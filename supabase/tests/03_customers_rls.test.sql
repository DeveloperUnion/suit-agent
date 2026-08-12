-- 顧客の権限マトリクス。
--
-- この設計で最も重要なテスト。supabase-js 一本にしたので接続ロールは常に
-- authenticated 固定で、GRANT による二枚目の壁が無い。RLS が破れれば
-- そのまま全顧客の漏洩になる。
--
-- 特に確かめたいのは「管理者は閲覧できるが編集はできない」という非対称性。
-- FOR ALL で書くと崩れる箇所であり、レビューでは見落としやすい。

begin;
create extension if not exists pgtap with schema extensions;

select plan(25);


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

\set admin_uid 'b1111111-1111-4111-8111-111111111111'
\set a_uid      'b2222222-2222-4222-8222-222222222222'
\set b_uid      'b3333333-3333-4333-8333-333333333333'

select pg_temp.make_staff(:'admin_uid', 'テスト管理者', 't-admin@example.com', 'admin') as admin_id \gset
select pg_temp.make_staff(:'a_uid',     'テストA',      't-a@example.com')              as a_id     \gset
select pg_temp.make_staff(:'b_uid',     'テストB',      't-b@example.com')              as b_id     \gset

insert into public.customers (id, name, name_kana, company_name, phone, staff_id)
values ('c1111111-1111-4111-8111-111111111111', '時枝 正', 'トキエダ タダシ', '時枝建設', '090-1111-2222', :'a_id'),
       ('c2222222-2222-4222-8222-222222222222', '国枝 誠', 'クニエダ マコト', '国枝商事', '090-3333-4444', :'b_id');


-- ── 生成列 ──────────────────────────────────────────────

select is(
  (select search_key from public.customers where id = 'c1111111-1111-4111-8111-111111111111'),
  '時枝正トキエダタダシ時枝建設',
  'search_key は氏名・カナ・会社名を正規化して連結する（空白は落ちる）'
);


-- ── 閲覧 ────────────────────────────────────────────────

select pg_temp.login_as(:'a_uid');
select is(
  (select count(*) from public.customers where id in
    ('c1111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222')),
  1::bigint,
  'A は自分の担当だけが見える（B の顧客は存在ごと見えない）'
);

select pg_temp.login_as(:'admin_uid');
select is(
  (select count(*) from public.customers where id in
    ('c1111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222')),
  2::bigint,
  '管理者は全顧客を閲覧できる'
);


-- ── 編集は自担当のみ。管理者にも例外を作らない ──────────
--
-- USING に弾かれた UPDATE はエラーではなく 0 行になる。
-- 「エラーが出ないから通った」と読み違えないよう、値そのものを確かめる。

select pg_temp.login_as(:'admin_uid');
update public.customers set family_info = '管理者が書き換えた' where id = 'c1111111-1111-4111-8111-111111111111';
select pg_temp.as_postgres();
select is(
  (select family_info from public.customers where id = 'c1111111-1111-4111-8111-111111111111'),
  null,
  '★ 管理者でも他人の担当顧客は編集できない（閲覧と編集の非対称性）'
);

select pg_temp.login_as(:'b_uid');
update public.customers set family_info = 'B が書き換えた' where id = 'c1111111-1111-4111-8111-111111111111';
select pg_temp.as_postgres();
select is(
  (select family_info from public.customers where id = 'c1111111-1111-4111-8111-111111111111'),
  null,
  '一般スタッフも他人の担当顧客は編集できない'
);

select pg_temp.login_as(:'a_uid');
update public.customers set family_info = 'A が書いた' where id = 'c1111111-1111-4111-8111-111111111111';
select pg_temp.as_postgres();
select is(
  (select family_info from public.customers where id = 'c1111111-1111-4111-8111-111111111111'),
  'A が書いた',
  '自分の担当顧客は編集できる'
);


