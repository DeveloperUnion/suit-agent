-- 1 文字の苗字（林・原・森・南）が会話から引けなかった。
--
-- app.find_customers_by_name() に「2 文字未満は引かない」というガードが入っていた。
-- 部分一致（`like '%語%'`）で 1 文字を許すと台帳の半分が返るので、それを避けるための
-- ものだったが、**接客では苗字だけで話しかけるのが普通**（「林さんゴルフ好きらしい」）で、
-- そこで 0 件になると「見つかりませんでした」と返ってしまう。しかも
-- 「その苗字の顧客がいない」と「1 文字だから引かなかった」が区別できない形で。
--
-- dev-seed に 1 文字の苗字が 1 人もいなかったので、eval でも気づけなかった。
--
-- 直し方は「1 文字のときだけ前方一致にする」。苗字は search_key の先頭に来る
-- （search_key = normalize_ja(name || name_kana || company_name)）ので、
-- `林%` は「林」で始まる人だけに当たり、台帳の半分は返らない。
--   林 太郎  → 当たる
--   小林 太郎 → 当たらない（「小林さん」と言うはずなので、これでよい）
--
-- 2 文字以上はこれまでどおり部分一致。カナや会社名でも引けるのはそのため。

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
       and length(app.normalize_ja(coalesce(p_query, ''))) >= 1
       and case
             when length(app.normalize_ja(p_query)) = 1
               -- 1 文字は前方一致だけ。部分一致にすると台帳の半分が返る
               then c.search_key like app.normalize_ja(p_query) || '%'
             else c.search_key like '%' || app.normalize_ja(p_query) || '%'
           end
     -- 上限を付けない。同姓が 6 人いる店で 5 人しか出さないと、
     -- 6 人目は会話からは永久に選べない。
  ) t
$$;

comment on function app.find_customers_by_name(text, uuid) is
  '名寄せ。モデルが選べる顧客をここが返した候補に閉じるための口。担当の境界は越えない。1 文字は前方一致。';
