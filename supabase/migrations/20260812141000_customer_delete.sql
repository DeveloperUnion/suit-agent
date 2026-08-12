-- Phase 3: 顧客の物理削除
--
-- **これは 20260811082223_customers.sql の「削除 … 誰にもできない」を 1 本外す。**
-- 元の判断（PITR を入れない代わりに「消えない」ことを構造で担保する）は変えない。
-- 変えるのは「誤登録した顧客を店が自分で消せる」という 1 点だけで、そのために:
--
--   * テーブルへの delete 権限は付けない。revoke も policy も今のまま
--     （直接 `delete from public.customers` は 42501 のまま落ちる）
--   * 消せる口は public.delete_customer() 1 本だけ。app.find_similar_customers と
--     同じで、RLS を貫通する例外は関数の中に閉じる
--   * 境界は customers_update と同じ。管理者にも他人の顧客は消させない
--
-- public スキーマに置くのは PostgREST の都合。config.toml の api.schemas が
-- public / graphql_public だけなので、supabase().rpc() から確実に届くのはこちら。

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

  -- 着装写真は行だけ。実体（order-photos バケット）はクライアントが
  -- この関数を呼ぶ前に消している（lib/data/customers.ts の deleteCustomer）。
  -- SQL からは Storage に手が届かないので、順序を逆にすると写真が孤児になる。
  delete from public.order_photos where customer_id = p_customer_id;

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
