-- Phase 3: 着装写真
--
-- **これは「画像を一切保存しない」という当初の決定の反転にあたる。**
-- 元の判断（config.toml の [storage] を無効にし、名刺画像も着装写真も持たない）は
-- 「削除請求への対応を DB だけで完結させ、保持する個人情報を減らす」ためだった。
--
-- 反転する理由と、それでも前提を壊さないための条件:
--   * 仕立てた服の写真は接客そのものの資産で、紙のカルテには最初から貼ってあった。
--     アプリにだけ無いので、結局スタッフの個人端末に溜まっている（いちばん悪い状態）。
--   * 代わりに削除の側を 2 段にする。public.delete_customer() が DB を消し、
--     その手前でクライアントが Storage の {customerId}/ を消す
--     （lib/data/customers.ts の deleteCustomer）。SQL からは Storage に手が届かない
--     ので、この順序だけが「写真だけ孤児になる」を防ぐ。
--
-- 名刺画像は引き続き保存しない。読み取ったら捨てる（app/api/extract/business-card）。

-- ── バケット ────────────────────────────────────────────
--
-- 非公開。公開バケットにすると URL を知っている全員に顧客の写真が出る。
-- 読み出しは常に署名 URL（lib/data/order-photos.ts）。
--
-- config.toml のバケット定義はローカルの supabase start にしか効かないので、
-- 本番にも同じものが要る以上、ここで作る。

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'order-photos',
  'order-photos',
  false,
  20971520,   -- 20MB。クライアントは長辺 1600px / JPEG 0.8 に縮小してから上げる
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;


-- ── パス規約 ────────────────────────────────────────────
--
-- {customerId}/{orderId}/{uuid}.jpg
--
-- 先頭を顧客 id にするのは 2 つの理由から:
--   (a) storage.objects のポリシーが 1 セグメント目だけ見れば判定できる
--   (b) 顧客を消すときにプレフィックス 1 本で消せる
--
-- パスは人が作るものではないが、ポリシーの中で無条件に uuid へキャストすると
-- 異物 1 件で全員の読み出しが落ちる。キャストはここに閉じ、uuid でなければ
-- NULL を返す（can_read_customer(NULL) は false になるので安全側に倒れる）。

create or replace function app.customer_id_from_object_name(p_name text) returns uuid
  language sql
  immutable
  set search_path = ''
as $$
  select case
    when (storage.foldername(p_name))[1] ~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(p_name))[1])::uuid
  end
$$;

comment on function app.customer_id_from_object_name(text) is
  'order-photos のパス先頭から顧客 id を取り出す。uuid でなければ NULL（＝誰にも見えない）。';


-- ── storage.objects のポリシー ──────────────────────────
--
-- 他のテーブルと同じ判定関数に寄せる。境界を 2 系統に分けると、
-- 引き継ぎで担当が変わったときに片方だけ追随しない。

create policy order_photos_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'order-photos'
    and app.can_read_customer(app.customer_id_from_object_name(name))
  );

create policy order_photos_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'order-photos'
    and app.can_write_customer(app.customer_id_from_object_name(name))
  );

-- 差し替えは「消して上げ直す」。update ポリシーは作らない
-- （同じパスに別の中身が入ると、署名 URL のキャッシュと食い違う）。
create policy order_photos_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'order-photos'
    and app.can_write_customer(app.customer_id_from_object_name(name))
  );


-- ── メタデータ ──────────────────────────────────────────
--
-- Storage の list に頼らずテーブルを持つ。list だけで組むと、並び順と
-- 「どの注文の写真か」の判定が storage 側の命名規約だけに乗ることになり、
-- RLS の判定経路が 2 系統になる。

create table public.order_photos (
  id uuid primary key default gen_random_uuid(),

  order_id uuid not null references public.orders (id) on delete cascade,

  -- orders と同じ理由で顧客を直に持つ。これがあるので RLS が
  -- app.can_read_customer(customer_id) の 1 本で書ける。
  customer_id uuid not null references public.customers (id) on delete cascade,

  -- {customerId}/{orderId}/{uuid}.jpg。実体は order-photos バケット。
  storage_path text not null unique,

  created_by_staff_id uuid not null references public.staff (id)
    default app.current_staff_id(),
  created_at timestamptz not null default now()
);

comment on table public.order_photos is
  '着装写真。実体は order-photos バケットで、行はその索引。顧客削除のときは行と実体の両方を消す。';

create index order_photos_order_idx on public.order_photos (order_id, created_at);

alter table public.order_photos enable row level security;
alter table public.order_photos force row level security;

create policy order_photos_select on public.order_photos
  for select to authenticated using (app.can_read_customer(customer_id));

create policy order_photos_insert on public.order_photos
  for insert to authenticated with check (app.can_write_customer(customer_id));

-- ここは facts と違って追記式にしない。撮り損ねた 1 枚を残す監査上の意味が無く、
-- 消せないと分かった時点で現場が写真を撮らなくなる。
create policy order_photos_delete on public.order_photos
  for delete to authenticated using (app.can_write_customer(customer_id));

-- 20260812120000_revoke_anon.sql で default privileges を剥がしてあるので、
-- 新しいテーブルには明示的に付ける必要がある。
grant select, insert, delete on public.order_photos to authenticated;
