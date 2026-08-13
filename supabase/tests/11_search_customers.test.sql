-- エージェントが顧客を引く 3 本の口。
--
-- ここで守るのは**網羅性**。「ゴルフが趣味の方は 12 名です」と言い切れることが
-- この検索の存在理由で、top-k で 5 名だけ返すと落ちた 7 名は誰にも見えない。
-- 現れ方は「ゴルフ好きなのに案内が来なかった人が 7 名いる」で、誰も気づけない。
--
-- だから「上限が無いこと」を、上限より多い件数を作って確かめる。

begin;
create extension if not exists pgtap with schema extensions;

select plan(13);


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
  insert into public.staff (name, email, role)
  values (p_name, p_email, p_role)
  returning id into v_id;
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (p_auth_user_id, '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', p_email, now(), now());
  return v_id;
end $$;


-- ── 登場人物 ────────────────────────────────────────────

\set admin_uid 'e6111111-1111-4111-8111-111111111111'
\set a_uid     'e6222222-2222-4222-8222-222222222222'
\set b_uid     'e6333333-3333-4333-8333-333333333333'

select pg_temp.make_staff(:'admin_uid', '検索管理者', 's-admin@example.com', 'admin') as admin_id \gset
select pg_temp.make_staff(:'a_uid',     '検索-A',    's-a@example.com')               as a_id     \gset
select pg_temp.make_staff(:'b_uid',     '検索-B',    's-b@example.com')               as b_id     \gset

-- 語は dev-seed に無いものを使う。テストは seed が流れた後の DB で走る。
select pg_temp.as_postgres();
insert into public.fact_labels (id, name, category_key, created_by_staff_id)
values ('e6aaaaaa-1111-4111-8111-111111111111', 'ボルダリング', 'hobby', :'a_id');
insert into public.fact_aliases (alias, label_id)
values (app.normalize_ja('クライミング'), 'e6aaaaaa-1111-4111-8111-111111111111');

-- A の担当を 7 名。**上限を付けていたら必ず露見する数**にしておく
-- （よくある既定の 5 を超える）。
insert into public.customers (id, name, name_kana, staff_id)
select ('e6c00000-0000-4000-8000-00000000000' || i)::uuid,
       '登攀 ' || i, 'トハン ' || i, :'a_id'
  from generate_series(1, 7) i;

insert into public.customer_facts (customer_id, label_id, body, source, created_by_staff_id)
select ('e6c00000-0000-4000-8000-00000000000' || i)::uuid,
       'e6aaaaaa-1111-4111-8111-111111111111', 'ボルダリング', 'manual', :'a_id'
  from generate_series(1, 7) i;

-- B の担当にも同じ語の人を 1 名。境界を越えたら数に出る。
insert into public.customers (id, name, name_kana, staff_id)
values ('e6c00000-0000-4000-8000-000000000099', '他担当 太郎', 'タタントウ タロウ', :'b_id');
insert into public.customer_facts (customer_id, label_id, body, source, created_by_staff_id)
values ('e6c00000-0000-4000-8000-000000000099',
        'e6aaaaaa-1111-4111-8111-111111111111', 'ボルダリング', 'manual', :'b_id');


-- ── 確定検索は全件返す ──────────────────────────────────

select pg_temp.login_as(:'a_uid');

select is(
  (app.search_customers(array['ボルダリング'])->>'exactCount')::int,
  7,
  '確定検索は上限を付けずに全件返す（5 で切っていれば 5 になる）'
);

select is(
  jsonb_array_length(app.search_customers(array['ボルダリング'])->'exact'),
  7,
  '一覧の長さも件数と一致する（数だけ合って中身が欠ける、が起きない）'
);


-- ── 境界 ────────────────────────────────────────────────

select isnt(
  (app.search_customers(array['ボルダリング'])->'exact')::text,
  null,
  '結果は返る'
);
select is(
  (select count(*) from jsonb_array_elements(app.search_customers(array['ボルダリング'])->'exact') e
    where e->>'name' = '他担当 太郎'),
  0::bigint,
  '他スタッフの顧客は混ざらない'
);

