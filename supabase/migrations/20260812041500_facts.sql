-- Phase 2: 人となり
--
-- 「ゴルフが趣味な人って誰だっけ」に**全員**で答えるための器。
-- customers.hobbies の "ゴルフ・ワイン" という 1 本の文字列を 1 事実 1 行に割る。
-- 移行そのものと画面の作り替えは次の migration。ここでは空の器だけを置く。
--
-- 設計の根拠は docs/database-design.md の「人となり（Phase 2）」。要点だけ:
--
--   ・カテゴリは**ラベルの属性**（fact_labels.category_key）。事実ごとに
--     分類させると「ゴルフ場の設計」が日によって hobby / work に揺れる。
--     初出時に 1 回決めれば 2 回目以降は判断が発生しない
--   ・カテゴリで**検索を絞らない**。work に分類された「ゴルフ」が
--     「ゴルフが趣味な人」から永久に漏れる。引くのは label だけ
--   ・「写真OK」と NG メモはここに入れない。前者は事実ではなく同意、
--     後者は取りこぼしが許されない情報。次の migration で別の器を作る
--
-- 記述順の制約は Phase 0 と同じ: テーブル → 関数 → ポリシー。

create extension if not exists vector with schema extensions;


-- ── fact_categories ─────────────────────────────────────
--
-- カルテの見出しと並び順にしか使わない。デプロイ成果物なので、
-- 中身は lib/constants/facts.ts を正として masters.sql から流す。

create table public.fact_categories (
  key        text primary key,
  label      text not null,
  sort_order integer not null default 100
);

comment on table public.fact_categories is
  '人となりの見出し。検索の絞り込みには使わない（分類が 1 回ずれるとその顧客が永久に引けなくなる）。正は lib/constants/facts.ts。';

alter table public.fact_categories enable row level security;
alter table public.fact_categories force row level security;

create policy fact_categories_select on public.fact_categories
  for select to authenticated using (true);

-- 書き込みポリシーは作らない。masters.sql（postgres 権限）からしか入らない。
revoke insert, update, delete on public.fact_categories from authenticated, anon;
grant select on public.fact_categories to authenticated;


-- ── fact_labels ─────────────────────────────────────────
--
-- 「ゴルフ」は誰にとってもゴルフ。ここが正規化の本体で、
-- **一覧をまるごとプロンプトに載せられる**のが最大の実利になる。
-- 「打ちっぱなし行くらしい」→ 一覧に「ゴルフ」がある → LLM が既存語に寄せる。
-- embedding の類似度より確実で、これは文字列 1 本のままでは作れなかった。

create table public.fact_labels (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  category_key text not null references public.fact_categories (key),

  -- 一意なのはこちら。「ゴルフ」「ごるふ」「ＧＯＬＦ」を同じキーに寄せる。
  -- UI とエージェントで別の正規化をすると「画面には出るのに AI が
  -- 見つけられない」が起きるので、両者ともこの関数だけを通す。
  normalized text generated always as (app.normalize_ja(name)) stored,

  created_at          timestamptz not null default now(),
  created_by_staff_id uuid references public.staff (id) default app.current_staff_id()
);

comment on table public.fact_labels is
  '人となりの語彙。カテゴリはラベルの属性として持つ（分類を直すと全顧客へ一斉反映される）。';

create unique index fact_labels_normalized_key on public.fact_labels (normalized);
create index fact_labels_category_idx on public.fact_labels (category_key);

alter table public.fact_labels enable row level security;
alter table public.fact_labels force row level security;

create policy fact_labels_select on public.fact_labels
  for select to authenticated using (true);

-- INSERT は全員。新しい語は「事実を 1 件記録する」という通常の経路で生まれるので、
-- ここを管理者だけにすると記録そのものが止まる。
create policy fact_labels_insert on public.fact_labels
  for insert to authenticated with check (app.current_staff_id() is not null);

