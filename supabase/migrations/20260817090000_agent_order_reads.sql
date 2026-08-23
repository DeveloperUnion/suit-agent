-- Phase 3: エージェントが「顧客を横断して」注文と売上を読む
--
-- これまでエージェントが読めたのは顧客 1 人ずつだった（app.customer_dossier）。
-- 「今月お渡しの人」「今月の売上」のような**横断の問い**に道具が無く、
-- しかも lib/ai/prompt.ts は「売上は扱えない」と書いていた一方で
-- dossier は total_amount を返していた。その食い違いをここで畳む。
--
--   app.orders_in_scope()   母集団。集計規則をこの 1 箇所に閉じる
--   app.search_orders()     注文を軸にした横断検索
--   app.revenue_summary()   月次の実績と目標
--   app.customer_dossier()  採寸履歴を返せるように引数を 1 つ足す
--
-- どれも SECURITY INVOKER（既定）。RLS はブラウザから引いたときとまったく同じに効く。


-- ── 母集団 ─────────────────────────────────────────────
--
-- **集計規則はここにしか書かない。**lib/data/dashboard.ts と
-- lib/data/settings.ts が別々に同じ規則を手書きしていて、片方だけ絞っていたせいで
-- 「同じ月の実績が 2 つの画面で違う数字になる」を既に一度やっている。
-- search_orders と revenue_summary が別々に書けば、いつか片方だけ直る。
--
--   ・キャンセルは数えない（売上でも件数でもないものを実績に入れると達成率が嘘になる）
--   ・数えるのは「担当している顧客の注文」。受注者では数えない
--     — 同僚が代理で受けた注文が担当者の実績から抜け落ちるため
--
-- **archived_at では絞らない。**ダッシュボードも絞っていない。顧客をアーカイブした
-- 瞬間に過去の売上が減るのは、実績としておかしい（search_customers が絞っているのは
-- 「これから声をかける相手」を返す道具だから。目的が違う）。
--
-- p_store_wide は **app.is_admin() のときだけ**効く。呼び側は「頼まれた範囲」と
-- 「実際に適用された範囲」を突き合わせて、落ちたことを黙らせない。

create or replace function app.orders_in_scope(
  p_viewing_staff_id uuid    default null,
  p_store_wide       boolean default false
) returns table (
  order_id      uuid,
  customer_id   uuid,
  customer_name text,
  customer_name_kana text,
  company_name  text,
  staff_id      uuid,
  staff_name    text,
  order_number  text,
  ordered_at    date,
  arrived_at    date,
  delivered_at  date,
  status        text,
  purpose       text,
  fabric_product_number text,
  fabric_color_name     text,
  total_amount  integer
)
  language sql
  stable
  set search_path = ''
as $$
  select o.id, c.id, c.name, c.name_kana, c.company_name, c.staff_id, st.name,
         o.order_number, o.ordered_at, o.arrived_at, o.delivered_at,
         o.status, o.purpose,
         o.fabric_product_number, o.fabric_color_name, o.total_amount
    from public.orders o
    join public.customers c on c.id = o.customer_id
    join public.staff st on st.id = c.staff_id
   where o.status <> 'cancelled'
     and (
       (p_store_wide and app.is_admin())
       or c.staff_id = coalesce(p_viewing_staff_id, app.current_staff_id())
     )
$$;

comment on function app.orders_in_scope(uuid, boolean) is
  '集計の母集団。キャンセルを除き、担当している顧客の注文だけを返す。店全体は管理者のときだけ。';


