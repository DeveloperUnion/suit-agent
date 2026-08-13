-- エージェントがデータに触る 3 本の口。
--
-- lib/ai/ からはテーブルを直接読ませない（ESLint が supabase().from( を禁じている）。
-- 網羅性の担保をこの中に閉じ込めるためで、外から top-k で引ける経路を作らない。
--
--   app.search_customers()      語で顧客を引く。確定検索と意味検索を 1 本で両方走らせる
--   app.customer_dossier()      その人を丸ごと読む。検索を経由しない
--   app.find_customers_by_name() 名寄せ。モデルに顧客名を書かせないための口
--
-- どれも SECURITY INVOKER（既定）。RLS はブラウザから引いたときとまったく同じに効く。


-- ── 索引を捨て、halfvec にする ──────────────────────────
--
-- HNSW は近似索引で、**RLS のフィルタが索引走査の後に来る**。
-- 他スタッフの顧客が k 枠を食い潰し、自分の顧客が黙って落ちる
-- （pgvector 公式いわく「条件が 10% にマッチするとき既定の ef_search=40 では
-- 平均 4 行しか残らない」）。回避策（hnsw.iterative_scan）はあるが、
-- 関数属性として固定し忘れると**無音で劣化する**という性質は消えない。
--
-- 6.6 万行は pgvector にとって小さい。索引を張らなければ、下の検索が
-- 「先に自担当へ絞ってから距離を計算する」という素直な形になり、
-- 取りこぼしが構造的に起こらなくなる。触るのは 6,600 行。
--
-- halfvec は 1 次元 2 バイト（vector は 4）。走査するバイト数が半分になる。
-- 埋め込みはまだ 1 行も入っていないので、いま替えるコストはゼロ。
-- 索引が要る規模（p95 が 300ms を超える）になったら create index 1 行で足せる。

drop index if exists public.search_chunks_embedding_idx;

alter table public.search_chunks
  alter column embedding type extensions.halfvec(1536);

comment on column public.search_chunks.embedding is
  '意味検索用。索引は張らない（RLS で先に絞ってから全走査する。取りこぼしが起きない側に倒してある）。';


-- ── app.search_customers ────────────────────────────────
--
-- **ツールを 2 本に分けて「網羅が要るときは確定検索を使え」とプロンプトで
-- 指示する解は採らない。**1 本にして中で両方走らせる。作法は必ず破れる。
--
-- 返す形は 2 つの枠を分けてある。同じ形にすると、モデルが「近いもの」を
-- 「該当者」として答えてしまう。
--   exact      … 該当者。**LIMIT なし・全件**
--   exactCount … 顧客の実数。モデルに数えさせない
--   similar    … 近いもの。exact に出た人は除く
--
-- 引数を labels と freeText に分けているのも同じ理由。
-- 「アウトドア系が好きな人」をそのまま確定検索へ渡すと 0 件になり、
-- **その 0 件が「該当なし」と誤読される**。語彙の一覧はプロンプトに載せてあるので、
-- モデルは「アウトドア系」→ {ゴルフ, キャンプ, 釣り} に展開してから呼べる。
--
-- p_query_embedding を text で受けるのは PostgREST の都合。
-- halfvec を JSON で表現する術が無いので、'[0.1,...]' の文字列で受けて中で嵌める。

create or replace function app.search_customers(
  p_labels           text[]  default '{}',
  p_free_text        text    default null,
  p_query_embedding  text    default null,
  p_viewing_staff_id uuid    default null,
  p_similar_limit    integer default 20
) returns jsonb
  language sql
  stable
  set search_path = ''
as $$
  with
  -- **RLS が天井、この絞り込みが既定。**
  --
  -- 既定を「RLS が許す全部」にしてはいけない。管理者は全顧客を閲覧できるので、
  -- 絞らないと管理者のときだけ他スタッフの顧客まで数に入り、
  -- 画面（listCustomers は常にスタッフで絞る）と AI の答えが食い違う。
  -- 「ゴルフの方は 4 名です」と言われた管理者が一覧を開くと 3 名しかいない、
  -- という形で出る。
  --
  -- p_viewing_staff_id が来るのは、管理者が画面でスタッフを切り替えているとき。
  -- 来なければ本人。退職して current_staff_id() が NULL なら 0 件に倒れる。
  scope as (
    select c.id, c.name, c.name_kana, c.company_name
      from public.customers c
     where c.archived_at is null
       and c.staff_id = coalesce(p_viewing_staff_id, app.current_staff_id())
  ),

  -- 探す語を正規化して 1 列に畳む。表記ゆれ（ゴルフ／ごるふ／ゴルフ）を吸う。
  needles as (
    select app.normalize_ja(x) as needle, x as raw
      from unnest(coalesce(p_labels, '{}')) x
     where length(btrim(x)) > 0
  ),

  -- ── 確定検索 ──
  -- ラベル一致 ∪ 別名一致 ∪ 本文一致。**3 つとも上限を付けない。**
  -- 走り書き（label_id が null の行）に「ゴルフ」と書かれた顧客を落とさないため、
  -- ラベルだけでなく本文も見る。
  hits as (
    select f.customer_id, f.id as fact_id, f.body, f.observed_on,
           l.name as label_name
      from public.customer_facts f
      join scope s on s.id = f.customer_id
      left join public.fact_labels l on l.id = f.label_id
     where f.invalidated_at is null
       and (
         exists (select 1 from needles n where l.normalized = n.needle)
         or exists (
              select 1 from needles n
                join public.fact_aliases a on a.alias = n.needle
               where a.label_id = f.label_id
            )
         or exists (select 1 from needles n where f.body ilike '%' || n.raw || '%')
         or (p_free_text is not null and length(btrim(p_free_text)) > 0
             and f.body ilike '%' || btrim(p_free_text) || '%')
       )
  ),

  exact_hits as (
    select s.id, s.name, s.name_kana, s.company_name,
           jsonb_agg(
             jsonb_build_object(
               'factId', h.fact_id, 'label', h.label_name,
               'body', h.body, 'observedOn', h.observed_on
             ) order by h.observed_on desc nulls last
           ) as matched
      from hits h
      join scope s on s.id = h.customer_id
     group by s.id, s.name, s.name_kana, s.company_name
  ),

  -- ── 意味検索 ──
  -- 索引が無いので、join で自担当へ絞ってから距離を計算する。
  -- 確定検索に出た人は除く（「該当 12 名。ほかに近い人 3 名」と言えるように）。
  similar_hits as (
    select s.id, s.name, s.name_kana, ch.fact_id, ch.content,
           extensions.cosine_distance(ch.embedding, p_query_embedding::extensions.halfvec) as distance
      from public.search_chunks ch
      join scope s on s.id = ch.customer_id
     where p_query_embedding is not null
       and ch.embedding is not null
       and not exists (select 1 from exact_hits e where e.id = ch.customer_id)
     order by extensions.cosine_distance(ch.embedding, p_query_embedding::extensions.halfvec)
     limit greatest(coalesce(p_similar_limit, 20), 0)
  )

  select jsonb_build_object(
    'exact', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'name', e.name, 'nameKana', e.name_kana,
               'companyName', e.company_name, 'matched', e.matched
             ) order by e.name)
        from exact_hits e
    ), '[]'::jsonb),
    -- 一覧とは別に数を返す。モデルが散文にする過程で列挙を削っても、
    -- 「12 名」という数字だけは削れない形にしておく。
    'exactCount', (select count(*) from exact_hits),
    'similar', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', si.id, 'name', si.name, 'nameKana', si.name_kana,
               'factId', si.fact_id, 'content', si.content,
               'distance', round(si.distance::numeric, 4)
             ) order by si.distance)
        from similar_hits si
    ), '[]'::jsonb),
    -- 埋め込みがまだ入っていない間は similar が常に空になる。
    -- 「近い人はいません」と「まだ意味検索が使えません」を区別できるようにする。
    'similarAvailable', (p_query_embedding is not null
                         and exists (select 1 from public.search_chunks where embedding is not null))
  )