-- UPDATE は管理者だけ。1 行直すと全顧客の見え方が変わるため、app_settings と
-- 同じ「店舗共通のルール」として扱う。顧客データの「管理者は閲覧のみ」は
-- ここには効かない（この非対称の線引きは docs/database-design.md に書いてある）。
create policy fact_labels_update on public.fact_labels
  for update to authenticated
  using      (app.is_admin())
  with check (app.is_admin());

-- 削除は誰にもできない。使われている語を消すと customer_facts の FK が壊れる。
-- 語を廃止したいときは category_key を 'other' へ落とす。
revoke delete on public.fact_labels from authenticated, anon;
grant select, insert, update on public.fact_labels to authenticated;


-- ── fact_aliases ────────────────────────────────────────
--
-- 「打ちっぱなし」「ラウンド」→「ゴルフ」。確定検索で語を引くときと、
-- LLM に既存語へ寄せさせるときの両方で使う。
--
-- fact_labels の INSERT と違い、これは通常の記録経路では生まれない
-- （人が「これも同じ意味だ」と気づいたときだけ増える）ので管理者に絞る。

create table public.fact_aliases (
  alias      text primary key,   -- app.normalize_ja を通した形で入れる
  label_id   uuid not null references public.fact_labels (id),
  created_at timestamptz not null default now()
);

comment on column public.fact_aliases.alias is
  'app.normalize_ja を通した形で入れること。生の表記のまま入れると検索側と突き合わない。';

create index fact_aliases_label_idx on public.fact_aliases (label_id);

alter table public.fact_aliases enable row level security;
alter table public.fact_aliases force row level security;

create policy fact_aliases_select on public.fact_aliases
  for select to authenticated using (true);

create policy fact_aliases_insert on public.fact_aliases
  for insert to authenticated with check (app.is_admin());

create policy fact_aliases_update on public.fact_aliases
  for update to authenticated
  using      (app.is_admin())
  with check (app.is_admin());

revoke delete on public.fact_aliases from authenticated, anon;
grant select, insert, update on public.fact_aliases to authenticated;


-- ── customer_facts ──────────────────────────────────────
--
-- 顧客について記録した 1 行。ラベルが付いているものと、付いていない走り書きの
-- 両方がここに入る。**メモと事実は、ラベルの有無しか違わない。**
--
-- 分けて持つと「これは趣味欄か、メモか」をスタッフに毎回選ばせることになり、
-- 速いほう（textarea）へ情報が逃げて確定検索から漏れる。1 つにすれば
-- 入力は「1 行書く」だけになり、ラベルは後から付く。
--
-- 追記のみ。訂正も上書きではなく「無効化して新しい行を足す」。
-- PITR を入れない判断（+$100/月）の裏返しで、「消えない」ことを設計で担保する
-- 3 本目にあたる（1 本目は顧客の物理削除禁止、2 本目は change_log）。

create table public.customer_facts (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id),

  -- null は「まだラベルの付いていない記録」。「ご子息の成人式スーツの相談」の
  -- ように語彙にならない話はここへ落ちる。fact_labels は 1 語も汚れないので、
  -- 「メモを facts に流すと一覧がノイズで埋まる」という懸念は起きない。
  label_id uuid references public.fact_labels (id),

  -- 原文。「打ちっぱなしによく行くらしい」。ラベルだけだと文脈が落ちるので、
  -- カルテには必ずこちらを出す。RAG のチャンクの本文でもある。
  body text not null,

  -- migration は「文字列を機械的に割ったので誤りが混ざりうる」という印。
  -- agent は会話由来だが、人が「適用」を押した行しか存在しない
  -- （提案のまま適用されていない書き込みは agent_messages に留まる）。
  source text not null check (source in ('agent', 'manual', 'migration')),

  -- いつの話か。「3 年前に聞いた」と「先週聞いた」を区別する。
  -- 記入は任意で、NULL は「時点が分からない」を素直に表す。
  observed_on date,

  invalidated_at          timestamptz,
  invalidated_by_staff_id uuid references public.staff (id),

  created_by_staff_id uuid not null references public.staff (id)
    default app.current_staff_id(),
  created_at timestamptz not null default now()
);