-- ── app.search_orders ──────────────────────────────────
--
-- **search_customers の引数を増やす形は採らない。**あちらは exactCount を
-- 言い切れることが存在理由で、その数の意味は match / labels / excluded の 3 つで
-- 完全に決まる形になっている。注文の条件を混ぜると、同じ数値フィールドが
-- 「人の数」と「注文の数」の 2 つの母数を指すことになる。それは
-- 20260815090000（match / exclude）で一度潰した失敗そのもの。
--
-- **scope 引数は付けない（自担当固定）。**「店全体で今月お渡しの人」は業務として
-- 存在しない（顧客はスタッフごとに分割されていて、他人の顧客には声をかけられない）。
-- それ以上に、**モデルが宛先にできる customerId の新しい供給源を作らない**ため。
-- いまその供給源は find_customers_by_name と search_customers の 2 本だけで、
-- どちらも SQL 側で担当に絞ってある。
--
-- 返す形の決めごと:
--   ・orders に LIMIT を付けない（search_customers と同じ担保）
--   ・orderCount と customerCount を**別のフィールド**で返す。「今月何件作った？」と
--     「今月何人にお渡し？」は別の問いで、1 つの数で答えると必ずどちらかが嘘になる
--   ・fabricUnknownCount … 色系統は復活させない判断（20260811082718_orders.sql）なので、
--     生地は色名の**部分一致**でしか引けない。紙に生地名が無い注文は静かに落ちるので、
--     その件数を必ず返す。similarAvailable が「近い人はいません」と
--     「意味検索がまだ使えません」を分けているのとまったく同じ理由。
--     **将来 fabric_color_family 列に進むなら、その入口はここ。**
--   ・条件が 1 つも来なかったら 0 件ではなく **error** を返す。全注文は数百件になるが、
--     上限を付けるのは網羅性の担保を壊す。**上限ではなく入口で止める。**
--
-- 月は SQL 側で月末まで展開する。**モデルに月の境界を計算させない。**

create or replace function app.search_orders(
  p_viewing_staff_id uuid    default null,
  p_ordered_month    char(7) default null,
  p_ordered_from     date    default null,
  p_ordered_to       date    default null,
  p_delivery_month   char(7) default null,
  p_delivery_from    date    default null,
  p_delivery_to      date    default null,
  p_fabric           text    default null,
  p_purpose          text    default null,
  p_min_amount       integer default null,
  p_max_amount       integer default null,
  p_undelivered      boolean default false
) returns jsonb
  language sql
  stable
  set search_path = ''
