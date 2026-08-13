-- 金額の内訳（任意）と、使われなかった 3 列の始末
--
-- 20260811082718_orders.sql は紙の右上と同じ 4 欄（売上金額・割増金額・消費税・
-- 合計金額）を持っていたが、実運用でその欄は空欄のまま流れ、店が入れるのは
-- 税込の 1 本だけだった。画面は早々に 1 欄へ畳んだのに列は 4 つ残り、
-- subtotal_amount / surcharge_amount / tax_amount は**一度も 0 以外にならなかった**。
--
-- ここで軸を入れ替える。店が知りたいのは「税抜がいくらで税がいくらか」ではなく
-- **「何がいくら売れたか」**だった。割増を分けて持つかの審議（docs/todo.md）は
-- 「分けない」で決着し、代わりに売上区分の内訳を任意で持つ。


alter table public.orders
  -- 常に 0 の 3 列。使わない列が残っていること自体が、読む人に
  -- 「どれが正なのか」を毎回考えさせていた。
  drop column subtotal_amount,
  drop column surcharge_amount,
  drop column tax_amount,

  -- 売上区分ごとの内訳。**すべて任意（nullable）。**
  --
  -- not null default 0 にしない。「未入力」と「0 円」を区別できなくなり、
  -- 内訳を入れていない注文が「4 区分すべて 0 円」に見える。落としたばかりの
  -- 3 列とまったく同じ失敗を繰り返すことになる。
  --
  -- 採寸の item_types（jacket / pants / vest / shirt / coat）とは別の軸。
  -- 「スーツ」は上下一式の売上区分で、対応するアイテム種別の id は無い。
  add column amount_suit      integer,   -- スーツ
  add column amount_coat      integer,   -- コート
  add column amount_accessory integer,   -- 小物
  add column amount_shirt     integer;   -- シャツ


-- **CHECK も再計算トリガーも張らない。**total_amount と同じ原則
-- （20260811082718_orders.sql:33-35）をそのまま継ぐ。
--
-- ここでは理由がもう 1 つ増える。「その他」区分を作らないと決めたので、
-- **4 つの和が合計に届かないのは異常ではなく既定の状態**。和で縛ると、
-- 区分に当てはまらない売上が 1 円でもある注文が保存できなくなる。

comment on column public.orders.total_amount is
  '合計金額（税込）。これが正。内訳（amount_*）の和と一致しなくてよい。CHECK を張ってはいけない。';

comment on column public.orders.amount_suit is
  '内訳・スーツ。任意。NULL は未入力で、0 円とは別物。合計との差は正常。';
comment on column public.orders.amount_coat is
  '内訳・コート。任意。NULL は未入力で、0 円とは別物。合計との差は正常。';
comment on column public.orders.amount_accessory is
  '内訳・小物。任意。NULL は未入力で、0 円とは別物。合計との差は正常。';
comment on column public.orders.amount_shirt is
  '内訳・シャツ。任意。NULL は未入力で、0 円とは別物。合計との差は正常。';

-- RLS も grant も足さない。orders の既存ポリシーが列ごと覆う。
