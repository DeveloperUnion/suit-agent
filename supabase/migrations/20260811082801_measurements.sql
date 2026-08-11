-- Phase 1: 採寸
--
-- 要件定義書は jsonb を推しているが採らない。
--
-- 描画だけなら jsonb で足りるし、「行をまたぐ問いが書きにくい」も決定打では
-- ない（どのみちビューに閉じ込めるので、書きにくさはビューを書く 1 回に閉じる）。
-- 決定打は型と制約のほう。jsonb だと actual に文字列が入っても通り、存在しない
-- キーは静かに NULL を返す。OCR が誤読した「股下 175」を止める場所が DB に
-- 無くなる。
--
-- 5ef0d88 で OCR が採寸の主動線になり、手入力は取り込み画面の中のリンクへ
-- 退けられた。人の目を通る経路が細くなった分、ここが最後の境界になる。
--
-- なお OCR 側にも既に 1 枚防御がある（route.ts の FIELD_KEYS enum）。
-- ただしあれはキー名のフラットな集合なので「pants に bust」を弾けない。
-- こちらは (item_type_id, key) の複合 FK なので、そこまで止まる。

-- ── マスタ ──────────────────────────────────────────────
--
-- 正は lib/constants/*.ts。ここはミラー。
-- 「紙の帳票と製造側の都合で決まっており店舗が変えるものではない」＝
-- デプロイ成果物であって設定ではない、という型定義の判断に従う。
--
-- DB 側にも実体が要る理由は 3 つ:
--   (a) measurement_values.field_key の FK 検証
--   (b) ビューのラベル
--   (c) エージェントが「ウエスト」→ pants.waist を引くための語彙列挙
--
-- 中身は supabase/masters.sql（生成物）が入れる。行を直接ここに書かない —
-- 項目を 1 つ直すたびに新しい migration が要ることになるため。

create table public.item_types (
  id text primary key,
  name text not null,
  sheet_label text not null,          -- 採寸票上の英字表記（JACKET / PANTS / VEST）
  body_part text not null check (body_part in ('upper', 'lower')),
  requires_measurement boolean not null default true,
  display_order int not null
);

-- key はグローバルに一意ではない。bust は jacket / vest / shirt に、
-- waist は pants / shirt に、shoulder_width は jacket / shirt にある。
-- 主キーを key 単独にすると、別アイテムの同名項目が潰し合う。
create table public.measurement_fields (
  item_type_id text not null references public.item_types (id),
  key   text not null,
  label text not null,                -- 総丈 / バスト / EF(半胸) など、紙の表記そのまま
  unit  text not null default 'cm',
  body_part text not null check (body_part in ('upper', 'lower')),
  has_actual   boolean not null default true,    -- 実寸欄を出すか
  has_finished boolean not null default true,    -- 上がり寸欄を出すか
  display_order int not null,
  primary key (item_type_id, key)
);

comment on table public.measurement_fields is
  '採寸項目。silhouettePoint はミラーしない（純粋な UI データ）。主キーが (item_type_id, key) の複合なのは、bust などが複数アイテムに存在するため。';

-- 紙の右列「補正内容」に印刷されている番号付きリスト
create table public.adjustment_masters (
  code int primary key,
  name text not null,
  strength text check (strength in ('弱', '強')),
  default_value numeric(4, 1) not null,
  body_part text not null check (body_part in ('upper', 'lower'))
);

comment on table public.adjustment_masters is
  '補正コード。個数制約（上半身5個・下半身3個）は DB で強制しない — 紙の実物に6個書いてあったら OCR の取り込みが弾かれるため。アプリ層の警告に留める。';

-- マスタは読むだけ。書き込みはデプロイ手順（masters.sql）が postgres で行う。
do $$
declare t text;
begin
  foreach t in array array['item_types', 'measurement_fields', 'adjustment_masters'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)',
                   t || '_select', t);
    -- Supabase は public の全テーブルに ALL を既定で与えるので、書き込みは
    -- 明示的に剥がす。ポリシーを書かないだけだと「許可されているが RLS で
    -- 弾かれる」状態になり、意図が権限として読み取れない。
    execute format('revoke insert, update, delete on public.%I from authenticated, anon', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end
$$;

-- orders 側の FK はマスタができてから張る
alter table public.order_items
  add constraint order_items_item_type_id_fkey
  foreign key (item_type_id) references public.item_types (id);


-- ── 採寸票 ──────────────────────────────────────────────

create table public.measurement_sheets (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  -- 採寸だけ先行するケースがあるため任意
  order_id uuid references public.orders (id) on delete set null,
  measured_at date not null,

  -- 「誰が測ったか」の記録。RLS の判定には使わない（customers.staff_id が境界）
  recorded_by_staff_id uuid not null references public.staff (id),
  input_method text not null default 'ocr' check (input_method in ('tablet', 'pc', 'ocr')),

  -- アイテム非依存なので section に入らないが、「時枝さん3kg痩せたって」は
  -- エージェントが最初に言われること。要件定義書の BODY_MEASUREMENT（別表）は
  -- 作らない — 胸囲・ウエストは measurement_values.actual に既にあり、
  -- 別表にすると同じ数字が 2 箇所に入ってどちらが正か分からなくなる。
  height_cm numeric(4, 1) check (height_cm between 50 and 250),
  weight_kg numeric(4, 1) check (weight_kg between 20 and 300),

  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index measurement_sheets_customer_idx
  on public.measurement_sheets (customer_id, measured_at desc);

create trigger measurement_sheets_touch_updated_at
  before update on public.measurement_sheets
  for each row execute function app.touch_updated_at();


-- 1 枚の票の中の、アイテムごとの区画。
-- シルエット記号（NB / AG / DA）と C#（型番）は区画の属性で、項目ではない。
create table public.measurement_sections (
  sheet_id uuid not null references public.measurement_sheets (id) on delete cascade,
  item_type_id text not null references public.item_types (id),
  silhouette   text,
  color_number text,
  primary key (sheet_id, item_type_id)
);


-- 実寸と上がり寸は同一行の 2 列。
-- 型定義の「その変換こそが職人の判断そのもの」の通り、ペアで 1 つの意味を持つ。
create table public.measurement_values (
  sheet_id uuid not null,
  item_type_id text not null,
  field_key text not null,

  -- 桁違いの誤読（1750、0.5、負値）だけを止める。
  -- 「股下 175」のような “ありえるが間違っている” 値はここでは止まらない
  -- ことに注意 — それを止めるのは OCR の confidence と確認画面の役目。
  -- 項目ごとの現実的な範囲（股下なら 60〜100 など）を measurement_fields に
  -- 持たせれば止められるが、その数値は店舗に確認しないと決められない。
  actual   numeric(5, 1) check (actual   between 1 and 250),
  finished numeric(5, 1) check (finished between 1 and 250),

  primary key (sheet_id, item_type_id, field_key),
  foreign key (sheet_id, item_type_id)
    references public.measurement_sections (sheet_id, item_type_id) on delete cascade,
  -- ★ 存在しない項目名を制約違反で弾く。jsonb だと静かに NULL が返る
  foreign key (item_type_id, field_key)
    references public.measurement_fields (item_type_id, key)
);

comment on table public.measurement_values is
  '採寸値。field_key の複合 FK が AI と OCR の幻覚を弾く。実寸/上がり寸は同一行の2列。';


create table public.measurement_adjustments (
  sheet_id uuid not null references public.measurement_sheets (id) on delete cascade,
  code int not null references public.adjustment_masters (code),
  value numeric(4, 1) not null,
  primary key (sheet_id, code)
);


-- ── RLS ─────────────────────────────────────────────────
--
-- 票は customers 経由、その下は票経由で境界を継ぐ。
-- どの層にも staff_id を非正規化しない。

alter table public.measurement_sheets enable row level security;
alter table public.measurement_sheets force row level security;

create policy measurement_sheets_select on public.measurement_sheets
  for select to authenticated using (app.can_read_customer(customer_id));
create policy measurement_sheets_insert on public.measurement_sheets
  for insert to authenticated with check (app.can_write_customer(customer_id));
create policy measurement_sheets_update on public.measurement_sheets
  for update to authenticated
  using (app.can_write_customer(customer_id))
  with check (app.can_write_customer(customer_id));
-- 票の物理削除は許さない。注文の根拠が消えるため。
revoke delete on public.measurement_sheets from authenticated, anon;
grant select, insert, update on public.measurement_sheets to authenticated;

-- 子 3 表は同じ形になるので生成する。書き分けると 1 つだけ USING を
-- 書き忘れる、という事故が起きやすい。
do $$
declare t text;
begin
  foreach t in array array['measurement_sections', 'measurement_values', 'measurement_adjustments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    execute format($f$
      create policy %I on public.%I for select to authenticated
        using (exists (select 1 from public.measurement_sheets s
                        where s.id = sheet_id and app.can_read_customer(s.customer_id)))
    $f$, t || '_select', t);

    execute format($f$
      create policy %I on public.%I for insert to authenticated
        with check (exists (select 1 from public.measurement_sheets s
                             where s.id = sheet_id and app.can_write_customer(s.customer_id)))
    $f$, t || '_insert', t);

    execute format($f$
      create policy %I on public.%I for update to authenticated
        using (exists (select 1 from public.measurement_sheets s
                        where s.id = sheet_id and app.can_write_customer(s.customer_id)))
        with check (exists (select 1 from public.measurement_sheets s
                             where s.id = sheet_id and app.can_write_customer(s.customer_id)))
    $f$, t || '_update', t);

    -- 採り直しで区画ごと入れ替えるため、この層は消せてよい
    execute format($f$
      create policy %I on public.%I for delete to authenticated
        using (exists (select 1 from public.measurement_sheets s
                        where s.id = sheet_id and app.can_write_customer(s.customer_id)))
    $f$, t || '_delete', t);

    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end
$$;
