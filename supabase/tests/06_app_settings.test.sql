-- 店舗共通の業務ルール（app_settings）。
--
-- 確かめたいのは 2 つ。
--   1. 変えられるのは管理者だけ（1 つの値が全スタッフの画面の出方を変えるため）
--   2. 節目の並びが壊れた配列は DB が弾く（降順・重複を許すと
--      「過ぎている節目のうち最も後のもの」の判定が無音でずれる）

begin;
create extension if not exists pgtap with schema extensions;

select plan(10);


-- ── 道具 ────────────────────────────────────────────────
--
-- 02_staff_rls.test.sql と同じ。RLS は接続ロールと request.jwt.claims の
-- 2 つで決まるので両方差し替え、SET LOCAL 相当にして後続へ漏らさない。

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

\set admin_uid  '11111111-1111-1111-1111-111111111111'
\set member_uid '22222222-2222-2222-2222-222222222222'

select pg_temp.make_staff(:'admin_uid',  '細川 憲佑', 'admin@test.example',  'admin')  as admin_id  \gset
select pg_temp.make_staff(:'member_uid', '白髭 崇',   'member@test.example', 'member') as member_id \gset


-- ── 行は 1 つだけ ───────────────────────────────────────

select pg_temp.as_postgres();
select is(
  (select count(*) from public.app_settings), 1::bigint,
  'app_settings は migration が入れた 1 行だけ'
);
select is(
  (select post_delivery_months from public.app_settings), '{6,12}'::integer[],
  '既定の節目は半年と 1 年'
);


-- ── 閲覧は全員 ──────────────────────────────────────────
--
-- 一般スタッフの画面もこの値で通知を出すので、読めないと何も表示できない。

select pg_temp.login_as(:'member_uid');
select isnt_empty(
  $$ select 1 from public.app_settings $$,
  '一般スタッフも設定を閲覧できる'
);


-- ── 更新は管理者だけ ────────────────────────────────────

-- UPDATE は USING に弾かれるのでエラーではなく 0 行になる。
-- 「エラーが出ないから通った」と読み違えないよう、値そのものを確かめる。
update public.app_settings set post_delivery_months = '{3}';
select pg_temp.as_postgres();
select is(
  (select post_delivery_months from public.app_settings), '{6,12}'::integer[],
  '一般スタッフは節目を変えられない（0 行になる）'
);

select pg_temp.login_as(:'admin_uid');
update public.app_settings set post_delivery_months = '{6,9,18}';
select pg_temp.as_postgres();
select is(
  (select post_delivery_months from public.app_settings), '{6,9,18}'::integer[],
  '管理者は節目を変えられる'
);
select isnt(
  (select updated_by_staff_id from public.app_settings), null,
  '更新すると操作者が default で埋まる'
);


-- ── 壊れた並びは DB が弾く ──────────────────────────────

select pg_temp.login_as(:'admin_uid');

select throws_ok(
  $$ update public.app_settings set post_delivery_months = '{12,6}' $$,
  '23514', null,
  '降順の節目は入らない'
);

select throws_ok(
  $$ update public.app_settings set post_delivery_months = '{6,6}' $$,
  '23514', null,
  '重複した節目は入らない'
);

select throws_ok(
  $$ update public.app_settings set post_delivery_months = '{0}' $$,
  '23514', null,
  '0 ヶ月は入らない（納品当日に「経ちました」とは言えない）'
);

-- 上限は 3 つ。これ以上出すと「連絡すべき人」のリストが節目だけで埋まる。
select throws_ok(
  $$ update public.app_settings set post_delivery_months = '{6,12,24,36}' $$,
  '23514', null,
  '節目は 3 つまで'
);


select * from finish();
rollback;
