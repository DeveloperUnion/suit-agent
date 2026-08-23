-- エージェントが注文と売上を横断で読む口。
--
-- ここで守るのは 3 つ。
--
--   1. **境界**。search_orders はどんな引数でも自担当を越えない。
--      越えると、モデルが宛先にできる顧客の新しい供給源が生まれる
--   2. **食い違わないこと**。search_orders の合計と revenue_summary の実績が、
--      同じ月について必ず一致する（2 本が別々に集計規則を持っていない証明）
--   3. **黙って落とさないこと**。一般スタッフが「店全体で」と言ったとき、
--      自担当の数字が「店全体」というラベルで返るのが最悪の形

begin;
create extension if not exists pgtap with schema extensions;

select plan(27);


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

-- 「今月」は JST で決まる（revenue_summary の中と同じ基準にしないと、
-- 月初の 9 時間だけテストが落ちる）。
create or replace function pg_temp.jst_today() returns date
  language sql stable as $$ select (now() at time zone 'Asia/Tokyo')::date $$;

create or replace function pg_temp.jst_month() returns char(7)
  language sql stable as $$ select to_char(pg_temp.jst_today(), 'YYYY-MM')::char(7) $$;


-- ── 登場人物 ────────────────────────────────────────────

\set admin_uid 'e7111111-1111-4111-8111-111111111111'
\set a_uid     'e7222222-2222-4222-8222-222222222222'
\set b_uid     'e7333333-3333-4333-8333-333333333333'

select pg_temp.make_staff(:'admin_uid', '注文管理者', 'o-admin@example.com', 'admin') as admin_id \gset
select pg_temp.make_staff(:'a_uid',     '注文-A',    'o-a@example.com')               as a_id     \gset
select pg_temp.make_staff(:'b_uid',     '注文-B',    'o-b@example.com')               as b_id     \gset

select pg_temp.as_postgres();

-- A の担当を 3 名。**注文は 6 件**にする（上限を付けていたら露見する数）。
insert into public.customers (id, name, name_kana, staff_id)
select ('e7c00000-0000-4000-8000-00000000000' || i)::uuid,
       '受注 ' || i, 'ジュチュウ ' || i, :'a_id'
  from generate_series(1, 3) i;

-- B の担当に 1 名。境界を越えたら数に出る。
insert into public.customers (id, name, name_kana, staff_id)
values ('e7c00000-0000-4000-8000-000000000099', '他担当 次郎', 'タタントウ ジロウ', :'b_id');

-- A の注文 6 件。今月受注、金額はばらす。うち 1 件は生地名が空、1 件はキャンセル。
-- taken_by_staff_id（受注者）は埋めるが、**集計はこれで数えない。**
-- 数えるのは customers.staff_id（担当）のほう。受注者で数えると、
-- 同僚が代理で受けた注文が担当者の実績から抜け落ちる。
insert into public.orders
  (id, customer_id, taken_by_staff_id, order_number, ordered_at, arrived_at, delivered_at,
   status, purpose, fabric_color_name, fabric_product_number, total_amount)
values
  ('e7000000-0000-4000-8000-000000000001', 'e7c00000-0000-4000-8000-000000000001',
   :'a_id', 'T-001', pg_temp.jst_today(), pg_temp.jst_today(), pg_temp.jst_today(),
   'delivered', 'business', 'ネイビー無地', 'AC-1001', 200000),
  ('e7000000-0000-4000-8000-000000000002', 'e7c00000-0000-4000-8000-000000000001',
   :'a_id', 'T-002', pg_temp.jst_today(), pg_temp.jst_today(), null,
   'ordered', 'business', 'ミッドナイトネイビー', 'AC-1002', 300000),
  ('e7000000-0000-4000-8000-000000000003', 'e7c00000-0000-4000-8000-000000000002',
   :'a_id', 'T-003', pg_temp.jst_today(), pg_temp.jst_today(), pg_temp.jst_today(),
   'delivered', 'formal', 'チャコールグレー', 'AC-1003', 600000),
  ('e7000000-0000-4000-8000-000000000004', 'e7c00000-0000-4000-8000-000000000002',
   :'a_id', 'T-004', pg_temp.jst_today(), pg_temp.jst_today(), pg_temp.jst_today(),
   'delivered', 'business', null, null, 150000),
  ('e7000000-0000-4000-8000-000000000005', 'e7c00000-0000-4000-8000-000000000003',
   :'a_id', 'T-005', pg_temp.jst_today(), pg_temp.jst_today(), pg_temp.jst_today(),
   'delivered', 'wedding', 'ライトグレー', 'AC-1005', 250000),
  -- **キャンセルは実績に入らない。**入ると達成率が実態より高く出る
  ('e7000000-0000-4000-8000-000000000006', 'e7c00000-0000-4000-8000-000000000003',
   :'a_id', 'T-006', pg_temp.jst_today(), null, null,
   'cancelled', 'business', 'ネイビーストライプ', 'AC-1006', 999999);

