-- 監査ログ。
--
-- PITR を入れないので、「昨日の誤操作を辿る」手段はこれしかない。
-- 記録が漏れていても、改竄できても、気づくのは事が起きた後になる。

begin;
create extension if not exists pgtap with schema extensions;

select plan(11);


-- ── 道具 ────────────────────────────────────────────────

create or replace function pg_temp.login_as(p_auth_user_id uuid) returns void
  language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_auth_user_id)::text, true);
end $$;

create or replace function pg_temp.as_postgres() returns void
  language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);
end $$;

create or replace function pg_temp.make_staff(
  p_auth_user_id uuid, p_name text, p_email text, p_role text default 'member'
) returns uuid
  language plpgsql as $$
declare v_id uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (p_auth_user_id, '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', p_email, now(), now());
  insert into public.staff (auth_user_id, name, email, role)
  values (p_auth_user_id, p_name, p_email, p_role)
  returning id into v_id;
  return v_id;
end $$;


\set a_uid 'c1111111-1111-4111-8111-111111111111'
\set b_uid 'c2222222-2222-4222-8222-222222222222'

select pg_temp.make_staff(:'a_uid', 'LA', 'l-a@example.com') as a_id \gset
select pg_temp.make_staff(:'b_uid', 'LB', 'l-b@example.com') as b_id \gset


-- ── 書き込みが記録される ────────────────────────────────

select pg_temp.login_as(:'a_uid');
insert into public.customers (id, name, name_kana)
values ('aa111111-1111-4111-8111-111111111111', '記録 太郎', 'キロク タロウ');

select pg_temp.as_postgres();
select is(
  (select op from public.change_log
    where table_name = 'customers' and row_id = 'aa111111-1111-4111-8111-111111111111'),
  'INSERT',
  '顧客の登録が記録される'
);

select is(
  (select actor_staff_id from public.change_log
    where table_name = 'customers' and row_id = 'aa111111-1111-4111-8111-111111111111'),
  :'a_id'::uuid,
  '誰が書いたかが残る（提案 → 適用なので、主体は常に人間）'
);


-- ── 変わった列だけを残す ────────────────────────────────

select pg_temp.login_as(:'a_uid');
update public.customers set memo = 'ひとこと'
 where id = 'aa111111-1111-4111-8111-111111111111';

select pg_temp.as_postgres();
select is(
  (select changed_columns from public.change_log
    where table_name = 'customers' and row_id = 'aa111111-1111-4111-8111-111111111111'
      and op = 'UPDATE'),
  array['memo'],
  '★ 変わった列だけが残る（updated_at は毎回動くので除外している）'
);

select is(
  (select before ->> 'memo' from public.change_log
    where table_name = 'customers' and row_id = 'aa111111-1111-4111-8111-111111111111'
      and op = 'UPDATE'),
  null,
  '変更前の値が残る'
);


-- ── 何も変わらない UPDATE は記録しない ──────────────────
--
-- 画面の保存ボタンを二度押しただけでログが伸びると、
-- 「昨日の誤操作」を探すときにノイズで埋まる。

select pg_temp.login_as(:'a_uid');
update public.customers set memo = 'ひとこと'
 where id = 'aa111111-1111-4111-8111-111111111111';

select pg_temp.as_postgres();
select is(
  (select count(*) from public.change_log
    where table_name = 'customers' and row_id = 'aa111111-1111-4111-8111-111111111111'
      and op = 'UPDATE'),
  1::bigint,
  '同じ値での UPDATE は記録されない'
);


-- ── 採寸値は票を経由して顧客に紐づく ────────────────────

select pg_temp.login_as(:'a_uid');
insert into public.measurement_sheets (id, customer_id, measured_at, recorded_by_staff_id)
values ('ab111111-1111-4111-8111-111111111111', 'aa111111-1111-4111-8111-111111111111',
        '2026-07-06', :'a_id');
insert into public.measurement_sections (sheet_id, item_type_id)
values ('ab111111-1111-4111-8111-111111111111', 'pants');
insert into public.measurement_values (sheet_id, item_type_id, field_key, actual)
values ('ab111111-1111-4111-8111-111111111111', 'pants', 'inseam', 78.0);

select pg_temp.as_postgres();
select is(
  (select customer_id from public.change_log
    where table_name = 'measurement_values' and op = 'INSERT'
    order by id desc limit 1),
  'aa111111-1111-4111-8111-111111111111'::uuid,
  '採寸値の記録は sheet_id から顧客を引く（単価15〜20万の服の寸法が黙って変わるのを追える）'
);


-- ── 改竄できない ────────────────────────────────────────
--
-- トリガー関数は SECURITY DEFINER なので postgres の権限で走り、
-- この revoke の影響を受けない。結果、アプリのどのコードからも
-- 監査ログを書き換えられない。

select pg_temp.login_as(:'a_uid');

select throws_ok(
  $$ delete from public.change_log where table_name = 'customers' $$,
  '42501', null,
  '★ 監査ログは削除できない'
);

select throws_ok(
  $$ update public.change_log set actor_staff_id = null where table_name = 'customers' $$,
  '42501', null,
  '★ 監査ログは書き換えられない（誰がやったかを消せない）'
);

select throws_ok(
  $$ insert into public.change_log (table_name, op) values ('customers', 'INSERT') $$,
  '42501', null,
  '★ 監査ログに偽の行を差し込めない'
);


-- ── 読める範囲は顧客の境界と同じ ────────────────────────

select pg_temp.login_as(:'b_uid');
select is_empty(
  $$ select 1 from public.change_log
      where row_id = 'aa111111-1111-4111-8111-111111111111' $$,
  '他人の担当顧客の変更履歴は見えない'
);

select pg_temp.login_as(:'a_uid');
select isnt_empty(
  $$ select 1 from public.change_log
      where row_id = 'aa111111-1111-4111-8111-111111111111' $$,
  '自分の担当顧客の変更履歴は読める（辿れないなら記録する意味がない）'
);


select * from finish();
rollback;
