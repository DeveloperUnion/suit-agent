/**
 * **本番（torico-agent）へ入れる検証用データ**の SQL を吐く。
 *
 *   npm run db:demo-seed
 *
 * ローカル用の generate-dev-seed.ts とは別物。混ぜないこと。
 *
 * | | ローカル（dev-seed） | 本番（demo-seed） |
 * |---|---|---|
 * | 流れ方 | `supabase db reset` が自動で流す（config.toml の sql_paths） | **手で流す。**自動では絶対に流れない |
 * | スタッフ | staff-1..3 の固定 uuid | 本番に実在する 2 名の uuid |
 * | ラベル | id で衝突回避 | **normalized で衝突回避**（下記） |
 * | 消し方 | `db reset` | 99_teardown.sql |
 *
 * ## なぜラベルの扱いだけ違うのか
 *
 * `fact_labels` には `normalized` の UNIQUE 索引がある。本番にはすでに手で入れた
 * 「ワイン」「サーフィン」が**別の id で**存在するので、dev-seed と同じ
 * `on conflict (id) do nothing` では拾えず、**insert 文がまるごと落ちる**。
 * さらに `customer_facts.label_id` に計算した id を入れると FK で落ちる。
 *
 * だからこちらは 2 つとも名前で解決する:
 *   - `insert ... on conflict (normalized) do nothing`
 *   - `label_id` は `(select id from fact_labels where normalized = app.normalize_ja('ゴルフ'))`
 *
 * ## 引き渡し前に消すこと
 *
 * これは**店舗に渡すものではない**。99_teardown.sql を必ず流すこと。
 * 消し忘れると、架空の顧客 600 名が付いたまま本番が渡る。
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

import { buildAll, buildRevenueTargets, DEFAULT_SHAPE, type SeedShape } from "@/lib/mock/seed";
import type { MeasurementSheet } from "@/lib/types";

// ── 本番のスタッフ ──────────────────────────────────────
//
// `select id, name from public.staff` の実測値。ここを間違えると
// 600 行すべてが FK で落ちる（落ちてくれるほうが安全ではある）。
const SHIMODAIRA = "be18f4de-7c74-4420-b28e-7163644211ec"; // 下平 凌生（admin）
const KITAJIMA = "3d026301-bdac-44c1-a859-5dd3a2af58f5"; // 北島壮馬（member）

/**
 * 本番の形。**担当 300 名ずつ。**
 *
 * 固定の 10 名は下平さんに寄せ、そのぶん生成ぶんを 290 に減らして 300 に揃える。
 */
const SHAPE: SeedShape = {
  ...DEFAULT_SHAPE,
  pinnedStaffId: SHIMODAIRA,
  perStaff: [
    { staffId: SHIMODAIRA, count: 290 },
    { staffId: KITAJIMA, count: 300 },
  ],
};

const OUT_DIR = new URL("../supabase/demo/", import.meta.url);

/** dev-seed と同じ変換。同じ入力なら常に同じ uuid になる */
function toUuid(mockId: string): string {
  const h = createHash("sha1").update(`suit-agent:${mockId}`).digest("hex");
  const v = h.slice(0, 32).split("");
  v[12] = "5";
  v[16] = ((parseInt(v[16], 16) & 0x3) | 0x8).toString(16);
  const s = v.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

function lit(v: unknown): string {
  if (v === undefined || v === null) return "null";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return `'${String(v).replace(/'/g, "''")}'`;
}

/**
 * 1 文あたりの行数。
 *
 * 全体で 2MB を超えるので、MCP の execute_sql には 1 発で載らない。
 * 500 行ずつに割ると 1 文あたり 50〜150KB に収まる。
 */
const CHUNK = 500;

/** 行の配列を、CHUNK ごとの insert 文に畳む */
function statements(head: string, rows: string[], tail: string): string {
  if (rows.length === 0) return "";
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    out.push(`${head}\n${rows.slice(i, i + CHUNK).join(",\n")}\n${tail}`);
  }
  return out.join("\n\n") + "\n";
}

const db = buildAll(SHAPE);

