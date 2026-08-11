-- Phase 1: 注文
--
-- 生地マスタと標準価格は上流で廃止された（5ef0d88）。原反ＮＯ・色番・色名・組成は
-- すべて発注書の上にあるので、マスタを引かず紙の値をそのまま持つ。
-- 色系統（navy / gray …）は復活させない判断なので、「紺をまだ持っていない人」は
-- 引けない。引けるのは原反ＮＯ の完全一致まで。
--
-- 生地は order_items ではなく orders に置く。上流の実装は受け取りが注文単位
-- （「生地は 1 注文で 1 種類。紙が原反NO を 1 つしか持たない」）なのに保存だけ
-- 明細ごとにコピーしており、OrderItem.fabricId だった頃の名残になっている。
-- 金額を注文単位へ移した（OrderItem.amount の削除）のと同じ判断を適用する。

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,

  order_number text not null,
  ordered_at    date not null,
  due_date      date,
  delivered_at  date,

  status  text not null default 'ordered'
          check (status in ('ordered', 'in_production', 'fitting', 'delivered', 'cancelled')),
  purpose text not null check (purpose in ('business', 'formal', 'wedding', 'casual')),

  -- 紙の生地欄をそのまま
  fabric_product_number text,   -- 原反ＮＯ  例: AC5601
  fabric_color_number   text,   -- 色番      例: 3330
  fabric_color_name     text,   -- 色名      例: カーキ無地
  fabric_composition    text,   -- 組成      例: N(ナイロン) 92% / U(ポリウレタン) 8%

  -- 紙の右上と同じ 4 欄。
  -- CHECK も再計算トリガーも張らない — 3 つの和と合計が一致しないことが
  -- 正常な状態だから。工場側が計算した消費税は端数処理が不明で、計算値と
  -- 1 円ずれうる。「紙の合計欄が正」という原則を DB で壊さない。
  subtotal_amount  integer not null default 0,   -- 売上金額
  surcharge_amount integer not null default 0,   -- 割増金額
  tax_amount       integer not null default 0,   -- 消費税
  total_amount     integer not null default 0,   -- 合計金額

  -- 「誰が操作したか」の記録。RLS には使わない。
  -- 同僚が代理で受けた注文を RLS に使うと、担当者から自分の顧客の注文が消える。
  taken_by_staff_id uuid not null references public.staff (id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.orders.total_amount is
  '合計金額。3 つの和が既定だが紙の合計欄が正なので手で上書きできる。CHECK を張ってはいけない。';
comment on column public.orders.taken_by_staff_id is
  '受注した人。顧客の担当（customers.staff_id）とは別物で、RLS の判定には使わない。';

create index orders_customer_id_idx on public.orders (customer_id);
create index orders_delivered_idx   on public.orders (customer_id, delivered_at desc)
  where delivered_at is not null;

create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute function app.touch_updated_at();

alter table public.orders enable row level security;
alter table public.orders force row level security;

create policy orders_select on public.orders
  for select to authenticated using (app.can_read_customer(customer_id));
create policy orders_insert on public.orders
  for insert to authenticated with check (app.can_write_customer(customer_id));
create policy orders_update on public.orders
  for update to authenticated
  using (app.can_write_customer(customer_id))
  with check (app.can_write_customer(customer_id));
-- DELETE ポリシーは作らない。取り消しは status = 'cancelled'。
-- 注文を消すと approach_resolutions.trigger_key（post_delivery:{orderId}:6m）が
-- 孤児になり、納品後フォローの対応履歴が意味を失う。
revoke delete on public.orders from authenticated, anon;
grant select, insert, update on public.orders to authenticated;


-- ── 注文明細 ────────────────────────────────────────────
--
-- 金額を持たない。工場発注書は明細ごとの金額を持たず、金額は注文単位の 4 欄が
-- すべてだから（上流で OrderItem.amount と按分処理が削除された）。
-- 生地も持たない（orders 側へ移動）。
-- photo_urls も持たない — Storage を使わない判断のため。型にあるだけで
-- どこからも参照されていなかった。

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  item_type_id text not null,
  created_at timestamptz not null default now()
);

create index order_items_order_id_idx on public.order_items (order_id);

alter table public.order_items enable row level security;
alter table public.order_items force row level security;

-- 明細は注文経由で境界を継ぐ。order_items に customer_id を非正規化しない。
create policy order_items_select on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o
                  where o.id = order_id and app.can_read_customer(o.customer_id)));
create policy order_items_insert on public.order_items
  for insert to authenticated
  with check (exists (select 1 from public.orders o
                       where o.id = order_id and app.can_write_customer(o.customer_id)));
create policy order_items_update on public.order_items
  for update to authenticated
  using (exists (select 1 from public.orders o
                  where o.id = order_id and app.can_write_customer(o.customer_id)))
  with check (exists (select 1 from public.orders o
                       where o.id = order_id and app.can_write_customer(o.customer_id)));
-- 明細は消せてよい（注文の作り直しは実務で起きる）
create policy order_items_delete on public.order_items
  for delete to authenticated
  using (exists (select 1 from public.orders o
                  where o.id = order_id and app.can_write_customer(o.customer_id)));

grant select, insert, update, delete on public.order_items to authenticated;
