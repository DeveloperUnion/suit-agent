-- 埋め込みのバックフィルが接続してくる口を開ける。
--
-- worker_role は 20260811075650_app_schema_and_staff.sql で nologin として作り、
-- 20260812041500_facts.sql で search_chunks への書き込みポリシーを与えてある。
-- 「Cron が何のロールで接続するかは埋め込みを入れる回で決める」と書き置いてあった。
-- ここで果たす。
--
-- **なぜ service_role を使わないか。** あれは BYPASSRLS 相当で、環境変数に
-- 置いた瞬間に「RLS が天井」という前提がアプリのどこか 1 行の import で消える。
-- worker_role に BYPASSRLS は与えない。越境できるのは、facts の回で明示的に
-- 書いたポリシーの範囲（search_chunks の読み書きと、埋め込む本文を組み立てる
-- ための customer_facts / fact_labels の select）だけ。
--
-- **パスワードはここに書かない。**migration は git に入るので、書いた時点で
-- 本番の資格情報を公開することになる。本番は SQL Editor から 1 回だけ設定し、
-- 接続文字列は Vercel の環境変数（WORKER_DATABASE_URL）に置く。手順は
-- docs/database.md に書いた。ローカルは supabase/seed.sql が開発用の値を入れる
-- （db reset でしか流れないので本番には届かない）。

alter role worker_role with login;

-- ベクトル型は extensions スキーマにある。app_schema の回で public と app には
-- usage を与えたが、extensions は入っていなかった。無いと
-- `$1::extensions.halfvec` が "permission denied for schema extensions" で落ちる
-- — 型を跨ぐ操作は書き込みの瞬間まで現れないので、本番の初回投入で初めて出る。
grant usage on schema extensions to worker_role;

comment on role worker_role is
  '埋め込みのバックフィル専用。BYPASSRLS は持たない。パスワードは git に置かず、本番は手で設定する。';
