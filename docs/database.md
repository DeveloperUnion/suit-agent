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
npm run db:test           # pgTAP 107 件
```

`db:reset` を毎回通すのが要点。「途中から足した migration」ではなく
「まっさらから全部流す」ことを常に検証しておかないと、本番でだけ落ちる。

**パスワードは無い。**ローカルも本番も入り口は Magic Link だけで、
サインイン画面にメールアドレスを入れ、届いたリンクを開く。
ローカルの宛先は届かないので **Mailpit（http://127.0.0.1:54324）で読む**。

```
hosokawa@example.com / shirahige@example.com / nozaki@example.com / admin@kensetsu-tech.com
```

4 人とも管理者。開発だけパスワードで抜けられるようにはしない — その抜け道でしか
踏まない不具合（リダイレクト先の許可・メールの文面・リンクの期限）が本番の初日に出る。

`emailRedirectTo` はブラウザの origin をそのまま渡すので、`config.toml` の
`site_url` / `additional_redirect_urls` に**無い宛先は黙って site_url へ向き直る**。
`localhost:3000` と `127.0.0.1:3000` は別物として扱われるため、両方許してある。

| | |
|---|---|
| Studio | http://127.0.0.1:54323 |
| DB | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| メール確認 | http://127.0.0.1:54324 （Mailpit。サインインのリンクはここに届く） |

環境変数は `.env.local`（gitignore 済み）。`supabase status -o env` の値を入れる。
**`SUPABASE_SERVICE_ROLE_KEY` はローカルにも Vercel にも置かない** — `BYPASSRLS`
相当なので、置いた時点で「RLS が天井」という前提がどこか 1 行のインポートで消える。

---

## ファイルの役割

```
supabase/
  migrations/*.sql     実行可能な正。手で書く（db diff は関数・ポリシーを取りこぼす）
  masters.sql          生成物。採寸マスタとパーソナルの見出し。本番にも要る（後述）
  dev-seed.sql         生成物。モックの 50 顧客。ローカル専用
  seed.sql             管理者 4 名と auth.users。ローカル専用
  tests/*.sql          pgTAP。db:test で回る
  config.toml          Storage は着装写真のためだけに有効。Realtime は無効
scripts/
  generate-masters.mts   lib/constants/* → supabase/masters.sql
  generate-dev-seed.ts   lib/mock/seed.ts → supabase/dev-seed.sql
.github/workflows/
  db.yml               PR で検証し、main へのマージで本番へ反映する（後述）
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

正は `lib/constants/` の `measurement-fields.ts` / `adjustments.ts` / `facts.ts`。
DB はミラーで、DB 側で直したものは次の生成で消える。

---

## CI（`.github/workflows/db.yml`）

**どの DB が相手かを取り違えると事故になるので、そこから書く。**

| | 手元の Docker | CI ランナーの中 | 本番 |
|---|---|---|---|
| 誰が触る | 自分だけ。**CI は来ない** | `verify` ジョブ | `deploy` ジョブ |
| DB | `supabase start` した自分のコンテナ | ジョブごとに新品を立て、終われば VM ごと捨てる | 本番プロジェクト |
| 流すもの | 今まで通り自分で `db:reset` | `db:reset` → `db:test` | `db push` → `masters.sql` |
| データ | 消えない | **消えるものが最初から無い** | **消えない** |

`db:reset` は使い捨ての DB にしか流れない。本番に流れるのは `db push`（記録の無い
migration を追記するだけ）と、冪等な `masters.sql` の 2 つで、どちらも既存の行を消さない。
**`deploy` に `db reset` は書かない。**

`verify`（PR と main への push）:

- **適用済みの migration を書き換えていないこと。**`db push` は一度当てたファイルを
  二度流さないので、書き換えると**手元の `db:reset` は緑のまま本番にだけ入らない**。
  merge-base との差分で `M`/`D`/`R` を見て落とす
- `db:reset` → `db:test` → `db:masters:check`。3 つめは `lib/constants/*` を直して
  `npm run db:masters` を忘れた PR を止める

`app` は Docker が要らないので別ジョブで並走する（`lint` と `typecheck`）。
`typecheck` が `next typegen && tsc --noEmit` なのは、`next-env.d.ts` と `.next/types`
が生成物で git に入っていないため。`tsc` だけを打つと型が丸ごと見つからずに落ちる。

`deploy` は `needs: verify`。**main への直 push でも、まっさらからの reset と pgTAP を
通したコミットしか本番に触れない。**

### 本番の credential を CI に置くことについて

`SUPABASE_DB_URL`（`production` environment secret）は `postgres` ロールなので、
このリポジトリで置かないと決めている `service_role` キーより強い。migration を
自動で当てる以上これは避けられないが、等価交換ではないので抑えを書いておく。

- repository secret ではなく **`production` environment に閉じる**。PR のジョブからは見えない
- `deploy` は `needs: verify`。検証が緑のコミットしか本番に触れない
- ワークフローで `$SUPABASE_DB_URL` を echo しない
- 承認を挟みたくなったら Settings → Environments → production に reviewer を 1 人足すだけで、
  コードを変えずに「マージ後、人が Approve するまで止まる」に切り替わる

接続文字列は **Session pooler（ポート 5432）**を Dashboard の Connect からそのまま写す。
直結ホスト `db.<ref>.supabase.co` は IPv6 専用で、GitHub Actions のランナーは IPv4 しか
持たないので届かない。Transaction pooler（6543）は DDL に使えない。

---

## できているもの

| migration | 中身 |
|---|---|
| `..._app_schema_and_staff` | `app` スキーマ / `current_staff_id()` / `is_admin()` / `normalize_ja()` / `worker_role` / `staff` |
| `..._customers` | `customers` / `customer_anniversaries` / `can_read_customer()` / `can_write_customer()` / `find_similar_customers()` |
| `..._orders` | `orders`（金額4列・生地4列）/ `order_items` |
| `..._measurements` | マスタ3表 / 採寸4表（複合 FK） |
| `..._approach_and_targets` | `app_settings`（1 行）/ `approach_resolutions` / `revenue_targets` / `v_approach_inputs` |
| `..._change_log` | `change_log` とトリガー |
| `..._agent_messages` | `agent_messages`（`action` jsonb + `applied_at`） |
| `..._actor_defaults` | 操作者の列に `default app.current_staff_id()` |
| `..._customer_view` | `v_customers`（顧客 + 最終お渡し） |
| `..._facts` | `fact_categories` / `fact_labels` / `fact_aliases` / `customer_facts` / `search_chunks` / `worker_role` のポリシー |
| `..._facts_migration` | 同意 2 列 / `customer_ng_notes` / 使わない 8 列の削除 / ビュー作り直し |
| `..._revoke_anon` | `anon` の権限を全部剥がす / `authenticated` の TRUNCATE / 既定 ACL |
| `..._staff_gate` | `auth.users` のトリガー 2 本（招待の門番と自動紐付け） |
| `..._handover_and_similar_customers` | `due_date` → `arrived_at` / `v_customers` の起点を `coalesce(delivered_at, arrived_at)` に / `anniversary_lead_days` / `public.find_similar_customers()` のラッパ |

pgTAP 107 件。構造ガード（RLS 付け忘れ・`security_invoker` 忘れ）は
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

（この表は移行時点の記録。トリガーのタブはその後、お渡し後フォローの節目を
店舗が変えられるようにしたときに一番右へ戻している。）

`lib/data/*` の側では、狙いどおり**担当の絞り込みが全部消えた**。

```
- .filter((c) => c.staffId === staffId)          RLS が担う
- if (customer.staffId !== getCurrentStaffId()) return null;   RLS が 0 行を返す
- staffId: getCurrentStaffId(),                   DB の default が入れる
```

---

## 次にやること

### モデル名は `lib/ai/models.ts` にだけ書く

用途ごとに事業者もモデルも違い、どれも半年で入れ替わる。呼び出し側に
文字列を書かない。

| 用途 | 現在 |
|---|---|
| 紙・写真の読み取り | `gemini-3.6-flash` |
| 会話 | `gpt5.6luna`（まだ呼んでいない。定数に置いてあるだけ） |
| 埋め込み | `gemini-embedding-001`（**未確定**） |

**埋め込みだけは実装時に引き比べて決める。**候補は `gemini-embedding-001` 系と
`text-embedding-3-large`。費用は論点にならない（初期投入 6.6 万チャンクで数セント）。
dev-seed の事実で「アウトドア系が好きな人」のような曖昧な問いを両方に投げ、
出てくる顔ぶれで選ぶ。

どちらも既定は 3072 次元だが、**pgvector の HNSW は 2000 次元までしか索引化
できない**ので、API 側（`outputDimensionality` / `dimensions`）で 1536 に
切り詰めて使う。どちらも Matryoshka 表現なので先頭を切り出すだけで済む。
`search_chunks.embedding_model` がどのモデルで作った行かを持っているが、
**混在させたまま検索してはいけない**（ベクトル空間が違うので距離が意味を成さない）。
替えるときは全行を埋め込み直す。

### Phase 1 との違い

**Phase 2 は画面の作り替えを伴う。**Phase 1 は「画面を 1 行も変えずに DB 化する」が
目標だった。こちらではカルテが 6 セクションに組み替わり、趣味欄が textarea から
チップに、メモが 1 行ずつの追記リストになった。性質が違うので、
1 画面ずつ壁打ちしながら進めている。

### Phase 2 — パーソナルとエージェント基盤

- [x] `fact_categories` / `fact_labels` / `fact_aliases` / `customer_facts` / `search_chunks`
- [x] `lib/ai/` の ESLint ルール（`supabase().from(` を禁止）
- [x] `customers` の 8 列を落として facts へ移す。**`memo` も facts に入れた**
      （`label_id` が null の行）。カルテは「パーソナル（チップ）」と
      「メモ（1 行ずつ追記）」の 2 面になったが、DB では同じ 1 テーブル
- [x] `customer_ng_notes` テーブルと `photo_consent` / `night_contact_ok` への分割
      （同意 2 列は Phase 3 で落とした。一度も使われず、注意事項の枠の
      下半分を占めていただけだった）
- [x] 埋め込みのバックフィル（`app/api/cron/embed`、`worker_role`）。
      **LOGIN + 専用パスワードにした。**`BYPASSRLS` は与えていないので、越境できるのは
      facts の回で明示したポリシーの範囲（`search_chunks` の読み書きと、本文を
      組み立てるための `customer_facts` / `fact_labels` の select）だけ。
      パスワードは migration に書かない — git に入るため。**本番は SQL Editor で
      1 回だけ設定し、接続文字列を Vercel の `WORKER_DATABASE_URL` に置く**:

      ```sql
      alter role worker_role with password '<生成した値>';
      ```

      ローカルは `supabase/seed.sql` が `worker` を入れる（`db reset` でしか流れない）。
      接続は **Session pooler（ポート 5432）**。直結ホストは IPv6 専用で Vercel から
      届かず、Transaction pooler（6543）は使わない
- [x] `app.search_customers()` — 確定検索と意味検索を 1 本の関数で両方走らせる。
      **ツールを 2 本に分けて「網羅が要るときは確定検索を使え」とプロンプトで
      指示する解は採らない**（RLS を採ったのと同じ理由で、作法は必ず破れる）。
      確定検索は**ラベル一致と本文の全文一致の両方**を LIMIT なしで返す —
      走り書きに「ゴルフ」と書かれた顧客を落とさないため
- [ ] 会話を `MODELS.chat` に差し替える（いまは `lib/ai/agent.ts` のパターン照合）。
      このとき `lib/ai/` から `lib/data/*` の import も禁止する
      （`agent-tools.ts` が丸ごと書き換わるので、それまでは入れられない）
- [x] 埋め込みは**二重**にする — 書き込み直後の fire-and-forget（`addFact` が
      `/api/embed` を叩き、結果を待たない）と Cron のバックフィル。
      片方だけだと「その顧客だけ検索に出てこない」が無音で起きる。
      **未処理のキューは持たない** — `customer_facts left join search_chunks` が
      null の集合をそのまま使うので、事実が存在する限り必ず拾われる

### Phase 3 — 運用

- [x] `public.delete_customer()`（顧客の物理削除。テーブルへの delete 権限は
      付けず、この関数 1 本に閉じる。`change_log` は削除の事実だけ残す。
      実体の写真はクライアントが Storage から先に消す）
- [x] `app.sync_birthday_anniversary()`（生年月日 → 誕生日の記念日）
- [x] `order_photos` と `order-photos` バケット（着装写真）
- `app.deactivate_staff()`（退職時の引き継ぎ。いまは無効化だけで引き継ぎは手作業）
- `customer_assignments`（引き継ぎ履歴）
- `alterations`

### 本番（`torico-agent`）

Tokyo リージョン。**まだ店舗には渡していない。**手順書ではなく、いまの状態として書く。

- [x] `supabase link` → `supabase db push`（migration 13 本）。**手作業でやったのは
      ここまで。**以降は main へマージすると `deploy` ジョブが流す
- [x] `psql`（実際は SQL Editor）で `supabase/masters.sql`。**migration では入らない**ので、
      スキーマを push するたびにこれも流す。この順序も `deploy` ジョブに入れてある
- [x] **`deploy` ジョブの有効化。**`production` environment に `SUPABASE_DB_URL` を入れて、
      `.github/workflows/db.yml` の `if:` から `false &&` を外した。
      手動で流し直す口として `workflow_dispatch` も足してある（本番に流れるのは
      main を選んだときだけ）。
      **止めていた間に踏んだ事故:**`20260812140000` 以降の 5 本が本番に入らないまま
      アプリだけ先に出て、`v_customers.order_count` と `app_settings.anniversary_lead_days`
      が 42703 で落ち続けた。**`deploy` のスキップは失敗にならない**ので Actions は
      ずっと緑に見えていた。CI を止めるときは、緑が何を意味しなくなるかまで見ておく
- [x] 1 人目の管理者を SQL Editor から 1 行。管理者がいないと管理者を作れないため、
      ここだけは手作業。**2 人目以降は設定画面から名前とメールを登録するだけ**で、
      本人がサインインすると `auth.users` が作られ `auth_user_id` はトリガーが埋まる
- [x] Vercel にデプロイ（`torico-agent.vercel.app`）
- [ ] **カスタム SMTP。**組み込みのメールは 2 通/時で、外す手段が他に無い（後述の罠）。
      **本番の初回ログインで実際にこれを踏んで止まっている。**
      Google Workspace の SMTP なら DNS を触らずに通せる。最終的には Resend などで
      `noreply@<自分のドメイン>` にする — 差出人が `noreply@mail.app.supabase.io` の
      ままだと、受け取る側にはフィッシングと区別がつかない
- [ ] Site URL と Redirect URLs に本番ドメイン。**パス無しの形とワイルドカードの両方**を
      入れる（アプリは `emailRedirectTo` に origin をそのまま渡す）。
      ここが漏れるとリンクが `localhost` へ向いて、本番の初回ログインだけが通らない
- [ ] **Pro プラン。店舗に渡す前に必ず入れる。**1 週間触らないとプロジェクトが停止するのと、
      日次バックアップのため。いまは実データがほぼ無いので `deploy` の有効化を先にしたが、
      **店舗が使い始めたら戻す先が無い状態で自動反映を続けないこと**。
      **メールの上限とは無関係**（課金しても外れない）

設定で間違えやすいのは 2 つ。どちらも**切ってはいけない**もの:

| | |
|---|---|
| Sign In / Providers の**新規サインアップ** | **有効のまま。**招待制の門番は GoTrue のフラグではなく DB のトリガー（`app.guard_auth_user_is_staff`）に移してある。切ると設定画面から追加したスタッフが誰もサインインできない |
| **Email プロバイダ** | **有効のまま。**切ると既存ユーザーへのリンク送信まで止まる（ローカルで踏んだ罠と同じ構造） |

Vercel の環境変数は 3 つ。**`SUPABASE_SERVICE_ROLE_KEY` は置かない**

| | |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API Keys の anon / publishable |
| `GEMINI_API_KEY` | 採寸票・名刺の読み取り。`app/api/extract/*` だけが読む（NEXT_PUBLIC を付けない） |

---

## 実装中に踏んだ罠

次に同じことをするときのために。

- **Supabase は `public` の全テーブルに `authenticated`/`anon` へ ALL 権限を
  既定で与える。**`grant select, insert, update` は無意味で、ポリシーの無い DELETE も
  エラーにならず 0 行になり、アプリのバグを隠す。
  → **`20260812120000_revoke_anon.sql` で既定値ごと止めた。**いまは grant を
  書き忘れると `permission denied` で落ちる。あわせて `anon` の権限を全部剥がし
  （二枚目の壁）、`authenticated` から TRUNCATE も剥がした（**TRUNCATE は
  RLS を無視する**）。プロジェクト作成画面の "Automatically expose new tables" は
  無効を推奨されているが、**トグルは git に残らない**ので migration で塞ぐ
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
- **`[auth.email] enable_signup = false` はメールのプロバイダごと止める**
  （`GOTRUE_EXTERNAL_EMAIL_ENABLED` に写る）。既存ユーザーへのリンク送信まで
  `email_provider_disabled` で落ちるので、新規登録を塞ぐのは `[auth]` 直下の
  `enable_signup = false` のほう。こちらなら未登録の宛先だけが `otp_disabled` になる
- **メールの送信上限は既定 2 通/時で、本番では動かせない。**組み込みのリレーが
  共有のものなので、`Rate Limits` の欄は**カスタム SMTP を入れて初めて編集可能**になる
  （Supabase に課金しても外れない）。種類の区別は無く、確認・招待・Magic Link・
  再設定が同じ枠から引かれる。**入り口が Magic Link だけなので、上限に当たると
  誰もログインできない** — 本番の初回ログインで実際にこれを踏んだ。
  ローカルの `email_sent` は 60 に上げてある
- **429 には 2 種類ある。**上の送信枠と、同一宛先への連続要求に対する
  60 秒ほどのクールダウン。後者は**カスタム SMTP を入れても残る**。
  区別はレスポンス本文でつく（`For security purposes, you can only request this
  after N seconds` ならクールダウン）。Logs の `log_type: "edge"` には本文が
  入らないので、Auth Logs か DevTools の Response を見ること
- テストは `seed.sql` が流れた後の DB で走る。**「テーブルが空」を前提にすると
  seed を足すたびに壊れる**。件数ではなく不変条件を確かめる
- **HNSW + RLS + LIMIT は取りこぼす。**`order by embedding <=> q limit k` は
  インデックス走査が先で RLS のフィルタが後なので、他スタッフの顧客が k 枠を
  食い潰して自分の顧客が落ちる。`app.search_customers()` では多めに取ってから
  絞る。確定検索側は LIMIT なしで全件返すので影響を受けない
- **PostgreSQL 16 でロールのメンバーシップが `INHERIT` と `SET` に分かれた。**
  `CREATEROLE` を持つ `postgres` が作ったロールへの自動付与は `SET` を含まないので、
  `grant … with set true` を書かないと `set role worker_role` が権限エラーになる
  （ロールを作ったのに一度も使えない、という形で現れる）
- **`auth.users` のトリガーが投げた例外は GoTrue が 500 に丸める。**
  `Database error saving new user` としか出ないので、ログだけ見ると不具合に見える。
  画面側は登録済みかどうかを区別しない文言を返しているので実害は無いが、
  HTTP のステータスでは区別できてしまう（11 名の店舗でメールアドレスの
  列挙が脅威にならないため、受け入れている）
- **`worker_role` は `extensions` スキーマの USAGE を持たない。**pgTAP の `is()` も
  そこにあるので、`set role worker_role` した状態では判定関数を呼べない。
  数えるところだけをそのロールで走らせ、`\gset` で持ち帰ってから判定する
- **適用済みの migration を書き換えても、ローカルは緑のまま通る。**`db:reset` は
  まっさらから流すので直した内容が反映されるが、本番の `db push` は
  `supabase_migrations.schema_migrations` に記録のあるファイルを二度流さない。
  **どこにもエラーが出ないまま本番だけが古い**という形で現れる。
  → CI に merge-base との差分検査を入れて落としている
- **Supabase の直結ホストは IPv6 専用。**`db.<ref>.supabase.co` は AAAA しか返さず、
  GitHub Actions のランナーは IPv4 しか持たないので接続が張れない
  （名前解決は通るのでタイムアウトとして出る）。CI からは Session pooler を使う。
  Transaction pooler（6543）は prepared statement を張れないので DDL には使えない

---

## 店舗に確認すること

1. **下半身の補正コードの完全なリスト**（`lib/constants/adjustments.ts` に
   「紙の一部のみ」と明記）。**code 28 / 39 の既定値**も
2. **項目ごとの現実的な寸法範囲**（股下なら 60〜100 など）。
   持たせれば OCR の「ありえるが間違っている」誤読を DB で止められる
3. 個人情報の削除請求への対応手順（`app.purge_customer()` を誰が実行するか）
4. 退職時の Supabase セッション失効の手順（DB からは実行できない）
5. お渡し後フォローの節目を実際に動かしたくなるか。半年・1 年のまま何ヶ月か回して、
   触られないなら定数に戻して `app_settings` ごと畳んでよい
6. 流入経路を集計したくなるか。列ごと落として記録の自由記述に畳んだので、
   集計するなら固定リストの列を改めて作る
