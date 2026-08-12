-- Phase 3: 生年月日から誕生日の記念日を自動で作る
--
-- customers.birth_date と customer_anniversaries は別物で、記念日トリガーは
-- 後者しか見ていない（v_approach_inputs は c.birth_date を持たない）。
-- つまり生年月日を入れても誕生日のアプローチは 1 件も立っていなかった。
-- README の「生年月日（記念日トリガー）」は、この移行で初めて本当になる。
--
-- アプリ側ではなく DB に置く理由:
-- 生年月日を書く経路は今は基本情報の編集 1 本だが、名刺 OCR や発注書取り込みが
-- 後から書けるようになったときに、同期の呼び忘れが無音で起きる。RLS を採ったのと
-- 同じ理由で、作法は必ず破れる。

create or replace function app.sync_birthday_anniversary() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_id uuid;
begin
  if new.birth_date is null then
    delete from public.customer_anniversaries
     where customer_id = new.id and type = 'birthday';
    return null;
  end if;

  select id into v_id
    from public.customer_anniversaries
   where customer_id = new.id and type = 'birthday'
   order by created_at, id
   limit 1;

  if v_id is null then
    -- label は空にしておく。画面は label || ANNIVERSARY_LABEL[type] で
    -- 「誕生日」に落ちるので、手で付けた表示名があればそちらが勝つ。
    insert into public.customer_anniversaries (customer_id, type, date, label)
    values (new.id, 'birthday', new.birth_date, '');
  else
    -- ★ 消して入れ直さない。id を作り直すと approach_resolutions.trigger_key
    -- （anniversary:{id}:{年}）が別の記念日を指し、スキップ済みの判断が
    -- 無音で他の記念日へ移る（20260811082223_customers.sql:180-184）。
    update public.customer_anniversaries
       set date = new.birth_date
     where id = v_id and date is distinct from new.birth_date;
  end if;

  return null;   -- AFTER トリガーなので戻り値は使われない
end
$$;

comment on function app.sync_birthday_anniversary() is
  '生年月日を customer_anniversaries の birthday 行へ写す。行は作り直さず date だけ更新する。';

create trigger customers_sync_birthday
  after insert or update of birth_date on public.customers
  for each row execute function app.sync_birthday_anniversary();


-- 既にある生年月日を拾う。ローカルでは 0 行になる（この時点で customers は空で、
-- dev-seed は後から流れる）が、本番では意味を持つ。
insert into public.customer_anniversaries (customer_id, type, date, label)
select c.id, 'birthday', c.birth_date, ''
  from public.customers c
 where c.birth_date is not null
   and not exists (
     select 1 from public.customer_anniversaries a
      where a.customer_id = c.id and a.type = 'birthday'
   );
