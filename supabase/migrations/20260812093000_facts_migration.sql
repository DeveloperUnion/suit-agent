-- Phase 2: 人となりを customers から customer_facts へ移し、使っていない列を落とす。
--
-- 本番 DB はまだ無いので、既存行を変換する insert ... select は書かない。
-- そもそも `db reset` は migration → masters → seed → dev-seed の順に流れるので、
-- ここで customers を読んでもローカルでは 0 行になる。移行後の姿を作るのは
-- scripts/generate-dev-seed.ts のほう。
--
-- 落とす列は 3 種類ある。
--   1. 行き先ができたもの … hobbies / preferences / tags / ng_notes / memo
--   2. 正しく保てないもの … last_contacted_at
--   3. 誰も使っていないもの … first_visit_date / acquisition_channel / referrer_id

-- ── 同意 ────────────────────────────────────────────────
--
-- tags には「式典多め（事実）」「写真OK（同意）」「紹介元（関係性）」の 3 種類が
-- 混ざっていた。同意を facts に入れてはいけない —
--   (a) 「無効化」の意味が変わる（事実の訂正と、同意の撤回は別物）
--   (b) 意味検索で「近いもの」として曖昧に扱われうる
--   (c) 同意が無い人の写真を使う事故が無音で起きる
--
-- 既定は false。同意を取った人だけが true になる。設定し忘れが
-- 「まだ許可を得ていない」に倒れる向きに揃えてある。

alter table public.customers
  add column photo_consent    boolean not null default false,
  add column night_contact_ok boolean not null default false;

comment on column public.customers.photo_consent is
  '写真の掲載に同意を得ているか。既定は false（未確認は不可として扱う）。';
comment on column public.customers.night_contact_ok is
  '夜間の連絡に同意を得ているか。既定は false。';


-- ── NG 事項 ─────────────────────────────────────────────
--
-- customer_facts に入れない。facts は類似検索で「引っ張り出す」ものだが、
-- NG は当該顧客に触れた瞬間に**無条件で全件**コンテキストに入るべきもの。
-- 取りこぼしが許される情報と許されない情報を、同じ機構に載せない。
--
-- 1 行 1 件にするのは、複数あるときに片方だけ解消できるようにするため
-- （自由記述 1 本だと「もう大丈夫になった 1 件」を消すのに全文を編集することになり、
-- そのついでに残すべき 1 件が消える）。

create table public.customer_ng_notes (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id),

  body text not null,

  -- 解消したら無効化する。消さないのは、同じ提案を繰り返して二度断られる事故を
  -- 「以前も断られている」と後から辿れるようにするため。
  invalidated_at          timestamptz,
  invalidated_by_staff_id uuid references public.staff (id),

  created_by_staff_id uuid not null references public.staff (id)
    default app.current_staff_id(),
  created_at timestamptz not null default now()
);

comment on table public.customer_ng_notes is
  'NG 事項。当該顧客に触れたら無条件に全件読む前提の情報なので、類似検索に載る facts とは分けてある。';

create unique index customer_ng_notes_dedupe
  on public.customer_ng_notes (customer_id, body)
  where invalidated_at is null;

create index customer_ng_notes_customer_idx
  on public.customer_ng_notes (customer_id) where invalidated_at is null;

-- 追記のみ。安全情報こそ書き換えの履歴が要る。
-- customer_facts と同じ考え方だが、見る列が違うので関数は分ける
-- （共通化すると、片方に列を足したときにもう片方の守りが静かに緩む）。
create or replace function app.guard_ng_note_append_only() returns trigger
  language plpgsql
as $$
begin
  if new.id          is distinct from old.id
  or new.customer_id is distinct from old.customer_id
  or new.body        is distinct from old.body
  or new.created_by_staff_id is distinct from old.created_by_staff_id
  or new.created_at  is distinct from old.created_at
  then
    raise exception 'NG 事項は追記のみです。訂正は無効化して新しい行を足してください'
      using errcode = 'restrict_violation';
  end if;

  if new.invalidated_at is not null and old.invalidated_at is null then
    new.invalidated_by_staff_id = app.current_staff_id();
  end if;

  return new;
end
$$;

create trigger customer_ng_notes_append_only
  before update on public.customer_ng_notes
  for each row execute function app.guard_ng_note_append_only();

alter table public.customer_ng_notes enable row level security;
alter table public.customer_ng_notes force row level security;

create policy customer_ng_notes_select on public.customer_ng_notes
  for select to authenticated using (app.can_read_customer(customer_id));

create policy customer_ng_notes_insert on public.customer_ng_notes
  for insert to authenticated with check (app.can_write_customer(customer_id));

create policy customer_ng_notes_update on public.customer_ng_notes
  for update to authenticated
  using      (app.can_write_customer(customer_id))
  with check (app.can_write_customer(customer_id));

revoke delete on public.customer_ng_notes from authenticated, anon;
grant select, insert, update on public.customer_ng_notes to authenticated;


-- ── 列を落とす ──────────────────────────────────────────
--
-- ビューが customers を参照しているので、先に落として作り直す。
-- create or replace view では列を減らせない（並びと名前を変えられない）。

drop view if exists public.v_approach_inputs;
drop view if exists public.v_customers;

alter table public.customers
  -- 行き先ができたもの
  drop column hobbies,
  drop column preferences,
  drop column tags,
  drop column ng_notes,
  drop column memo,

  -- 正しく保てないもの。
  -- 書き込む経路は「注文を記録した」と「アプローチで連絡したを押した」の 2 つだけで、
  -- 実際の連絡は個人のラインで行われるため 1 件も入らない。それを「最終連絡」と
  -- 名乗って出すと、昨日連絡した相手が半年前として表示される。
  -- **間違っている日付は、無い日付より悪い。**
  -- 「最近連絡していない人」は納品からの経過日数で見る（納品は必ず記録される）。
  drop column last_contacted_at,

  -- 誰も使っていないもの。3 つとも画面に出るだけで、集計にもトリガーにも
  -- 出てこなかった。referrer_id にいたっては入力する画面すら無い。
  -- 紹介は記録に「高橋様のご紹介」と書けば、確定検索の全文一致で引ける。
  drop column first_visit_date,
  drop column acquisition_channel,
  drop column referrer_id;


-- ── ビューを作り直す ────────────────────────────────────
--
-- security_invoker = true を忘れるとビューは所有者権限で走り、RLS を丸ごと
-- 迂回する。この設計で最も踏みやすい穴なので CI が全ビューを検査している。

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
