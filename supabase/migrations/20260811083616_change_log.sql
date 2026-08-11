-- Phase 1: 監査ログ
--
-- PITR を入れない判断（+$100/月でインフラ費が 3 倍になる）の裏返しとして、
-- 「昨日の誤操作を辿る」唯一の手段がこれになる。
--
-- 3 つの決めごと:
--   テーブルごとの履歴表にしない  … N 個のマイグレーションを生むだけ
--   アプリ層で記録しない          … RLS と同じ論理で、書き込みそのものに
--                                    紐づける以外に書き忘れは防げない
--   誰にも DML 権限を与えない      … SECURITY DEFINER のトリガー関数だけが
--                                    書く。改竄がアプリのどこからも不可能になる
--
-- コストは年間で数万行・数十MB。無視できる。

create table public.change_log (
  id bigint generated always as identity primary key,

  table_name text not null,
  row_id uuid,
  -- 個人情報の削除請求（app.purge_customer）で before/after をマスキングする
  -- ために持つ。「消したのに監査ログに残っている」は法的にアウト。
  customer_id uuid,

  op text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  before jsonb,
  after  jsonb,
  -- UPDATE のとき実際に変わった列だけ。全列を並べると差分が読めない。
  changed_columns text[],

  -- 「提案 → 適用」を採ったので、書き込みの主体は常に人間。
  -- AI かどうかの区別は持たない（承認なしに AI は書けない）。
  actor_staff_id uuid,
  occurred_at timestamptz not null default now()
);

comment on table public.change_log is
  '全書き込みの記録。誰にも DML 権限を与えず、SECURITY DEFINER のトリガー関数だけが書く。';

create index change_log_customer_idx on public.change_log (customer_id, occurred_at desc);
create index change_log_row_idx      on public.change_log (table_name, row_id, occurred_at desc);


-- ── 記録するトリガー ────────────────────────────────────
--
-- TG_ARGV[0] で customer_id の求め方を指定する:
--   'self'       … その行の id が customer_id（customers 自身）
--   'column'     … TG_ARGV[1] の列に入っている
--   'via_sheet'  … sheet_id から measurement_sheets を引く
--   'none'       … 顧客に紐づかない（staff など）

create or replace function app.log_change() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_row      jsonb;
  v_before   jsonb;
  v_after    jsonb;
  v_changed  text[];
  v_row_id   uuid;
  v_customer uuid;
  v_mode     text := coalesce(tg_argv[0], 'none');
begin
  if tg_op = 'DELETE' then
    v_before := to_jsonb(old);
    v_row := v_before;
  elsif tg_op = 'INSERT' then
    v_after := to_jsonb(new);
    v_row := v_after;
  else
    v_before := to_jsonb(old);
    v_after  := to_jsonb(new);
    v_row := v_after;
    select array_agg(key order by key) into v_changed
      from jsonb_each(v_after)
     where value is distinct from (v_before -> key)
       -- updated_at は必ず動くので差分に含めない。含めると
       -- 「何が変わったか」が毎回 1 件多く見えて読みにくくなる。
       and key <> 'updated_at';

    -- 実質何も変わっていない UPDATE は記録しない。
    -- 画面の保存ボタンを二度押しただけでログが伸びるのを避ける。
    if v_changed is null then
      return null;
    end if;
  end if;

  v_row_id := (v_row ->> 'id')::uuid;

  v_customer := case v_mode
    when 'self'   then v_row_id
    when 'column' then (v_row ->> tg_argv[1])::uuid
    when 'via_sheet' then (
      select s.customer_id from public.measurement_sheets s
       where s.id = (v_row ->> 'sheet_id')::uuid
    )
    else null
  end;

  insert into public.change_log
    (table_name, row_id, customer_id, op, before, after, changed_columns, actor_staff_id)
  values
    (tg_table_name, v_row_id, v_customer, tg_op, v_before, v_after, v_changed,
     app.current_staff_id());

  return null;   -- AFTER トリガーなので戻り値は使われない
end
$$;


-- ── 貼り付け ────────────────────────────────────────────

create trigger customers_log
  after insert or update or delete on public.customers
  for each row execute function app.log_change('self');

create trigger customer_anniversaries_log
  after insert or update or delete on public.customer_anniversaries
  for each row execute function app.log_change('column', 'customer_id');

-- customer_ng_notes は Phase 2 で作るので、そのときトリガーも貼る。

create trigger orders_log
  after insert or update or delete on public.orders
  for each row execute function app.log_change('column', 'customer_id');

create trigger measurement_sheets_log
  after insert or update or delete on public.measurement_sheets
  for each row execute function app.log_change('column', 'customer_id');

-- 採寸値は id を持たない（複合主キー）ので row_id は NULL になるが、
-- before/after に sheet_id と field_key が入るので追跡はできる。
-- 単価 15〜20 万円の服の寸法が「いつの間にか変わっていた」を追えるようにする。
create trigger measurement_values_log
  after insert or update or delete on public.measurement_values
  for each row execute function app.log_change('via_sheet');

create trigger staff_log
  after insert or update or delete on public.staff
  for each row execute function app.log_change('none');

-- approach_resolutions は追記のみで UPDATE も DELETE も無いため貼らない。
-- 行の存在そのものが履歴になっている。


-- ── 権限 ────────────────────────────────────────────────
--
-- 書き込みは剥がす。トリガー関数は SECURITY DEFINER なので postgres の
-- 権限で走り、この revoke の影響を受けない。
-- 結果として「アプリのどのコードからも監査ログを書き換えられない」が成立する。

alter table public.change_log enable row level security;
alter table public.change_log force row level security;

-- 読むのは許す。「昨日の誤操作を辿る」ためのものなので、閲覧できないと
-- 存在意義がない。範囲は顧客の閲覧境界と同じにする。
create policy change_log_select on public.change_log
  for select to authenticated
  using (
    case
      when customer_id is not null then app.can_read_customer(customer_id)
      else app.is_admin()   -- 顧客に紐づかない行（staff の変更など）は管理者だけ
    end
  );

revoke insert, update, delete on public.change_log from authenticated, anon;
grant select on public.change_log to authenticated;