as $$
  with
  bounds as (
    select
      case when p_ordered_month is not null
           then to_date(p_ordered_month || '-01', 'YYYY-MM-DD')
           else p_ordered_from end as o_from,
      case when p_ordered_month is not null
           then (to_date(p_ordered_month || '-01', 'YYYY-MM-DD')
                 + interval '1 month' - interval '1 day')::date
           else p_ordered_to end as o_to,
      case when p_delivery_month is not null
           then to_date(p_delivery_month || '-01', 'YYYY-MM-DD')
           else p_delivery_from end as d_from,
      case when p_delivery_month is not null
           then (to_date(p_delivery_month || '-01', 'YYYY-MM-DD')
                 + interval '1 month' - interval '1 day')::date
           else p_delivery_to end as d_to
  ),

  -- 生地**以外**の条件を当てた集合。fabricUnknownCount はここから数える
  -- （生地で絞ったあとの集合から数えると必ず 0 になり、意味を成さない）。
  base as (
    select s.*, coalesce(s.delivered_at, s.arrived_at) as delivery_date
      from app.orders_in_scope(p_viewing_staff_id, false) s, bounds b
     where (b.o_from is null or s.ordered_at >= b.o_from)
       and (b.o_to   is null or s.ordered_at <= b.o_to)
       -- お渡しは「お渡し日、無ければ納品日」。**未来も落とさない**
       -- （「今月お渡しの人」は予定を含む問い）。
       and (b.d_from is null or coalesce(s.delivered_at, s.arrived_at) >= b.d_from)
       and (b.d_to   is null or coalesce(s.delivered_at, s.arrived_at) <= b.d_to)
       and (p_purpose    is null or s.purpose = p_purpose)
       and (p_min_amount is null or s.total_amount >= p_min_amount)
       and (p_max_amount is null or s.total_amount <= p_max_amount)
       and (not p_undelivered or s.delivered_at is null)
  ),

  hits as (
    select * from base
     where p_fabric is null
        or fabric_color_name ilike '%' || p_fabric || '%'
        or fabric_product_number ilike '%' || p_fabric || '%'
  ),

  unknown_fabric as (
    select count(*)::int as n
      from base
     where p_fabric is not null
       and coalesce(fabric_color_name, '') = ''
       and coalesce(fabric_product_number, '') = ''
  ),

  scope_label as (
    select st.name || ' さんの担当' as label
      from public.staff st
     where st.id = coalesce(p_viewing_staff_id, app.current_staff_id())
  ),

  -- **その数が何の数かを、数と一緒に返す。**search_customers の countMeans の兄弟。
  means as (
    select array_to_string(array_remove(array[
      case when b.o_from is not null or b.o_to is not null
           then '受注日 ' || coalesce(b.o_from::text, '') || '〜' || coalesce(b.o_to::text, '') end,
      case when b.d_from is not null or b.d_to is not null
           then 'お渡し ' || coalesce(b.d_from::text, '') || '〜' || coalesce(b.d_to::text, '') end,
      case when p_fabric is not null then '生地に「' || p_fabric || '」を含む' end,
      case when p_purpose is not null then '用途が ' || p_purpose end,
      case when p_min_amount is not null then p_min_amount::text || ' 円以上' end,
      case when p_max_amount is not null then p_max_amount::text || ' 円以下' end,
      case when p_undelivered then 'まだお渡ししていない' end
    ], null), '、') as label
      from bounds b
  )

  select case
    when p_ordered_month is null and p_ordered_from is null and p_ordered_to is null
     and p_delivery_month is null and p_delivery_from is null and p_delivery_to is null
     and p_fabric is null and p_purpose is null
     and p_min_amount is null and p_max_amount is null and not p_undelivered
    then jsonb_build_object(
      'error', '期間か条件を 1 つ以上指定してください。全件は返しません。')
    else jsonb_build_object(
      'scopeLabel',    (select label from scope_label),
      'countMeans',    (select label from means),
      'orderCount',    (select count(*) from hits),
      'customerCount', (select count(distinct customer_id) from hits),
      'totalAmount',   (select coalesce(sum(total_amount), 0) from hits),
      'fabricUnknownCount', (select n from unknown_fabric),
      'orders', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'orderId', h.order_id, 'customerId', h.customer_id,
                 'customerName', h.customer_name,
                 'customerNameKana', h.customer_name_kana,
                 'companyName', h.company_name,
                 'orderNumber', h.order_number,
                 'orderedAt', h.ordered_at,
                 'deliveryDate', h.delivery_date,
                 -- 「まだ渡していない予定」と「渡した実績」を同じ日付欄で返さない
                 'deliveryIsPlanned', (h.delivered_at is null and h.arrived_at is not null),
                 'status', h.status, 'purpose', h.purpose,
                 'fabricColorName', h.fabric_color_name,
                 'fabricProductNumber', h.fabric_product_number,
                 'totalAmount', h.total_amount
               ) order by h.ordered_at desc, h.customer_name)
          from hits h
      ), '[]'::jsonb)
    )
  end
$$;

comment on function app.search_orders(uuid, char, date, date, char, date, date, text, text, integer, integer, boolean) is
  '注文を軸にした横断検索。自担当固定・上限なし。注文の数と人の数を別に返す。';


-- ── app.revenue_summary ────────────────────────────────
--
-- **「今月」をここで決める。**ダッシュボードはブラウザ（JST）で月を作るが、
-- エージェントはサーバ（Vercel = UTC）で走る。同じ「今月」を別々に作ると、
-- 月初と月末の最大 9 時間だけ**画面と AI が別の月を指す**。
-- 店舗が JST 以外になったら、ここが設定になる。
--
-- **scopeDenied を返す。**一般スタッフが「店全体で」と言ったとき、RLS 任せにすると
-- 自担当の数字が「店全体」というラベルで返る、という最悪の形になる。
-- app.is_admin() で明示的に門を作り、通らなかったことをフィールドで返して、
-- 呼び側が「店全体は見られません」と言えるようにする。
--
-- **店全体では target を返さない（null）。**各スタッフの目標の合計は
-- ダッシュボードのどこにも出ておらず、**人が画面で検算できない数字**になる。
-- revenue_targets の select が using (true) なので技術的には出せるが、
-- 「AI しか知らない数字」を作らない側に倒した。返すのは実績と件数だけ。

