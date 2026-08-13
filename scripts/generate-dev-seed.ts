/**
 * モックのシードを DB のシードへ変換する。
 *
 * lib/mock/seed.ts は mulberry32(20260804) で決定的なので、何度実行しても
 * 同じデータが出る。壁打ち中に見ていた顧客がそのまま DB に載る。
 *
 * ID の変換がこの script の本体。モックは "staff-1" / "cust-xxxx" のような
 * 文字列 ID を使っており、DB は uuid。全モジュールが同時に DB を向く以上、
 * 変換は決定的でなければならない（実行のたびに ID が変わると、
 * db reset のたびに URL が死ぬ）。
 *
 * 実行: npm run db:dev-seed
 */

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createSeedDatabase } from "@/lib/mock/seed";
import type { MeasurementSheet } from "@/lib/types";

const OUT = new URL("../supabase/dev-seed.sql", import.meta.url);

/**
 * モックの ID を決定的な uuid v5 風の値へ写す。
 * 同じ入力なら常に同じ uuid になるので、db reset をまたいで URL が生き残る。
 */
function toUuid(mockId: string): string {
  const h = createHash("sha1").update(`suit-agent:${mockId}`).digest("hex");
  // version 5 / variant 10xx に整える
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

const db = createSeedDatabase();

/**
 * スタッフだけは sha1 で変換しない。supabase/seed.sql が auth.users と
 * 一緒に固定 uuid で作っているので、そちらに合わせる
 * （auth と staff の対応を 2 箇所で決めると必ずずれる）。
 *
 * ここで要るのは staff.id であって auth_user_id ではない。
 * customers.staff_id が参照するのは前者。
 */
const STAFF_UUID: Record<string, string> = {
  "staff-1": "5ea55000-0000-4000-8000-000000000001",
  "staff-2": "5ea55000-0000-4000-8000-000000000002",
  "staff-3": "5ea55000-0000-4000-8000-000000000003",
};
const staffId = (id: string) => STAFF_UUID[id] ?? toUuid(id);

const lines: string[] = [];
const push = (s: string) => lines.push(s);

push(`-- 自動生成。直接編集しない。`);
push(`-- 正は lib/mock/seed.ts。直すときはそちらを編集して \`npm run db:dev-seed\`。`);
push(`--`);
push(`-- ローカル開発用。本番では流さない（config.toml の sql_paths を見よ）。`);
push(`-- ID は sha1 由来の決定的な uuid なので、db reset をまたいでも URL が生きる。`);
push(``);
push(`begin;`);
push(``);

// ── 顧客 ──
push(`insert into public.customers (`);
push(`  id, name, name_kana, birth_date, gender, phone, email, address,`);
push(`  residence_prefecture, embroidery_name,`);
push(`  company_name, department, job_title, industry,`);
push(`  family_info,`);
push(`  staff_id, created_at`);
push(`) values`);
push(
  db.customers
    .map((c) =>
      `  (${[
        lit(toUuid(c.id)), lit(c.name), lit(c.nameKana), lit(c.birthDate), lit(c.gender),
        lit(c.phone), lit(c.email), lit(c.address), lit(c.residencePrefecture),
        lit(c.embroideryName),
        lit(c.companyName), lit(c.department), lit(c.jobTitle), lit(c.industry),
        lit(c.familyInfo),
        lit(staffId(c.staffId)), lit(c.createdAt),
      ].join(", ")})`,
    )
    .join(",\n"),
);
push(`on conflict (id) do nothing;`);
push(``);

// ── パーソナルとメモ ──
//
// ラベルは店舗で共通なので、全顧客ぶんを畳んでから 1 回で入れる。
// id はラベル名から決まる（同じ語なら常に同じ uuid）ので、
// customer_facts 側は名前を引き直さずに参照できる。
const labels = new Map<string, { name: string; categoryKey: string }>();
for (const f of db.facts) {
  if (f.label) labels.set(f.label.name, { name: f.label.name, categoryKey: f.label.categoryKey });
}
if (labels.size > 0) {
  push(`insert into public.fact_labels (id, name, category_key) values`);
  push(
    [...labels.values()]
      .map((l) => `  (${lit(toUuid(`label-${l.name}`))}, ${lit(l.name)}, ${lit(l.categoryKey)})`)
      .join(",\n"),
  );
  push(`on conflict (id) do nothing;`);
  push(``);
}

if (db.facts.length > 0) {
  push(`-- label_id が null の行は「まだラベルの付いていない走り書き」。`);
  push(`-- 移行元が自由記述だったものはこちらへ落ちる。`);
  push(`insert into public.customer_facts (id, customer_id, label_id, body, source, created_by_staff_id, created_at) values`);
  push(
    db.facts
      .map((f) => {
        const owner = db.customers.find((c) => c.id === f.customerId)!;
        return `  (${[
          lit(toUuid(f.id)),
          lit(toUuid(f.customerId)),
          f.label ? lit(toUuid(`label-${f.label.name}`)) : "null",
          lit(f.body),
          lit(f.source),
          lit(staffId(owner.staffId)),
          lit(f.createdAt),
        ].join(", ")})`;
      })
      .join(",\n"),
  );
  push(`on conflict (id) do nothing;`);
  push(``);
}

if (db.ngNotes.length > 0) {
  push(`insert into public.customer_ng_notes (id, customer_id, body, created_by_staff_id, created_at) values`);
  push(
    db.ngNotes
      .map((n) => {
        const owner = db.customers.find((c) => c.id === n.customerId)!;
        return `  (${[
          lit(toUuid(n.id)),
          lit(toUuid(n.customerId)),
          lit(n.body),
          lit(staffId(owner.staffId)),
          lit(n.createdAt),
        ].join(", ")})`;
      })
      .join(",\n"),
  );
  push(`on conflict (id) do nothing;`);
  push(``);
}

// ── 記念日 ──
// モックの `anv-{customerId}-{i}` は位置由来なので、ここで決定的な uuid に写す。
// 位置由来のままだと、記念日を 1 つ消したとき後続が繰り上がって
// approach_resolutions.trigger_key と衝突する。
if (db.anniversaries.length > 0) {
  push(`insert into public.customer_anniversaries (id, customer_id, type, date, label) values`);
  push(
    db.anniversaries
      .map((a) =>
        `  (${[lit(toUuid(a.id)), lit(toUuid(a.customerId)), lit(a.type), lit(a.date), lit(a.label ?? "")].join(", ")})`,
      )
      .join(",\n"),
  );
  push(`on conflict (id) do nothing;`);
  push(``);
}

// ── 注文 ──
// 生地は order_items から orders へ移した（紙が原反ＮＯ を 1 つしか持たないため）。
// モックのデータは明細ごとに同じ値が入っているので、先頭を代表として採る。
if (db.orders.length > 0) {
  push(`insert into public.orders (`);
  push(`  id, customer_id, order_number, ordered_at, arrived_at, delivered_at, status, purpose,`);
  push(`  fabric_product_number, fabric_color_number, fabric_color_name, fabric_composition,`);
  // 内訳は任意なので、入っていない区分は null で出す（lit が undefined を null にする）
  push(`  total_amount, amount_suit, amount_coat, amount_accessory, amount_shirt,`);
  push(`  taken_by_staff_id`);
  push(`) values`);
  push(
    db.orders
      .map(
        (o) =>
          `  (${[
            lit(toUuid(o.id)), lit(toUuid(o.customerId)), lit(o.orderNumber), lit(o.orderedAt),
            lit(o.arrivedAt), lit(o.deliveredAt), lit(o.status), lit(o.purpose),
            lit(o.fabricProductNumber), lit(o.fabricColorNumber),
            lit(o.fabricColorName), lit(o.fabricComposition),
            o.totalAmount,
            lit(o.amountSuit), lit(o.amountCoat),
            lit(o.amountAccessory), lit(o.amountShirt),
            lit(staffId(o.takenByStaffId)),
          ].join(", ")})`,
      )
      .join(",\n"),
  );
  push(`on conflict (id) do nothing;`);
  push(``);

  push(`insert into public.order_items (id, order_id, item_type_id) values`);
  push(
    db.orderItems
      .map((i) => `  (${[lit(toUuid(i.id)), lit(toUuid(i.orderId)), lit(i.itemTypeId)].join(", ")})`)
      .join(",\n"),
  );
  push(`on conflict (id) do nothing;`);
  push(``);
}

// ── 採寸 ──
// Record<fieldKey, {actual, finished}> の縦持ちへの展開がここで起きる。
// 存在しない項目名は FK が弾くので、モック側の綴り誤りはここで落ちる
// （落ちてくれるのが正しい）。
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

if (db.measurementSheets.length > 0) {
  push(`insert into public.measurement_sheets (`);
  push(`  id, customer_id, order_id, measured_at, recorded_by_staff_id, input_method, note`);
  push(`) values`);
  push(
    db.measurementSheets
      .map((s) =>
        `  (${[
          lit(toUuid(s.id)), lit(toUuid(s.customerId)),
          s.orderId ? lit(toUuid(s.orderId)) : "null",
          lit(s.measuredAt), lit(staffId(s.recordedByStaffId)), lit(s.inputMethod), lit(s.note),
        ].join(", ")})`,
      )
      .join(",\n"),
  );
  push(`on conflict (id) do nothing;`);
  push(``);

  const { sections, values, adjustments } = sheetRows(db.measurementSheets);
  if (sections.length) {
    push(`insert into public.measurement_sections (sheet_id, item_type_id, silhouette, color_number) values`);
    push(sections.join(",\n"));
    push(`on conflict (sheet_id, item_type_id) do nothing;`);
    push(``);
  }
  if (values.length) {
    push(`insert into public.measurement_values (sheet_id, item_type_id, field_key, actual, finished) values`);
    push(values.join(",\n"));
    push(`on conflict (sheet_id, item_type_id, field_key) do nothing;`);
    push(``);
  }
  if (adjustments.length) {
    push(`insert into public.measurement_adjustments (sheet_id, code, value) values`);
    push(adjustments.join(",\n"));
    push(`on conflict (sheet_id, code) do nothing;`);
    push(``);
  }
}

// ── アプローチの解決 ──
// モックの id は `apt-{triggerKey}` だが、DB では trigger_key の unique が
// 冪等性の本体なので id は uuid にする。
if (db.approachTasks.length > 0) {
  push(`insert into public.approach_resolutions (`);
  push(`  id, trigger_key, customer_id, trigger_type, reason, status, resolved_at, resolved_by_staff_id`);
  push(`) values`);
  push(
    db.approachTasks
      .map((t) => {
        const c = db.customers.find((x) => x.id === t.customerId);
        return `  (${[
          lit(toUuid(t.id)), lit(t.triggerKey.replace(/(ord-[^:]+)/, (m) => toUuid(m))),
          lit(toUuid(t.customerId)), lit(t.triggerType), lit(t.reason), lit(t.status),
          lit(t.resolvedAt), lit(staffId(c?.staffId ?? "staff-1")),
        ].join(", ")})`;
      })
      .join(",\n"),
  );
  push(`on conflict (trigger_key) do nothing;`);
  push(``);
}

// ── 売上目標 ──
if (db.revenueTargets.length > 0) {
  push(`insert into public.revenue_targets (staff_id, month, amount) values`);
  push(
    db.revenueTargets
      .map((t) => `  (${[lit(staffId(t.staffId)), lit(t.month), t.amount].join(", ")})`)
      .join(",\n"),
  );
  push(`on conflict (staff_id, month) do update set amount = excluded.amount;`);
  push(``);
}

push(`commit;`);
push(``);

writeFileSync(OUT, lines.join("\n"));

console.log(
  `supabase/dev-seed.sql を生成しました:\n` +
    `  顧客 ${db.customers.length} / 記念日 ${db.anniversaries.length}\n` +
    `  パーソナル ${db.facts.length}（うちラベル無し ${db.facts.filter((f) => !f.label).length}）` +
    ` / NG ${db.ngNotes.length}\n` +
    `  注文 ${db.orders.length} / 明細 ${db.orderItems.length} / 採寸票 ${db.measurementSheets.length}\n` +
    `  アプローチ解決 ${db.approachTasks.length} / 売上目標 ${db.revenueTargets.length}`,
);