const HEADER = `-- 自動生成。直接編集しない。正は lib/mock/seed.ts と scripts/generate-demo-seed.ts。
--
-- **本番（torico-agent）の検証用データ。店舗に渡す前に 99_teardown.sql で消すこと。**
-- 既存の顧客 9 名と、手で入れた語（ワイン・サーフィンなど）には触れない。
`;

const files: { name: string; body: string }[] = [];
const add = (name: string, body: string) => files.push({ name, body: HEADER + "\n" + body });

// ── ラベル ──────────────────────────────────────────────
const labels = new Map<string, string>();
for (const f of db.facts) if (f.label) labels.set(f.label.name, f.label.categoryKey);
add(
  "01_fact_labels.sql",
  `-- normalized の UNIQUE で衝突を避ける。すでにある語（ワイン等）は既存行が勝つ。
-- id は入れない（default が振る）。dev-seed のように名前から計算した id を入れると、
-- 既存行と normalized で衝突して文ごと落ちる。
` +
    statements(
      `insert into public.fact_labels (name, category_key) values`,
      [...labels].map(([name, category]) => `  (${lit(name)}, ${lit(category)})`),
      `on conflict (normalized) do nothing;`,
    ),
);

// ── 顧客 ────────────────────────────────────────────────
add(
  "02_customers.sql",
  `-- 誕生日の記念日は入れない。customers を insert した時点で
-- app.sync_birthday_anniversary() が birth_date から作る。
` +
    statements(
      `insert into public.customers (
  id, name, name_kana, birth_date, gender, phone, email, address,
  residence_prefecture, embroidery_name,
  company_name, department, job_title, industry,
  family_info, staff_id, created_at
) values`,
      db.customers.map(
        (c) =>
          `  (${[
            lit(toUuid(c.id)), lit(c.name), lit(c.nameKana), lit(c.birthDate), lit(c.gender),
            lit(c.phone), lit(c.email), lit(c.address), lit(c.residencePrefecture),
            lit(c.embroideryName),
            lit(c.companyName), lit(c.department), lit(c.jobTitle), lit(c.industry),
            lit(c.familyInfo), lit(c.staffId), lit(c.createdAt),
          ].join(", ")})`,
      ),
      `on conflict (id) do nothing;`,
    ),
);

// ── パーソナルとメモ ────────────────────────────────────
const staffOf = new Map(db.customers.map((c) => [c.id, c.staffId]));
add(
  "03_customer_facts.sql",
  `-- label_id は**名前から引く**。計算した uuid を入れると、既存の「ワイン」を
-- 指さずに FK で落ちる。
--
-- 行ごとにスカラ副問い合わせを書くのではなく、values を 1 回だけ fact_labels へ
-- 左結合する。500 行のうち 500 回引くのと 1 回結合するのとで、SQL の大きさが
-- 3 分の 1 になる（読むときにも、名前で引いていることが 1 箇所に見える）。
--
-- 左結合なので、label_name が null の行（ラベルの付いていない走り書き）は
-- label_id が null のまま入る。
` +
    statements(
      `insert into public.customer_facts (id, customer_id, label_id, body, source, created_by_staff_id, created_at)
select v.id, v.customer_id, l.id, v.body, v.source, v.staff_id, v.created_at
  from (values`,
      db.facts.map(
        (f) =>
          `  (${[
            `${lit(toUuid(f.id))}::uuid`,
            `${lit(toUuid(f.customerId))}::uuid`,
            f.label ? lit(f.label.name) : "null::text",
            lit(f.body),
            lit(f.source),
            `${lit(staffOf.get(f.customerId))}::uuid`,
            `${lit(f.createdAt)}::timestamptz`,
          ].join(", ")})`,
      ),
      `) as v(id, customer_id, label_name, body, source, staff_id, created_at)
  left join public.fact_labels l on l.normalized = app.normalize_ja(v.label_name)
on conflict (id) do nothing;`,
    ),
);

add(
  "04_customer_ng_notes.sql",
  statements(
    `insert into public.customer_ng_notes (id, customer_id, body, created_by_staff_id, created_at) values`,
    db.ngNotes.map(
      (n) =>
        `  (${[
          lit(toUuid(n.id)), lit(toUuid(n.customerId)), lit(n.body),
          lit(staffOf.get(n.customerId)), lit(n.createdAt),
        ].join(", ")})`,
    ),
    `on conflict (id) do nothing;`,
  ),
);

