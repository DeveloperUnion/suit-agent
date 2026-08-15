-- 「両方」と「〜じゃない人」に、正しい数を返せるようにする。
--
-- これまで search_customers は語を **OR でしか引けなかった**のに、返す exactCount には
-- 「いずれかに当てはまる人数」という意味しか無いことがどこにも書かれていなかった。
-- モデルはその数を**どんな問いの答えにも使える**ので、実際にこうなった:
--
--   「ゴルフもワインも両方好きな人」→ 和集合の 4 名（正解は 1 名）
--   「ゴルフが趣味じゃない人」      → 肯定の 3 名（正反対）
--
-- どちらも自信たっぷりに言い切る。**数が間違っているのに、間違っていると気づく手段が
-- 無い**のがいちばん悪い。数を返す以上、その数が何の数かも一緒に返す必要がある。
--
-- なお「否定はできない」と答えさせる案は採らなかった。SQL では 3 行で書けるので、
-- **できることをできないと言う**別の嘘になる。

drop function if exists public.search_customers(text[], text, text, uuid, integer);
drop function if exists app.search_customers(text[], text, text, uuid, integer);

create function app.search_customers(
  p_labels           text[]  default '{}',
  p_free_text        text    default null,
  p_query_embedding  text    default null,
  p_viewing_staff_id uuid    default null,
  p_similar_limit    integer default 20,
  -- 'any' … いずれかに当てはまる（既定）
  -- 'all' … **全部**に当てはまる（「ゴルフもワインも」）
  p_match            text    default 'any',
  -- これに当てはまる人を外す（「ゴルフじゃない人」）
  p_exclude          text[]  default '{}'
) returns jsonb
  language sql
  stable
  set search_path = ''
as $$
  with
  scope as (
    select c.id, c.name, c.name_kana, c.company_name
      from public.customers c
     where c.archived_at is null
       and c.staff_id = coalesce(p_viewing_staff_id, app.current_staff_id())
  ),

  needles as (
    select app.normalize_ja(x) as needle, x as raw
      from unnest(coalesce(p_labels, '{}')) x
     where length(btrim(x)) > 0
  ),
  excludes as (
    select app.normalize_ja(x) as needle, x as raw
      from unnest(coalesce(p_exclude, '{}')) x
     where length(btrim(x)) > 0
  ),

  -- 顧客 × 語 の当たり。ラベル一致 ∪ 別名一致 ∪ 本文一致。**上限は付けない。**
  hit as (
    select s.id as customer_id, n.needle,
           f.id as fact_id, f.body, f.observed_on, l.name as label_name
      from scope s
      join public.customer_facts f
        on f.customer_id = s.id and f.invalidated_at is null
      left join public.fact_labels l on l.id = f.label_id
      join needles n
        on l.normalized = n.needle
        or exists (select 1 from public.fact_aliases a
                    where a.alias = n.needle and a.label_id = f.label_id)
        or f.body ilike '%' || n.raw || '%'
  ),

  -- 対象になる顧客。
  --
  -- 語も本文も指定が無いとき（＝除外だけの問い）は、**担当の全員が土台**になる。
  -- ここを「当たった人」にすると「ゴルフじゃない人」が 0 名になる。
  base as (
    select s.id
      from scope s
     where case
             when not exists (select 1 from needles)
              and (p_free_text is null or length(btrim(p_free_text)) = 0)
               then true
             when p_match = 'all'
               -- 全部に当てはまる。freeText は意味検索側の材料なので、ここでは見ない
               then (select count(distinct h.needle) from hit h where h.customer_id = s.id)
                    = (select count(*) from needles)
             else exists (select 1 from hit h where h.customer_id = s.id)
               or (p_free_text is not null and length(btrim(p_free_text)) > 0
                   and exists (select 1 from public.customer_facts f
                                where f.customer_id = s.id and f.invalidated_at is null
                                  and f.body ilike '%' || btrim(p_free_text) || '%'))
           end
  ),

  exact_ids as (
    select b.id from base b
     where not exists (
       select 1
         from public.customer_facts f
         left join public.fact_labels l on l.id = f.label_id
         join excludes e
           on l.normalized = e.needle
           or exists (select 1 from public.fact_aliases a
                       where a.alias = e.needle and a.label_id = f.label_id)
           or f.body ilike '%' || e.raw || '%'
        where f.customer_id = b.id and f.invalidated_at is null
     )
  ),

  exact_hits as (
    select s.id, s.name, s.name_kana, s.company_name,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'factId', h.fact_id, 'label', h.label_name,
                      'body', h.body, 'observedOn', h.observed_on
                    ) order by h.observed_on desc nulls last)
               from hit h where h.customer_id = s.id
           ), '[]'::jsonb) as matched
      from scope s
     where s.id in (select id from exact_ids)
  ),

  similar_hits as (
    select s.id, s.name, s.name_kana, ch.fact_id, ch.content,
           extensions.cosine_distance(ch.embedding, p_query_embedding::extensions.halfvec) as distance
      from public.search_chunks ch
      join scope s on s.id = ch.customer_id
     where p_query_embedding is not null
       and ch.embedding is not null
       and not exists (select 1 from exact_ids e where e.id = ch.customer_id)
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
    'exactCount', (select count(*) from exact_ids),
    -- **数と一緒に、その数が何の数かを返す。**受け取った側が「両方」と「いずれか」を
    -- 取り違えても、画面に出る文言がここから作られるので人が気づける
    'match', case when p_match = 'all' then 'all' else 'any' end,
    'labels', coalesce((select jsonb_agg(raw) from needles), '[]'::jsonb),
    'excluded', coalesce((select jsonb_agg(raw) from excludes), '[]'::jsonb),
    'similar', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', si.id, 'name', si.name, 'nameKana', si.name_kana,
               'factId', si.fact_id, 'content', si.content,
               'distance', round(si.distance::numeric, 4)
             ) order by si.distance)
        from similar_hits si
    ), '[]'::jsonb),
    'similarAvailable', (p_query_embedding is not null
                         and exists (select 1 from public.search_chunks where embedding is not null))
  )
$$;

comment on function app.search_customers(text[], text, text, uuid, integer, text, text[]) is
  '語で顧客を引く。いずれか / 全部 / 除外に対応し、確定検索は上限なしで全件。数と一緒に「何の数か」も返す。';

create function public.search_customers(
  p_labels           text[]  default '{}',
  p_free_text        text    default null,
  p_query_embedding  text    default null,
  p_viewing_staff_id uuid    default null,
  p_similar_limit    integer default 20,
  p_match            text    default 'any',
  p_exclude          text[]  default '{}'
) returns jsonb
  language sql
  stable
  set search_path = ''
as $$
  select app.search_customers(p_labels, p_free_text, p_query_embedding,
                              p_viewing_staff_id, p_similar_limit, p_match, p_exclude)
$$;

revoke all on function app.search_customers(text[], text, text, uuid, integer, text, text[]) from public;
revoke all on function public.search_customers(text[], text, text, uuid, integer, text, text[]) from public;
grant execute on function app.search_customers(text[], text, text, uuid, integer, text, text[]) to authenticated;
grant execute on function public.search_customers(text[], text, text, uuid, integer, text, text[]) to authenticated;
