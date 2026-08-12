-- 二枚目の壁を戻す。
--
-- Supabase は public の新しいテーブルに anon / authenticated へ既定で権限を与える
-- （プロジェクト作成時の "Automatically expose new tables"、ローカルでは
-- pg_default_acl の postgres 行）。この設計はそれを前提に、テーブルごとに
-- 明示の grant と revoke を書いてきた。
--
-- ただし 2 つ残っていた。
--
--   1. anon にも権限が付いている。ポリシーは全部 to authenticated なので
--      どれにも一致せず 0 行になる（fail-closed）が、それは
--      **RLS が唯一の砦**という状態そのもの。using (true) のポリシーを
--      1 本うっかり書いた瞬間に外へ出る
--   2. authenticated に TRUNCATE が付いている（既定 ACL の 'D'）。
--      **TRUNCATE は RLS を無視する。**PostgREST からは呼べないので到達経路は
--      無いが、権限として開いている理由も無い
--
-- ダッシュボードのトグルではなくここに書くのは、ローカルと本番で同じ状態を
-- 作るため。トグルは git に残らないし、次にプロジェクトを作る人が同じ選択を
-- する保証もない。

-- ── anon ────────────────────────────────────────────────
--
-- anon が要る経路は 1 つも無い。サインインは GoTrue が受けるので PostgREST を
-- 通らず、未ログインの画面（AuthGate）はテーブルを 1 つも引かない。

revoke all on all tables in schema public from anon;

-- 既定値も止める。これが無いと、次にテーブルを足した時点でまた付く。
-- migration は postgres で走るので for role postgres が暗黙に効く
-- （pg_default_acl には supabase_admin の行もあるが、こちらが作る
--  テーブルに効くのは postgres の行のほう）。
alter default privileges in schema public revoke all on tables from anon;


-- ── authenticated ───────────────────────────────────────
--
-- DML（select / insert / update / delete）はテーブルごとに grant と revoke で
-- 過不足なく書いてあるので触らない。既定 ACL でしか付いていない 3 つだけ剥がす。

revoke truncate, references, trigger on all tables in schema public from authenticated;

-- 既定値のほうは全部止める。**既存のテーブルには触らない** —
-- あちらは grant と revoke で過不足なく書けているので、剥がすと壊れる。
--
-- これで「踏んだ罠」の 1 番目（`grant select, insert, update` は無意味）が
-- 無意味でなくなる。次にテーブルを足したとき、grant を書き忘れると
-- **permission denied で落ちる**。いままでは既定で全権限が付いていたので、
-- 書き忘れても動いてしまい、revoke の書き忘れだけが穴になっていた。
alter default privileges in schema public revoke all on tables from authenticated;