add(
  "05_customer_anniversaries.sql",
  statements(
    `insert into public.customer_anniversaries (id, customer_id, type, date, label) values`,
    db.anniversaries.map(
      (a) =>
        `  (${[lit(toUuid(a.id)), lit(toUuid(a.customerId)), lit(a.type), lit(a.date), lit(a.label ?? "")].join(", ")})`,
    ),
    `on conflict (id) do nothing;`,
  ),
);

// ── 注文 ────────────────────────────────────────────────
add(
  "06_orders.sql",
  statements(
    `insert into public.orders (
  id, customer_id, order_number, ordered_at, arrived_at, delivered_at, status, purpose,
  fabric_product_number, fabric_color_number, fabric_color_name, fabric_composition,
  total_amount, amount_suit, amount_coat, amount_accessory, amount_shirt,
  taken_by_staff_id
) values`,
    db.orders.map(
      (o) =>
        `  (${[
          lit(toUuid(o.id)), lit(toUuid(o.customerId)), lit(o.orderNumber), lit(o.orderedAt),
          lit(o.arrivedAt), lit(o.deliveredAt), lit(o.status), lit(o.purpose),
          lit(o.fabricProductNumber), lit(o.fabricColorNumber),
          lit(o.fabricColorName), lit(o.fabricComposition),
          o.totalAmount,
          lit(o.amountSuit), lit(o.amountCoat), lit(o.amountAccessory), lit(o.amountShirt),
          lit(o.takenByStaffId),
        ].join(", ")})`,
    ),
    `on conflict (id) do nothing;`,
  ),
);

add(
  "07_order_items.sql",
  statements(
    `insert into public.order_items (id, order_id, item_type_id) values`,
    db.orderItems.map(
      (i) => `  (${[lit(toUuid(i.id)), lit(toUuid(i.orderId)), lit(i.itemTypeId)].join(", ")})`,
    ),
    `on conflict (id) do nothing;`,
  ),
);

// ── 採寸 ────────────────────────────────────────────────
function sheetRows(sheets: MeasurementSheet[]) {
  const sections: string[] = [];
  const values: string[] = [];
  const adjustments: string[] = [];
  for (const s of sheets) {
    for (const sec of s.sections) {
      sections.push(
        `  (${[lit(toUuid(s.id)), lit(sec.itemTypeId), lit(sec.silhouette), lit(sec.colorNumber)].join(", ")})`,
      );
      for (const [key, v] of Object.entries(sec.values)) {
        if (v.actual === undefined && v.finished === undefined) continue;
        values.push(
          `  (${[lit(toUuid(s.id)), lit(sec.itemTypeId), lit(key), lit(v.actual), lit(v.finished)].join(", ")})`,
        );
      }
    }
    for (const a of s.adjustments) {
      adjustments.push(`  (${[lit(toUuid(s.id)), a.code, a.value].join(", ")})`);
    }
  }
  return { sections, values, adjustments };
}

const { sections, values, adjustments } = sheetRows(db.sheets);

add(
  "08_measurement_sheets.sql",
  statements(
    `insert into public.measurement_sheets (
  id, customer_id, order_id, measured_at, recorded_by_staff_id, input_method, note
) values`,
    db.sheets.map(
      (s) =>
        `  (${[
          lit(toUuid(s.id)), lit(toUuid(s.customerId)),
          s.orderId ? lit(toUuid(s.orderId)) : "null",
          lit(s.measuredAt), lit(s.recordedByStaffId), lit(s.inputMethod), lit(s.note),
        ].join(", ")})`,
    ),
    `on conflict (id) do nothing;`,
  ),
);

add(
  "09_measurement_sections.sql",
  statements(
    `insert into public.measurement_sections (sheet_id, item_type_id, silhouette, color_number) values`,
    sections,
    `on conflict (sheet_id, item_type_id) do nothing;`,
  ),
);

add(
  "10_measurement_values.sql",
  `-- ここが一番行数が多い。log_change トリガーが 1 行ごとに change_log を書くので、
-- 流すのに時間がかかる（落ちるわけではない）。
` +
    statements(
      `insert into public.measurement_values (sheet_id, item_type_id, field_key, actual, finished) values`,
      values,
      `on conflict (sheet_id, item_type_id, field_key) do nothing;`,
    ),
);

