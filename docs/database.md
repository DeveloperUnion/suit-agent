# データベース

Vercel + Supabase。`lib/store/mock-db.ts` の localStorage を置き換えるための本番スキーマ。

現在 **Phase 1 の DB 側まで完了**し、アプリ（`lib/data/*`）はまだモックを見ている。
両者は並存していて、**アプリは 1 行も壊れていない**（今まで通りモックで動く）。

---

## ローカルで動かす

Docker Desktop が要る（Supabase CLI のローカルスタックは Postgres だけでなく
GoTrue / PostgREST もコンテナで動かすため、他の起動方法がない）。
Homebrew の PostgreSQL では代用できない — **`security_invoker` は PG15 以降**で、
この設計の要になっている。

```bash
open -a Docker            # 起動を待つ
supabase start            # 初回はイメージの取得で数分
npm run db:reset          # 全 migration → masters → seed → dev-seed
npm run db:test           # pgTAP 61 件
```

`db:reset` を毎回通すのが要点。「途中から足した migration」ではなく
「まっさらから全部流す」ことを常に検証しておかないと、本番でだけ落ちる。

ローカルのログインは `hosokawa@example.com` / `password`（他 2 名も同じ）。
本番は Magic Link（招待メール）。

| | |
|---|---|
| Studio | http://127.0.0.1:54323 |
| DB | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| メール確認 | http://127.0.0.1:54324 （Inbucket） |

環境変数は `.env.local`（gitignore 済み）。`supabase status -o env` の値を入れる。
**`SUPABASE_SERVICE_ROLE_KEY` はローカルにも Vercel にも置かない** — `BYPASSRLS`
相当なので、置いた時点で「RLS が天井」という前提がどこか 1 行のインポートで消える。

---

## ファイルの役割

```
supabase/
  migrations/*.sql     実行可能な正。手で書く（db diff は関数・ポリシーを取りこぼす）
  masters.sql          生成物。採寸マスタ。本番にも要る（後述）
  dev-seed.sql         生成物。モックの 50 顧客。ローカル専用
  seed.sql             管理者 3 名と auth.users。ローカル専用
  tests/*.sql          pgTAP。db:test で回る
  config.toml          Storage / Realtime は無効（使わないと決めた）
scripts/
  generate-masters.mts   lib/constants/* → supabase/masters.sql
  generate-dev-seed.ts   lib/mock/seed.ts → supabase/dev-seed.sql
```

### マスタは「デプロイ手順」であって seed でも migration でもない

`measurement_fields` は `measurement_values.field_key` の FK 先なので、
**本番にも要る**。しかし `seed.sql` はローカルの `db reset` でしか流れない。
かといって migration に `insert` を書くと、項目を 1 つ直すたびに新しい
migration が要る。

```bash
npm run db:masters                          # lib/constants から生成
psql "$DATABASE_URL" -f supabase/masters.sql   # 本番。冪等なので何度でも安全
npm run db:masters:check                    # CI。生成し直して差分ゼロを検査
```

正は `lib/constants/measurement-fields.ts` と `adjustments.ts`。
DB はミラーで、DB 側で直したものは次の生成で消える。

---

## できているもの

| migration | 中身 |
|---|---|
| `..._app_schema_and_staff` | `app` スキーマ / `current_staff_id()` / `is_admin()` / `normalize_ja()` / `worker_role` / `staff` |
| `..._customers` | `customers` / `customer_anniversaries` / `can_read_customer()` / `can_write_customer()` / `find_similar_customers()` |
| `..._orders` | `orders`（金額4欄・生地4列）/ `order_items` |
| `..._measurements` | マスタ3表 / 採寸4表（複合 FK） |
| `..._approach_and_targets` | `approach_resolutions` / `revenue_targets` / `v_approach_inputs` |
| `..._change_log` | `change_log` とトリガー |
| `..._agent_messages` | `agent_messages`（`action` jsonb + `applied_at`） |

pgTAP 61 件。構造ガード（RLS 付け忘れ・`security_invoker` 忘れ）は
**わざと違反を作って検出することを確認済み**。

---

## 変えると壊れるもの

設計の理由は `docs/database-design.md` に書いてある。要点だけ:

- **RLS がこの設計の唯一の砦。**supabase-js 一本なので接続ロールは常に
  `authenticated` 固定で、GRANT による二枚目の壁が無い。新しいテーブルを足したら
  必ず RLS とポリシーを書く（CI が検出する）
- **ビューには必ず `with (security_invoker = true)`。**忘れると所有者権限で走り
  RLS を丸ごと迂回する。CI が検出する
- **管理者は閲覧のみ。**書き込みポリシーで `app.is_admin()` を呼ばない。
  `FOR ALL` で書くとこの非対称性が崩れる
- **UPDATE ポリシーには `USING` と `WITH CHECK` の両方を書く。**片方だけだと
  「自分の顧客を他人へ押し付ける」が通る
- **顧客・採寸票・スタッフ・注文は物理削除できない。**PITR を入れない
  （+$100/月）判断の裏返しで、「消えない」ことを設計で担保している
- **`orders.total_amount` に CHECK もトリガーも張らない。**3 つの和と一致しない
  ことが正常（紙の合計欄が正）

---

## 次にやること