$$;

comment on function app.search_customers(text[], text, text, uuid, integer) is
  '語で顧客を引く。確定検索（全件）と意味検索（近いもの）を 1 本で両方走らせる。';


-- ── app.customer_dossier ────────────────────────────────
--
-- 「時枝さんってどんな人だっけ」に検索は要らない。その人の記録を全部渡せばよい。
-- 注意事項は無条件で全件入れる（取りこぼしが許されない情報なので、
-- 類似度や上限の対象にしない）。採寸は最新の 1 枚だけ。

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


-- ── app.find_customers_by_name ──────────────────────────
--
-- モデルに顧客の UUID を書かせない。ここが返した候補の外は選べない、という形にする。
-- 幻覚した顧客名が「稀」ではなく「構造的に不可能」になる。
--
-- 二重登録防止の find_similar_customers と違い、**担当の境界を越えない**。
-- 会話から他人の顧客を書き換えられては困る。

create or replace function app.find_customers_by_name(
  p_query            text,
  p_viewing_staff_id uuid default null
) returns jsonb
  language sql
  stable
  set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x->>'name'), '[]'::jsonb)
  from (
    select jsonb_build_object(
             'id', c.id, 'name', c.name, 'nameKana', c.name_kana,
             'companyName', c.company_name,
             'labels', coalesce((
               select jsonb_agg(distinct l.name)
                 from public.customer_facts f
                 join public.fact_labels l on l.id = f.label_id
                where f.customer_id = c.id and f.invalidated_at is null
             ), '[]'::jsonb)
           ) as x
      from public.customers c
     where c.archived_at is null
       -- search_customers と同じ既定。管理者のときだけ他人の顧客が候補に
       -- 出てくる、という不整合を作らない。
       and c.staff_id = coalesce(p_viewing_staff_id, app.current_staff_id())
       and length(app.normalize_ja(coalesce(p_query, ''))) >= 2
       and c.search_key like '%' || app.normalize_ja(p_query) || '%'
     -- 上限を付けない。同姓が 6 人いる店で 5 人しか出さないと、
     -- 6 人目は会話からは永久に選べない。
  ) t