add(
  "11_measurement_adjustments.sql",
  statements(
    `insert into public.measurement_adjustments (sheet_id, code, value) values`,
    adjustments,
    `on conflict (sheet_id, code) do nothing;`,
  ),
);

// ── アプローチの解決 ────────────────────────────────────
add(
  "12_approach_resolutions.sql",
  statements(
    `insert into public.approach_resolutions (
  id, trigger_key, customer_id, trigger_type, reason, status, resolved_at, resolved_by_staff_id
) values`,
    db.approachTasks.map((t) => {
      const owner = staffOf.get(t.customerId);
      return `  (${[
        lit(toUuid(t.id)),
        lit(t.triggerKey.replace(/(ord-[^:]+)/, (m) => toUuid(m))),
        lit(toUuid(t.customerId)), lit(t.triggerType), lit(t.reason), lit(t.status),
        lit(t.resolvedAt), lit(owner),
      ].join(", ")})`;
    }),
    `on conflict (trigger_key) do nothing;`,
  ),
);

// ── 売上目標 ────────────────────────────────────────────
//
// **do update にしない。**本番には北島さんが自分で入れた目標が 12 か月ぶん
// すでにある。生成した数字で上書きすると、人が設定した値を黙って書き換える。
const targets = buildRevenueTargets(db.customers, db.orders);
add(
  "13_revenue_targets.sql",
  `-- 既存の目標が勝つ（do nothing）。人が設定した値を上書きしない。
` +
    statements(
      `insert into public.revenue_targets (staff_id, month, amount) values`,
      targets.map((t) => `  (${[lit(t.staffId), lit(t.month), t.amount].join(", ")})`),
      `on conflict (staff_id, month) do nothing;`,
    ),
);

// ── 削除 ────────────────────────────────────────────────
//
// 顧客 id は決定的なので、その集合を消せば従属行も落ちる（ほとんどが on delete cascade）。
// change_log は customer_id を持っているので一緒に消す。
const customerIds = db.customers.map((c) => toUuid(c.id));
/** values の行。**1 件ずつ括弧で包むこと**（包み忘れて teardown が構文エラーで落ちた） */
const idList = (ids: string[]) =>
  ids.map((id, i) => (i % 4 === 0 ? `\n  (${lit(id)})` : ` (${lit(id)})`)).join(",");

