-- 招待を画面から行えるようにする。門番を GoTrue のフラグから staff テーブルへ移す。
--
-- これまでの門番は `enable_signup = false` という設定フラグ 1 つだった。その結果
-- auth.users を作る手段が「service_role キーを持つ招待 API」しか残らず、
-- キーを置かないと決めた以上、**スタッフを増やす経路が存在しなかった**
-- （createStaff() は staff に 1 行入れるだけで、その人はサインインできない）。
--
-- 本番の管理者は店舗の人なので、Supabase の Dashboard を開かせる運用は成立しない。
--
-- フラグは外すが、セルフサインアップは相変わらず通らない。**staff に行が無い
-- メールでは auth.users を作れない**ためで、むしろ強くなっている — 誰かが
-- Dashboard でフラグを戻しても、この門番は DB の中にあり続ける。
--
--   管理者が設定画面で名前とメールを登録   → staff に 1 行（auth.users はまだ無い）
--   本人がサインイン画面でメールを入れる   → GoTrue が auth.users を作ろうとする
--   下の BEFORE トリガーが staff を見て通す
--   下の AFTER トリガーが staff.auth_user_id を埋める
--   リンクが届いて入れる
--
-- **メール一致で紐付けている。**staff.auth_user_id のコメントは
-- 「一致で紐付けない — 検証しない IdP を後から足したときになりすまし登録が通る」
-- と書いていて、その懸念は正しい。いまは入り口が Magic Link だけで、
-- **アドレスの所有はメールが届くことで証明される**ので成立している。
-- Google ログインのような別の IdP を足すなら、ここを見直すこと。

create or replace function app.guard_auth_user_is_staff() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  -- supabase_auth_admin は public.staff を読めないので definer で走らせる。
  -- 所有者（postgres）は BYPASSRLS を持つため、staff の FORCE RLS も通り抜ける。
  if not exists (
    select 1
      from public.staff s
     where lower(s.email) = lower(new.email)
       and s.is_active
  ) then
    raise exception '登録されていないメールアドレスです'
      using errcode = 'insufficient_privilege',
            hint = '管理者に設定画面からスタッフを追加してもらってください';
  end if;
  return new;
end
$$;

comment on function app.guard_auth_user_is_staff() is
  'staff に無いメールでは認証ユーザーを作らせない。セルフサインアップ禁止の実体はここ（GoTrue の設定フラグではない）。';

create or replace function app.link_staff_auth_user() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  update public.staff
     set auth_user_id = new.id
   where lower(email) = lower(new.email)
     and auth_user_id is null;
  return null;
end
$$;

create trigger auth_users_must_be_staff
  before insert on auth.users
  for each row execute function app.guard_auth_user_is_staff();

create trigger auth_users_link_staff
  after insert on auth.users
  for each row execute function app.link_staff_auth_user();

-- 列のコメントも直す。元の migration は main に出ているので、ここで上書きする。
comment on column public.staff.auth_user_id is
  '初回サインイン時に app.link_staff_auth_user() が埋める。メール一致で紐付けているのは、入り口が Magic Link だけでアドレスの所有が配信で証明されるため。検証しない IdP（Google など）を足すならここを見直すこと。';
