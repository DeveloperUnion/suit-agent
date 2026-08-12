-- ローカル開発用のシード。
--
-- `supabase db reset` でのみ流れる（本番の `supabase db push` では流れない）。
-- マスタ（item_types / measurement_fields / adjustment_masters）は Phase 1 で
-- lib/constants/*.ts から生成してここに足す。冪等に書くこと — migration に
-- insert を書くと項目を 1 つ直すたびに新しい migration が要る。
--
-- 本番では staff を 1 行入れるだけでは足りない。auth.users が無いと
-- current_staff_id() が NULL のままで、そもそもサインインできない
-- （shouldCreateUser: false なので GoTrue が otp_disabled を返す）。
--
-- 招待画面は無い。auth.admin.inviteUserByEmail() には service_role キーが要り、
-- 置かないと決めた以上そもそも実装できないため。当面は 1 人につき手作業で 2 手:
--   1. Dashboard → Authentication → Users → Add user（Auto Confirm を有効に）
--   2. SQL Editor で
--      insert into public.staff (name, email, role) values ('…', '…', 'member');
--      update public.staff s set auth_user_id = u.id from auth.users u
--       where u.email = s.email and s.auth_user_id is null;

-- ── スタッフ ────────────────────────────────────────────
--
-- 4 人とも管理者（全顧客を閲覧できるが、編集は自分の担当のみ）。
-- 一般スタッフ約 7 名は運用開始時に上の 2 手で追加する。

do $$
declare
  v_instance uuid := '00000000-0000-0000-0000-000000000000';
  r record;
begin
  for r in
    -- staff.id と auth_user_id は別物。dev-seed.sql が customers.staff_id に
    -- 入れるのは前者なので、両方をここで固定して 1 箇所で決める。
    select * from (values
      ('5ea55000-0000-4000-8000-000000000001'::uuid, 'a0000000-0000-4000-8000-000000000001'::uuid, '細川 憲佑', 'hosokawa@example.com',    'admin'),
      ('5ea55000-0000-4000-8000-000000000002'::uuid, 'a0000000-0000-4000-8000-000000000002'::uuid, '白髭 崇',   'shirahige@example.com',   'admin'),
      ('5ea55000-0000-4000-8000-000000000003'::uuid, 'a0000000-0000-4000-8000-000000000003'::uuid, '野﨑 匠',   'nozaki@example.com',      'admin'),
      -- 開発側。顧客は持たないが、管理者として全体を見る
      ('5ea55000-0000-4000-8000-000000000004'::uuid, 'a0000000-0000-4000-8000-000000000004'::uuid, '下平 凌生', 'admin@kensetsu-tech.com', 'admin')
    ) as t(staff_id, auth_user_id, name, email, role)
  loop
    -- パスワードは持たせない。入り口は Magic Link だけで、ローカルも同じ経路を通る
    -- （届いたメールは Inbucket http://127.0.0.1:54324 で読む）。
    -- トークン列を NULL のままにしない。GoTrue は Go の string で受けるので、
    -- NULL があるとスキャンに失敗し、ログインが
    -- 「Database error querying schema」で落ちる。
    insert into auth.users (
      instance_id, id, aud, role, email,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change,
      email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token
    ) values (
      v_instance, r.auth_user_id, 'authenticated', 'authenticated', r.email,
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      '', '', '', '', '', '', '', ''
    ) on conflict (id) do nothing;

    -- GoTrue は email プロバイダの identity が無いと、その宛先へリンクを送らない
    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      r.auth_user_id::text, r.auth_user_id,
      jsonb_build_object('sub', r.auth_user_id::text, 'email', r.email, 'email_verified', true),
      'email', now(), now(), now()
    ) on conflict (provider, provider_id) do nothing;

    insert into public.staff (id, auth_user_id, name, email, role)
    values (r.staff_id, r.auth_user_id, r.name, r.email, r.role)
    on conflict (id) do update
      set name = excluded.name,
          role = excluded.role,
          auth_user_id = excluded.auth_user_id;
  end loop;
end
$$;