create or replace function app.revenue_summary(
  p_viewing_staff_id uuid    default null,
  p_store_wide       boolean default false,
  p_month            char(7) default null,
  p_months           integer default 3
) returns jsonb
  language sql
  stable
  set search_path = ''
as $$
  with
  ctx as (
    select
      (now() at time zone 'Asia/Tokyo')::date as today,
      (p_store_wide and app.is_admin())       as store_wide,
      coalesce(p_viewing_staff_id, app.current_staff_id()) as staff_id
  ),

  -- p_month があれば単月。無ければ今月を含む直近 n ヶ月（1〜12 に丸める）。
  month_list as (
    select case
             when p_month is not null then p_month
             else to_char(
               (date_trunc('month', c.today) - (g.i || ' month')::interval)::date,
               'YYYY-MM')
           end as m
      from ctx c,
           generate_series(
             0,
             case when p_month is not null then 0
                  else greatest(least(coalesce(p_months, 3), 12), 1) - 1 end
           ) g(i)
  ),

  agg as (
    select to_char(o.ordered_at, 'YYYY-MM') as m,
           sum(o.total_amount)::bigint      as revenue,
           count(*)::int                    as order_count
      from ctx c, app.orders_in_scope(p_viewing_staff_id, c.store_wide) o
     group by 1
  ),

  -- 目標は**自分の担当のときだけ**。店全体では返さない（上のコメント）。
  tgt as (
    select t.month, t.amount
      from public.revenue_targets t, ctx c
     where not c.store_wide
       and t.staff_id = c.staff_id
  ),

  -- **months と同じ期間で絞る。**ここを p_month is null で素通しにしていたときは
  -- 全期間の合計が返り、「今月は誰がいくら」に開店以来の数字を答えていた。
  -- 数を返す以上、その数が何の期間の数かも一緒に返す（byStaffMeans）。
  by_staff as (
    select o.staff_name, sum(o.total_amount)::bigint as revenue, count(*)::int as order_count
      from ctx c, app.orders_in_scope(p_viewing_staff_id, c.store_wide) o
     where c.store_wide
       and to_char(o.ordered_at, 'YYYY-MM') in (select m from month_list)
     group by o.staff_name
  )

  select jsonb_build_object(
    'scope',          case when c.store_wide then 'store' else 'mine' end,
    'scopeRequested', case when p_store_wide then 'store' else 'mine' end,
    -- 頼まれた範囲と実際の範囲が食い違ったことを、黙らせない
    'scopeDenied',    (p_store_wide and not c.store_wide),
    'scopeLabel',     case when c.store_wide then '店全体'
                           else (select st.name || ' さんの担当'
                                   from public.staff st where st.id = c.staff_id) end,
    'today',          c.today,
    'countsBy',       '受注日で数える。キャンセルは除く。担当している顧客の注文で数える',
    'targetAvailable', not c.store_wide,
    'months', coalesce((
      select jsonb_agg(jsonb_build_object(
               'month',     ml.m,
               'revenue',   coalesce(a.revenue, 0),
               'orderCount', coalesce(a.order_count, 0),
               'target',    t.amount,
               'rate', case when t.amount is null or t.amount = 0 then null
                            else round(coalesce(a.revenue, 0)::numeric / t.amount, 3) end,
               'remaining', case when t.amount is null then null
                                 else greatest(t.amount - coalesce(a.revenue, 0), 0) end,
               -- 月の進み具合も SQL 側で出す。lib/utils/date.ts の monthProgress と
               -- 同じ式を TS 側に二重に持たせない（持たせると必ず片方だけ直る）。
               'monthProgress', case
                 when ml.m = to_char(c.today, 'YYYY-MM')
                 then round(
                   extract(day from c.today)::numeric
                   / extract(day from (date_trunc('month', c.today)
                                       + interval '1 month' - interval '1 day')), 3)
                 when ml.m > to_char(c.today, 'YYYY-MM') then 0
                 else 1 end,
               'isCurrent', ml.m = to_char(c.today, 'YYYY-MM')
             ) order by ml.m desc)
        from month_list ml
        left join agg a on a.m = ml.m
        left join tgt t on t.month = ml.m
    ), '[]'::jsonb),
    'byStaffMeans', case when c.store_wide then
      (select min(m) || '〜' || max(m) || ' の合計' from month_list) else null end,
    'byStaff', case when c.store_wide then coalesce((
      select jsonb_agg(jsonb_build_object(
               'staffName', b.staff_name,
               'revenue', b.revenue,
               'orderCount', b.order_count
             ) order by b.staff_name)
        from by_staff b
    ), '[]'::jsonb) else null end
  )
  from ctx c
