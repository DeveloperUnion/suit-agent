-- Phase 3: 同意フラグ（写真掲載・夜間連絡）を落とす
--
-- 20260812093000_facts_migration.sql で tags から切り出した 2 列だが、
-- 運用してみて一度も使われなかった。「取り扱い」枠の下半分を占めて、
-- 本来そこで無条件に読ませたい NG 事項の視線を奪っていたので落とす。
--
-- 着装写真（20260812140000）を持つことと矛盾しないか、について:
-- photo_consent は「掲載」＝対外利用の同意で、カルテに写真を持つことの
-- 同意ではない。掲載を始めるなら、そのときに掲載媒体ごとの同意として
-- 作り直すほうが正しい（媒体を区別しない boolean 1 本では足りない）。

-- ビューが customers を c.* で参照しているので、先に落として作り直す。
-- create or replace view では列を減らせない。

drop view if exists public.v_approach_inputs;
drop view if exists public.v_customers;

alter table public.customers
  drop column photo_consent,
  drop column night_contact_ok;


-- ── ビューを作り直す ────────────────────────────────────
--
-- security_invoker = true を忘れるとビューは所有者権限で走り、RLS を丸ごと
-- 迂回する。CI（01_structure.test.sql）が全ビューを検査している。

create view public.v_customers with (security_invoker = true) as
select
  c.*,
  d.delivered_at as last_delivered_at,
  d.id           as last_delivered_order_id,
  case
    when d.delivered_at is null then null
    else (current_date - d.delivered_at)
  end as days_since_delivery
from public.customers c
left join lateral (
  -- 起点は最新のお渡しだけ。注文ごとには立てない
  -- （新しくお渡しがあれば、古いぶんのフォローはもう意味を持たない）。
  select o.id, o.delivered_at
    from public.orders o
   where o.customer_id = c.id
     and o.delivered_at is not null
     and o.status <> 'cancelled'
   order by o.delivered_at desc
   limit 1
) d on true;

comment on view public.v_customers is
  '顧客一覧の素。archived_at では絞らない — カルテを直接開く経路があるため、絞るのは呼び出し側。';

grant select on public.v_customers to authenticated;

create view public.v_approach_inputs with (security_invoker = true) as
select
  c.id   as customer_id,
  c.name,
  c.name_kana,
  c.company_name,
  c.staff_id,
  c.last_delivered_at,
  c.last_delivered_order_id,
  c.days_since_delivery,
  coalesce(a.anniversaries, '[]'::jsonb) as anniversaries
from public.v_customers c
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
  'アプローチ判定の入力。顧客ごとに記念日を引くと 300 クエリになるので、jsonb に畳んで 1 回で返す。';

grant select on public.v_approach_inputs to authenticated;
