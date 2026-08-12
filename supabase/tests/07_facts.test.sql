-- パーソナルの権限マトリクスと、追記のみの担保。
--
-- 確かめたいのは 3 つ。
--   1. 顧客と同じ境界が効くこと（管理者は読めるが書けない）
--   2. ラベルは全員が足せるが、分類を直せるのは管理者だけという非対称
--   3. **追記のみが構造で守られていること** — UPDATE ポリシーは行を選べても
--      列を選べないので、body の書き換えはトリガーでしか止まらない。
--      ここが破れると過去の事実が無音で消える
--
-- search_chunks は「アプリからは 1 行も書けない」ことだけを確かめる。
-- 検索そのもの（app.search_customers）は次の migration。

begin;
create extension if not exists pgtap with schema extensions;

select plan(23);


-- ── 道具 ────────────────────────────────────────────────

create or replace function pg_temp.login_as(p_auth_user_id uuid) returns void
  language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_auth_user_id)::text, true);
end $$;

create or replace function pg_temp.as_postgres() returns void
  language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);
end $$;

create or replace function pg_temp.make_staff(
  p_auth_user_id uuid, p_name text, p_email text, p_role text default 'member'
) returns uuid
  language plpgsql as $$
declare v_id uuid;
begin
  -- staff が先。auth.users のトリガーが staff を見るので、逆順だと弾かれる。
  -- auth_user_id は AFTER トリガーが埋める（本番と同じ経路を通す）。
  insert into public.staff (name, email, role)
  values (p_name, p_email, p_role)
  returning id into v_id;
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (p_auth_user_id, '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', p_email, now(), now());
  return v_id;
end $$;


-- ── 登場人物 ────────────────────────────────────────────

\set admin_uid 'd1111111-1111-4111-8111-111111111111'
\set a_uid     'd2222222-2222-4222-8222-222222222222'
\set b_uid     'd3333333-3333-4333-8333-333333333333'

\set cust_a 'ca111111-1111-4111-8111-111111111111'
\set cust_b 'cb222222-2222-4222-8222-222222222222'

select pg_temp.make_staff(:'admin_uid', 'ファクト管理者', 'f-admin@example.com', 'admin') as admin_id \gset
select pg_temp.make_staff(:'a_uid',     'ファクトA',      'f-a@example.com')              as a_id     \gset
select pg_temp.make_staff(:'b_uid',     'ファクトB',      'f-b@example.com')              as b_id     \gset

insert into public.customers (id, name, name_kana, staff_id)
values (:'cust_a', '時枝 正', 'トキエダ タダシ', :'a_id'),
       (:'cust_b', '国枝 誠', 'クニエダ マコト', :'b_id');


-- ── 埋め込みの次元 ──────────────────────────────────────
--
-- lib/ai/models.ts の EMBEDDING_DIMENSIONS と揃っていること。
-- ずれると挿入時に落ちるので無音ではないが、気づくのが本番の初回投入になる。

select is(
  (select format_type(a.atttypid, a.atttypmod)
     from pg_attribute a
    where a.attrelid = 'public.search_chunks'::regclass
      and a.attname = 'embedding'),
  'vector(1536)',
  'search_chunks.embedding は vector(1536)（HNSW の上限 2000 に収まる次元）'
);


-- ── ラベル ──────────────────────────────────────────────

select pg_temp.login_as(:'a_uid');

-- 語は dev-seed に無いものを使う。テストは seed が流れた後の DB で走るので、
-- 実データにある語を選ぶと「重複で落ちる」ほうが先に起きる。
select lives_ok(
  $$ insert into public.fact_labels (name, category_key) values ('パラグライダー', 'hobby') $$,
  '一般スタッフでも新しいラベルを足せる'
);

-- UI とエージェントで別の正規化をすると「画面には出るのに AI が見つけられない」。
-- 一意なのは normalized のほうなので、表記ゆれは同じ語に寄る。
select throws_ok(
  $$ insert into public.fact_labels (name, category_key) values ('ぱらぐらいだー', 'hobby') $$,
  '23505', null,
  '「ぱらぐらいだー」は「パラグライダー」と同じキーに寄って重複で落ちる'
);

