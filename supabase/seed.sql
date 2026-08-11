-- ローカル開発用のシード。
--
-- `supabase db reset` でのみ流れる（本番の `supabase db push` では流れない）。
-- マスタ（item_types / measurement_fields / adjustment_masters）は Phase 1 で
-- lib/constants/*.ts から生成してここに足す。冪等に書くこと — migration に
-- insert を書くと項目を 1 つ直すたびに新しい migration が要る。
--
-- 本番の 1 人目だけは別立てになる。管理者がいないと管理者を作れないため、
-- SQL Editor から手で 1 行入れて、そこから招待画面で増やす。
--   insert into public.staff (name, email, role) values ('…', '…', 'admin');
--   -- そのあと画面から招待 → auth.admin.inviteUserByEmail() が auth_user_id を埋める

-- ── スタッフ ────────────────────────────────────────────
--
-- 現状の 3 人は全員が管理者（全顧客を閲覧できるが、編集は自分の担当のみ）。
-- 一般スタッフ約 7 名は運用開始時に招待画面から追加する。

do $$
declare
  v_instance uuid := '00000000-0000-0000-0000-000000000000';
  v_password text := extensions.crypt('password', extensions.gen_salt('bf'));
  r record;
begin
  for r in
    -- staff.id と auth_user_id は別物。dev-seed.sql が customers.staff_id に
    -- 入れるのは前者なので、両方をここで固定して 1 箇所で決める。
    select * from (values
      ('5ea55000-0000-4000-8000-000000000001'::uuid, 'a0000000-0000-4000-8000-000000000001'::uuid, '細川 憲佑', 'hosokawa@example.com', 'admin'),
      ('5ea55000-0000-4000-8000-000000000002'::uuid, 'a0000000-0000-4000-8000-000000000002'::uuid, '白髭 崇',   'shirahige@example.com', 'admin'),
      ('5ea55000-0000-4000-8000-000000000003'::uuid, 'a0000000-0000-4000-8000-000000000003'::uuid, '野﨑 匠',   'nozaki@example.com',    'admin')
    ) as t(staff_id, auth_user_id, name, email, role)
  loop
    -- ローカルでは email + password でそのままログインできるようにしておく。
    -- 本番は Magic Link（招待メール）なので、この経路は開発中しか使わない。
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    ) values (
      v_instance, r.auth_user_id, 'authenticated', 'authenticated', r.email, v_password,
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
    ) on conflict (id) do nothing;

    -- GoTrue はこの行が無いとパスワードログインを受け付けない
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