-- 管理者は全顧客を「閲覧」できるが、それをそのまま検索範囲にしてはいけない。
-- 画面（listCustomers）は常にスタッフで絞るので、絞らないと
-- 「AI は 8 名と言うのに一覧には 7 名しかいない」になる。
select pg_temp.login_as(:'admin_uid');
select is(
  (app.search_customers(array['ボルダリング'])->>'exactCount')::int,
  0,
  '管理者の既定は自分の担当（RLS の上限をそのまま検索範囲にしない）'
);
select is(
  (app.search_customers(array['ボルダリング'], null, null, :'a_id')->>'exactCount')::int,
  7,
  '管理者がスタッフを切り替えると、そのスタッフの顧客が出る（画面と一致する）'
);


-- ── ラベルの無い走り書きも拾う ──────────────────────────
--
-- 「メモに書くほうが速い」ので情報はそちらへ逃げる。入力側で止められない以上、
-- 検索側で拾う。ここが落ちると「ゴルフ好きなのに案内が来なかった人」が生まれる。

select pg_temp.login_as(:'a_uid');
insert into public.customers (id, name, name_kana, staff_id)
values ('e6c00000-0000-4000-8000-000000000010', '走書 一郎', 'ハシリガキ イチロウ', :'a_id');
insert into public.customer_facts (customer_id, body, source, created_by_staff_id)
values ('e6c00000-0000-4000-8000-000000000010', '週末はボルダリングに通っているらしい', 'manual', :'a_id');

select is(
  (app.search_customers(array['ボルダリング'])->>'exactCount')::int,
  8,
  'ラベルの無い走り書き（本文一致）も確定検索で拾う'
);


-- ── 別名 ────────────────────────────────────────────────

select is(
  (app.search_customers(array['クライミング'])->>'exactCount')::int,
  7,
  '別名（fact_aliases）でも同じ顧客が引ける'
);


-- ── 無効化した事実は出ない ──────────────────────────────

update public.customer_facts set invalidated_at = now()
 where customer_id = 'e6c00000-0000-4000-8000-000000000001';

select is(
  (app.search_customers(array['ボルダリング'])->>'exactCount')::int,
  7,
  '無効化した事実は検索に出ない（8 → 7）'
);


-- ── 1 顧客が 2 事実持っていても 1 名 ────────────────────
--
-- count(*) と count(distinct customer_id) の取り違えは例外を出さない。
-- 「ボルダリングの方は 12 名です」が実は 9 名、という形で無音に間違う。

insert into public.customer_facts (customer_id, body, source, created_by_staff_id)
values ('e6c00000-0000-4000-8000-000000000002', 'ボルダリングのジムを変えたそう', 'manual', :'a_id');

select is(
  (app.search_customers(array['ボルダリング'])->>'exactCount')::int,
  7,
  '同じ顧客が 2 つ該当しても 1 名として数える'
);


-- ── 意味検索も担当の境界を越えない ──────────────────────
--
-- 索引を張らないのは、まさにこれを「先に絞ってから距離を計算する」形で
-- 構造的に守るため。HNSW を張ると走査が先・RLS が後になり、他人の顧客が
-- 枠を食い潰して自分の顧客が黙って落ちる。

select pg_temp.as_postgres();
insert into public.search_chunks (fact_id, customer_id, content, embedding, embedding_model, embedded_at)
select f.id, f.customer_id, f.body,
       ('[' || array_to_string(array(select case when i = 1 then 1.0 else 0.0 end
                                       from generate_series(1, 1536) i), ',') || ']')::extensions.halfvec,
       'test-model', now()
  from public.customer_facts f
 where f.customer_id in ('e6c00000-0000-4000-8000-000000000003',   -- A の担当
                         'e6c00000-0000-4000-8000-000000000099');  -- B の担当

select pg_temp.login_as(:'a_uid');

select is(
  (select count(*)::int
     from jsonb_array_elements(
            app.search_customers('{}', null,
              '[' || array_to_string(array(select case when i = 1 then 1.0 else 0.0 end
                                             from generate_series(1, 1536) i), ',') || ']')->'similar') s
    where s->>'name' = '他担当 太郎'),
  0,
  '意味検索にも他スタッフの顧客は出ない'
);

-- 「近い人はいません」と「まだ埋め込みが入っていません」を混ぜない。
select is(
  (app.search_customers('{}', null, null)->>'similarAvailable')::boolean,
  false,
  'ベクトルを渡さなければ similarAvailable は false（似た人がいない、とは言わない）'
);


-- ── 名寄せは担当の境界を越えない ────────────────────────

select is(
  jsonb_array_length(app.find_customers_by_name('他担当')),
  0,
  '名寄せから他スタッフの顧客は出ない（会話から他人の顧客を触らせない）'
);


select * from finish();
rollback;
