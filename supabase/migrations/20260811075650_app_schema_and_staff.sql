-- Phase 0: 土台
--
-- ここで作るのは「今誰か」を DB が自力で知るための仕組みだけ。
-- 顧客も注文も無いうちに RLS の主体を確定させておくのは、後から足すと
-- ポリシーの付け忘れが混ざったまま気づけなくなるため。
--
-- 認証方式（Magic Link / パスワード / Google）はここに影響しない。
-- app.current_staff_id() は auth.uid() しか見ないので、入り口が変わっても
-- 境界の定義は動かない。
--
-- 記述順に制約がある: language sql の関数は作成時に本体が検証されるため、
--   staff テーブル → それを参照する関数 → 関数を使うポリシー
-- の順でないと通らない。

create schema if not exists app;

-- 関数は誰でも実行してよい（中身が権限判定そのものなので、隠す意味がない）
grant usage on schema app to authenticated, anon, service_role;


-- ── staff ───────────────────────────────────────────────

create table public.staff (
  id uuid primary key default gen_random_uuid(),

  -- 招待発行時（auth.admin.inviteUserByEmail の戻り値）に埋める。
  -- メールアドレスの一致で紐付けない — 検証しない IdP を後から足したときに
  -- なりすまし登録が通る経路になるため。
  auth_user_id uuid unique references auth.users (id) on delete set null,

  name  text not null,
  email text not null unique,
  role  text not null default 'member' check (role in ('admin', 'member')),

  -- 退職者は行を消さずにこれを false にする。current_staff_id() が毎回
  -- 見るので、有効な JWT が端末に残っていても DB からは何も見えなくなる。
  is_active boolean not null default true,

  invited_at      timestamptz,
  deactivated_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.staff is
  'スタッフ。セルフサインアップは構造で禁止される — auth 側で勝手にアカウントが作られても、ここに対応行が無ければ current_staff_id() が NULL を返し全ポリシーが 0 行になる。';

create index staff_auth_user_id_idx on public.staff (auth_user_id) where is_active;


-- ── 主体の取得 ──────────────────────────────────────────
--
-- 必ず staff テーブルを経由する。JWT の claim に role を埋めて信用しない。
-- 退職者のトークンが有効期限内に残っていても is_active = false なら NULL が
-- 返り、この関数を使う全ポリシーが 0 行に倒れる（fail-closed）。
--
-- SECURITY DEFINER + search_path = '' は必須。staff 自身のポリシーから
-- 呼ばれるため、INVOKER だと RLS の評価が無限再帰する。

create or replace function app.current_staff_id() returns uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select s.id
    from public.staff s
   where s.is_active
     and s.auth_user_id = auth.uid()
$$;

comment on function app.current_staff_id() is
  '操作しているスタッフ。管理者が画面上でスタッフを切り替えても、この値は本人のまま動かない（切り替えは閲覧フィルタであって、なりきりではない）。';

create or replace function app.is_admin() returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
      from public.staff s
     where s.is_active
       and s.auth_user_id = auth.uid()
       and s.role = 'admin'
  )
$$;

comment on function app.is_admin() is
  '管理者かどうか。管理者に許すのは全顧客の「閲覧」だけで、編集は全員が自担当のみ。書き込み側のポリシーからは呼ばない。';


-- ── 日本語の正規化 ──────────────────────────────────────
--
-- UI とエージェントで別の正規化をすると「画面には出るのに AI が見つけられない」
-- が起きるので、正規化はこの 1 関数に集約する。
--
-- やること:
--   空白（半角・全角）の除去 / 全角英数 → 半角 / ひらがな → カタカナ /
--   半角長音 → 全角長音 / 大文字 → 小文字
--
-- やらないこと:
--   半角カタカナの合成（ｶﾞ = ｶ + ﾞ の 2 文字なので translate では扱えない）。
--   入る経路が OCR くらいしかないため、必要になってから足す。
--
-- generated column から呼ぶので immutable であること。

create or replace function app.normalize_ja(t text) returns text
  language sql
  immutable
  parallel safe
as $$
  select lower(
    translate(
      regexp_replace(coalesce(t, ''), '[[:space:]　]', '', 'g'),
      '０１２３４５６７８９'
      || 'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ'
      || 'ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ'
      || 'ｰ'
      || 'ぁあぃいぅうぇえぉおかがきぎくぐけげこご'
      || 'さざしじすずせぜそぞただちぢっつづてでとど'
      || 'なにぬねのはばぱひびぴふぶぷへべぺほぼぽ'
      || 'まみむめもゃやゅゆょよらりるれろ'
      || 'ゎわゐゑをんゔゕゖ',
      '0123456789'
      || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      || 'abcdefghijklmnopqrstuvwxyz'
      || 'ー'
      || 'ァアィイゥウェエォオカガキギクグケゲコゴ'
      || 'サザシジスズセゼソゾタダチヂッツヅテデトド'
      || 'ナニヌネノハバパヒビピフブプヘベペホボポ'
      || 'マミムメモャヤュユョヨラリルレロ'
      || 'ヮワヰヱヲンヴヵヶ'
    )
  )
$$;

comment on function app.normalize_ja(text) is
  '検索キーの正規化。UI とエージェントで必ずこの関数を通す。ひらがなはカタカナへ寄せるので「たなか」で「タナカ」を引ける。';


-- ── バッチ用ロール ──────────────────────────────────────
--
-- 埋め込みのバックフィルは全スタッフ分を横断して拾う必要があり、RLS を
-- 越えることになる。ここで service_role を使ってはいけない（BYPASSRLS 相当で、
-- 一度環境変数に置くとアプリのどこからでも天井が消える）。
--
-- BYPASSRLS を持たない専用ロールを作り、テーブルごとに必要な GRANT だけを
-- 与える。ポリシーは Phase 2 で対象テーブルと一緒に書く。

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'worker_role') then
    create role worker_role nologin noinherit;
  end if;
end
$$;

grant usage on schema public, app to worker_role;


-- ── staff の RLS ────────────────────────────────────────

alter table public.staff enable row level security;
alter table public.staff force row level security;

-- 閲覧は全員に開ける。管理者のスタッフ切り替え、売上目標の一覧、
-- 「白髭さん担当の田中様」という言い回しがすべてこれを必要とする。
-- 10 名の店舗で氏名とメールを隠す意味もない。
create policy staff_select on public.staff
  for select to authenticated
  using (true);

create policy staff_insert on public.staff
  for insert to authenticated
  with check (app.is_admin());

create policy staff_update on public.staff
  for update to authenticated
  using (app.is_admin())
  with check (app.is_admin());

-- DELETE ポリシーは作らない。退職は is_active = false で表現する。
-- 行を消すと採寸票・注文の「誰がやったか」が全部壊れる。
--
-- ただしポリシーを書かないだけでは足りない。Supabase は public スキーマの
-- 全テーブルに対して authenticated/anon へ ALL 権限を既定で与えるので、
-- DELETE 自体は「許可されている」状態になり、RLS が 0 行に切り落とすだけに
-- なる。エラーが出ず静かに何も起きないので、アプリ側のバグを隠す。
-- 明示的に剥がして、試みた時点で落ちるようにする。
revoke delete on public.staff from authenticated, anon;
grant select, insert, update on public.staff to authenticated;


-- ── updated_at ──────────────────────────────────────────

create or replace function app.touch_updated_at() returns trigger
  language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger staff_touch_updated_at
  before update on public.staff
  for each row execute function app.touch_updated_at();