$$;

comment on function app.revenue_summary(uuid, boolean, char, integer) is
  '月次の実績と目標。既定は自担当。店全体は管理者だけで、そのときは目標を返さない（画面で検算できないため）。';


-- ── 採寸の項目を JSON にする ───────────────────────────
--
-- customer_dossier が最新の 1 枚と履歴の両方で使う。**同じ入れ子を 2 回書かない。**
-- 書くと、項目を 1 つ足したときに片方だけ直る。

create or replace function app.measurement_sections_json(p_sheet_id uuid)
returns jsonb
  language sql
  stable
  set search_path = ''
as $$
  select coalesce((
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
     where sec.sheet_id = p_sheet_id
  ), '[]'::jsonb)
$$;

comment on function app.measurement_sections_json(uuid) is
  '採寸票 1 枚の項目を JSON に畳む。customer_dossier が最新分と履歴の両方で使う。';


-- ── app.customer_dossier に採寸履歴 ────────────────────
--
-- 「最近痩せた？」「前より細くなった？」に答える材料が無かった。
-- ただし **既定は 1 枚のまま**にする。20260813120000 の
-- 「履歴まで入れると人の記録がベクトルの海に埋もれる」はいまも正しい。
--
--   measuredAt / heightCm / weightKg / note … **全枚数**返す（軽いうえ、体型の変化はここで見える）
--   sections（項目ごとの実測・上がり寸） … 新しい順に p_measurement_detail 枚まで
--   measurementCount … 何枚あるか。**削れたことが見える**ようにする
--
-- 引数が増えるのでシグネチャが変わる。1 引数版を残すとデフォルト引数と衝突して
-- 呼び出しが曖昧になるので、public のラッパごと落として作り直す
-- （20260815090000 が match / exclude を足したときと同じ手順）。
-- **revoke / grant も書き直すこと。**書き漏らすと機能が黙って死ぬ。

drop function if exists public.customer_dossier(uuid);
drop function if exists app.customer_dossier(uuid);

create function app.customer_dossier(
  p_customer_id        uuid,
  p_measurement_detail integer default 1
) returns jsonb
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
               'sections', app.measurement_sections_json(sh.id)
             )
        from public.measurement_sheets sh
       where sh.customer_id = c.id
       order by sh.measured_at desc, sh.created_at desc
       limit 1
    ),
    -- 何枚あるか。**削れたことが見える**ようにする
    'measurementCount', (
      select count(*) from public.measurement_sheets sh where sh.customer_id = c.id
    ),
    -- 履歴。p_measurement_detail 枚目までは項目まで、それ以降は日付と身長体重だけ。
    -- 体型の変化を見るのに要るのは後者で、しかも軽い。
    'measurements', case when coalesce(p_measurement_detail, 1) <= 1 then null else coalesce((
      select jsonb_agg(x order by x->>'measuredAt' desc)
        from (
          select jsonb_build_object(
                   'sheetId', sh.id, 'measuredAt', sh.measured_at,
                   'heightCm', sh.height_cm, 'weightKg', sh.weight_kg, 'note', sh.note,
                   'sections', case
                     when row_number() over (order by sh.measured_at desc, sh.created_at desc)
                          <= p_measurement_detail
                     then app.measurement_sections_json(sh.id)
                     else null end
                 ) as x
            from public.measurement_sheets sh
           where sh.customer_id = c.id
        ) t
    ), '[]'::jsonb) end
  ) end
  from public.v_customers c
 where c.id = p_customer_id
