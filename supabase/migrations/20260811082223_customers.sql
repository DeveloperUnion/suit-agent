-- Phase 1: 顧客
--
-- 権限モデルの本体がここに現れる。
--   閲覧 … 自分の担当 or 管理者（管理者は全顧客を見られる）
--   編集 … 全員が自分の担当のみ。管理者にも例外を作らない
--   削除 … 誰にもできない（DELETE ポリシーを作らない）
--
-- 「アーカイブ」は archived_at の UPDATE なので、上の編集ポリシーがそのまま
-- 効く。専用の権限も管理者の例外も要らない。
--
-- PITR を入れない判断（+$100/月）の裏返しとして、「消えない」ことは設計で
-- 担保する。物理削除を許さないのはその 1 本目。

create table public.customers (
  id uuid primary key default gen_random_uuid(),

  name      text not null,
  name_kana text not null,
  birth_date date,
  gender    text check (gender in ('male', 'female', 'other')),
  phone     text,
  email     text,
  address   text,

  -- 住所とは別に持つ。自由記述の address からは絞り込めないため、
  -- 災害時にその地域の顧客をまとめて拾えるようキーだけ切り出している。
  residence_prefecture text,

  -- 公式アカウントの配信そのものは Lstep が担うため、このシステムは LINE へ
  -- 送らない。それでも ID を持つのは、将来 Lstep 側の友だちと突き合わせる
  -- ときの鍵になるため。表示名は個人 LINE のトーク一覧で見分けるのに使う。
  -- ※ 現状これを埋める経路が無い（Webhook が無い）。当面 NULL のまま。
  line_user_id     text,
  line_display_name text,

  -- ネーム刺繍。注文ごとに変わるものではなく毎回同じものを入れるため、
  -- 票や注文ではなく人に持たせる。
  embroidery_name text,

  company_name text,
  department   text,
  job_title    text,
  industry     text,

  -- 接客直前に一文で読むもの。検索対象ではないので分解しない
  -- （label='長男' に検索価値が無く、年齢は時間で古びる）。
  -- 日付が絡むもの（入学・受験）は customer_anniversaries の担当。
  family_info text,

  -- 走り書きの置き場。customer_facts に流すと一覧がノイズで埋まる。
  memo text,

  -- ── Phase 2 で customer_facts へ移すもの ──
  --
  -- 設計としては 1 事実 1 行に正規化する（出典・時点・無効化を持たせ、
  -- RAG のチャンク単位にする）が、それは画面の作り替えを伴うので Phase 2。
  -- Phase 1 の目的は「画面を 1 行も変えずに DB 化する」ことなので、
  -- ここでは現行の型のまま受ける。
  --
  -- 移行時は source = 'migration' で facts に流し込む。文字列を機械的に
  -- 割るので誤りが混ざるが、その 1 件ずつを人が承認していない唯一の経路
  -- だと後から言えるようにするための印。
  hobbies     text,        -- 「ゴルフ・ワイン」のような「・」区切り 1 本
  preferences jsonb,       -- { colors, patterns, silhouette, scenes }
  tags        text[],      -- 事実・同意フラグ・関係性が混在している
  ng_notes    text,        -- Phase 2 で customer_ng_notes へ

  -- photo_consent / night_contact_ok も Phase 2。
  -- tags に「式典多め（事実）」「写真OK（同意）」「紹介元（関係性）」の 3 種類が
  -- 混ざっているので分割するが、tags 列と同時に持つと同じ情報が 2 箇所に入る。
  -- 分割は移行と同時に行う。

  -- アクセス境界そのもの。各レコードの staff_id（採寸者・受注者）とは別物で、
  -- あちらは「誰が操作したか」の記録。
  -- default で「登録した人が担当になる」を宣言的に表す。
  staff_id uuid not null references public.staff (id) default app.current_staff_id(),

  first_visit_date    date,
  acquisition_channel text,

  -- 紹介者。RLS と衝突することがある（紹介者が他スタッフの担当だと JOIN が
  -- NULL を返す）。正しい挙動なので、UI 側で「他の担当の方」と出す。
  referrer_id uuid references public.customers (id),

  -- 「連絡した」を押したときだけ更新する。トリガーの判定には使わない。
  last_contacted_at date,

  -- 一覧検索はここだけを見る。氏名と会社名に絞るのは上流の判断
  -- （趣味・タグ・メモまで当てると探している人と関係のない顧客が混ざる）。
  -- 人となりからの検索は app.search_customers() の担当。
  search_key text generated always as (
    app.normalize_ja(
      coalesce(name, '') || coalesce(name_kana, '') || coalesce(company_name, '')
    )
  ) stored,

  -- 誤登録はこれで一覧から消す。物理削除はしない。
  archived_at timestamptz,

  created_at date not null default current_date,
  updated_at timestamptz not null default now()
);

comment on table public.customers is
  '顧客。物理削除は誰にもできない（DELETE ポリシーを作らない）。誤登録は archived_at、個人情報の削除請求は app.purge_customer() で扱う。';

create index customers_staff_id_idx    on public.customers (staff_id) where archived_at is null;
create index customers_referrer_id_idx on public.customers (referrer_id);
-- search_key にインデックスは張らない。3,000 行の seq scan で 1〜3ms であり、
-- 2ms のために pg_trgm を入れて移植性を捨てる価値がない。

create trigger customers_touch_updated_at
  before update on public.customers
  for each row execute function app.touch_updated_at();


