import { GoogleGenAI } from "@google/genai";

import { MAX_UPLOAD_BYTES, type ExtractionUsage } from "@/lib/ai/extraction";
import { MODELS } from "@/lib/ai/models";

/**
 * Gemini への読み取り依頼。
 *
 * このファイルは Route Handler からしか読まない。API キーをブラウザへ出さないため、
 * 読み取りだけはサーバを通す（アプリの他の部分は localStorage だけを見る純クライアント）。
 *
 * 呼び出し側（lib/ai/extract-*.ts）に返す形は lib/ai/extraction.ts の器に揃えてあり、
 * モデルや事業者を替えてもその器は動かさない。
 */

/** 判読しやすさをモデル自身に申告させる。確認画面の「要確認」はこの値だけを見る */
export const CONFIDENCE_RULE = `
confidence は「その値をどれだけ確実に読み取れたか」を 0〜1 で自己申告してください。
- 1.0 に近い: 活字、または太くはっきりした手書きで、読み違えようがない
- 0.7 前後: 読めるが、似た字（1と7、0と6、3と8、小数点の有無）と迷う余地がある
- 0.7 未満: かすれ・重なり・訂正線があり、人が紙と見比べて直すべき
自信が無いものを高い値で出さないでください。この値が低い項目だけが確認画面で強調され、
人が見直す対象になります。全部を高くすると読み取りの意味がなくなります。
`.trim();

/** 読み取れなかった項目の扱い。空文字（読めたが空欄）と区別する */
export const OMIT_RULE = `
読み取れない項目・紙に記入が無い項目は、キーごと省略してください。
推測で埋めたり、空文字や 0 で埋めたりしないでください。
`.trim();

/** 紙の画像・PDF を読める現行モデル。名前の正は lib/ai/models.ts */
const MODEL = MODELS.extraction;

export class ExtractionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

/**
 * 受け取ったファイルを Gemini に渡し、schema に従った JSON を返させる。
 *
 * PDF はネイティブに読めるので変換しない（画像化すると手書きの細部が落ちる）。
 *
 * 読み取った中身と一緒に実使用トークンを返す。呼び出し側が捨てても構わないが、
 * ここで拾っておかないと実費を突き合わせる手段が事業者のコンソールしか無くなる。
 */
export async function runExtraction<T>({
  file,
  prompt,
  schema,
}: {
  file: File;
  prompt: string;
  schema: Record<string, unknown>;
}): Promise<{ data: T; usage?: ExtractionUsage }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ExtractionError("GEMINI_API_KEY が設定されていません。", 500);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ExtractionError("ファイルが大きすぎます。", 413);
  }

  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const mimeType = file.type || "application/pdf";
  // PDF とそれ以外（名刺の写真）で content block の型が違う
  const document =
    mimeType === "application/pdf"
      ? ({ type: "document", data, mime_type: mimeType } as const)
      : ({ type: "image", data, mime_type: mimeType } as const);

  const ai = new GoogleGenAI({ apiKey });

  let interaction;
  try {
    interaction = await ai.interactions.create({
      model: MODEL,
      input: [{ type: "text", text: prompt }, document],
      response_format: { type: "text", mime_type: "application/json", schema },
    });
  } catch (cause) {
    throw new ExtractionError(
      `読み取りに失敗しました: ${cause instanceof Error ? cause.message : String(cause)}`,
      502,
    );
  }

  const text = interaction.output_text;
  if (!text) {
    throw new ExtractionError("読み取り結果が空でした。", 502);
  }

  let parsed: T;
  try {
    parsed = JSON.parse(text) as T;
  } catch {
    throw new ExtractionError("読み取り結果を解釈できませんでした。", 502);
  }

  // usage は無くても取り込みは成立するので、欠けていても例外にしない
  const usage = interaction.usage;
  return {
    data: parsed,
    usage: usage && {
      inputTokens: usage.total_input_tokens,
      outputTokens: usage.total_output_tokens,
      thoughtTokens: usage.total_thought_tokens,
    },
  };
}

export { MODEL as EXTRACTION_MODEL };

// ── JSON Schema の部品 ────────────────────────────────
// value / confidence / raw の 3 つ組を項目ごとに繰り返すので、組み立てを共通化する。

export function extractedString(description: string) {
  return {
    type: "object",
    description,
    properties: {
      value: { type: "string" },
      confidence: { type: "number" },
      raw: { type: "string", description: "紙に書かれていた原文" },
    },
    required: ["value", "confidence"],
  };
}

export function extractedNumber(description: string) {
  return {
    type: "object",
    description,
    properties: {
      value: { type: "number" },
      confidence: { type: "number" },
      raw: { type: "string", description: "紙に書かれていた原文" },
    },
    required: ["value", "confidence"],
  };
}