$$;

comment on function app.find_customers_by_name(text, uuid) is
  '名寄せ。モデルが選べる顧客をここが返した候補に閉じるための口。担当の境界は越えない。';


-- ── PostgREST から呼ぶためのラッパ ──────────────────────
--
-- supabase-js の .rpc() は public しか見ない。中身は持たせない
-- （find_similar_customers と同じ作り）。

create or replace function public.search_customers(
  p_labels           text[]  default '{}',
  p_free_text        text    default null,
  p_query_embedding  text    default null,
  p_viewing_staff_id uuid    default null,
  p_similar_limit    integer default 20
) returns jsonb
  language sql
  stable
  set search_path = ''
as $$
  select app.search_customers(p_labels, p_free_text, p_query_embedding,
                              p_viewing_staff_id, p_similar_limit)
$$;

create or replace function public.customer_dossier(p_customer_id uuid)
returns jsonb
  language sql
  stable
  set search_path = ''
as $$
  select app.customer_dossier(p_customer_id)
$$;

create or replace function public.find_customers_by_name(
  p_query            text,
  p_viewing_staff_id uuid default null
) returns jsonb
  language sql
  stable
  set search_path = ''
as $$
  select app.find_customers_by_name(p_query, p_viewing_staff_id)
$$;

revoke all on function app.search_customers(text[], text, text, uuid, integer) from public;
revoke all on function app.customer_dossier(uuid) from public;
revoke all on function app.find_customers_by_name(text, uuid) from public;
revoke all on function public.search_customers(text[], text, text, uuid, integer) from public;
revoke all on function public.customer_dossier(uuid) from public;
revoke all on function public.find_customers_by_name(text, uuid) from public;

grant execute on function app.search_customers(text[], text, text, uuid, integer) to authenticated;
grant execute on function app.customer_dossier(uuid) to authenticated;
grant execute on function app.find_customers_by_name(text, uuid) to authenticated;
grant execute on function public.search_customers(text[], text, text, uuid, integer) to authenticated;
grant execute on function public.customer_dossier(uuid) to authenticated;
grant execute on function public.find_customers_by_name(text, uuid) to authenticated;