files.push({
  name: "99_teardown.sql",
  body: `-- 自動生成。直接編集しない。
--
-- **本番へ入れた検証用データを消す。店舗に渡す前に必ず流すこと。**
--
--     supabase db query --linked -f supabase/demo/99_teardown.sql
--
-- ## このファイルは git に入れる。作り直さないこと
--
-- 下の id 一覧は **lib/mock/seed.ts が生成した顧客そのもの**で、本番に実際に
-- 入っている行と 1 件ずつ対応している。seed.ts を触ったあとに db:demo-seed を
-- 流し直すと、**一覧が入れ替わって本番の行を指さなくなり、消し漏れる**。
-- 投入したときのものをそのまま残しておくこと。
--
-- 消すのはこの投入で作った顧客 ${db.customers.length} 名と、その従属行だけ。
-- 既存の顧客 9 名（山岸秀匡さん・横川尚隆さんなど手で入れたもの）と、
-- 手で入れた語（カレー・サーフィン・サッカー観戦・ビジネス・ワイン・
-- 保険の営業・野球観戦）には触れない。
--
-- ## なぜ public.delete_customer() を呼ばないのか
--
-- あの関数は app.can_write_customer() で**担当者かどうか**を見る。ここは
-- postgres から流すので auth.uid() が無く、current_staff_id() が NULL になって
-- 42501 で落ちる。担当者を偽装するより、同じ順序を集合演算で書くほうが素直。
--
-- ## 順序は写しであって、思いつきではない
--
-- 20260813190000_drop_order_photos.sql の public.delete_customer() と**同じ順序**。
-- 向こうを直したらこちらも直すこと。要点は 2 つ:
--
--   1. FK に cascade のある表と無い表が混在している。任せると
--      customer_facts / customer_ng_notes / search_chunks で FK 違反になる
--      （実際にここで一度落ちた）
--   2. **measurement_values を票より先に消す。**change_log のトリガーは
--      via_sheet モードで measurement_sheets を引いて customer_id を決めるので、
--      票を先に消すとログの customer_id が NULL になり、最後の掃除から漏れて
--      寸法が残る

begin;

create temporary table demo_customer_ids (id uuid primary key) on commit drop;

insert into demo_customer_ids (id) values${idList(customerIds)};

-- 意味検索の索引 → 事実 → 注意事項。ここは FK が no action
delete from public.search_chunks     where customer_id in (select id from demo_customer_ids);
delete from public.customer_facts    where customer_id in (select id from demo_customer_ids);
delete from public.customer_ng_notes where customer_id in (select id from demo_customer_ids);

-- ★ 採寸値を票より先に（上の 2 を見よ）
delete from public.measurement_values mv
 using public.measurement_sheets ms
 where mv.sheet_id = ms.id and ms.customer_id in (select id from demo_customer_ids);

delete from public.measurement_sections sec
 using public.measurement_sheets ms
 where sec.sheet_id = ms.id and ms.customer_id in (select id from demo_customer_ids);

delete from public.measurement_adjustments adj
 using public.measurement_sheets ms
 where adj.sheet_id = ms.id and ms.customer_id in (select id from demo_customer_ids);

delete from public.measurement_sheets where customer_id in (select id from demo_customer_ids);

delete from public.order_items oi
 using public.orders o
 where oi.order_id = o.id and o.customer_id in (select id from demo_customer_ids);

delete from public.orders                 where customer_id in (select id from demo_customer_ids);
delete from public.approach_resolutions   where customer_id in (select id from demo_customer_ids);
delete from public.customer_anniversaries where customer_id in (select id from demo_customer_ids);
delete from public.customers              where id          in (select id from demo_customer_ids);

-- 会話。agent_messages は顧客への FK を持たないが、action jsonb に
-- AgentCustomerRef（id と氏名）が入る。uuid の一致で十分に絞れる
delete from public.agent_messages m
 where exists (
   select 1 from demo_customer_ids d where m.action::text like '%' || d.id::text || '%'
 );

-- 監査ログ。ここまでの delete が DELETE 行を積んでおり、customers のぶんは
-- before に氏名・電話・住所が丸ごと入っている。**最後に消す**
delete from public.change_log where customer_id in (select id from demo_customer_ids);

-- 消え残りが無いか数える。**すべて 0 でなければ commit しないこと**
select
  (select count(*) from public.customers c      join demo_customer_ids d on d.id = c.id)          as customers,
  (select count(*) from public.orders o         join demo_customer_ids d on d.id = o.customer_id) as orders,
  (select count(*) from public.customer_facts f join demo_customer_ids d on d.id = f.customer_id) as facts,
  (select count(*) from public.change_log g     join demo_customer_ids d on d.id = g.customer_id) as change_log;

commit;
`,
});

mkdirSync(OUT_DIR, { recursive: true });
for (const f of files) writeFileSync(new URL(f.name, OUT_DIR), f.body);

const kb = (s: string) => Math.round(Buffer.byteLength(s) / 1024);
console.log("supabase/demo/ に書き出しました:\n");
for (const f of files) console.log(`  ${f.name.padEnd(30)} ${String(kb(f.body)).padStart(5)} KB`);
console.log(
  `\n  顧客 ${db.customers.length}（下平 ${db.customers.filter((c) => c.staffId === SHIMODAIRA).length} / ` +
    `北島 ${db.customers.filter((c) => c.staffId === KITAJIMA).length}）` +
    `\n  語 ${labels.size} / パーソナル ${db.facts.length} / 注意事項 ${db.ngNotes.length}` +
    `\n  記念日 ${db.anniversaries.length}（誕生日 ${db.customers.filter((c) => c.birthDate).length} 件はトリガーが別に作る）` +
    `\n  注文 ${db.orders.length} / 明細 ${db.orderItems.length}` +
    `\n  採寸票 ${db.sheets.length} / 測定値 ${values.length}` +
    `\n  アプローチ解決 ${db.approachTasks.length} / 売上目標 ${targets.length}`,
);
