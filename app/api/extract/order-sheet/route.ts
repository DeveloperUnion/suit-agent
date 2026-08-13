import {
  CONFIDENCE_RULE,
  EXTRACTION_MODEL,
  ExtractionError,
  extractedString,
  OMIT_RULE,
  runExtraction,
} from "@/lib/ai/gemini";
import { errorResponse, requireStaff } from "@/lib/api/auth";
import { ADJUSTMENT_MASTERS, adjustmentLabel } from "@/lib/constants/adjustments";
import { ITEM_TYPES, fieldsForItemType } from "@/lib/constants/measurement-fields";
import type { OrderSheetExtraction } from "@/lib/ai/extract-order-sheet";
import type { ExtractedField, ExtractionUsage } from "@/lib/ai/extraction";
import type { ItemTypeId } from "@/lib/types";

/**
 * 工場発注書の読み取り。
 *
 * 紙にはすでに寸法・補正・生地・日付・備考が全部書かれているのに、
 * アプリへは同じ内容を打ち直している。ここを埋めるのが目的。
 *
 * 読み取った結果をそのまま保存はしない。返すのは確認画面の材料までで、
 * 書き込みは lib/data/order-sheet-import.ts の commitOrderSheetImport でしか起きない。
 */

/** モデルが返す形。ExtractedField の入れ子を浅くして、読み違いの余地を減らす */
type RawValue = { fieldKey: string; value: number; confidence: number; raw?: string };
type RawSection = {
  itemTypeId: ItemTypeId;
  silhouette?: ExtractedField;
  colorNumber?: ExtractedField;
  values?: RawValue[];
};
type RawAdjustment = {
  code: number;
  codeConfidence: number;
  value?: number;
  valueConfidence?: number;
  rawLabel: string;
};
type RawExtraction = Omit<
  OrderSheetExtraction,
  "source" | "elapsedMs" | "usage" | "sections" | "adjustments"
> & {
  sections?: RawSection[];
  adjustments?: RawAdjustment[];
};

const ITEM_TYPE_IDS = ITEM_TYPES.map((t) => t.id);
/** 採寸項目に無いキーを作られると確認画面に出せないので、enum で閉じる */
const FIELD_KEYS = [...new Set(ITEM_TYPES.flatMap((t) => fieldsForItemType(t.id).map((f) => f.key)))];
const ADJUSTMENT_CODES = ADJUSTMENT_MASTERS.map((a) => a.code);

const SCHEMA = {
  type: "object",
  properties: {
    customerName: extractedString("お客様名。姓と名の間は半角スペース1つ"),
    customerNameKana: extractedString("フリガナ欄。カタカナのまま"),
    embroideryName: extractedString("ネーム欄（漢字・筆記体・花文字）に書かれた刺繍名"),
    orderedAt: extractedString("受注日。YYYY-MM-DD 形式"),
    arrivedAt: extractedString("納品日（工場→店）。YYYY-MM-DD 形式"),
    handoverDate: extractedString("お渡し日（店→お客様）。YYYY-MM-DD 形式。空欄なら省略する"),
    shopName: extractedString("販売店"),
    fitterName: extractedString("フィッター"),
    fabricProductNumber: extractedString("原反NO1（品番）"),
    fabricColorNumber: extractedString("原反NO1 の右にある在庫区分／要M の番号"),
    fabricColorName: extractedString("生地貼付欄の色名。例: カーキ無地"),
    fabricComposition: extractedString("品質表示欄の組成。例: N(ナイロン) 92% / U(ポリウレタン) 8%"),
    liningCode: extractedString("裏地欄の記号"),
    sections: {
      type: "array",
      description: "JACKET / PANTS / VEST など、紙にある採寸ブロックごとに1つ",
      items: {
        type: "object",
        properties: {
          itemTypeId: { type: "string", enum: ITEM_TYPE_IDS },
          silhouette: extractedString("シルエット記号。例: NB / AG / DA"),
          colorNumber: extractedString("C# の値"),
          values: {
            type: "array",
            items: {
              type: "object",
              properties: {
                fieldKey: { type: "string", enum: FIELD_KEYS },
                value: { type: "number", description: "上がり寸（cm）" },
                confidence: { type: "number" },
                raw: { type: "string" },
              },
              required: ["fieldKey", "value", "confidence"],
            },
          },
        },
        required: ["itemTypeId", "values"],
      },
    },
    adjustments: {
      type: "array",
      description: "補正内容欄で丸が付いている行だけ",
      items: {
        type: "object",
        properties: {
          code: { type: "number", description: "補正コード（行頭の番号）" },
          codeConfidence: { type: "number" },
          value: { type: "number", description: "その行の数値。数値が無い指示なら省略" },
          valueConfidence: { type: "number" },
          rawLabel: { type: "string", description: "紙に印字されていた補正名" },
        },
        required: ["code", "codeConfidence", "rawLabel"],
      },
    },
    note: extractedString("備考欄・メモ欄の記述"),
  },
  required: ["sections", "adjustments"],
};

