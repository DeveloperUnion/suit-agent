# データベース

Vercel + Supabase。

**Phase 1 完了。**アプリは全画面が Supabase を見ている。localStorage のモックストアは
削除した（`lib/mock/seed.ts` だけは `supabase/dev-seed.sql` を生成する素として残る）。

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
| `..._actor_defaults` | 操作者の列に `default app.current_staff_id()` |
| `..._customer_view` | `v_customers`（顧客 + 最終納品） |

pgTAP 61 件。構造ガード（RLS 付け忘れ・`security_invoker` 忘れ）は
**わざと違反を作って検出することを確認済み**。

アプリ側は `lib/data/*` 8 ファイルが supabase-js を見る。認証は
`lib/auth/current-staff.ts`、購読は `lib/store/revision.ts`（書き込み後に
`bump()` を呼ぶと購読しているクエリが流し直される）。

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

## 「画面は変わらない」はどこまで成り立ったか

RLS を採った最大の論拠は「境界を DB が持つので API 層が要らず、`lib/data/*` の
中身を差し替えるだけで済む」だった。移行を終えて実測すると:

**保存先の入れ替えそのものを理由とする画面の変更は 0 行。**

変わったところは全部、保存先ではなく**業務上の判断**が理由になっている。

| 画面 | 行数 | 理由 |
|---|---|---|
| `settings/trigger-settings.tsx` | −103（削除） | 記念日を 7 日前で固定した |
| `layout/app-shell.tsx` | 91 | ログインとスタッフ切り替えの導入 |
| `customer/tabs/orders-tab.tsx` | 75 | 生地を明細から注文へ移した |
| `app/layout.tsx` | 17 | 認証ゲート |
| `settings/settings-view.tsx` | 13 | トリガーのタブが消えた |
| `settings/revenue-target-settings.tsx` | 12 | 「今誰か」が非同期になった |
| 採寸・注文の 3 ダイアログ | 各 3〜7 | **引数が減った**（操作者は DB の default） |
| その他 12 ファイル | 各 1〜3 | `useMockQuery` → `useQuery` の改名だけ |

最後の改名は、フックが DB を見るようになった以上その名前が嘘になるため。
変更行数を小さく見せるために誤った名前を残すのは本末転倒なので直した。

`lib/data/*` の側では、狙いどおり**担当の絞り込みが全部消えた**。

```
- .filter((c) => c.staffId === staffId)          RLS が担う
- if (customer.staffId !== getCurrentStaffId()) return null;   RLS が 0 行を返す
- staffId: getCurrentStaffId(),                   DB の default が入れる
```

---

## 次にやること

**Phase 2 — 人となりとエージェント基盤**

1. `fact_categories` / `fact_labels` / `fact_aliases` / `customer_facts` / `search_chunks`
2. `customers.hobbies` / `preferences` / `tags` / `ng_notes` からの移行
   （`source='migration'`。機械的に割るので誤りが混ざる、と後から言えるようにする）
3. `customer_ng_notes` テーブルと `photo_consent` / `night_contact_ok` への分割
4. 埋め込みのバックフィル（`app/api/cron/embed`、`worker_role`）
5. `app.search_customers()` — 確定検索と意味検索を 1 本の関数で両方走らせる
6. `lib/ai/` の ESLint ルール（`supabase.from(` を禁止し `supabase.rpc(` だけ許す）

**Phase 3 — 運用**

- `app.deactivate_staff()`（退職時の引き継ぎ。いまは無効化だけで引き継ぎは手作業）
- `app.purge_customer()`（削除請求。`change_log` のマスキングまで）
- `customer_assignments`（引き継ぎ履歴）
- `alterations`

**本番へ出すとき**

- Supabase プロジェクトを作り `supabase link` → `supabase db push`
- **`psql "$DATABASE_URL" -f supabase/masters.sql`**（採寸マスタ。migration では入らない）
- 1 人目の管理者を SQL Editor から 1 行入れ、以降は招待画面から
- Vercel の環境変数は `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` の 2 つだけ。
  **`SUPABASE_SERVICE_ROLE_KEY` は置かない**

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
- **`measurement_values` は票へ直接 FK を持たない**（複合 FK で区画とマスタを指す）。
  PostgREST の埋め込みは FK を辿るので、票から直接は取れない。区画の下にぶら下げる
- **`auth.users` のトークン列を NULL のままにしない。**GoTrue は Go の `string` で
  受けるので、NULL があると `Database error querying schema` でログインが落ちる。
  `confirmation_token` など 8 列を `''` で埋める
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