$$;

comment on function app.customer_dossier(uuid, integer) is
  'その顧客の記録を丸ごと返す。採寸は既定で最新 1 枚、p_measurement_detail を上げると履歴も返す。';


-- ── PostgREST から呼ぶためのラッパ ──────────────────────
--
-- supabase-js の .rpc() は public しか見ない。中身は持たせない
-- （20260813120000 と同じ作り）。
--
-- orders_in_scope と measurement_sections_json にはラッパを作らない。
-- **あれは中の部品**で、外から直に呼ぶ口ではない。

create or replace function public.search_orders(
  p_viewing_staff_id uuid    default null,
  p_ordered_month    char(7) default null,
  p_ordered_from     date    default null,
  p_ordered_to       date    default null,
  p_delivery_month   char(7) default null,
  p_delivery_from    date    default null,
  p_delivery_to      date    default null,
  p_fabric           text    default null,
  p_purpose          text    default null,
  p_min_amount       integer default null,
  p_max_amount       integer default null,
  p_undelivered      boolean default false
) returns jsonb
  language sql
  stable
  set search_path = ''
as $$
  select app.search_orders(p_viewing_staff_id, p_ordered_month, p_ordered_from, p_ordered_to,
                           p_delivery_month, p_delivery_from, p_delivery_to,
                           p_fabric, p_purpose, p_min_amount, p_max_amount, p_undelivered)
$$;

create or replace function public.revenue_summary(
  p_viewing_staff_id uuid    default null,
  p_store_wide       boolean default false,
  p_month            char(7) default null,
  p_months           integer default 3
) returns jsonb
  language sql
  stable
  set search_path = ''
as $$
  select app.revenue_summary(p_viewing_staff_id, p_store_wide, p_month, p_months)
$$;

create function public.customer_dossier(
  p_customer_id        uuid,
  p_measurement_detail integer default 1
) returns jsonb
  language sql
  stable
  set search_path = ''
as $$
  select app.customer_dossier(p_customer_id, p_measurement_detail)
$$;


-- ── 権限 ───────────────────────────────────────────────
--
-- **customer_dossier は作り直したので、ここも書き直す。**
-- 落として作り直した関数は権限を引き継がない。書き漏らすと機能が黙って死ぬ。

revoke all on function app.orders_in_scope(uuid, boolean) from public;
revoke all on function app.measurement_sections_json(uuid) from public;
revoke all on function app.search_orders(uuid, char, date, date, char, date, date, text, text, integer, integer, boolean) from public;
revoke all on function app.revenue_summary(uuid, boolean, char, integer) from public;
revoke all on function app.customer_dossier(uuid, integer) from public;
revoke all on function public.search_orders(uuid, char, date, date, char, date, date, text, text, integer, integer, boolean) from public;
revoke all on function public.revenue_summary(uuid, boolean, char, integer) from public;
revoke all on function public.customer_dossier(uuid, integer) from public;

grant execute on function app.orders_in_scope(uuid, boolean) to authenticated;
grant execute on function app.measurement_sections_json(uuid) to authenticated;
grant execute on function app.search_orders(uuid, char, date, date, char, date, date, text, text, integer, integer, boolean) to authenticated;
grant execute on function app.revenue_summary(uuid, boolean, char, integer) to authenticated;
grant execute on function app.customer_dossier(uuid, integer) to authenticated;
grant execute on function public.search_orders(uuid, char, date, date, char, date, date, text, text, integer, integer, boolean) to authenticated;
grant execute on function public.revenue_summary(uuid, boolean, char, integer) to authenticated;
grant execute on function public.customer_dossier(uuid, integer) to authenticated;
