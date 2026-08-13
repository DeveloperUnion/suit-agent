-- 会話から提案を組み立てるための口。
--
-- **どちらも書き込まない。**返すのは「適用したら何が起きるか」だけで、
-- 実際に書くのは人が「適用」を押したあとの適用ハンドラ。
--
-- ここを SQL に置くのは、決める値が DB のものだからで、性能のためではない。
-- ラベルの表記は app.normalize_ja を通した結果に寄せなければならず、
-- モデルに「ごるふ」と書かれた瞬間に「ゴルフが趣味な人」から漏れる。
-- 寄せる判断をモデルの外に出しておく。

-- ── 語彙の一覧 ──────────────────────────────────────────
--
-- プロンプトに常時載せる。「打ちっぱなし」→「ゴルフ」の寄せと、
-- 「アウトドア系」→ {ゴルフ, キャンプ, 釣り} の展開を、これ 1 つが担う。
-- **「アウトドア＝〇〇」の対応表を人が書くのではない** — 店が実際に使った語が
-- そのまま出てくるだけで、新しい語が増えれば自動で載る。
--
-- **件数は返さない。**あると便利だが、事実を 1 件足すたびに文字列が変わり、
-- プロンプトの前方一致キャッシュが毎回外れる。語彙そのものは日に数語しか
-- 動かないので、ここはキャッシュが実際に効く数少ない塊になる。
--
-- スタッフでは絞らない。語彙は店で共通のもので、顧客データではない。

create or replace function app.fact_vocabulary()
returns jsonb
  language sql
  stable
  set search_path = ''
as $$
  select coalesce(jsonb_agg(
           jsonb_build_object('label', l.name, 'category', l.category_key)
           order by c.sort_order, l.name
         ), '[]'::jsonb)
    from public.fact_labels l
    left join public.fact_categories c on c.key = l.category_key
$$;

comment on function app.fact_vocabulary() is
  'プロンプトに載せる語彙。件数は返さない（変わるたびにキャッシュが外れるため）。';


-- ── パーソナルの追記の下見 ──────────────────────────────

create or replace function app.plan_fact_add(
  p_customer_id uuid,
  p_labels      text[]
) returns jsonb
  language sql
  stable
  set search_path = ''
as $$
  with
  -- 触れる相手か。会話から来た id でも境界は越えさせない。
  target as (
    select c.id from public.customers c
     where c.id = p_customer_id and c.archived_at is null
       and c.staff_id = app.current_staff_id()
  ),
  input as (
    select distinct btrim(x) as raw, app.normalize_ja(btrim(x)) as norm
      from unnest(coalesce(p_labels, '{}')) x
     where length(btrim(x)) > 0
  ),
  -- 既存語と別名の両方を見る。「打ちっぱなし」で来ても「ゴルフ」に寄る。
  resolved as (
    select i.raw,
           coalesce(l.name, la.name) as canonical
      from input i
      left join public.fact_labels l on l.normalized = i.norm
      left join public.fact_aliases a on a.alias = i.norm
      left join public.fact_labels la on la.id = a.label_id
  ),
  owned as (
    select distinct l.name
      from public.customer_facts f
      join public.fact_labels l on l.id = f.label_id
     where f.customer_id = p_customer_id and f.invalidated_at is null
  ),
  final as (
    select coalesce(r.canonical, r.raw) as name,
           (r.canonical is null) as is_new,
           exists (select 1 from owned o where o.name = coalesce(r.canonical, r.raw)) as has
      from resolved r
  )
  select case when not exists (select 1 from target) then null else jsonb_build_object(
    'labelNames',    coalesce((select jsonb_agg(f.name order by f.name) from final f where not f.has), '[]'::jsonb),
    -- 適用時に fact_labels へ新しく作られる分。カードで「新しい語です」と出す
    'newLabelNames', coalesce((select jsonb_agg(f.name order by f.name) from final f where not f.has and f.is_new), '[]'::jsonb),
    -- すでに付いていたので落としたもの。「すでに入っています」と言えるように返す
    'alreadyHas',    coalesce((select jsonb_agg(f.name order by f.name) from final f where f.has), '[]'::jsonb)
  ) end
$$;

comment on function app.plan_fact_add(uuid, text[]) is
  '追記の下見。既存語へ寄せた結果と、新しく作られる語を返す。書き込みはしない。';


-- ── ラッパ ──────────────────────────────────────────────

create or replace function public.fact_vocabulary()
returns jsonb language sql stable set search_path = ''
as $$ select app.fact_vocabulary() $$;

create or replace function public.plan_fact_add(p_customer_id uuid, p_labels text[])
returns jsonb language sql stable set search_path = ''
as $$ select app.plan_fact_add(p_customer_id, p_labels) $$;

revoke all on function app.fact_vocabulary() from public;
revoke all on function app.plan_fact_add(uuid, text[]) from public;
revoke all on function public.fact_vocabulary() from public;
revoke all on function public.plan_fact_add(uuid, text[]) from public;

grant execute on function app.fact_vocabulary() to authenticated;
grant execute on function app.plan_fact_add(uuid, text[]) to authenticated;
grant execute on function public.fact_vocabulary() to authenticated;
grant execute on function public.plan_fact_add(uuid, text[]) to authenticated;