`lib/data/*` の localStorage → supabase-js 差し替え。**8 ファイルまとめてやる**。

### なぜ部分移行できないか

モックは `staff-1` / `cust-xxxx` の文字列 ID、DB は uuid。
`customers.ts` だけを DB に向けると、返る顧客 ID が uuid になり、
モックのままの `orders.ts` が `db.orders.filter(o => o.customerId === <uuid>)` で
0 件を返す。クラッシュはしないが注文タブも採寸タブも空になる。

セッションも同じ。`getCurrentStaffId()` は `db.session.staffId`（`"staff-1"`）を
返し、未移行のモジュールが全部これを見ている。

`supabase/dev-seed.sql` がモックと同じデータを DB に入れてあるので、
**全モジュールを同時に切り替えれば ID は最初から揃う**。

### 順番

1. **認証**（`lib/auth/current-staff.ts`）
   - `getCurrentStaff()` は非同期になる。`app-shell.tsx:90` は既に async の中なので
     `await` を足すだけ
   - **管理者のスタッフ切り替えは「表示中のスタッフ」= 閲覧フィルタにする。
     なりきりにしない。**`app.current_staff_id()` は常に本人で、監査ログの主体も本人。
     モックの `switchStaff()` は `session.staffId` を差し替える実装なので、
     そのまま持ってくると「白髭さんが採寸した」ことになって監査ログが嘘になる
2. **`lib/data/*` 8 ファイル**
   - `.filter(c => c.staffId === staffId)` は**全部消える**（RLS が担う）。
     消えることの確認がこの移行の主目的
   - `getCustomer` の「担当外は null」も消える（RLS が 0 行を返す）
   - `createCustomer` の `staffId: getCurrentStaffId()` も消える
     （`default app.current_staff_id()`）
   - `saveAnniversaries` は**全置換をやめて行単位 upsert**。
     全削除＋全挿入だと `change_log` が毎回ノイズで埋まる
   - `listApproaches` は `v_approach_inputs` を 1 回引く（今の実装は顧客ごとに
     `anniversaries.filter()` を回していて、DB 化するとそのまま 300 クエリになる）
3. **型の変更**
   - `Order` に生地 4 列を移動（`OrderItem` から）
   - `OrderItem.photoUrls` 削除（未使用。Storage を使わない）
   - `AppSettings` 削除（記念日は 7 日固定で `lib/constants/approach.ts` へ）
   - `CustomerAnniversary.id` を uuid（位置由来 ID は `trigger_key` と衝突する）
   - `Order.staffId` → `takenByStaffId`、`MeasurementSheet.staffId` → `recordedByStaffId`
4. **通しの確認** — `components/` の変更行数を数える。
   「RLS があるので画面は変わらない」という主張の検証そのもの

購読は `lib/store/revision.ts` に切り出し済み。`useMockQuery` の形は変わらないので、
書き込み後に `bump()` を呼べば画面はそのまま動く。

---

## 実装中に踏んだ罠

次に同じことをするときのために。

- **Supabase は `public` の全テーブルに `authenticated`/`anon` へ ALL 権限を
  既定で与える。**`grant select, insert, update` は無意味。ポリシーの無い DELETE は
  エラーにならず 0 行になり、アプリのバグを隠す。**明示的に `revoke` する**
- **`language sql` の関数は作成時に本体が検証される。**`app.current_staff_id()` を
  `staff` テーブルより先に書くと migration が落ちる。順序は テーブル → 関数 → ポリシー
- **`MeasurementField.key` はグローバルに一意ではない。**`bust` は
  jacket/vest/shirt/coat の 4 つ、`waist` は pants/shirt にある。
  主キーは `(item_type_id, key)` の複合。副次的に、OCR の `FIELD_KEYS` enum
  （キー名のフラットな集合）では止まらない「pants に bust」を DB が弾ける
- **`check (actual between 1 and 250)` は「股下 175」を止めない。**止まるのは
  桁違い（8200）だけ。ありえるが間違っている値を止めるのは OCR の confidence と
  確認画面の役目。項目ごとの範囲を持たせれば止められるが、その数値は店舗に
  確認しないと決められない
- **pgTAP の `throws_ok` は 3 引数だと 3 つ目が期待メッセージ**になる。
  説明を書きたいなら 4 引数（`throws_ok(sql, errcode, null, description)`）
- テストは `seed.sql` が流れた後の DB で走る。**「テーブルが空」を前提にすると
  seed を足すたびに壊れる**。件数ではなく不変条件を確かめる

---

## 店舗に確認すること

1. **下半身の補正コードの完全なリスト**（`lib/constants/adjustments.ts` に
   「紙の一部のみ」と明記）。**code 28 / 39 の既定値**も
2. **項目ごとの現実的な寸法範囲**（股下なら 60〜100 など）。
   持たせれば OCR の「ありえるが間違っている」誤読を DB で止められる
3. `line_user_id` を Lstep から CSV でエクスポートできるか。
   できなければこの列は当面 NULL のまま
4. 個人情報の削除請求への対応手順（`app.purge_customer()` を誰が実行するか）
5. 退職時の Supabase セッション失効の手順（DB からは実行できない）
6. `acquisitionChannel` の選択肢。現状は自由記述で、集計するなら固定リストが要る
