-- 利き手・利き足。
--
-- 列で持つ。カルテの箱の分け方（README「カルテの箱の分け方」）でいう
-- 「機械が値そのものを使う」側 — 袖丈の左右差と股下差は、利き手・利き足が
-- 決まらないと出せない。パーソナル（チップ）に「左利き」と書いても、
-- 仕立ての前提としては読めない。
--
-- 生涯変わらないので顧客に付ける。時間で動く身長・体重を
-- measurement_sheets 側に置いてあるのと対になる判断。
--
-- 値は 'right' / 'left' の 2 つだけ。「両利き」は入れない — スーツの仕立てでは
-- 「どちらに合わせて作るか」を 1 つ決める必要があり、両方を許すと
-- 決めていないことが決めた顔をして残る。迷う人は未設定（NULL）のままにする。

-- ビューが customers を c.* で参照している。**`*` はビューを作った時点で
-- 展開されて固定される**ので、列を足しただけでは v_customers に出てこない
-- （c.dominant_hand does not exist で customer_dossier が落ちる）。
-- 列を減らすときと同じく、落として作り直す。
--
-- create or replace view では列の途中に足せない。新しい列は customers の末尾に
-- 付くので、展開すると last_delivered_at より手前に割り込む形になる。

drop view if exists public.v_approach_inputs;
drop view if exists public.v_customers;

alter table public.customers
  add column dominant_hand text check (dominant_hand in ('right', 'left')),
  add column dominant_foot text check (dominant_foot in ('right', 'left'));

comment on column public.customers.dominant_hand is
  '利き手。right / left。袖丈の左右差の前提。未設定は NULL。';
comment on column public.customers.dominant_foot is
  '利き足。right / left。股下の左右差の前提。未設定は NULL。';

-- change_log は列の許可リストを持たない汎用トリガーなので、新しい列は自動で差分に載る。


-- ── ビューを作り直す ────────────────────────────────────
--
-- 中身は 20260812150000_handover_and_similar_customers.sql（v_customers）と
-- 20260812142000_drop_consent_columns.sql（v_approach_inputs）のまま。
-- security_invoker = true を忘れるとビューは所有者権限で走り RLS を丸ごと迂回する。
-- CI（01_structure.test.sql）が全ビューを検査している。

create view public.v_customers with (security_invoker = true) as
select
  c.*,
  d.at           as last_delivered_at,
  d.id           as last_delivered_order_id,
  case
    when d.at is null then null
    else (current_date - d.at)
  end as days_since_delivery,
  -- 似た顧客の候補行で「何着作った方か」を見分けるのに使う
  coalesce(n.order_count, 0) as order_count
from public.customers c
left join lateral (
  -- 起点は最新の 1 件だけ。注文ごとには立てない
  -- （新しくお渡しがあれば、古いお渡しのフォローはもう意味を持たない）。
  --
  -- 未来の日付は数えない。納品日は受注時点で「40 日後に届く予定」として入るので、
  -- そのまま起点にすると、まだ何も受け取っていない顧客が
  -- 「お渡しから -34 日」になって一覧の並びにも紛れ込む。
  select o.id, coalesce(o.delivered_at, o.arrived_at) as at
    from public.orders o
   where o.customer_id = c.id
     and coalesce(o.delivered_at, o.arrived_at) <= current_date
     and o.status <> 'cancelled'
   order by coalesce(o.delivered_at, o.arrived_at) desc
   limit 1
) d on true
left join lateral (
  select count(*) as order_count
    from public.orders o
   where o.customer_id = c.id
     and o.status <> 'cancelled'
) n on true;

comment on view public.v_customers is
  '顧客一覧の素。last_delivered_at は「お渡し日、無ければ納品日」。archived_at では絞らない — カルテを直接開く経路があるため、絞るのは呼び出し側。';

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


-- ── app.customer_dossier に 2 項目を足す ────────────────
--
-- ここは列を明示列挙している。足し忘れると、エージェントは「記録がありません」と
-- 答える — 列は在るのに読めていない、という一番気づけない形の誤りになる。
--
-- 本体は 20260813120000_search_customers.sql と同一。追加は customer 直下の 2 行だけ。


