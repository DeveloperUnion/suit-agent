-- 売上目標の境界。
--
-- 確かめたいのは「誰が誰の目標を触れるか」が 3 つの書き込みポリシーで
-- **同じ形をしていること**。
--
--   閲覧   全員（週次ミーティングで並べて見る運用）
--   書込   自分のぶんは自分で。他人のぶんは管理者だけ
--   削除   書込と同じ（20260813200000_revenue_target_delete.sql で開けた）
--
-- 削除をここまで書くのは、**塞がっていたせいで保存そのものが落ちていた**から。
-- 画面は「未設定」を行が無いことで表しており、目標を消す唯一の手段が
-- 行の削除だった。片方のポリシーだけ後から直したときに気づけるよう、
-- 3 つとも同じ表で並べて検査する。

begin;
create extension if not exists pgtap with schema extensions;

select plan(8);


-- ── 道具 ────────────────────────────────────────────────
--
-- 06_app_settings.test.sql と同じ。RLS は接続ロールと request.jwt.claims の
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
  insert into public.staff (name, email, role)
  values (p_name, p_email, p_role)
  returning id into v_id;
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (p_auth_user_id, '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', p_email, now(), now());
  return v_id;
end $$;


-- ── 登場人物 ────────────────────────────────────────────

\set m_uid 'b7777777-7777-4777-8777-777777777777'
\set n_uid 'b8888888-8888-4888-8888-888888888888'
\set a_uid 'b9999999-9999-4999-8999-999999999999'

select pg_temp.make_staff(:'m_uid', '目標一般', 'rt-member@example.com')          as m_id \gset
select pg_temp.make_staff(:'n_uid', '目標同僚', 'rt-other@example.com')           as n_id \gset
select pg_temp.make_staff(:'a_uid', '目標管理', 'rt-admin@example.com', 'admin')  as a_id \gset

insert into public.revenue_targets (staff_id, month, amount)
values (:'m_id', '2030-01', 1000000),
       (:'n_id', '2030-01', 2000000);


-- ── 一般スタッフ ────────────────────────────────────────

select pg_temp.login_as(:'m_uid');

-- 週次ミーティングで全員の数字を並べる運用なので、閲覧に境界を引かない。
select is(
  (select count(*) from public.revenue_targets where month = '2030-01'),
  2::bigint,
  '一般スタッフでも他人の目標が見える'
);

select lives_ok(
  format($$ update public.revenue_targets set amount = 1100000
             where staff_id = %L and month = '2030-01' $$, :'m_id'),
  '自分の目標は直せる'
);

-- USING が 0 行にするだけなのでエラーにはならない。**行数で確かめる。**
update public.revenue_targets set amount = 1 where staff_id = :'n_id';
select is(
  (select amount from public.revenue_targets where staff_id = :'n_id' and month = '2030-01'),
  2000000,
  '他人の目標は直せない（0 行になるだけでエラーにはならない）'
);

select throws_ok(
  format($$ insert into public.revenue_targets (staff_id, month, amount)
            values (%L, '2030-02', 1) $$, :'n_id'),
  '42501',
  null,
  '他人の目標は入れられない'
);

-- ★ ここが今回開けたところ。塞がっていた頃はこれが permission denied で落ち、
--   画面の保存そのものが道連れになっていた。
select lives_ok(
  format($$ delete from public.revenue_targets
             where staff_id = %L and month = '2030-01' $$, :'m_id'),
  '★ 自分の目標は消せる（未設定に戻す唯一の手段）'
);

delete from public.revenue_targets where staff_id = :'n_id';
select is(
  (select count(*) from public.revenue_targets where staff_id = :'n_id'),
  1::bigint,
  '他人の目標は消せない'
);


-- ── 管理者 ──────────────────────────────────────────────
--
-- 「管理者は閲覧のみ」は顧客データの原則で、ここには効かない
-- （docs/database-design.md「書き込みポリシーで app.is_admin() を呼ぶのは
-- 店舗共通ルールだけ」）。目標は本人が立てるものだが、他人のぶんを
-- 触れるのは管理者だけ、という非対称は意図したもの。

select pg_temp.login_as(:'a_uid');

select lives_ok(
  format($$ update public.revenue_targets set amount = 2200000
             where staff_id = %L and month = '2030-01' $$, :'n_id'),
  '管理者は他人の目標を直せる'
);

select lives_ok(
  format($$ delete from public.revenue_targets
             where staff_id = %L and month = '2030-01' $$, :'n_id'),
  '管理者は他人の目標を消せる'
);


select * from finish();
rollback;