-- 1 行直すと全顧客の見え方が変わるので、分類の変更は店舗共通ルール扱い。
update public.fact_labels set category_key = 'work' where name = 'パラグライダー';
select pg_temp.as_postgres();
select is(
  (select category_key from public.fact_labels where name = 'パラグライダー'),
  'hobby',
  '一般スタッフはラベルの分類を直せない（0 行になる）'
);

select pg_temp.login_as(:'admin_uid');
update public.fact_labels set category_key = 'work' where name = 'パラグライダー';
select pg_temp.as_postgres();
select is(
  (select category_key from public.fact_labels where name = 'パラグライダー'),
  'work',
  '管理者はラベルの分類を直せる（全顧客へ一斉反映される）'
);

update public.fact_labels set category_key = 'hobby' where name = 'パラグライダー';
select id as para_id from public.fact_labels where name = 'パラグライダー' \gset


-- ── 事実の権限マトリクス ────────────────────────────────

select pg_temp.login_as(:'a_uid');

select lives_ok(
  format(
    $$ insert into public.customer_facts (customer_id, label_id, body, source)
       values (%L, %L, '打ちっぱなしによく行くらしい', 'agent') $$,
    :'cust_a', :'para_id'
  ),
  'A は自分の担当の顧客に事実を足せる'
);

select throws_ok(
  format(
    $$ insert into public.customer_facts (customer_id, label_id, body, source)
       values (%L, %L, '越境して書いた', 'manual') $$,
    :'cust_b', :'para_id'
  ),
  '42501', null,
  'A は他スタッフの顧客に事実を足せない'
);

select pg_temp.login_as(:'b_uid');
select is_empty(
  format($$ select 1 from public.customer_facts where customer_id = %L $$, :'cust_a'),
  'B から A の顧客のパーソナルは存在ごと見えない'
);

-- 管理者は読めるが書けない。FOR ALL で書くと崩れる非対称。
select pg_temp.login_as(:'admin_uid');
select isnt_empty(
  format($$ select 1 from public.customer_facts where customer_id = %L $$, :'cust_a'),
  '管理者は他スタッフの顧客のパーソナルを読める'
);
select throws_ok(
  format(
    $$ insert into public.customer_facts (customer_id, label_id, body, source)
       values (%L, %L, '管理者が書いた', 'manual') $$,
    :'cust_a', :'para_id'
  ),
  '42501', null,
  '管理者でも他スタッフの顧客に事実を足せない（閲覧のみ）'
);


-- ── 追記のみ ────────────────────────────────────────────

select pg_temp.login_as(:'a_uid');

-- 止めるのは同じ原文の二重登録だけ。ラベル単位では止めない
-- （「ゴルフ好きらしい」と「月2でラウンドしてる」は別の事実）。
select throws_ok(
  format(
    $$ insert into public.customer_facts (customer_id, label_id, body, source)
       values (%L, %L, '打ちっぱなしによく行くらしい', 'manual') $$,
    :'cust_a', :'para_id'
  ),
  '23505', null,
  '同じ顧客・同じラベル・同じ原文の二重登録は落ちる'
);

select lives_ok(
  format(
    $$ insert into public.customer_facts (customer_id, label_id, body, source)
       values (%L, %L, '月2でラウンドしているらしい', 'agent') $$,
    :'cust_a', :'para_id'
  ),
  '同じラベルでも原文が違えば別の事実として足せる'
);

-- UPDATE ポリシーは列を選べない。ここが破れると過去の事実が無音で消える。
select throws_ok(
  format(
    $$ update public.customer_facts set body = '書き換えた'
        where customer_id = %L and body = '打ちっぱなしによく行くらしい' $$,
    :'cust_a'
  ),
  '23001', null,
  '原文の書き換えはトリガーで落ちる（訂正は無効化して新しい行を足す）'
);

update public.customer_facts set invalidated_at = now()
 where customer_id = :'cust_a' and body = '打ちっぱなしによく行くらしい';

select is(
  (select invalidated_by_staff_id from public.customer_facts
    where customer_id = :'cust_a' and body = '打ちっぱなしによく行くらしい'),
  :'a_id'::uuid,
  '無効化は通り、操作者はトリガーが本人で埋める'
);