create or replace function app.customer_dossier(p_customer_id uuid)
returns jsonb
  language sql
  stable
  set search_path = ''
as $$
  select case when c.id is null then null else jsonb_build_object(
    'customer', jsonb_build_object(
      'id', c.id, 'name', c.name, 'nameKana', c.name_kana,
      'birthDate', c.birth_date, 'gender', c.gender,
      'phone', c.phone, 'email', c.email, 'address', c.address,
      'residencePrefecture', c.residence_prefecture,
      'embroideryName', c.embroidery_name,
      'companyName', c.company_name, 'department', c.department,
      'jobTitle', c.job_title, 'industry', c.industry,
      'familyInfo', c.family_info,
      'dominantHand', c.dominant_hand, 'dominantFoot', c.dominant_foot,
      'lastDeliveredAt', c.last_delivered_at,
      'daysSinceDelivery', c.days_since_delivery,
      'orderCount', c.order_count
    ),
    'facts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'label', l.name, 'category', l.category_key,
               'body', f.body, 'observedOn', f.observed_on
             ) order by f.created_at desc)
        from public.customer_facts f
        left join public.fact_labels l on l.id = f.label_id
       where f.customer_id = c.id and f.invalidated_at is null
    ), '[]'::jsonb),
    'ngNotes', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body) order by n.created_at)
        from public.customer_ng_notes n
       where n.customer_id = c.id and n.invalidated_at is null
    ), '[]'::jsonb),
    'anniversaries', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'type', a.type, 'date', a.date, 'label', a.label
             ) order by a.date)
        from public.customer_anniversaries a
       where a.customer_id = c.id
    ), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'orderNumber', o.order_number,
               'orderedAt', o.ordered_at, 'arrivedAt', o.arrived_at,
               'deliveredAt', o.delivered_at, 'status', o.status, 'purpose', o.purpose,
               'fabric', jsonb_build_object(
                 'productNumber', o.fabric_product_number,
                 'colorNumber', o.fabric_color_number,
                 'colorName', o.fabric_color_name,
                 'composition', o.fabric_composition
               ),
               'totalAmount', o.total_amount,
               'items', coalesce((
                 select jsonb_agg(t.name order by t.display_order)
                   from public.order_items oi
                   join public.item_types t on t.id = oi.item_type_id
                  where oi.order_id = o.id
               ), '[]'::jsonb)
             ) order by o.ordered_at desc)
        from public.orders o
       where o.customer_id = c.id
    ), '[]'::jsonb),
    -- 採寸は最新の 1 枚。「前回のジャケットの着丈は」に答えるための材料で、
    -- 履歴まで入れると人の記録がベクトルの海に埋もれる。
    'latestMeasurement', (
      select jsonb_build_object(
               'sheetId', sh.id, 'measuredAt', sh.measured_at,
               'heightCm', sh.height_cm, 'weightKg', sh.weight_kg, 'note', sh.note,
               'sections', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'itemType', t.name,
                          'silhouette', sec.silhouette,
                          'values', coalesce((
                            select jsonb_agg(jsonb_build_object(
                                     'field', mf.label, 'unit', mf.unit,
                                     'actual', mv.actual, 'finished', mv.finished
                                   ) order by mf.display_order)
                              from public.measurement_values mv
                              join public.measurement_fields mf
                                on mf.item_type_id = mv.item_type_id and mf.key = mv.field_key
                             where mv.sheet_id = sec.sheet_id
                               and mv.item_type_id = sec.item_type_id
                          ), '[]'::jsonb)
                        ) order by t.display_order)
                   from public.measurement_sections sec
                   join public.item_types t on t.id = sec.item_type_id
                  where sec.sheet_id = sh.id
               ), '[]'::jsonb)
             )
        from public.measurement_sheets sh
       where sh.customer_id = c.id
       order by sh.measured_at desc, sh.created_at desc
       limit 1
    )
  ) end
  from public.v_customers c
 where c.id = p_customer_id
$$;

comment on function app.customer_dossier(uuid) is
  'その顧客の記録を丸ごと返す。「どんな人だっけ」に検索を使わないための口。';
