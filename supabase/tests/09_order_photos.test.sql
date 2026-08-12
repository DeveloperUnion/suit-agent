-- 着装写真。
--
-- 「画像を一切保存しない」判断を反転した箇所なので、代わりに置いた条件が
-- 効いているかをここで確かめる。
--   1. 行の境界は他のテーブルと同じ（app.can_read_customer / can_write_customer）
--   2. 実体側（storage.objects）も同じ判定関数に乗っている
--   3. パスが uuid でないときに、誰にも見えない側へ倒れる
--
-- 3 が要点。ポリシーの中で無条件に uuid へキャストすると、異物 1 件で
-- 全員の読み出しが落ちる。

begin;
create extension if not exists pgtap with schema extensions;

select plan(9);


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
  insert into public.staff (name, email, role)
  values (p_name, p_email, p_role)
  returning id into v_id;
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (p_auth_user_id, '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', p_email, now(), now());
  return v_id;
end $$;


-- ── 登場人物 ────────────────────────────────────────────

\set a_uid 'b4444444-4444-4444-8444-444444444444'
\set b_uid 'b5555555-5555-4555-8555-555555555555'
\set cust_a 'c4444444-4444-4444-8444-444444444444'
\set cust_b 'c5555555-5555-4555-8555-555555555555'
\set order_a 'd4444444-4444-4444-8444-444444444444'
\set order_b 'd5555555-5555-4555-8555-555555555555'

select pg_temp.make_staff(:'a_uid', '写真A', 'p-a@example.com') as a_id \gset
select pg_temp.make_staff(:'b_uid', '写真B', 'p-b@example.com') as b_id \gset

insert into public.customers (id, name, name_kana, staff_id)
values (:'cust_a', '時枝 正', 'トキエダ タダシ', :'a_id'),
       (:'cust_b', '国枝 誠', 'クニエダ マコト', :'b_id');

insert into public.orders (id, customer_id, order_number, ordered_at, purpose, taken_by_staff_id)
values (:'order_a', :'cust_a', 'J1-200-100', '2026-02-01', 'business', :'a_id'),
       (:'order_b', :'cust_b', 'J1-200-200', '2026-02-01', 'business', :'b_id');

insert into public.order_photos (order_id, customer_id, storage_path, created_by_staff_id)
values (:'order_a', :'cust_a', :'cust_a' || '/' || :'order_a' || '/1.jpg', :'a_id'),
       (:'order_b', :'cust_b', :'cust_b' || '/' || :'order_b' || '/1.jpg', :'b_id');


-- ── パスから顧客を取り出す ──────────────────────────────

select is(
  app.customer_id_from_object_name(:'cust_a' || '/' || :'order_a' || '/1.jpg'),
  :'cust_a'::uuid,
  'パスの先頭セグメントが顧客 id として読める'
);

select is(
  app.customer_id_from_object_name('logo.png'),
  null,
  '★ uuid でないパスは NULL（can_read_customer(NULL) が false になり、誰にも見えない）'
);

select is(
  app.customer_id_from_object_name('not-a-uuid/xxx/1.jpg'),
  null,
  '異物が 1 件混ざってもキャスト失敗で全体が落ちたりしない'
);


-- ── 行の境界 ────────────────────────────────────────────

select pg_temp.login_as(:'a_uid');
select is(
  (select count(*) from public.order_photos),
  1::bigint,
  'A には自分の担当顧客の写真だけが見える'
);

select is_empty(
  format($$ select 1 from public.order_photos where customer_id = %L $$, :'cust_b'),
  '他人の担当顧客の写真は存在ごと見えない'
);

select throws_ok(
  format(
    $$ insert into public.order_photos (order_id, customer_id, storage_path)
       values (%L, %L, 'x/y/z.jpg') $$,
    :'order_b', :'cust_b'
  ),
  '42501', null,
  '他人の担当顧客には写真を足せない'
);

-- 撮り損ねた 1 枚は消せる必要がある。ここは facts と違って追記式にしない。
select lives_ok(
  format($$ delete from public.order_photos where customer_id = %L $$, :'cust_a'),
  '自分の担当顧客の写真は消せる'
);

select pg_temp.as_postgres();
select is(
  (select count(*) from public.order_photos where customer_id = :'cust_a'),
  0::bigint,
  '消した写真の行は残らない'
);


-- ── 実体側も同じ判定関数に乗っているか ──────────────────
--
-- storage.objects への insert は storage 側の内部処理を伴うので、ここでは
-- ポリシーが判定関数を経由していることだけを確かめる。

select is(
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'order_photos_objects_%'
      and (qual like '%customer_id_from_object_name%'
           or with_check like '%customer_id_from_object_name%')),
  3::bigint,
  '★ storage.objects の select / insert / delete が同じ判定関数を通っている'
);


select * from finish();
rollback;
