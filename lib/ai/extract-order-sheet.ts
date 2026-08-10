import type { ItemTypeId } from "@/lib/types";
import {
  field,
  fixtureIndex,
  simulateLatency,
  type ExtractedField,
  type ExtractionMeta,
} from "@/lib/ai/extraction";

/**
 * 工場発注書の読み取り。
 *
 * 紙にはすでに寸法・補正・生地・日付・備考が全部書かれているのに、
 * アプリへは同じ内容を打ち直している。ここを埋めるのが目的。
 *
 * 重要: この紙には上がり寸しか載らない。実寸は書かれていないので、
 * finished だけを返す。実寸の割り戻しは lib/constants/measurement-ease.ts を参照。
 *
 * 中身は固定のフィクスチャを返すスタブ。実 API に差し替えるときは
 * この関数の本体だけを置き換えればよいよう、シグネチャを実装後の形にしてある。
 */

export type OrderSheetSection = {
  itemTypeId: ItemTypeId;
  /** シルエット記号（NB / AG / DA） */
  silhouette?: ExtractedField;
  /** C#。アイテムごとの型番で、生地の色番とは別物 */
  colorNumber?: ExtractedField;
  /** key は MeasurementField.key。紙は上がり寸しか持たない */
  finished: Record<string, ExtractedField<number>>;
};

export type OrderSheetAdjustment = {
  code: ExtractedField<number>;
  value?: ExtractedField<number>;
  /** 紙に書かれていた補正名。マスタに無いコードを人が判断できるように残す */
  rawLabel: string;
};

export type OrderSheetExtraction = ExtractionMeta & {
  customerName?: ExtractedField;
  customerNameKana?: ExtractedField;
  /** ネーム刺繍 */
  embroideryName?: ExtractedField;
  /** 受注日 */
  orderedAt?: ExtractedField;
  /** 納品日。工場→店の納期であって、顧客へのお渡しではない */
  factoryDueDate?: ExtractedField;
  /** お渡し日。こちらが顧客への納品にあたる */
  handoverDate?: ExtractedField;
  shopName?: ExtractedField;
  fitterName?: ExtractedField;
  /** 原反NO */
  fabricProductNumber?: ExtractedField;
  /** 色番。生地の色番で、C# とは別物 */
  fabricColorNumber?: ExtractedField;
  liningCode?: ExtractedField;
  /** 合計金額。多くの紙では空欄 */
  totalAmount?: ExtractedField<number>;
  sections: OrderSheetSection[];
  adjustments: OrderSheetAdjustment[];
  note?: ExtractedField;
};

/**
 * フィクスチャ 0 — 実物の発注書をそのまま写したもの。
 * 袖丈左と裾巾の確信度を落としてあるのは、手書きの小数がまさに実 OCR の外すところで、
 * 主デモで「要確認」の見え方が必ず動くようにするため。
 */
