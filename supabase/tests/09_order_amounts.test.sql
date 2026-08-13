-- 注文の金額。
--
-- ここは 2 つの決定を機械的に守らせるためにある。
--
--   1. **着装写真は残っていない。**表・関数・バケットのどれか 1 つでも
--      取り残すと、次に触る人が「まだ写真がある」と読んでしまう。
--      とくに public.delete_customer() は order_photos を消す行を持っていたので、
--      差し替え漏れがあると顧客の削除が丸ごと落ちる。
--   2. **金額の内訳に CHECK を張らない。**「その他」区分を作らない判断なので、
--      4 つの和が合計に届かないのが既定の状態。ここを縛ると、区分に
--      当てはまらない売上が 1 円でもある注文が保存できなくなる。
--
-- 2 は「うっかり CHECK を足す」のを止めるためのテスト。壊れたときに
-- 落ちるのが本番ではなくここになるように、和が合わない行を実際に入れる。

begin;
create extension if not exists pgtap with schema extensions;

select plan(12);


-- ── 道具 ────────────────────────────────────────────────

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


-- ── 着装写真が残っていないこと ──────────────────────────

select hasnt_table('public', 'order_photos', 'order_photos テーブルは残っていない');

select hasnt_function(
  'app', 'customer_id_from_object_name', array['text'],
  'パスから顧客 id を取り出す関数も残っていない'
);

select is_empty(
  $$ select id from storage.buckets where id = 'order-photos' $$,
  'order-photos バケットも残っていない'
);

-- ポリシーは storage.objects に付いていた。テーブルごと消せないので、
-- 名前で残骸を探す。
select is_empty(
  $$
    select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname like 'order_photos_objects_%'
  $$,
  'storage.objects の着装写真ポリシーも残っていない'
);


-- ── 金額の列 ────────────────────────────────────────────

-- 常に 0 のまま使われなかった 3 列。残しておくと「どれが正か」を
-- 読む人に毎回考えさせる。
select hasnt_column('public', 'orders', 'subtotal_amount', '売上金額の列は落ちている');
select hasnt_column('public', 'orders', 'surcharge_amount', '割増金額の列は落ちている');
select hasnt_column('public', 'orders', 'tax_amount', '消費税の列は落ちている');

-- **内訳は nullable。**not null default 0 にすると「未入力」と「0 円」が
-- 区別できなくなり、内訳を付けていない注文が「4 区分すべて 0 円」に見える。
-- 落としたばかりの 3 列とまったく同じ失敗になる。
select col_is_null('public', 'orders', 'amount_suit', '内訳・スーツは NULL を許す');
select col_is_null('public', 'orders', 'amount_coat', '内訳・コートは NULL を許す');
select col_is_null('public', 'orders', 'amount_accessory', '内訳・小物は NULL を許す');
select col_is_null('public', 'orders', 'amount_shirt', '内訳・シャツは NULL を許す');


-- ── 和 ≠ 合計 が通ること ────────────────────────────────

\set a_uid 'b6666666-6666-4666-8666-666666666666'
\set cust_a 'c6666666-6666-4666-8666-666666666666'

select pg_temp.make_staff(:'a_uid', '金額A', 'amt-a@example.com') as a_id \gset

insert into public.customers (id, name, name_kana, staff_id)
values (:'cust_a', '金額 太郎', 'キンガク タロウ', :'a_id');

-- 合計 200,000 に対して内訳の和は 150,000。差の 50,000 は「その他」区分が
-- 無いので内訳に現れない。**これが異常ではないことを DB が認めていること。**
select lives_ok(
  format($$
    insert into public.orders
      (customer_id, order_number, ordered_at, purpose, taken_by_staff_id,
       total_amount, amount_suit, amount_accessory)
    values (%L, 'J1-900-900', '2026-01-10', 'business', %L,
            200000, 120000, 30000)
  $$, :'cust_a', :'a_id'),
  '★ 内訳の和が合計に届かない注文を保存できる（CHECK を張っていない）'
);


select * from finish();
rollback;
