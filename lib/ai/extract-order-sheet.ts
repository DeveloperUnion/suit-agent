import type { ItemTypeId } from "@/lib/types";
import { postExtraction, type ExtractedField, type ExtractionMeta } from "@/lib/ai/extraction";

/**
 * 工場発注書の読み取り。
 *
 * 紙にはすでに寸法・補正・生地・日付・備考が全部書かれているのに、
 * アプリへは同じ内容を打ち直している。ここを埋めるのが目的。
 *
 * 重要: この紙には上がり寸しか載らない。実寸は書かれていないので、
 * finished だけを返す。実寸の割り戻しは lib/constants/measurement-ease.ts を参照。
 *
 * 実際に読むのは app/api/extract/order-sheet（Gemini）。ここは呼ぶだけにして、
 * モデルや事業者を替えても画面側が動かないようにしている。
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
  /** 納品日。工場から店に届く日 */
  arrivedAt?: ExtractedField;
  /** お渡し日。店から顧客へ渡す日。紙にはまず書かれていない */
  handoverDate?: ExtractedField;
  shopName?: ExtractedField;
  fitterName?: ExtractedField;
  /** 原反NO */
  fabricProductNumber?: ExtractedField;
  /** 色番。生地の色番で、C# とは別物 */
  fabricColorNumber?: ExtractedField;
  /** 生地貼付欄の色名。例: カーキ無地 */
  fabricColorName?: ExtractedField;
  /** 品質表示欄の組成 */
  fabricComposition?: ExtractedField;
  liningCode?: ExtractedField;
  /*
   * 金額は読まない。紙の右上に金額欄はあるが、実運用では空欄のまま流れていて、
   * 読ませても「空欄でした」としか言えなかった。売上は取り込んだあと
   * 注文カードで人が入れる。
   */
  sections: OrderSheetSection[];
  adjustments: OrderSheetAdjustment[];
  note?: ExtractedField;
};

export async function extractOrderSheet(file: File): Promise<OrderSheetExtraction> {
  return postExtraction<OrderSheetExtraction>("/api/extract/order-sheet", file);
}
