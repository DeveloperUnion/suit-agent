/**
 * マスタの SQL を lib/constants から生成する。
 *
 * 正はコード定数のほう。DB はミラーであって、DB 側で直したものは次の生成で
 * 消える。型定義の「紙の帳票と製造側の都合で決まっており店舗が変えるもの
 * ではない」という判断に従い、設定ではなくデプロイ成果物として扱う。
 *
 * 生成物は冪等（on conflict do update）なので、デプロイのたびに流してよい。
 *   ローカル: supabase/seed.sql が \ir で読む
 *   本番    : psql "$DATABASE_URL" -f supabase/masters.sql
 *
 * 実行:  npm run db:masters
 * 検査:  npm run db:masters:check   （生成し直して差分が無いこと。CI で回す）
 */

import { writeFileSync } from "node:fs";
import { ITEM_TYPES, MEASUREMENT_FIELDS } from "@/lib/constants/measurement-fields";
import { ADJUSTMENT_MASTERS } from "@/lib/constants/adjustments";
import { FACT_CATEGORIES } from "@/lib/constants/facts";

const OUT = new URL("../supabase/masters.sql", import.meta.url);

/** SQL のリテラルにする。null と文字列だけ扱えれば足りる */
function lit(v: string | number | boolean | undefined | null): string {
  if (v === undefined || v === null) return "null";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return `'${v.replace(/'/g, "''")}'`;
}

const rows = (values: string[]) => values.join(",\n  ");

const sql = `-- 自動生成。直接編集しない。
-- 正は lib/constants/ の measurement-fields.ts / adjustments.ts / facts.ts。
-- 直すときはそちらを編集して \`npm run db:masters\` を実行する。
--
-- 冪等なので何度流してもよい。delete は書かない — 使われている項目を
-- 消すと measurement_values の FK が壊れるため、廃止は人が判断する。

begin;

insert into public.item_types (id, name, sheet_label, body_part, requires_measurement, display_order)
values
  ${rows(
    ITEM_TYPES.map(
      (t, i) =>
        `(${lit(t.id)}, ${lit(t.name)}, ${lit(t.sheetLabel)}, ${lit(t.bodyPart)}, ${lit(t.requiresMeasurement)}, ${i + 1})`,
    ),
  )}
on conflict (id) do update set
  name = excluded.name,
  sheet_label = excluded.sheet_label,
  body_part = excluded.body_part,
  requires_measurement = excluded.requires_measurement,
  display_order = excluded.display_order;

insert into public.measurement_fields (item_type_id, key, label, unit, body_part, has_actual, has_finished, display_order)
values
  ${rows(
    MEASUREMENT_FIELDS.map(
      (f) =>
        `(${lit(f.itemTypeId)}, ${lit(f.key)}, ${lit(f.label)}, ${lit(f.unit)}, ${lit(f.bodyPart)}, ${lit(f.hasActual)}, ${lit(f.hasFinished)}, ${f.displayOrder})`,
    ),
  )}
on conflict (item_type_id, key) do update set
  label = excluded.label,
  unit = excluded.unit,
  body_part = excluded.body_part,
  has_actual = excluded.has_actual,
  has_finished = excluded.has_finished,
  display_order = excluded.display_order;

insert into public.adjustment_masters (code, name, strength, default_value, body_part)
values
  ${rows(
    ADJUSTMENT_MASTERS.map(
      (a) =>
        `(${a.code}, ${lit(a.name)}, ${lit(a.strength)}, ${a.defaultValue}, ${lit(a.bodyPart)})`,
    ),
  )}
on conflict (code) do update set
  name = excluded.name,
  strength = excluded.strength,
  default_value = excluded.default_value,
  body_part = excluded.body_part;

insert into public.fact_categories (key, label, sort_order)
values
  ${rows(FACT_CATEGORIES.map((c, i) => `(${lit(c.key)}, ${lit(c.label)}, ${i + 1})`))}
on conflict (key) do update set
  label = excluded.label,
  sort_order = excluded.sort_order;

commit;
`;

writeFileSync(OUT, sql);
console.log(
  `supabase/masters.sql を生成しました: ` +
    `item_types ${ITEM_TYPES.length} / measurement_fields ${MEASUREMENT_FIELDS.length} / ` +
    `adjustment_masters ${ADJUSTMENT_MASTERS.length} / fact_categories ${FACT_CATEGORIES.length}`,
);
