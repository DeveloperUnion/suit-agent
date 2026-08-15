-- 会話と、「提案 → 適用」を一度きりにする担保。
--
-- applied_at はこの設計の本体で、「NULL の間は DB のどこにも反映されていない」
-- ことに全部が乗っている。ところが列を守るものがポリシーしか無いと、
-- 適用済みの提案を押し直せるし、カードに出したものと適用ハンドラが読むものを
-- 別にできる。どちらも無音なので、ここで機械的に確かめる。

begin;
create extension if not exists pgtap with schema extensions;

select plan(15);


-- ── 道具 ────────────────────────────────────────────────

create or replace function pg_temp.login_as(p_auth_user_id uuid) returns void
  language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_auth_user_id)::text, true);
end $$;

create or replace function pg_temp.make_staff(
  p_auth_user_id uuid, p_name text, p_email text, p_role text default 'member'
) returns uuid
  language plpgsql as $$
declare v_id uuid;
begin
  insert into public.staff (name, email, role)
  values (p_name, p_email, p_role)
  returning id into v_id;
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (p_auth_user_id, '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', p_email, now(), now());
  return v_id;
end $$;


-- ── 登場人物 ────────────────────────────────────────────

\set admin_uid 'e5111111-1111-4111-8111-111111111111'
\set a_uid     'e5222222-2222-4222-8222-222222222222'
\set b_uid     'e5333333-3333-4333-8333-333333333333'

select pg_temp.make_staff(:'admin_uid', '会話管理者', 'm-admin@example.com', 'admin') as admin_id \gset
select pg_temp.make_staff(:'a_uid',     '会話-A',    'm-a@example.com')               as a_id     \gset
select pg_temp.make_staff(:'b_uid',     '会話-B',    'm-b@example.com')               as b_id     \gset


-- ── 会話は本人だけのもの ────────────────────────────────
--
-- 管理者も覗けない。顧客データは「管理者は閲覧のみ」だが、
-- 会話はスタッフの手元のメモに近いので、閲覧そのものを開けていない。

select pg_temp.login_as(:'a_uid');
insert into public.agent_messages (role, body, action)
values ('assistant', '時枝様のパーソナルにゴルフを足します。',
        '{"kind":"add_fact","labelNames":["ゴルフ"]}'::jsonb);

select is(
  (select staff_id from public.agent_messages where body like '時枝様%'),
  (select :'a_id'::uuid),
  'staff_id は既定値で本人になる（画面から渡さない）'
);

select pg_temp.login_as(:'b_uid');
select is_empty(
  $$ select 1 from public.agent_messages where body like '時枝様%' $$,
  'B から A の会話は存在ごと見えない'
);

select pg_temp.login_as(:'admin_uid');
select is_empty(
  $$ select 1 from public.agent_messages where body like '時枝様%' $$,
  '管理者でも他スタッフの会話は覗けない'
);


-- ── 提案の中身は後から変えられない ──────────────────────
--
-- 「見せた提案」と「適用ハンドラが読む提案」が別になると、
-- 人が承認したものと実際に書かれるものがずれる。承認が演劇になる。

select pg_temp.login_as(:'a_uid');
select throws_ok(
  $$ update public.agent_messages set action = '{"kind":"add_fact","labelNames":["ワイン"]}'::jsonb
      where body like '時枝様%' $$,
  '23001', null,
  '提案（action）の書き換えはトリガーで落ちる'
);

select throws_ok(
  $$ update public.agent_messages set body = '書き換えた' where body like '時枝様%' $$,
  '23001', null,
  '本文の書き換えもトリガーで落ちる'
);


-- ── 適用は一度きり ──────────────────────────────────────

update public.agent_messages set applied_at = '2020-01-01'::timestamptz
 where body like '時枝様%';

select ok(
  (select applied_at from public.agent_messages where body like '時枝様%') > now() - interval '1 minute',
  '適用した日時は DB が決める（画面から渡した値は採らない）'
);

select throws_ok(
  $$ update public.agent_messages set applied_at = now() where body like '時枝様%' $$,
  '23001', null,
  '適用済みの提案をもう一度適用すると落ちる'
);

-- 取り消しも同じ経路では通らない。書き込まれた側（customer_facts の
-- invalidated_at）で無効化する、という一本道に寄せてある。
select throws_ok(
  $$ update public.agent_messages set applied_at = null where body like '時枝様%' $$,
  '23001', null,
  'applied_at を NULL に戻すこともできない'
);


-- ── 却下も一度きり ──────────────────────────────────────
--
-- 決定が 2 つ（適用・却下）になったので、**どちらか一方が済んでいたら
-- もう一方も受け付けない**。「適用したあとで却下」は意味を持たない。

insert into public.agent_messages (role, body, action)
values ('assistant', '柏木様の注意事項に足す提案です。',
        '{"kind":"add_ng_note","body":"光沢は苦手"}'::jsonb);

update public.agent_messages set rejected_at = '2020-01-01'::timestamptz
 where body like '柏木様%';

select ok(
  (select rejected_at from public.agent_messages where body like '柏木様%') > now() - interval '1 minute',
  '却下した日時も DB が決める（画面から渡した値は採らない）'
);

select throws_ok(
  $$ update public.agent_messages set rejected_at = now() where body like '柏木様%' $$,
  '23001', null,
  '却下済みの提案をもう一度却下すると落ちる'
);

select throws_ok(
  $$ update public.agent_messages set applied_at = now() where body like '柏木様%' $$,
  '23001', null,
  '却下したあとで適用はできない'
);


-- ── 適用していないのに「適用した内容」だけ残らない ──────

insert into public.agent_messages (role, body, action)
values ('assistant', '三雲様のパーソナルに足す提案です。',
        '{"kind":"add_fact","labelNames":["サウナ"]}'::jsonb);

select throws_ok(
  $$ update public.agent_messages set applied_action = '{"kind":"add_fact"}'::jsonb
      where body like '三雲様%' $$,
  '23001', null,
  '適用していない提案に applied_action は入れられない'
);


-- ── 「誰の話だったか」も後から変えられない ──────────────
--
-- subject_customer_id は**次のターンの宛先**になる。ここが動くと、
-- 過去の発言の相手が変わるだけでなく、これから出す提案の宛先も一緒に動く。
-- 提案の中身と同じ強さで固定しておく。

insert into public.customers (name, name_kana) values ('主語 太郎', 'しゅご たろう')
returning id as subject_id \gset

insert into public.agent_messages (role, body, subject_customer_id)
values ('assistant', '主語様のカルテを読みました。', :'subject_id'::uuid);

select is(
  (select subject_customer_id from public.agent_messages where body like '主語様%'),
  (select :'subject_id'::uuid),
  '提案が無いターンにも「誰の話だったか」は残る（カルテを読んだだけでも足跡になる）'
);

select throws_ok(
  $$ update public.agent_messages set subject_customer_id = null where body like '主語様%' $$,
  '23001', null,
  '「誰の話だったか」の書き換えはトリガーで落ちる'
);


-- ── 会話は捨てられる ────────────────────────────────────
--
-- 追記のみを守るのは「提案の中身」であって、会話そのものではない。
-- 消しゴムボタン（clearAgentMessages）は今までどおり効く。

delete from public.agent_messages where body like '時枝様%';
select is_empty(
  $$ select 1 from public.agent_messages where body like '時枝様%' $$,
  '適用済みの会話も消せる（消しゴムは効いたまま）'
);


select * from finish();
rollback;