-- B の注文 1 件。A から見えてはいけない。
insert into public.orders
  (id, customer_id, taken_by_staff_id, order_number, ordered_at, arrived_at, delivered_at,
   status, purpose, fabric_color_name, total_amount)
values
  ('e7000000-0000-4000-8000-000000000099', 'e7c00000-0000-4000-8000-000000000099',
   :'b_id', 'T-099', pg_temp.jst_today(), pg_temp.jst_today(), pg_temp.jst_today(),
   'delivered', 'business', 'ネイビー無地', 777000);

-- A の今月の目標
insert into public.revenue_targets (staff_id, month, amount)
values (:'a_id', pg_temp.jst_month(), 2000000);


-- ── 上限が無い / キャンセルが入らない ───────────────────

select pg_temp.login_as(:'a_uid');

select is(
  (app.search_orders(p_ordered_month => pg_temp.jst_month())->>'orderCount')::int,
  5,
  '今月の注文は 5 件。**キャンセルの 1 件は数えない**'
);

select is(
  jsonb_array_length(app.search_orders(p_ordered_month => pg_temp.jst_month())->'orders'),
  5,
  '一覧も 5 件。**上限を付けていない**（既定の 5 を超える 6 件を作って確かめている）'
);

select is(
  (app.search_orders(p_ordered_month => pg_temp.jst_month())->>'customerCount')::int,
  3,
  '人の数は 3 名。**注文の数と別のフィールドで返す**'
);

select is(
  (app.search_orders(p_ordered_month => pg_temp.jst_month())->>'totalAmount')::bigint,
  1500000::bigint,
  '合計は 150 万。キャンセルの 999,999 円は入らない'
);


-- ── 境界。どんな引数でも自担当を越えない ────────────────

select is(
  (select count(*) from jsonb_array_elements(
     app.search_orders(p_ordered_month => pg_temp.jst_month())->'orders') o
    where o->>'customerId' = 'e7c00000-0000-4000-8000-000000000099'),
  0::bigint,
  '他スタッフの顧客の注文は返らない'
);

select pg_temp.login_as(:'admin_uid');

select is(
  (app.search_orders(p_ordered_month => pg_temp.jst_month())->>'orderCount')::int,
  0,
  '**管理者でも自担当固定。**search_orders は宛先の新しい供給源にならない'
);


-- ── 生地は部分一致。引けなかった分を必ず名乗る ──────────

select pg_temp.login_as(:'a_uid');

select is(
  (app.search_orders(p_ordered_month => pg_temp.jst_month(),
                     p_fabric => 'ネイビー')->>'orderCount')::int,
  2,
  '生地の部分一致で 2 件（キャンセルの 1 件は母集団に入らない）'
);

select is(
  (app.search_orders(p_ordered_month => pg_temp.jst_month(),
                     p_fabric => 'ネイビー')->>'fabricUnknownCount')::int,
  1,
  '**生地名が空の注文が 1 件あることを名乗る。**言わないと落ちた分に誰も気づけない'
);

select is(
  (app.search_orders(p_ordered_month => pg_temp.jst_month())->>'fabricUnknownCount')::int,
  0,
  '生地で引いていないときは 0（「引けなかった」の話ではないため）'
);

select is(
  (app.search_orders(p_ordered_month => pg_temp.jst_month(),
                     p_fabric => 'AC-1003')->>'orderCount')::int,
  1,
  '原反ＮＯ でも引ける'
);


-- ── 金額・用途・お渡し ──────────────────────────────────

select is(
  (app.search_orders(p_ordered_month => pg_temp.jst_month(),
                     p_min_amount => 500000)->>'orderCount')::int,
  1,
  '50 万以上は 1 件'
);

