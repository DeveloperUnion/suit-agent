-- 発注書取り込みの見直しにともなう 4 点。
--
--   (a) 納期を捨て、「納品日（工場→店）」と「お渡し日（店→客）」の 2 本にする
--   (b) お渡し後フォローの起点を「お渡し日、無ければ納品日」にする
--   (c) 記念日の予告日数を店舗が変えられるようにする
--   (d) 似た顧客の検索を PostgREST から呼べるようにする ← 一度も動いていなかった


-- ── (a) 納期 → 納品日 ───────────────────────────────────
--
-- due_date が実際に保持していたのは発注書の「納品日」欄（工場から店に届く日）で、
-- 顧客に約束した納期ではなかった。名前だけが実態とずれていたので、列を作り直さず
-- 名前を合わせる。
--
-- 顧客に渡した日は delivered_at のまま。両方を「納品」と呼ぶと現場で混ざるため、
-- 画面では delivered_at 側を必ず「お渡し」と呼ぶ。

alter table public.orders rename column due_date to arrived_at;

comment on column public.orders.arrived_at is
  '納品日。工場から店に届いた日。発注書の「納品日」欄そのもの。';
comment on column public.orders.delivered_at is
  'お渡し日。店から顧客へ渡した日。お渡し後フォローの起点。顧客の都合で動くので空のことがある。';


-- ── (b) お渡し後フォローの起点 ──────────────────────────
--
-- お渡し日は顧客の都合で決まるため、発注書を取り込んだ時点では空のことが多い。
-- 空を理由にフォローが一生立たないほうが害が大きいので、そのときは納品日で代用する。
-- （「お渡し日が未入力です」と促す通知は todo.md 送り。それができるまでの担保でもある）
--
-- 列名は last_delivered_at のまま据え置く。意味は「お渡し日（無ければ納品日）」で、
-- 呼び出し側の select 別名を総取り替えするほどの益が無い。

create or replace view public.v_customers with (security_invoker = true) as
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

-- v_approach_inputs は v_customers の列を名前で選んでいるだけなので作り直さない。
-- last_delivered_at の意味が変わったぶんは、そのまま伝わる。

-- 部分インデックスの条件に current_date は書けない（immutable でない）ので、
-- 「日付がある」までで絞り、未来ぶんはビュー側の where で落とす。
drop index if exists public.orders_delivered_idx;
create index orders_handover_idx
  on public.orders (customer_id, (coalesce(delivered_at, arrived_at)) desc)
  where coalesce(delivered_at, arrived_at) is not null;


-- ── (c) 記念日の予告日数 ────────────────────────────────
--
-- 「7 日前は店舗として確定した決めごと」として定数に置いていたが、実際に運用すると
-- 声をかける準備に要る日数は店舗ごとに違った。節目と同じく app_settings に開く。
-- 0 は「当日だけ出す」。

alter table public.app_settings
  add column anniversary_lead_days integer not null default 7
    check (anniversary_lead_days between 0 and 60);

comment on column public.app_settings.anniversary_lead_days is
  '記念日の何日前から出すか。0 は当日のみ。';


-- ── (d) 似た顧客の検索を PostgREST に届かせる ───────────
--
-- app.find_similar_customers() は app スキーマにしかなく、PostgREST が公開して
-- いるのは public / graphql_public だけ（supabase/config.toml）。そのため
-- rpc("find_similar_customers") は毎回 404 を返し、二重登録の防止は一度も
-- 動いていなかった。public に薄いラッパを置いて届かせる。
--
-- 越境（RLS を貫通する SECURITY DEFINER）は app 側に閉じたまま。ラッパは
-- SECURITY INVOKER なので、ここが新しい穴になることはない。
--
-- あわせて担当スタッフ名を返す。他のスタッフが担当している人が候補に出たとき、
-- 誰に確認すればよいか分からないと、結局その場で新規登録されてしまうため。
-- 返すのは氏名・カナ・担当者名だけで、会社名・電話・接触状況は返さない
-- （名簿の抜き出しに使えないという元の設計をそのまま保つ）。

-- 返り値の型が変わるので replace では通らない（42P13）。作り直す。
drop function if exists app.find_similar_customers(text, text, text);

create function app.find_similar_customers(
  p_name text default null,
  p_name_kana text default null,
  p_phone text default null
)
returns table (
  id uuid,
  name text,
  name_kana text,
  staff_name text,
  is_other_staff boolean
)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  with needle as (
    select app.normalize_ja(p_name)      as name_key,
           app.normalize_ja(p_name_kana) as kana_key,
           regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as phone_key
  )
  select c.id,
         c.name,
         c.name_kana,
         s.name,
         c.staff_id <> app.current_staff_id() as is_other_staff
    from public.customers c
    join public.staff s on s.id = c.staff_id
   cross join needle n
   where c.archived_at is null
     and app.current_staff_id() is not null      -- 未ログインには何も返さない
     and (
          (length(n.name_key) >= 2 and app.normalize_ja(c.name) like '%' || n.name_key || '%')
       or (length(n.kana_key) >= 2 and app.normalize_ja(c.name_kana) like '%' || n.kana_key || '%')
       or (length(n.phone_key) >= 6
           and regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') like '%' || n.phone_key || '%')
     )
   order by (c.staff_id = app.current_staff_id()) desc, c.name
   limit 5
$$;

comment on function app.find_similar_customers(text, text, text) is
  'RLS を貫通する例外。二重登録の防止にだけ使う。他人の顧客は氏名・カナ・担当者名しか返さない。';

revoke all on function app.find_similar_customers(text, text, text) from public;
grant execute on function app.find_similar_customers(text, text, text) to authenticated;

create function public.find_similar_customers(
  p_name text default null,
  p_name_kana text default null,
  p_phone text default null
)
returns table (
  id uuid,
  name text,
  name_kana text,
  staff_name text,
  is_other_staff boolean
)
  language sql
  stable                                   -- SECURITY INVOKER（既定）のまま
  set search_path = ''
as $$
  select * from app.find_similar_customers(p_name, p_name_kana, p_phone)
$$;

comment on function public.find_similar_customers(text, text, text) is
  'app.find_similar_customers() を PostgREST から呼ぶためのラッパ。中身は持たない。';

revoke all on function public.find_similar_customers(text, text, text) from public;
grant execute on function public.find_similar_customers(text, text, text) to authenticated;
