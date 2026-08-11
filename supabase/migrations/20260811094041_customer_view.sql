-- 顧客 + 最終納品。
--
-- モックの decorate() が顧客ごとに付けていたものをビューにする。
-- あちらは lastDeliveredMap() を一覧のたびに 1 度組み立てて
-- 顧客数×注文数の走査を避けていた。DB では lateral 1 本で済む。
--
-- 「納品からの経過日数」を持つのは、着心地を伺うのに意味があるのが
-- 最終接触からではなく納品からの日数だから。
--
-- security_invoker = true を忘れるとビューは所有者権限で走り RLS を
-- 丸ごと迂回する。CI が全ビューを検査している。

create view public.v_customers with (security_invoker = true) as
select
  c.*,
  d.delivered_at as last_delivered_at,
  d.id          as last_delivered_order_id,
  case
    when d.delivered_at is null then null
    else (current_date - d.delivered_at)
  end as days_since_delivery
from public.customers c
left join lateral (
  -- 起点は最新の納品だけ。注文ごとには立てない
  -- （新しく納品があれば、古い納品のフォローはもう意味を持たない）。
  select o.id, o.delivered_at
    from public.orders o
   where o.customer_id = c.id
     and o.delivered_at is not null
     and o.status <> 'cancelled'
   order by o.delivered_at desc
   limit 1
) d on true;

comment on view public.v_customers is
  '顧客一覧の素。モックの decorate() に相当する。archived_at では絞らない — カルテを直接開く経路があるため、絞るのは呼び出し側。';

grant select on public.v_customers to authenticated;


-- v_approach_inputs も同じ lateral を持っていたので、こちらへ寄せる。
-- 2 箇所で「最新の納品」を定義すると、片方だけ直したときに
-- 一覧とアプローチで違う注文を指すようになる。
--
-- create or replace では列を足せない（並びと名前を変えられない）ので作り直す。
drop view if exists public.v_approach_inputs;

create view public.v_approach_inputs with (security_invoker = true) as
select
  c.id   as customer_id,
  c.name,
  c.name_kana,
  c.company_name,
  c.staff_id,
  c.last_contacted_at,
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