comment on table public.customer_facts is
  '人となりと記録。label_id が null の行は「まだラベルの付いていない走り書き」。追記のみ（訂正は invalidated_at を立てて新しい行を足す）。物理削除は誰にもできない。';

-- 止めるのは「同じ顧客・同じラベル・同じ原文」の二重登録だけ。
-- ラベル単位では止めない — 「ゴルフ好きらしい」と「月2でラウンドしてる」は
-- どちらもゴルフだが別の事実で、片方を捨てると情報が消える。
-- 無効化した行は対象外なので、一度消してから同じ内容を入れ直すことはできる。
--
-- nulls not distinct が要る。既定では NULL 同士を別物と見なすので、
-- ラベルの無い行だけ二重送信が素通りしてしまう。
create unique index customer_facts_dedupe
  on public.customer_facts (customer_id, label_id, body)
  nulls not distinct
  where invalidated_at is null;

create index customer_facts_customer_idx
  on public.customer_facts (customer_id) where invalidated_at is null;
create index customer_facts_label_idx
  on public.customer_facts (label_id)
  where invalidated_at is null and label_id is not null;


-- 追記のみを構造で守る。
--
-- UPDATE ポリシーは行を選べても列を選べないので、ポリシーだけだと
-- 「body を書き換えて過去の事実を消す」が通ってしまう。しかも無音。
create or replace function app.guard_fact_append_only() returns trigger
  language plpgsql
as $$
begin
  if new.id          is distinct from old.id
  or new.customer_id is distinct from old.customer_id
  or new.label_id    is distinct from old.label_id
  or new.body        is distinct from old.body
  or new.source      is distinct from old.source
  or new.observed_on is distinct from old.observed_on
  or new.created_by_staff_id is distinct from old.created_by_staff_id
  or new.created_at  is distinct from old.created_at
  then
    raise exception '人となりは追記のみです。訂正は無効化して新しい行を足してください'
      using errcode = 'restrict_violation';
  end if;

  -- 無効化した人は本人で固定する。画面から渡させると嘘を書ける。
  if new.invalidated_at is not null and old.invalidated_at is null then
    new.invalidated_by_staff_id = app.current_staff_id();
  end if;

  return new;
end
$$;

create trigger customer_facts_append_only
  before update on public.customer_facts
  for each row execute function app.guard_fact_append_only();


-- RLS は顧客と同じ境界。app.is_admin() を書き込みポリシーで呼ばない
-- （「管理者は閲覧のみ」は顧客データの原則で、人となりも顧客データ）。
alter table public.customer_facts enable row level security;
alter table public.customer_facts force row level security;

create policy customer_facts_select on public.customer_facts
  for select to authenticated using (app.can_read_customer(customer_id));

create policy customer_facts_insert on public.customer_facts
  for insert to authenticated with check (app.can_write_customer(customer_id));

create policy customer_facts_update on public.customer_facts
  for update to authenticated
  using      (app.can_write_customer(customer_id))
  with check (app.can_write_customer(customer_id));

revoke delete on public.customer_facts from authenticated, anon;
grant select, insert, update on public.customer_facts to authenticated;


-- ── search_chunks ───────────────────────────────────────
--
-- 1 事実 1 チャンク。"ゴルフ・ワイン・読書" を 1 チャンクにすると
-- 「ワインが好きな人」でスコアが薄まる。チャンク設計は正規化そのもの。
--
-- customer_facts の列にせず別テーブルにした理由:
--   1. 再埋め込みが追記のみのテーブルを触らずに済む（上のトリガーに掛からない）
--   2. **アプリは 1 行も書けない。**書けるのは worker_role だけ
--   3. 6KB のベクトルを、人が実際に引く facts の行に載せない

