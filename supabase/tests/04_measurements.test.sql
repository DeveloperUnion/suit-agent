-- 採寸の防御と境界。
--
-- jsonb ではなく縦持ちを選んだ理由は「型と制約」だった。その制約が実際に
-- 効いているかを確かめる。効いていなければ、縦持ちにした意味の大半が消える。
--
-- 5ef0d88 で OCR が主動線になり手入力が退けられたので、ここが人の目を
-- 通らない値に対する最後の境界になっている。

begin;
create extension if not exists pgtap with schema extensions;

select plan(13);


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

\set admin_uid 'd1111111-1111-4111-8111-111111111111'
\set a_uid      'd2222222-2222-4222-8222-222222222222'
\set b_uid      'd3333333-3333-4333-8333-333333333333'

select pg_temp.make_staff(:'admin_uid', 'M管理者', 'm-admin@example.com', 'admin') as admin_id \gset
select pg_temp.make_staff(:'a_uid',     'MA',      'm-a@example.com')              as a_id     \gset
select pg_temp.make_staff(:'b_uid',     'MB',      'm-b@example.com')              as b_id     \gset

insert into public.customers (id, name, name_kana, staff_id) values
  ('e1111111-1111-4111-8111-111111111111', 'A の顧客', 'エーノコキャク', :'a_id'),
  ('e2222222-2222-4222-8222-222222222222', 'B の顧客', 'ビーノコキャク', :'b_id');

insert into public.measurement_sheets (id, customer_id, measured_at, recorded_by_staff_id, height_cm, weight_kg)
values ('f1111111-1111-4111-8111-111111111111', 'e1111111-1111-4111-8111-111111111111',
        '2026-07-06', :'a_id', 172.5, 68.0);

insert into public.measurement_sections (sheet_id, item_type_id, silhouette)
values ('f1111111-1111-4111-8111-111111111111', 'pants', 'NB');


-- ── field_key の FK ─────────────────────────────────────
--
-- 存在しないキーを弾く。jsonb ならここは静かに通り、読み出しで NULL が
-- 返って「記録がありません」と答えてしまう（検出できない）。

select throws_ok(
  $$ insert into public.measurement_values (sheet_id, item_type_id, field_key, actual)
     values ('f1111111-1111-4111-8111-111111111111', 'pants', 'wiast', 82.0) $$,
  '23503', null,
  '★ 綴りを誤った項目名は FK で弾かれる（jsonb なら静かに NULL になる）'
);

-- ここが複合 FK の効きどころ。
-- OCR 側の FIELD_KEYS enum はキー名のフラットな集合なので「pants に bust」を
-- 通してしまう。(item_type_id, key) の複合にしてあるので DB では止まる。
select throws_ok(
  $$ insert into public.measurement_values (sheet_id, item_type_id, field_key, actual)
     values ('f1111111-1111-4111-8111-111111111111', 'pants', 'bust', 92.0) $$,
  '23503', null,
  '★ アイテムに存在しない項目（pants の bust）は複合 FK で弾かれる'
);

select lives_ok(
  $$ insert into public.measurement_values (sheet_id, item_type_id, field_key, actual, finished)
     values ('f1111111-1111-4111-8111-111111111111', 'pants', 'inseam', 78.0, 76.0) $$,
  '正しい項目は通る'
);


-- ── 数値の CHECK ────────────────────────────────────────
--
-- 止まるのは桁違いだけ。「股下 175」のような “ありえるが間違っている” 値は
-- ここでは止まらない — それは OCR の confidence と確認画面の役目。
-- ここで過大な期待をすると、止まっているつもりで止まっていない状態になる。

select throws_ok(
  $$ insert into public.measurement_values (sheet_id, item_type_id, field_key, actual)
     values ('f1111111-1111-4111-8111-111111111111', 'pants', 'waist', 8200.0) $$,
  '23514', null,
  '桁違いの値（8200cm）は CHECK で弾かれる'
);

select lives_ok(
  $$ insert into public.measurement_values (sheet_id, item_type_id, field_key, actual)
     values ('f1111111-1111-4111-8111-111111111111', 'pants', 'rise', 175.0) $$,
  '「股上 175」は DB では通る（項目ごとの範囲を持たないため。confidence と確認画面の担当）'
);


-- ── マスタは読むだけ ────────────────────────────────────

select pg_temp.login_as(:'a_uid');

select isnt_empty(
  $$ select 1 from public.measurement_fields where item_type_id = 'pants' $$,
  'マスタは全員が読める（エージェントが「ウエスト」→ pants.waist を引くのに要る）'
);

select throws_ok(
  $$ insert into public.item_types (id, name, sheet_label, body_part, display_order)
     values ('hat', '帽子', 'HAT', 'upper', 9) $$,
  '42501', null,
  'マスタはアプリから書き換えられない（デプロイ成果物であって設定ではない）'
);


-- ── 境界 ────────────────────────────────────────────────

select pg_temp.login_as(:'b_uid');
select is_empty(
  $$ select 1 from public.measurement_sheets
      where customer_id = 'e1111111-1111-4111-8111-111111111111' $$,
  '他人の担当顧客の採寸票は見えない'
);
select is_empty(
  $$ select 1 from public.measurement_values
      where sheet_id = 'f1111111-1111-4111-8111-111111111111' $$,
  '採寸値も票を経由して境界を継ぐ（staff_id を非正規化していない）'
);

select pg_temp.login_as(:'admin_uid');
select isnt_empty(
  $$ select 1 from public.measurement_values
      where sheet_id = 'f1111111-1111-4111-8111-111111111111' $$,
  '管理者は他人の担当顧客の採寸値も閲覧できる'
);

update public.measurement_values set actual = 999
 where sheet_id = 'f1111111-1111-4111-8111-111111111111' and field_key = 'inseam';
select pg_temp.as_postgres();
select is(
  (select actual from public.measurement_values
    where sheet_id = 'f1111111-1111-4111-8111-111111111111' and field_key = 'inseam'),
  78.0,
  '★ 管理者でも他人の担当顧客の採寸値は編集できない'
);


-- ── 票の削除は許さない ──────────────────────────────────

-- ポリシーが無いだけだと 0 行になって静かに何も起きない。権限ごと剥がして
-- あるので、試みた時点で落ちる。
select pg_temp.login_as(:'a_uid');
select throws_ok(
  $$ delete from public.measurement_sheets where id = 'f1111111-1111-4111-8111-111111111111' $$,
  '42501', null,
  '採寸票の削除は権限が無く落ちる（0 行で静かに済ませない）'
);
select pg_temp.as_postgres();


-- ── 身長・体重 ──────────────────────────────────────────

select is(
  (select weight_kg from public.measurement_sheets
    where id = 'f1111111-1111-4111-8111-111111111111'),
  68.0,
  '身長・体重は票の属性として持つ（「3kg痩せた」に票を並べて答えられる）'
);


select * from finish();
rollback;