-- ── 担当の奪取と押し付け ────────────────────────────────
--
-- WITH CHECK を書かないと、USING を通った行の staff_id を書き換えられてしまう。
-- 「他人の顧客を自分に奪う」は USING で止まるが、「自分の顧客を他人に
-- 押し付ける」は WITH CHECK でしか止まらない。

select pg_temp.login_as(:'a_uid');
select throws_ok(
  $$ update public.customers set staff_id =
       (select id from public.staff where email = 't-b@example.com')
      where id = 'c1111111-1111-4111-8111-111111111111' $$,
  '42501',
  'new row violates row-level security policy for table "customers"',
  '★ 自分の顧客を他人へ押し付けられない（WITH CHECK が効いている）'
);

select throws_ok(
  $$ insert into public.customers (name, name_kana, staff_id)
     values ('乗っ取り 太郎', 'ノットリ タロウ',
             (select id from public.staff where email = 't-b@example.com')) $$,
  '42501',
  'new row violates row-level security policy for table "customers"',
  '他人を担当にした顧客は登録できない'
);

-- staff_id を省略すると default app.current_staff_id() が入る＝登録者が担当。
insert into public.customers (name, name_kana) values ('新規 花子', 'シンキ ハナコ');
select pg_temp.as_postgres();
select is(
  (select s.email from public.customers c join public.staff s on s.id = c.staff_id
    where c.name = '新規 花子'),
  't-a@example.com',
  'staff_id を省略すると登録した人が担当になる'
);


-- ── 削除 ────────────────────────────────────────────────

-- ポリシーを書かないだけだと 0 行で静かに済む（Supabase は public の全テーブルに
-- ALL を既定で与えるため）。権限ごと剥がして、試みた時点で落ちるようにしてある。
select pg_temp.login_as(:'a_uid');
select throws_ok(
  $$ delete from public.customers where id = 'c1111111-1111-4111-8111-111111111111' $$,
  '42501', null,
  '★ 自分の担当顧客でも物理削除はできない'
);

select pg_temp.login_as(:'admin_uid');
select throws_ok(
  $$ delete from public.customers where id = 'c1111111-1111-4111-8111-111111111111' $$,
  '42501', null,
  '管理者でも物理削除はできない'
);
select pg_temp.as_postgres();

-- 誤登録を消す業務は archived_at で足りる。専用の権限は要らない。
select pg_temp.login_as(:'a_uid');
update public.customers set archived_at = now() where id = 'c1111111-1111-4111-8111-111111111111';
select pg_temp.as_postgres();
select isnt(
  (select archived_at from public.customers where id = 'c1111111-1111-4111-8111-111111111111'),
  null,
  'アーカイブは通常の UPDATE ポリシーで行える'
);


-- ── 子テーブルが境界を継ぐ ──────────────────────────────
--
-- staff_id を非正規化せず customers 経由の EXISTS で判定しているので、
-- 引き継ぎで担当が動いても子テーブルの追随漏れが原理的に起きない。

select pg_temp.as_postgres();
insert into public.customer_anniversaries (customer_id, type, date, label)
values ('c2222222-2222-4222-8222-222222222222', 'birthday', '1980-05-03', '誕生日');

select pg_temp.login_as(:'a_uid');
select is_empty(
  $$ select 1 from public.customer_anniversaries
      where customer_id = 'c2222222-2222-4222-8222-222222222222' $$,
  '他人の担当顧客の記念日は見えない'
);

select pg_temp.login_as(:'admin_uid');
select isnt_empty(
  $$ select 1 from public.customer_anniversaries
      where customer_id = 'c2222222-2222-4222-8222-222222222222' $$,
  '管理者は他人の担当顧客の記念日も閲覧できる'
);

update public.customer_anniversaries set label = '管理者が書き換えた'
 where customer_id = 'c2222222-2222-4222-8222-222222222222';
select pg_temp.as_postgres();
select is(
  (select label from public.customer_anniversaries
    where customer_id = 'c2222222-2222-4222-8222-222222222222'),
  '誕生日',
  '管理者でも他人の担当顧客の記念日は編集できない'
);