const REAL_SHEET: Omit<OrderSheetExtraction, keyof ExtractionMeta> = {
  customerName: field("城 知広", 0.93),
  customerNameKana: field("ジョウ チヒロ", 0.88),
  embroideryName: field("マシャ", 0.9),
  orderedAt: field("2025-12-19", 0.94, "251219"),
  factoryDueDate: field("2026-02-02", 0.94, "260202"),
  shopName: field("TORICO"),
  fitterName: field("タカヤマ", 0.86),
  fabricProductNumber: field("AC5601", 0.92),
  fabricColorNumber: field("3330", 0.87),
  liningCode: field("Y", 0.8),
  sections: [
    {
      itemTypeId: "jacket",
      silhouette: field("NB", 0.9),
      colorNumber: field("11", 0.88),
      finished: {
        bust: field(102, 0.93),
        jacket_length: field(72, 0.94),
        shoulder_width: field(47.5, 0.88),
        ef_half_chest: field(48, 0.91),
        sleeve_right: field(61, 0.92),
        sleeve_left: field(60.5, 0.55),
        collar_width: field(9, 0.9),
      },
    },
    {
      itemTypeId: "pants",
      silhouette: field("AG", 0.9),
      colorNumber: field("12", 0.88),
      finished: {
        waist: field(86, 0.93),
        hip: field(100, 0.92),
        thigh_width: field(33, 0.9),
        knee_width: field(23, 0.89),
        hem_width: field(17, 0.61),
        rise: field(26, 0.9),
        inseam: field(68, 0.92),
      },
    },
    {
      itemTypeId: "vest",
      silhouette: field("DA", 0.89),
      colorNumber: field("11", 0.87),
      finished: {
        bust: field(99, 0.91),
        vest_length: field(56.5, 0.87),
        ef_half_chest: field(46.5, 0.86),
      },
    },
  ],
  adjustments: [
    { code: field(15, 0.9), value: field(0.5, 0.86), rawLabel: "衿ミツ入れ" },
    { code: field(28, 0.87), rawLabel: "鎌浅く" },
    { code: field(39, 0.85), rawLabel: "背巾出し" },
    { code: field(32, 0.83), rawLabel: "脇尾錠(帯上)" },
  ],
  note: field(
    "刺繍縦書き・サスペンダーボタン前2箇所(釦4つ)後ろ1箇所(釦2つ)",
    0.82,
  ),
};

/** フィクスチャ 1 — きれいな1枚。シードの顧客と一致し、お渡し日まで埋まっている */
const CLEAN_SHEET: Omit<OrderSheetExtraction, keyof ExtractionMeta> = {
  customerName: field("時枝 正"),
  customerNameKana: field("トキエダ タダシ", 0.92),
  embroideryName: field("T.TOKIEDA", 0.9),
  orderedAt: field("2026-05-11", 0.95, "260511"),
  factoryDueDate: field("2026-06-24", 0.94, "260624"),
  handoverDate: field("2026-06-28", 0.92, "260628"),
  shopName: field("TORICO"),
  fitterName: field("ホソカワ", 0.9),
  fabricProductNumber: field("CE-7712", 0.93),
  fabricColorNumber: field("2140", 0.9),
  liningCode: field("N", 0.85),
  totalAmount: field(140000, 0.88, "140,000"),
  sections: [
    {
      itemTypeId: "jacket",
      silhouette: field("NB"),
      colorNumber: field("11", 0.9),
      finished: {
        bust: field(104),
        jacket_length: field(73),
        shoulder_width: field(46),
        ef_half_chest: field(52),
        sleeve_right: field(59.5),
        sleeve_left: field(59.5),
        collar_width: field(8),
      },
    },
    {
      itemTypeId: "pants",
      silhouette: field("AG"),
      colorNumber: field("12", 0.9),
      finished: {
        waist: field(88),
        hip: field(102),
        thigh_width: field(34),
        knee_width: field(23.5),
        hem_width: field(18),
        rise: field(25.5),
        inseam: field(66),
      },
    },
  ],
  adjustments: [
    { code: field(18), value: field(0.7), rawLabel: "猫背" },
    { code: field(26), value: field(1.0), rawLabel: "前肩(弱)" },
  ],
  note: field("内ポケットにイニシャル刺繍"),
};

const FIXTURES = [REAL_SHEET, CLEAN_SHEET];
/** デモでファイル名を狙って当てるためのキーワード。並びは FIXTURES と対応する */
const FIXTURE_KEYWORDS = ["jo", "tokieda"];

export async function extractOrderSheet(file: File): Promise<OrderSheetExtraction> {
  const startedAt = performance.now();
  await simulateLatency(1200);
  return {
    source: "stub",
    elapsedMs: Math.round(performance.now() - startedAt),
    ...FIXTURES[fixtureIndex(file, FIXTURES.length, FIXTURE_KEYWORDS)],
  };
}