-- ── 判定の共通化 ────────────────────────────────────────
--
-- 子テーブル（注文・採寸・facts）は staff_id を非正規化せず、customers 経由の
-- EXISTS で判定する。理由は性能ではなく引き継ぎ — 300 件の一括付け替えを
-- 子テーブル全部に追随させると、1 行の漏れが「見えない行」か「他人に見える行」
-- を生み、しかも無音になる。RLS を 1 箇所に集約した目的と正面から矛盾する。
--
-- SECURITY INVOKER のまま（customers の RLS を通す必要はない。ここでは
-- staff_id を直接見るので、二重に効かせても意味が同じ）。

create or replace function app.can_read_customer(p_customer_id uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.customers c
     where c.id = p_customer_id
       and (c.staff_id = app.current_staff_id() or app.is_admin())
  )
$$;

create or replace function app.can_write_customer(p_customer_id uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.customers c
     where c.id = p_customer_id
       and c.staff_id = app.current_staff_id()   -- 管理者にも例外を作らない
  )
$$;

comment on function app.can_write_customer(uuid) is
  '子テーブルの書き込みポリシー用。管理者かどうかを見ない — 管理者に許すのは閲覧だけ。';


-- ── RLS ─────────────────────────────────────────────────

alter table public.customers enable row level security;
alter table public.customers force row level security;

create policy customers_select on public.customers
  for select to authenticated
  using (staff_id = app.current_staff_id() or app.is_admin());

-- 「登録した人が担当になる」。他人名義での登録を構造的に不可能にする。
create policy customers_insert on public.customers
  for insert to authenticated
  with check (staff_id = app.current_staff_id());

-- USING と WITH CHECK の両方を書く。WITH CHECK が無いと、他人の顧客を
-- 自分に付け替える／自分の顧客を他人に押し付けることが通ってしまう。
create policy customers_update on public.customers
  for update to authenticated
  using      (staff_id = app.current_staff_id())
  with check (staff_id = app.current_staff_id());

-- DELETE ポリシーは作らないうえ、権限自体を剥がす。
-- Supabase は public の全テーブルに ALL を既定で与えるため、ポリシーを
-- 書かないだけでは「許可されているが 0 行」になり、静かに何も起きない。
revoke delete on public.customers from authenticated, anon;
grant select, insert, update on public.customers to authenticated;


-- ── 記念日 ──────────────────────────────────────────────
--
-- id は必ず gen_random_uuid()。モックの `anv-{customerId}-{i}` のような
-- 位置由来の ID にしてはいけない。approach_resolutions.trigger_key に
-- この id が埋まるため、記念日を 1 つ消すと後続が繰り上がって別の記念日の
-- トリガーキーと衝突し、「対応済み」と誤判定されて永久に出なくなる。
-- 順序を入れ替えただけでも起きるうえ、完全に無音。

create table public.customer_anniversaries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  type  text not null check (type in ('birthday', 'first_purchase', 'wedding', 'other')),
  -- 年をまたいで毎年発火するもの。年は初回の年を入れる
  date  date not null,
  label text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.customer_anniversaries is
  '記念日。保存は行単位の upsert で行う（全削除＋全挿入にすると change_log が毎回ノイズで埋まり、取り消し UI が使えなくなる）。';

create index customer_anniversaries_customer_id_idx
  on public.customer_anniversaries (customer_id);

create trigger customer_anniversaries_touch_updated_at
  before update on public.customer_anniversaries
  for each row execute function app.touch_updated_at();

alter table public.customer_anniversaries enable row level security;
alter table public.customer_anniversaries force row level security;

create policy customer_anniversaries_select on public.customer_anniversaries
  for select to authenticated using (app.can_read_customer(customer_id));

create policy customer_anniversaries_insert on public.customer_anniversaries
  for insert to authenticated with check (app.can_write_customer(customer_id));

create policy customer_anniversaries_update on public.customer_anniversaries
  for update to authenticated
  using (app.can_write_customer(customer_id))
  with check (app.can_write_customer(customer_id));

-- 記念日は消せてよい（顧客と違って、消すことに業務上の意味がある）
create policy customer_anniversaries_delete on public.customer_anniversaries
  for delete to authenticated using (app.can_write_customer(customer_id));

grant select, insert, update, delete on public.customer_anniversaries to authenticated;


-- ── NG 事項 ──────────────────────────────────────────────
--
-- 専用テーブル customer_ng_notes は Phase 2。
--
-- customer_facts に入れてはいけない理由（想起の仕方が根本的に違う。facts は
-- 類似検索で「引っ張り出す」もの、NG は当該顧客に触れた瞬間に無条件で全件が
-- コンテキストに入るべきもの）は変わらないが、テーブルに分けると画面の
-- 作り替えが要る。Phase 1 では customers.ng_notes の列で受ける。
--
-- Phase 2 で作るときは resolved_reason を CHECK で必須にし、
-- 無音の消滅を不可能にする。


-- ── 二重登録の防止 ──────────────────────────────────────
--
-- RLS を貫通する 3 つの穴のうちの 1 つ。
-- 二重に登録するとデータが分裂して後から直せないため、ここだけは担当の
-- 境界を越えて既存顧客の「存在」を知らせる必要がある。
--
-- ただし他人の顧客については氏名しか返さない。会社名・電話・接触状況は
-- 返さないので、これを名簿の抜き出しには使えない。

create or replace function app.find_similar_customers(
  p_name text default null,
  p_name_kana text default null,
  p_phone text default null
)
returns table (
  id uuid,
  name text,
  name_kana text,
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
         c.staff_id <> app.current_staff_id() as is_other_staff
    from public.customers c, needle n
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
  'RLS を貫通する例外。二重登録の防止にだけ使う。他人の顧客は氏名しか返さない。';

revoke all on function app.find_similar_customers(text, text, text) from public;
grant execute on function app.find_similar_customers(text, text, text) to authenticated;
