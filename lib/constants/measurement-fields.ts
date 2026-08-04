import type { ItemType, ItemTypeId, MeasurementField } from "@/lib/types";

/**
 * 採寸項目定義
 *
 * docs/採寸データ.jpg の左列をそのまま項目定義に落としたもの。
 * 画面はこのマスタを引いて描画し、項目をハードコードしない
 * （アイテム種別を追加してもスキーマ変更が不要になる）。
 *
 * silhouettePoint は人体シルエット上の相対座標（0–100）。
 */

export const ITEM_TYPES: ItemType[] = [
  { id: "jacket", name: "ジャケット", sheetLabel: "JACKET", bodyPart: "upper", requiresMeasurement: true },
  { id: "pants", name: "パンツ", sheetLabel: "PANTS", bodyPart: "lower", requiresMeasurement: true },
  { id: "vest", name: "ベスト", sheetLabel: "VEST", bodyPart: "upper", requiresMeasurement: true },
  { id: "shirt", name: "シャツ", sheetLabel: "SHIRT", bodyPart: "upper", requiresMeasurement: true },
  { id: "coat", name: "コート", sheetLabel: "COAT", bodyPart: "upper", requiresMeasurement: true },
];

export const ITEM_TYPE_MAP: Record<ItemTypeId, ItemType> = Object.fromEntries(
  ITEM_TYPES.map((t) => [t.id, t]),
) as Record<ItemTypeId, ItemType>;

const f = (
  itemTypeId: ItemTypeId,
  key: string,
  label: string,
  displayOrder: number,
  opts: {
    actual?: boolean;
    finished?: boolean;
    point?: { x: number; y: number };
  } = {},
): MeasurementField => ({
  key,
  itemTypeId,
  label,
  unit: "cm",
  bodyPart: ITEM_TYPE_MAP[itemTypeId].bodyPart,
  hasActual: opts.actual ?? true,
  hasFinished: opts.finished ?? true,
  displayOrder,
  silhouettePoint: opts.point,
});

export const MEASUREMENT_FIELDS: MeasurementField[] = [
  // ── JACKET（紙の順序を保つ） ──
  f("jacket", "total_length", "総丈", 1, { point: { x: 24, y: 30 } }),
  f("jacket", "bust", "バスト", 2, { point: { x: 50, y: 25 } }),
  // TODO: 実寸「17.5」は項目名の読み違いの可能性あり。上がり寸 68 は妥当
  f("jacket", "jacket_length", "上衣丈", 3, { point: { x: 76, y: 33 } }),
  f("jacket", "shoulder_width", "肩巾", 4, { point: { x: 50, y: 19 } }),
  f("jacket", "ef_half_chest", "EF(半胸)", 5, { point: { x: 50, y: 29 } }),
  f("jacket", "sleeve_right", "袖丈右", 6, { point: { x: 25, y: 40 } }),
  f("jacket", "sleeve_left", "袖丈左", 7, { point: { x: 75, y: 40 } }),
  f("jacket", "collar_width", "衿巾", 8, { actual: false, point: { x: 50, y: 14 } }),
  f("jacket", "vent_length", "ベント又", 9, { actual: false, point: { x: 50, y: 45 } }),

  // ── PANTS ──
  f("pants", "waist", "ウエスト", 1, { point: { x: 50, y: 37 } }),
  f("pants", "hip", "ヒップ", 2, { point: { x: 50, y: 46 } }),
  f("pants", "thigh_width", "渡り巾", 3, { point: { x: 40, y: 53 } }),
  f("pants", "knee_width", "ヒザ巾", 4, { point: { x: 40, y: 67 } }),
  f("pants", "hem_width", "裾巾", 5, { actual: false, point: { x: 40, y: 90 } }),
  f("pants", "rise", "股上", 6, { point: { x: 59, y: 48 } }),
  f("pants", "inseam", "股下", 7, { point: { x: 61, y: 70 } }),

  // ── VEST ──
  f("vest", "bust", "バスト", 1, { point: { x: 50, y: 25 } }),
  f("vest", "vest_length", "ベスト丈", 2, { point: { x: 64, y: 34 } }),
  f("vest", "ef_half_chest", "EF(半胸)", 3, { point: { x: 50, y: 29 } }),

  // ── SHIRT（紙には無いため 要件定義書 4.2 B-3 の表から） ──
  f("shirt", "neck", "首回り", 1, { point: { x: 50, y: 14 } }),
  f("shirt", "shoulder_width", "肩幅", 2, { point: { x: 50, y: 17 } }),
  f("shirt", "bust", "胸囲", 3, { point: { x: 50, y: 25 } }),
  f("shirt", "waist", "胴囲", 4, { point: { x: 50, y: 33 } }),
  f("shirt", "hem", "裾囲", 5, { point: { x: 50, y: 40 } }),
  f("shirt", "yuki", "裄丈", 6, { point: { x: 28, y: 36 } }),
  f("shirt", "cuff", "袖口", 7, { actual: false, point: { x: 24, y: 48 } }),
  f("shirt", "shirt_length", "着丈", 8, { point: { x: 74, y: 33 } }),

  // ── COAT ──
  f("coat", "coat_length", "着丈", 1, { point: { x: 74, y: 40 } }),
  f("coat", "shoulder_width", "肩幅", 2, { point: { x: 50, y: 17 } }),
  f("coat", "bust", "胸囲", 3, { point: { x: 50, y: 25 } }),
  f("coat", "waist", "胴囲", 4, { point: { x: 50, y: 33 } }),
  f("coat", "hem", "裾囲", 5, { point: { x: 50, y: 44 } }),
  f("coat", "sleeve", "袖丈", 6, { point: { x: 26, y: 40 } }),
];

export function fieldsForItemType(itemTypeId: ItemTypeId): MeasurementField[] {
  return MEASUREMENT_FIELDS.filter((field) => field.itemTypeId === itemTypeId).sort(
    (a, b) => a.displayOrder - b.displayOrder,
  );
}

export function findField(itemTypeId: ItemTypeId, key: string): MeasurementField | undefined {
  return MEASUREMENT_FIELDS.find((field) => field.itemTypeId === itemTypeId && field.key === key);
}
