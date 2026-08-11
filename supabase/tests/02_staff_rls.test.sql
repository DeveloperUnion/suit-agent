-- staff の権限マトリクスと、主体取得の fail-closed。
--
-- 「管理者は全顧客を閲覧できるが、編集は全員が自担当のみ」という権限モデルの
-- うち、staff テーブルに現れるのは「スタッフ管理は管理者だけ」の部分。
-- 顧客側のマトリクスは Phase 1 で customers と一緒に書く。

begin;
create extension if not exists pgtap with schema extensions;

select plan(12);


-- ── 道具 ────────────────────────────────────────────────
--
-- RLS は接続ロールと request.jwt.claims の 2 つで決まるので両方差し替える。
-- set_config(..., true) は SET LOCAL 相当。LOCAL にしないとトランザクションを
-- 抜けた後も値が残り、後続のテストが前のスタッフの権限で走る。

create or replace function pg_temp.login_as(p_auth_user_id uuid) returns void
  language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_auth_user_id)::text, true);
end $$;

create or replace function pg_temp.logout() returns void
  language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', null, true);
end $$;

/** 検証の準備をするために postgres へ戻す */
create or replace function pg_temp.as_postgres() returns void
  language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);
end $$;

create or replace function pg_temp.make_staff(
  p_auth_user_id uuid, p_name text, p_email text,
  p_role text default 'member', p_is_active boolean default true
) returns uuid
  language plpgsql as $$
declare v_id uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (p_auth_user_id, '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', p_email, now(), now());
  insert into public.staff (auth_user_id, name, email, role, is_active)
  values (p_auth_user_id, p_name, p_email, p_role, p_is_active)
  returning id into v_id;
  return v_id;
end $$;


-- ── 登場人物 ────────────────────────────────────────────

\set admin_uid   '11111111-1111-1111-1111-111111111111'
\set member_uid  '22222222-2222-2222-2222-222222222222'
\set retired_uid '33333333-3333-3333-3333-333333333333'

select pg_temp.make_staff(:'admin_uid',   '細川 憲佑', 'admin@example.com',   'admin')  as admin_id  \gset
select pg_temp.make_staff(:'member_uid',  '白髭 崇',   'member@example.com',  'member') as member_id \gset
select pg_temp.make_staff(:'retired_uid', '退職 太郎', 'retired@example.com', 'member', false) as retired_id \gset


-- ── 主体の取得 ──────────────────────────────────────────

select pg_temp.logout();
select is(app.current_staff_id(), null, '未ログインでは主体が NULL（全ポリシーが 0 行に倒れる）');
select is(app.is_admin(), false, '未ログインでは管理者ではない');

select pg_temp.login_as(:'admin_uid');
select is(app.current_staff_id(), :'admin_id'::uuid, '管理者としてログインすると自分の staff.id が返る');
select is(app.is_admin(), true, '管理者は is_admin() が true');

select pg_temp.login_as(:'member_uid');
select is(app.is_admin(), false, '一般スタッフは is_admin() が false');

-- 退職者のトークンが有効期限内に残っていても、is_active を毎回見るので
-- DB からは何も見えない。認証側のセッション失効を待たずに閉じられる。
select pg_temp.login_as(:'retired_uid');
select is(app.current_staff_id(), null, '無効化されたスタッフは主体が NULL（fail-closed）');


-- ── 閲覧 ────────────────────────────────────────────────
--
-- 全員に開けている。管理者のスタッフ切り替え、売上目標の一覧、
-- 「白髭さん担当の田中様」という言い回しがすべてこれを必要とする。

-- 件数では確かめない。seed.sql が流れた後の DB で走るので、
-- 「テーブルが空」を前提にすると seed を足すたびにテストが壊れる。
-- 見たいのは「自分以外の行が見えるか」という不変条件そのもの。
select pg_temp.login_as(:'member_uid');
select isnt_empty(
  $$ select 1 from public.staff where email = 'admin@example.com' $$,
  '一般スタッフも他のスタッフの行を閲覧できる'
);


-- ── 書き込みは管理者だけ ────────────────────────────────

select pg_temp.login_as(:'member_uid');

select throws_ok(
  $$ insert into public.staff (name, email) values ('乱入 太郎', 'intruder@example.com') $$,
  '42501',
  'new row violates row-level security policy for table "staff"',
  '一般スタッフはスタッフを追加できない'
);

-- UPDATE は USING に弾かれるので、エラーではなく 0 行になる。
-- 「エラーが出ないから通った」と読み違えないよう行数で確かめる。
update public.staff set role = 'admin' where email = 'member@example.com';
select pg_temp.as_postgres();
select is(
  (select role from public.staff where email = 'member@example.com'),
  'member',
  '一般スタッフは自分を管理者に昇格できない'
);

select pg_temp.login_as(:'admin_uid');
select lives_ok(
  $$ insert into public.staff (name, email) values ('新人 花子', 'newbie@example.com') $$,
  '管理者はスタッフを追加できる'
);

update public.staff set is_active = false where email = 'member@example.com';
select pg_temp.as_postgres();
select is(
  (select is_active from public.staff where email = 'member@example.com'),
  false,
  '管理者はスタッフを無効化できる'
);


-- ── 物理削除は誰にもできない ────────────────────────────
--
-- DELETE ポリシーを作っていないので、管理者でも 0 行。
-- 行を消すと採寸票・注文の「誰がやったか」が全部壊れる。

-- DELETE ポリシーを書かないだけだと 0 行で静かに済んでしまう
-- （Supabase は public の全テーブルに ALL を既定で与えるため）。
-- 権限ごと剥がしてあるので、試みた時点で落ちる。
select pg_temp.login_as(:'admin_uid');
select throws_ok(
  $$ delete from public.staff where email = 'newbie@example.com' $$,
  '42501', null,
  '管理者でもスタッフを物理削除できない（退職は is_active = false で表す）'
);


select * from finish();
rollback;
