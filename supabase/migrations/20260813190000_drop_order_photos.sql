-- 着装写真をやめる
--
-- **20260812140000_order_photos.sql を打ち消す。**あちらは「画像を一切保存しない」
-- という当初の判断をわざわざ反転して入れたもので、ここで元に戻る。判断が 2 度
-- 折り返しているので、履歴だけ追うと往復に見える。経緯は docs/database-design.md。
--
-- 反転を戻す理由:
--   * 店が着装写真を使わないと決めた。紙のカルテに貼ってあった写真は、
--     アプリで扱わなくても困らないという結論だった。
--   * 使わないなら、持たないほうが良い。顧客の画像はいちばん重い個人情報で、
--     削除請求への対応も Storage と DB の 2 段になっていた（下の delete_customer）。
--   * 本番はまだ店舗に渡しておらず、写真は 1 枚も入っていない。消すならいま。
--
-- **前の migration は書き換えない。**db push は一度当てたファイルを二度流さないので、
-- 書き換えると手元の db:reset は緑のまま本番にだけ入らない（.github/workflows/db.yml
-- がそれを検出して落とす）。だから打ち消す 1 本を足す。


-- ── storage.objects のポリシー ──────────────────────────
--
-- テーブルより先に落とす。ポリシーは app.customer_id_from_object_name() を
-- 参照しているので、関数を先に drop すると依存で止まる。

drop policy if exists order_photos_objects_select on storage.objects;
drop policy if exists order_photos_objects_insert on storage.objects;
drop policy if exists order_photos_objects_delete on storage.objects;


-- ── バケットと実体 ──────────────────────────────────────
--
-- storage.objects / storage.buckets には削除を止めるトリガーが立っている
-- （storage.protect_delete）。**わざと外す。**あのトリガーが守っているのは
-- 「行だけ消してバックエンドのファイルが孤児になる」ことで、まさにここで
-- 起きうる事故だから、外す理由を書いておく:
--
--   * 本番の order-photos は空。店舗にまだ渡しておらず、1 枚も上がっていない
--   * 手元の Docker に上げたぶんは、db:reset ではなく
--     `supabase stop --no-backup` でボリュームごと消える
--
-- 逃がし口は storage.allow_delete_query。**使ったら必ず戻す** — 立てたままだと
-- 以降の migration でも storage の削除が素通りする。
--
-- objects を先に消す。storage.objects.bucket_id は storage.buckets への FK なので、
-- 順序を逆にすると FK 違反で落ちる。

do $$
begin
  perform set_config('storage.allow_delete_query', 'true', false);

  delete from storage.objects where bucket_id = 'order-photos';
  delete from storage.buckets where id = 'order-photos';

  perform set_config('storage.allow_delete_query', 'false', false);
end
$$;


-- ── メタデータのテーブル ────────────────────────────────
--
-- RLS ポリシー・索引・grant も一緒に落ちる。

drop table if exists public.order_photos;

drop function if exists app.customer_id_from_object_name(text);


-- ── 顧客削除から写真の行を外す ──────────────────────────
--
-- **これを忘れると顧客の削除が「そんなテーブルは無い」で落ちる。**
-- 20260812141000_customer_delete.sql の関数から、order_photos を消す 1 行だけを
-- 抜いた版で置き換える。他は 1 文字も変えない。
--
-- 併せてクライアント側（lib/data/customers.ts の deleteCustomer）から
-- Storage の掃除が消え、削除は再びこの関数 1 本で完結する。

create or replace function public.delete_customer(p_customer_id uuid) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not app.can_write_customer(p_customer_id) then
    -- 存在しない顧客と担当外の顧客を区別しない。区別すると
    -- 「その id は存在する」だけが漏れる。
    raise exception '削除できません。担当している顧客ではありません'
      using errcode = '42501';
  end if;

  -- カスケードに任せず明示的に消す。
  --
  -- 理由が 2 つある。
  --   1. FK が cascade の表と no action の表が混在していて、任せると
  --      customer_facts / customer_ng_notes / search_chunks で FK 違反になる
  --   2. 順序そのものが監査ログの正しさに効く（下の measurement_values を参照）

  -- 意味検索の索引 → 事実 → 注意事項。ここは FK が no action。
  delete from public.search_chunks     where customer_id = p_customer_id;
  delete from public.customer_facts    where customer_id = p_customer_id;
  delete from public.customer_ng_notes where customer_id = p_customer_id;

  -- ★ 採寸値を票より先に消す。
  -- measurement_values_log は via_sheet モードで measurement_sheets を引いて
  -- customer_id を決める（20260811083616_change_log.sql:94-97）。票を先に消すと
  -- ログの customer_id が NULL になり、下の掃除から漏れて寸法が残る。
  delete from public.measurement_values mv
   using public.measurement_sheets ms
   where mv.sheet_id = ms.id and ms.customer_id = p_customer_id;

  delete from public.measurement_sections ms2
   using public.measurement_sheets ms
   where ms2.sheet_id = ms.id and ms.customer_id = p_customer_id;

  delete from public.measurement_adjustments ma
   using public.measurement_sheets ms
   where ma.sheet_id = ms.id and ms.customer_id = p_customer_id;

  delete from public.measurement_sheets where customer_id = p_customer_id;

  delete from public.order_items oi
   using public.orders o
   where oi.order_id = o.id and o.customer_id = p_customer_id;

  delete from public.orders where customer_id = p_customer_id;

  delete from public.approach_resolutions   where customer_id = p_customer_id;
  delete from public.customer_anniversaries where customer_id = p_customer_id;

  delete from public.customers where id = p_customer_id;

  -- 会話。agent_messages は顧客への FK を持たないが、action jsonb に
  -- AgentCustomerRef（id と氏名）が入る。uuid の一致で十分に絞れるので
  -- 文字列で見る。会話ごと消えるのは意図した挙動で、
  -- 「◯◯様はゴルフがお好きとのこと」が残るほうが困る。
  delete from public.agent_messages
   where action::text like '%' || p_customer_id::text || '%';

  -- 監査ログ。ここまでの delete が change_log に DELETE 行を積んでおり、
  -- customers のぶんは before に氏名・電話・住所が丸ごと入っている。
  -- 「消したのに監査ログに残っている」を残さないため、顧客に紐づく行は落とす。
  delete from public.change_log where customer_id = p_customer_id;

  -- 代わりに「いつ・誰が・どの id を消したか」だけを 1 行残す。
  -- 顧客行がもう無いので app.can_read_customer() は false になり、
  -- change_log_select により**この行を読めるのは管理者だけ**になる。意図どおり。
  insert into public.change_log
    (table_name, row_id, customer_id, op, before, after, changed_columns, actor_staff_id)
  values
    ('customers', p_customer_id, p_customer_id, 'DELETE', null, null, null,
     app.current_staff_id());
end
$$;

comment on function public.delete_customer(uuid) is
  '顧客の物理削除。RLS を貫通する例外で、境界は customers_update と同じ（自担当のみ）。監査ログは削除の事実だけ残す。';

revoke all on function public.delete_customer(uuid) from public;
grant execute on function public.delete_customer(uuid) to authenticated;
