-- NG 事項の権限マトリクスと、追記のみの担保。
--
-- customer_facts と形は同じだが、意図して別テーブルにしてある。
-- facts は類似検索で「引っ張り出す」もの、NG は当該顧客に触れた瞬間に
-- **無条件で全件**読むもの。取りこぼしが許される情報と許されない情報を、
-- 同じ機構に載せない。
--
-- 同じ形だからこそ、守りが片方だけ緩んでいないかをここで確かめる。

begin;
create extension if not exists pgtap with schema extensions;

select plan(7);


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
  -- staff が先。auth.users のトリガーが staff を見るので、逆順だと弾かれる。
  -- auth_user_id は AFTER トリガーが埋める（本番と同じ経路を通す）。
  insert into public.staff (name, email, role)
  values (p_name, p_email, p_role)
  returning id into v_id;
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (p_auth_user_id, '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', p_email, now(), now());
  return v_id;
end $$;


-- ── 登場人物 ────────────────────────────────────────────

\set admin_uid 'e1111111-1111-4111-8111-111111111111'
\set a_uid     'e2222222-2222-4222-8222-222222222222'
\set b_uid     'e3333333-3333-4333-8333-333333333333'

\set cust_a 'ea111111-1111-4111-8111-111111111111'

select pg_temp.make_staff(:'admin_uid', 'NG管理者', 'n-admin@example.com', 'admin') as admin_id \gset
select pg_temp.make_staff(:'a_uid',     'NG-A',    'n-a@example.com')               as a_id     \gset
select pg_temp.make_staff(:'b_uid',     'NG-B',    'n-b@example.com')               as b_id     \gset

insert into public.customers (id, name, name_kana, staff_id)
values (:'cust_a', '時枝 正', 'トキエダ タダシ', :'a_id');


-- ── 権限マトリクス ──────────────────────────────────────

select pg_temp.login_as(:'a_uid');
select lives_ok(
  format(
    $$ insert into public.customer_ng_notes (customer_id, body)
       values (%L, '光沢の強い生地は好まない') $$,
    :'cust_a'
  ),
  'A は自分の担当の顧客に NG を足せる'
);

select throws_ok(
  format(
    $$ insert into public.customer_ng_notes (customer_id, body)
       values (%L, '光沢の強い生地は好まない') $$,
    :'cust_a'
  ),
  '23505', null,
  '同じ本文の二重登録は落ちる'
);

select pg_temp.login_as(:'b_uid');
select is_empty(
  format($$ select 1 from public.customer_ng_notes where customer_id = %L $$, :'cust_a'),
  'B から A の顧客の NG は存在ごと見えない'
);

-- 管理者は読めるが書けない。NG も顧客データなので「管理者は閲覧のみ」が効く。
select pg_temp.login_as(:'admin_uid');
select isnt_empty(
  format($$ select 1 from public.customer_ng_notes where customer_id = %L $$, :'cust_a'),
  '管理者は他スタッフの顧客の NG を読める'
);
select throws_ok(
  format(
    $$ insert into public.customer_ng_notes (customer_id, body) values (%L, '管理者が書いた') $$,
    :'cust_a'
  ),
  '42501', null,
  '管理者でも他スタッフの顧客に NG を足せない'
);


-- ── 追記のみ ────────────────────────────────────────────
--
-- 安全情報こそ書き換えの履歴が要る。UPDATE ポリシーは列を選べないので、
-- ここが無いと「断られた記録」を上書きで消せてしまう。

select pg_temp.login_as(:'a_uid');
select throws_ok(
  format(
    $$ update public.customer_ng_notes set body = '書き換えた' where customer_id = %L $$,
    :'cust_a'
  ),
  '23001', null,
  '本文の書き換えはトリガーで落ちる'
);

update public.customer_ng_notes set invalidated_at = now()
 where customer_id = :'cust_a' and body = '光沢の強い生地は好まない';

select is(
  (select invalidated_by_staff_id from public.customer_ng_notes
    where customer_id = :'cust_a' and body = '光沢の強い生地は好まない'),
  :'a_id'::uuid,
  '無効化は通り、操作者はトリガーが本人で埋める'
);


select * from finish();
rollback;