-- ── 二重登録の防止だけは境界を越える ────────────────────

select pg_temp.login_as(:'a_uid');
select results_eq(
  $$ select name, is_other_staff from app.find_similar_customers(p_name => '国枝') $$,
  $$ values ('国枝 誠'::text, true) $$,
  '★ 二重登録の防止では他人の担当顧客も見つかる（氏名だけ返る）'
);

-- 誰に確認すればよいか分からないと、結局その場で新規登録されてしまう
select results_eq(
  $$ select staff_name from app.find_similar_customers(p_name => '国枝') $$,
  $$ values ('テストB'::text) $$,
  '他人の担当でも、誰が担当しているかは分かる'
);

/*
 * PostgREST が公開しているのは public だけ。app スキーマの関数は rpc() から
 * 呼べず、この経路が無いあいだ二重登録の防止は一度も動いていなかった。
 * ラッパが public に居ることと、越境が app 側と同じであることを確かめる。
 */
select has_function(
  'public', 'find_similar_customers', array['text', 'text', 'text'],
  'public にラッパがある（PostgREST から呼べる）'
);

select results_eq(
  $$ select name, staff_name, is_other_staff
       from public.find_similar_customers(p_name => '国枝') $$,
  $$ values ('国枝 誠'::text, 'テストB'::text, true) $$,
  'ラッパ経由でも app 側と同じものが返る'
);

select ok(
  has_function_privilege('authenticated', 'public.find_similar_customers(text, text, text)', 'execute'),
  'ログイン済みのスタッフはラッパを実行できる'
);


-- ── お渡し後フォローの起点 ──────────────────────────────
--
-- お渡し日は顧客の都合で決まるので、発注書を取り込んだ時点では空のことが多い。
-- 空を理由にフォローが一生立たないほうが害が大きいため、納品日で代用する。

select pg_temp.as_postgres();
insert into public.orders (customer_id, order_number, ordered_at, arrived_at, delivered_at,
                           purpose, taken_by_staff_id)
values ('c1111111-1111-4111-8111-111111111111', 'T-001', '2026-01-01',
        '2026-02-10', null, 'business', :'a_id');

select is(
  (select last_delivered_at from public.v_customers
    where id = 'c1111111-1111-4111-8111-111111111111'),
  '2026-02-10'::date,
  '★ お渡し日が空なら納品日を起点にする'
);

-- お渡し日が入ればそちらが正。実際に着はじめた日のほうが近いため
update public.orders set delivered_at = '2026-02-18'
 where order_number = 'T-001';

select is(
  (select last_delivered_at from public.v_customers
    where id = 'c1111111-1111-4111-8111-111111111111'),
  '2026-02-18'::date,
  'お渡し日が入っていればそちらを起点にする'
);

select is(
  (select order_count from public.v_customers
    where id = 'c1111111-1111-4111-8111-111111111111'),
  1::bigint,
  '注文件数を返す（同姓同名の見分けに使う）'
);

-- キャンセルは起点にも件数にもしない
update public.orders set status = 'cancelled' where order_number = 'T-001';
select is(
  (select order_count from public.v_customers
    where id = 'c1111111-1111-4111-8111-111111111111'),
  0::bigint,
  'キャンセルした注文は数えない'
);

/*
 * 納品日は受注時点で「40 日後に届く予定」として入る。そのまま起点にすると、
 * まだ何も受け取っていない顧客が「お渡しから -34 日」になって一覧に紛れ込む。
 */
update public.orders
   set status = 'ordered', delivered_at = null, arrived_at = current_date + 30
 where order_number = 'T-001';

select is(
  (select last_delivered_at from public.v_customers
    where id = 'c1111111-1111-4111-8111-111111111111'),
  null::date,
  '★ まだ届いていない注文は起点にしない（未来の日付を数えない）'
);


select * from finish();
rollback;