create table public.search_chunks (
  fact_id uuid primary key references public.customer_facts (id) on delete cascade,

  -- RLS の述語に要る。担当替えで動く staff_id と違い、事実の持ち主は動かないので
  -- 非正規化してよい（子テーブルに staff_id を持たせない判断とは別物）。
  customer_id uuid not null references public.customers (id),

  -- 埋め込みに渡した本文。ラベルがあれば「ラベル名 / 原文」、無ければ原文だけ。
  content text not null,

  -- 次元は lib/ai/models.ts の EMBEDDING_DIMENSIONS と一致させること。
  -- 1536 なのはモデルではなく pgvector の都合（HNSW は 2000 次元まで）。
  embedding extensions.vector(1536),

  -- どのモデルで作った行か。混在したまま検索すると距離が意味を成さないので、
  -- モデルを替えたら全行を埋め込み直す。
  embedding_model text,
  embedded_at     timestamptz
);

comment on table public.search_chunks is
  '意味検索用のチャンク。1 事実 1 行。アプリからは読むだけで、書けるのは worker_role のみ。';

-- 未処理のキューを別に持たない。customer_facts left join search_chunks が
-- NULL の集合がそのままキューになる。テーブルを増やすと「キューに入れ忘れた
-- 事実」という無音の失敗が生まれる。
create index search_chunks_pending_idx on public.search_chunks (fact_id)
  where embedding is null;

create index search_chunks_customer_idx on public.search_chunks (customer_id);

-- 罠: HNSW + RLS + LIMIT は取りこぼす。
-- `order by embedding <=> q limit k` はインデックス走査が先で RLS のフィルタが
-- 後なので、他スタッフの顧客が k 枠を食い潰して自分の顧客が落ちる。
-- app.search_customers() を書くときは多めに取ってから絞ること。
-- 確定検索（match_type='exact'）は LIMIT なしで全件返すので影響を受けない。
create index search_chunks_embedding_idx
  on public.search_chunks using hnsw (embedding extensions.vector_cosine_ops);

alter table public.search_chunks enable row level security;
alter table public.search_chunks force row level security;

create policy search_chunks_select on public.search_chunks
  for select to authenticated using (app.can_read_customer(customer_id));

-- アプリからは書けない。ポリシーも権限も与えない。
revoke insert, update, delete on public.search_chunks from authenticated, anon;
grant select on public.search_chunks to authenticated;


-- ── worker_role ─────────────────────────────────────────
--
-- 埋め込みのバックフィルは全スタッフ分を横断して拾う必要があり、RLS を越える。
-- service_role（BYPASSRLS 相当）を使ってはいけない — 一度環境変数に置くと
-- アプリのどこからでも天井が消える。
--
-- ロールは 20260811075650_app_schema_and_staff.sql で作ってあり、
-- 「ポリシーは Phase 2 で対象テーブルと一緒に書く」と書き置いてある。ここで果たす。
-- BYPASSRLS は持たせないので、越境は下のポリシーが明示的に許した範囲だけ。

create policy search_chunks_worker on public.search_chunks
  for all to worker_role using (true) with check (true);

grant select, insert, update on public.search_chunks to worker_role;

-- 埋め込む本文を組み立てるのに要る。書き込みは与えない。
create policy customer_facts_worker on public.customer_facts
  for select to worker_role using (true);

create policy fact_labels_worker on public.fact_labels
  for select to worker_role using (true);

grant select on public.customer_facts, public.fact_labels to worker_role;

-- worker_role は nologin なので、直接は接続できない。誰かが set role で入る。
-- PostgreSQL 16 でメンバーシップが INHERIT と SET に分かれ、CREATEROLE ロールが
-- 作ったロールへの自動付与は SET を含まなくなった。これが無いと
-- 「set role worker_role → permission denied」でロールを一度も使えない。
--
-- バックフィルの実体（Cron が何のロールで接続するか）は埋め込みを入れる回に決める。
-- worker_role に LOGIN と専用のパスワードを与えて Vercel に置くのが本命で、
-- そのときも BYPASSRLS は与えない。
grant worker_role to postgres with set true;
