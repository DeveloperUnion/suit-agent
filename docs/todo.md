# やると決めたが、まだ作っていないもの

決めた内容と理由だけを置く。作るときに考え直さなくて済むように、
「なぜその形か」を残す。

---

## お渡し催促の通知

**納品日から一定日数が過ぎても、お渡し日が空のままの注文に
「お渡ししましたか？」を出す。**

### なぜ 2 つの日付を分けて持っているか

紙の発注書には日付が 2 つある。

| | 列 | 意味 |
|---|---|---|
| 納品日 | `orders.arrived_at` | 工場 → 店。紙の 2 段目 |
| お渡し日 | `orders.delivered_at` | 店 → お客様。紙の上段 |

**束ねなかったのはこの通知のため。** お渡し日はお客様の都合でずれるが、
納品日は工場の都合だけで決まって先に確定する。片方に畳むと
「店には届いているのに、まだ渡していない」という状態が表現できなくなる。

着心地確認アプローチの起点はお渡し日のほう（`lib/data/approaches.ts` の
`post_delivery:{orderId}:{milestone}`）。実際に手渡した日から数えるのが正しい。

お渡し日が空の注文は、いまは**納品日で代用してフォローを立てている**
（`v_customers` の `coalesce(delivered_at, arrived_at)`）。空を理由に
フォローが一生立たないほうが害が大きいという判断だが、実際に渡した日とは
数日〜数週間ずれる。**そのずれを畳むのがこの通知。**

### 決めてあること

- **起点は納品日。** そこから N 日過ぎて `delivered_at` が null のものを出す
- 閾値 N は `app_settings` に置く。`post_delivery_months`（着心地確認の
  マイルストーン）と同じ置き場にして、トリガーの設定を 1 画面にまとめる
  — `supabase/migrations/20260811083444_approach_and_targets.sql`
- 出し先はアプローチリスト。`trigger_key` は `handover_reminder:{orderId}` の形。
  `approach_resolutions` に「もう渡した」「保留」を記録できるようにするため、
  年や日数をキーに含めない（含めると日が変わるたびに別の通知として復活する）
- お渡し日が入った瞬間にこの通知は消え、代わりに既存の
  `post_delivery:{orderId}:{milestone}` が立つ

### 実装するときに触る場所

- `v_approach_inputs` に「お渡し待ちの注文」を足す
  （いまは顧客 1 行に畳んでいるので、注文単位の入力をどう乗せるかを先に決める）
- `lib/data/approaches.ts` に `evaluateHandoverReminder()` を足す
- `components/settings/` のトリガー設定に閾値の欄を足す

---

## 割増金額を分けて持つか（審議中）

金額は「売上金額（税込）」の 1 欄にした。DB には `subtotal_amount` /
`surcharge_amount` / `tax_amount` の 3 列が残っていて、**常に 0**。

紙の右上と同じ 4 欄を並べていた時期があるが、その欄は実運用では空欄のまま
流れていて、残ったのは 0 が 3 つ並んだ画面だけだった。**紙の形を写すことと、
店が持っている情報の形を写すことは別物**、というのがこのときの学び。

判断が出たら:

- **分けない** → 3 列を落とすマイグレーションを書く
- **分ける** → 画面に欄を戻す。そのとき消費税を税率から計算するなら、税率は
  変わるので `tax_rate` を注文ごとに持つ必要がある（列数は減らない）

放置すると「使っていない列」が読む人を迷わせるので、どちらかに倒す。

---

## スタッフの引き継ぎが実装されていない

`lib/data/settings.ts` の `deactivateStaff()` は `TODO(Phase 3)` のまま無効化しか
しておらず、`reassignToId` を捨てている。一方で
`components/settings/staff-settings.tsx` は「担当していた N 名を X に
引き継ぎました」と**成功トーストを出す**。

実際には顧客の `staff_id` は動かない。そのスタッフを無効化すると
`app.current_staff_id()` が NULL になり、その顧客は管理者以外から見えなくなる。
要件 1.2-3「退職時に関係資産が消失する」を自分で再現している。

直すには `app.deactivate_staff()`（SECURITY DEFINER）が要る。管理者でも他人の
顧客は UPDATE できないので、通常のクエリでは付け替えられない。守るべき条件
（自分は無効化できない／引き継ぎ先は有効なスタッフ）を関数の中に置き、
他の経路を残さない。

**それまでの応急処置として、トーストの文言を実態に合わせるべき。**

---

## 売上目標の 0 クリアが権限エラーで落ちる

`saveRevenueTargets()`（`lib/data/settings.ts`）は金額 0 以下の行を `.delete()` で
消しているが、`revenue_targets` は `revoke delete`
（`supabase/migrations/20260811083444_approach_and_targets.sql`）。
0 を保存すると permission denied で throw する。

「未設定（null）」と「目標 0 円」を区別する設計は正しいので、消し方を変える。
DELETE を開けるか、`amount` を nullable にして null で未設定を表すか。