-- 重複防止は有効な行だけを見ているので、消した後なら同じ内容を入れ直せる。
select lives_ok(
  format(
    $$ insert into public.customer_facts (customer_id, label_id, body, source)
       values (%L, %L, '打ちっぱなしによく行くらしい', 'manual') $$,
    :'cust_a', :'para_id'
  ),
  '無効化したあとなら同じ内容を入れ直せる'
);

select throws_ok(
  format($$ delete from public.customer_facts where customer_id = %L $$, :'cust_a'),
  '42501', null,
  '事実は誰にも物理削除できない'
);


-- ── ラベルの無い記録 ────────────────────────────────────
--
-- メモと事実はラベルの有無しか違わない。分けて持つとスタッフに
-- 「これはどっちの箱か」を毎回選ばせることになり、速いほうへ情報が逃げる。

select count(*) as labels_before from public.fact_labels \gset

select lives_ok(
  format(
    $$ insert into public.customer_facts (customer_id, label_id, body, source)
       values (%L, null, 'ご子息の成人式スーツの相談を受けている', 'manual') $$,
    :'cust_a'
  ),
  'ラベルの無い走り書きを足せる'
);

-- 既定の unique 索引は NULL 同士を別物と見なすので、これを止めるには
-- nulls not distinct が要る。無いと走り書きだけ二重送信が素通りする。
select throws_ok(
  format(
    $$ insert into public.customer_facts (customer_id, label_id, body, source)
       values (%L, null, 'ご子息の成人式スーツの相談を受けている', 'manual') $$,
    :'cust_a'
  ),
  '23505', null,
  'ラベルが無くても同一本文の二重登録は落ちる（nulls not distinct）'
);

-- 走り書きは fact_labels に 1 語も足さない。
-- 「メモを facts に流すと一覧がノイズで埋まる」が起きないのはこの性質による。
-- 件数そのものは dev-seed 次第なので、増えていないことだけを見る。
select is(
  (select count(*) from public.fact_labels),
  :'labels_before'::bigint,
  '走り書きを足しても語彙は増えない'
);


-- ── 別名 ────────────────────────────────────────────────
--
-- 通常の記録経路では生まれない（人が「これも同じ意味だ」と気づいたときだけ）。

select pg_temp.login_as(:'a_uid');
select throws_ok(
  format($$ insert into public.fact_aliases (alias, label_id) values ('うちっぱなし', %L) $$, :'para_id'),
  '42501', null,
  '一般スタッフは別名を足せない'
);

select pg_temp.login_as(:'admin_uid');
select lives_ok(
  format($$ insert into public.fact_aliases (alias, label_id) values ('ウチッパナシ', %L) $$, :'para_id'),
  '管理者は別名を足せる'
);


-- ── search_chunks ───────────────────────────────────────

select pg_temp.as_postgres();

insert into public.customer_facts (id, customer_id, label_id, body, source, created_by_staff_id)
values ('f0000000-0000-4000-8000-000000000001', :'cust_b', :'para_id',
        'コースは月1らしい', 'manual', :'b_id');

insert into public.search_chunks (fact_id, customer_id, content)
select f.id, f.customer_id, 'ゴルフ / ' || f.body
  from public.customer_facts f
 where f.customer_id in (:'cust_a', :'cust_b');

-- 埋め込みを書けるのは worker_role だけ。アプリには権限ごと与えていない。
select pg_temp.login_as(:'a_uid');
select throws_ok(
  format(
    $$ insert into public.search_chunks (fact_id, customer_id, content)
       values ('f0000000-0000-4000-8000-000000000002', %L, 'でっちあげ') $$,
    :'cust_a'
  ),
  '42501', null,
  'アプリからは search_chunks に書けない（権限ごと剥がしてある）'
);

-- バックフィルは全スタッフ分を横断する。service_role を使わずにこれを成立させる
-- ためのロールなので、越境できることそのものを確かめる。
-- worker_role には extensions スキーマの USAGE が無い（pgtap の is() を呼べない）。
-- 数えるところだけをこのロールで走らせ、判定は戻ってから行う。
select pg_temp.as_postgres();
set local role worker_role;
select count(distinct customer_id) as worker_pending
  from public.search_chunks
 where embedding is null and customer_id in (:'cust_a', :'cust_b') \gset
reset role;

select is(
  :'worker_pending'::bigint,
  2::bigint,
  'worker_role は担当をまたいで未処理のチャンクを拾える'
);


select * from finish();
rollback;
