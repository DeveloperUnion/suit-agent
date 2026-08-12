-- 構造の不変条件。
--
-- RLS がこの設計の唯一の砦（supabase-js 一本にしたので、接続ロールは常に
-- authenticated 固定で、GRANT による二枚目の壁が無い）。
-- ゆえに「新しいテーブルに RLS を付け忘れた」「ビューに security_invoker を
-- 書き忘れた」は、そのまま全顧客の漏洩になる。
--
-- どちらもレビューでは落ちる。CI で機械的に落とす。

begin;
create extension if not exists pgtap with schema extensions;

select plan(11);


-- ── RLS の付け忘れ ──────────────────────────────────────

select is_empty(
  $$
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and not c.relrowsecurity
  $$,
  'public のテーブルはすべて RLS が有効であること'
);

-- FORCE を付けないと、テーブル所有者だけが RLS を素通りする。
-- 所有者で走るバッチや SECURITY DEFINER 関数が増えたときに穴になる。
select is_empty(
  $$
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and not c.relforcerowsecurity
  $$,
  'public のテーブルはすべて FORCE ROW LEVEL SECURITY であること'
);

-- RLS が有効でもポリシーが 0 本だと全行が見えなくなる（fail-closed なので
-- 漏洩はしないが、機能が黙って死ぬ）。付け忘れとして検出する。
select is_empty(
  $$
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relrowsecurity
       and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
  $$,
  'RLS が有効なテーブルには最低 1 本のポリシーがあること'
);


-- ── 権限の二枚目の壁 ────────────────────────────────────
--
-- RLS が唯一の砦にならないよう、権限のほうでも塞いである。
-- 新しいテーブルを足したときに既定 ACL で anon へ権限が戻っていないかを見る。

select is_empty(
  $$
    select table_name || ':' || privilege_type
      from information_schema.role_table_grants
     where grantee = 'anon' and table_schema = 'public'
  $$,
  'anon は public のテーブルに 1 つも権限を持たないこと'
);

-- TRUNCATE は RLS を無視する。DML は grant / revoke で書いてあるが、
-- これは既定 ACL でしか付かないので個別に見る。
select is_empty(
  $$
    select table_name
      from information_schema.role_table_grants
     where grantee = 'authenticated' and table_schema = 'public'
       and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
  $$,
  'authenticated は TRUNCATE / REFERENCES / TRIGGER を持たないこと'
);


-- ── ビューの security_invoker 忘れ ──────────────────────
--
-- 忘れるとビューは所有者の権限で走り、RLS を丸ごと迂回する。
-- 実装時に最も踏みやすい穴なので、ビューが 1 本も無いうちから検査を置く。

select is_empty(
  $$
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'v'
       and coalesce(
             (select option_value
                from pg_options_to_table(c.reloptions)
               where option_name = 'security_invoker'),
             'false'
           ) <> 'true'
  $$,
  'public のビューはすべて security_invoker = true であること'
);


-- ── 正規化 ──────────────────────────────────────────────
--
-- UI とエージェントで別の正規化をすると「画面には出るのに AI が見つけられない」
-- が起きる。ここが両者の唯一の出どころなので、挙動を固定しておく。

select is(app.normalize_ja('時枝 正'), '時枝正', '半角空白を落とす');
select is(app.normalize_ja('時枝　正'), '時枝正', '全角空白も落とす');
select is(app.normalize_ja('たなか'), 'タナカ', 'ひらがなをカタカナへ寄せる（「たなか」で「タナカ」を引けるように）');
select is(app.normalize_ja('ＡＢＣ１２３'), 'abc123', '全角英数を半角へ、大文字を小文字へ');
select is(app.normalize_ja(null), '', 'NULL は空文字（生成列で NULL を伝播させない）');


select * from finish();
rollback;
