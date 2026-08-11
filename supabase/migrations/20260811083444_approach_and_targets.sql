-- Phase 1: アプローチと売上目標

-- ── アプローチの解決 ────────────────────────────────────
--
-- 上流の trigger_key 設計をそのまま採る。当初 approach_states +
-- approach_resolutions の 2 表分割を提案したが取り下げた。
--
-- レコードが有る＝対応済み、無い＝未対応。状態を持たないので上書き事故が
-- 起きず、「半年をスキップしても 1 年後は出す」「今年の誕生日を見送っても
-- 来年は出す」が自然に成立する。DB では unique (trigger_key) を張るだけ。

create table public.approach_resolutions (
  id uuid primary key default gen_random_uuid(),

  -- 冪等性の本体。
  --   post_delivery:{orderId}:6m ／ post_delivery:{orderId}:12m
  --   anniversary:{anniversaryId}:{発火する年}
  -- orderId / anniversaryId を含むのでグローバルに一意になる。
  trigger_key text not null unique,

  -- RLS 判定用。trigger_key からは顧客を引けないので持つ。
  customer_id uuid not null references public.customers (id) on delete cascade,

  trigger_type text not null check (trigger_type in ('post_delivery', 'anniversary')),

  -- 判断した時点の根拠を焼き付ける。表示文言は毎週変わりうるので、
  -- 後から再計算すると履歴の意味がずれる。
  reason text not null,

  status text not null check (status in ('done', 'skipped')),
  resolved_at timestamptz not null default now(),
  resolved_by_staff_id uuid not null references public.staff (id)
);

comment on table public.approach_resolutions is
  '人が下した判断だけを保存する。アプローチそのものは毎回導出するので、ここに「未対応」の行は存在しない。';
comment on column public.approach_resolutions.trigger_key is
  'anniversary:{anniversaryId}:{年} の anniversaryId は必ず uuid。位置由来の ID にすると、記念日を 1 つ消したとき後続が繰り上がって別の記念日と衝突し、無音で「対応済み」と誤判定される。';

create index approach_resolutions_customer_idx
  on public.approach_resolutions (customer_id, resolved_at desc);

alter table public.approach_resolutions enable row level security;
alter table public.approach_resolutions force row level security;

create policy approach_resolutions_select on public.approach_resolutions
  for select to authenticated using (app.can_read_customer(customer_id));
create policy approach_resolutions_insert on public.approach_resolutions
  for insert to authenticated with check (app.can_write_customer(customer_id));

-- UPDATE も DELETE も無い。「連絡した」を取り消す業務が無く、
-- 追記のみにしておけば trigger_key の一意制約が冪等性をそのまま保証する。
revoke update, delete on public.approach_resolutions from authenticated, anon;
grant select, insert on public.approach_resolutions to authenticated;


-- ── 売上目標 ────────────────────────────────────────────
--
-- 閲覧は全員。週次ミーティングで並べる運用なので、他人の目標が見えないと
-- 成立しない。編集は自分の分は自分で、他人の分は管理者だけ。

create table public.revenue_targets (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id),
  month char(7) not null check (month ~ '^\d{4}-\d{2}$'),   -- YYYY-MM
  amount integer not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, month)
);

comment on table public.revenue_targets is
  '売上目標。集計側は orders.total_amount（税込）を見る — 紙の合計欄と目で一致することを優先した店舗判断。';

create trigger revenue_targets_touch_updated_at
  before update on public.revenue_targets
  for each row execute function app.touch_updated_at();

alter table public.revenue_targets enable row level security;
alter table public.revenue_targets force row level security;

create policy revenue_targets_select on public.revenue_targets
  for select to authenticated using (true);

create policy revenue_targets_insert on public.revenue_targets
  for insert to authenticated
  with check (staff_id = app.current_staff_id() or app.is_admin());

create policy revenue_targets_update on public.revenue_targets
  for update to authenticated
  using      (staff_id = app.current_staff_id() or app.is_admin())
  with check (staff_id = app.current_staff_id() or app.is_admin());

revoke delete on public.revenue_targets from authenticated, anon;
grant select, insert, update on public.revenue_targets to authenticated;


-- ── アプローチ評価の入力 ────────────────────────────────
--
-- 評価そのもの（根拠テキストと weight）は毎週変わる表示ロジックなので
-- アプリ層に残す。ここで束ねるのは入力だけ。
--
-- モックは顧客ごとに getDb().anniversaries.filter() を回している。
-- localStorage では無害だが、DB 化するとそのまま 300 クエリになる。
--
-- security_invoker = true を忘れるとビューは所有者権限で走り、RLS を丸ごと
-- 迂回する。この設計で最も踏みやすい穴なので、CI で全ビューを検査している。

create view public.v_approach_inputs with (security_invoker = true) as
select
  c.id   as customer_id,
  c.name,
  c.name_kana,
  c.company_name,
  c.staff_id,
  c.last_contacted_at,
  d.last_delivered_at,
  d.last_delivered_order_id,
  coalesce(a.anniversaries, '[]'::jsonb) as anniversaries
from public.customers c
left join lateral (
  -- 起点は最新の納品だけ。注文ごとには立てない
  -- （新しく納品があれば、古い納品のフォローはもう意味を持たない）。
  select o.delivered_at as last_delivered_at,
         o.id           as last_delivered_order_id
    from public.orders o
   where o.customer_id = c.id
     and o.delivered_at is not null
     and o.status <> 'cancelled'
   order by o.delivered_at desc
   limit 1
) d on true
left join lateral (
  select jsonb_agg(
           jsonb_build_object('id', an.id, 'type', an.type, 'date', an.date, 'label', an.label)
           order by an.date
         ) as anniversaries
    from public.customer_anniversaries an
   where an.customer_id = c.id
) a on true
where c.archived_at is null;

comment on view public.v_approach_inputs is
  'アプローチ評価の入力を 1 クエリに束ねる。評価ロジックはアプリ層（lib/data/approaches.ts）に残す。';

grant select on public.v_approach_inputs to authenticated;