const PROMPT = `
あなたはオーダースーツ店の事務担当です。工場へ送る「注文書兼採寸票」1枚を読み取り、JSON にしてください。

# 紙の構成
- 上段: フリガナ / お客様名 / ご住所 / 会社名 / ネーム（刺繍名）/ お渡し日 / 販売店 / 紹介者 / 特記、
  右上に 売上金額・割増金額・消費税・合計金額・支払方法、店名・フィッター
- 次段: 受注日 / 納品日 / ショップコード
- その下: メイク / 品名 / 原反NO1 / 在庫区分・要M / 裏地 / 前芯 / 糸 / 釦
- 左列: JACKET / PANTS / VEST の採寸ブロック。各ブロックに シルエット記号・C# と寸法が並ぶ
- 中央: 指示項目の丸つけ表（前釦・衿型・ポケット・ベント・ステッチなど）
- 右列: 補正内容。番号・補正名・数値が並び、適用するものに丸が付く
- 右下: 品質表示（組成）と 原反NO・生地貼付欄（色名）
- 下段: 備考欄

# 読み取りの決まり
1. **寸法はすべて上がり寸です。** この紙に実寸欄はありません。数値をそのまま value に入れてください。
2. 採寸ブロックごとに sections を 1 つ作り、記入がある行だけ values に入れます。
   使える fieldKey はブロックごとに決まっています:
${ITEM_TYPES.map(
  (t) =>
    `   - ${t.sheetLabel} (itemTypeId: ${t.id}): ${fieldsForItemType(t.id)
      .map((f) => `${f.key}=${f.label}`)
      .join(", ")}`,
).join("\n")}
3. 日付は紙では YYMMDD の6桁で書かれています（例: 251219 → 2025-12-19）。
   value は YYYY-MM-DD に直し、raw には6桁の原文を入れてください。西暦は 20xx 年として解釈します。
4. 補正内容は **丸が付いている行だけ** を adjustments に入れます。丸の無い行は無視してください。
   登録済みの補正コードは次のとおりです。手書きで追記された未登録の番号もそのまま入れてください:
${ADJUSTMENT_MASTERS.map((a) => `   - ${a.code}: ${adjustmentLabel(a)}`).join("\n")}
   （参考: 使われうるコード ${ADJUSTMENT_CODES.join(", ")}）
5. **中央の指示項目（丸つけ表）は読まないでください。** 今回は取り込みません。
6. 備考欄に書かれた文章は note にそのまま入れてください。要約しないでください。
7. **右上の金額欄は読まないでください。** 実運用では空欄のまま流れており、取り込みでは使いません。

${OMIT_RULE}

${CONFIDENCE_RULE}
`.trim();

export async function POST(request: Request) {
  const startedAt = performance.now();

  // ここが無いと Gemini のキーを世界中に配ることになる。
  try {
    await requireStaff(request);
  } catch (error) {
    return errorResponse(error);
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ message: "ファイルが送られていません。" }, { status: 400 });
  }

  let raw: RawExtraction;
  let usage: ExtractionUsage | undefined;
  try {
    ({ data: raw, usage } = await runExtraction<RawExtraction>({
      file,
      prompt: PROMPT,
      schema: SCHEMA,
    }));
  } catch (error) {
    const status = error instanceof ExtractionError ? error.status : 500;
    const message = error instanceof Error ? error.message : "読み取りに失敗しました。";
    return Response.json({ message }, { status });
  }

  const extraction: OrderSheetExtraction = {
    ...raw,
    source: EXTRACTION_MODEL,
    elapsedMs: Math.round(performance.now() - startedAt),
    usage,
    sections: (raw.sections ?? []).map((section) => ({
      itemTypeId: section.itemTypeId,
      silhouette: section.silhouette,
      colorNumber: section.colorNumber,
      // データ層は Record で受けるので、ここで組み直す
      finished: Object.fromEntries(
        (section.values ?? []).map((v) => [
          v.fieldKey,
          { value: v.value, confidence: v.confidence, ...(v.raw ? { raw: v.raw } : {}) },
        ]),
      ),
    })),
    adjustments: (raw.adjustments ?? []).map((a) => ({
      code: { value: a.code, confidence: a.codeConfidence },
      value:
        a.value === undefined
          ? undefined
          : { value: a.value, confidence: a.valueConfidence ?? a.codeConfidence },
      rawLabel: a.rawLabel,
    })),
  };

  return Response.json(extraction);
}