select is(
  (app.search_orders(p_ordered_month => pg_temp.jst_month(),
                     p_purpose => 'wedding')->>'orderCount')::int,
  1,
  '用途で引ける'
);

select is(
  (app.search_orders(p_ordered_month => pg_temp.jst_month(),
                     p_undelivered => true)->>'orderCount')::int,
  1,
  'まだお渡ししていない注文は 1 件'
);

select is(
  (select o->>'deliveryIsPlanned'
     from jsonb_array_elements(
       app.search_orders(p_ordered_month => pg_temp.jst_month(),
                         p_undelivered => true)->'orders') o),
  'true',
  'お渡し日が空で納品日があるものは「予定」と名乗る（実績と混ぜない）'
);


-- ── 条件が無ければ全件ではなくエラー ────────────────────

select ok(
  app.search_orders() ? 'error',
  '**条件が 1 つも無ければ error。**上限を付けるのではなく入口で止める'
);


-- ── 売上。search_orders と必ず一致する ──────────────────

select is(
  (select m->>'revenue' from jsonb_array_elements(
     app.revenue_summary(p_month => pg_temp.jst_month())->'months') m),
  (app.search_orders(p_ordered_month => pg_temp.jst_month())->>'totalAmount'),
  '**同じ月なら search_orders の合計と revenue_summary の実績が一致する**（集計規則が 1 箇所にある証明）'
);

select is(
  (select (m->>'target')::int from jsonb_array_elements(
     app.revenue_summary(p_month => pg_temp.jst_month())->'months') m),
  2000000,
  '自担当なら目標が返る'
);

select is(
  (select m->>'rate' from jsonb_array_elements(
     app.revenue_summary(p_month => pg_temp.jst_month())->'months') m),
  '0.750',
  '達成率は 150 万 / 200 万 = 0.75'
);


-- ── 店全体は管理者だけ。断ったことを黙らせない ──────────

select is(
  app.revenue_summary(p_store_wide => true)->>'scope',
  'mine',
  '一般スタッフが店全体を頼んでも自担当に落ちる'
);

select is(
  app.revenue_summary(p_store_wide => true)->>'scopeDenied',
  'true',
  '**落としたことをフィールドで名乗る。**黙ると自担当の数字が「店全体」として伝わる'
);

select is(
  app.revenue_summary(p_store_wide => true)->>'targetAvailable',
  'true',
  '自担当に落ちたのだから目標は返せる'
);


-- ── 管理者の店全体 ─────────────────────────────────────

select pg_temp.login_as(:'admin_uid');

select is(
  app.revenue_summary(p_store_wide => true, p_month => pg_temp.jst_month())->>'scope',
  'store',
  '管理者は店全体を見られる'
);

select is(
  app.revenue_summary(p_store_wide => true, p_month => pg_temp.jst_month())->>'targetAvailable',
  'false',
  '**店全体では目標を扱わない。**各人の目標の合計は画面のどこにも出ておらず、人が検算できない'
);

select is(
  (select (m->>'target') from jsonb_array_elements(
     app.revenue_summary(p_store_wide => true, p_month => pg_temp.jst_month())->'months') m),
  null,
  '店全体の月にも目標は乗らない'
);

select ok(
  jsonb_array_length(
    app.revenue_summary(p_store_wide => true, p_month => pg_temp.jst_month())->'byStaff') >= 2,
  '店全体ならスタッフごとの内訳が返る（「白髭さんの今月の売上」に答えられる）'
);

-- **byStaff は months と同じ期間で絞る。**素通しにしていたときは開店以来の合計が返り、
-- 「今月は誰がいくら」に別の期間の数字を答えていた。
select is(
  (select sum((b->>'revenue')::bigint) from jsonb_array_elements(
     app.revenue_summary(p_store_wide => true, p_months => 2)->'byStaff') b),
  (select sum((m->>'revenue')::bigint) from jsonb_array_elements(
     app.revenue_summary(p_store_wide => true, p_months => 2)->'months') m),
  '**byStaff の合計と months の合計が一致する**（同じ期間・同じ母集団を見ている証明）'
);


-- ── 採寸履歴は既定では返さない ──────────────────────────

select is(
  app.customer_dossier('e7c00000-0000-4000-8000-000000000001')->'measurements',
  'null'::jsonb,
  '**既定では採寸履歴を返さない**（人の記録がベクトルの海に埋もれるため）'
);


select * from finish();
rollback;
