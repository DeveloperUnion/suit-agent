import { GoogleGenAI } from "@google/genai";

import { EMBEDDING_DIMENSIONS, EMBEDDING_TASK_TYPES, MODELS } from "@/lib/ai/models";

/**
 * 事実を意味検索できる形に変える。
 *
 * このファイルは Route Handler からしか読まない（API キーをブラウザへ出さない）。
 *
 * 1 事実 1 チャンク。"ゴルフ・ワイン・読書" を 1 つに畳むと
 * 「ワインが好きな人」でスコアが薄まる。チャンク設計は正規化そのもの。
 */

export class EmbeddingError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "EmbeddingError";
  }
}

/**
 * 埋め込みに渡す本文。
 *
 * ラベルがあれば「ラベル名 / 原文」、無ければ原文だけ
 * （search_chunks.content のコメントと同じ形）。ラベルを頭に付けるのは、
 * 走り書きの原文が長いときに主題が薄まるのを防ぐため。
 */
export function chunkContent(label: string | null, body: string): string {
  return label ? `${label} / ${body}` : body;
}

/**
 * 単位ベクトルに直す。
 *
 * gemini-embedding-001 は 3072 次元で正規化済みだが、**outputDimensionality で
 * 切り詰めたものは正規化されていない**（先頭を切り出すだけなので長さが変わる）。
 * いまの索引はコサイン距離でスケール不変なので、これが無くても壊れない。
 * それでも入れておくのは、内積（vector_ip_ops）に触れた瞬間に**無音で**
 * 距離が意味を成さなくなるため。ここで直しておけば、その事故が起こせない。
 */
function normalize(values: number[]): number[] {
  let sum = 0;
  for (const v of values) sum += v * v;
  const length = Math.sqrt(sum);
  if (length === 0) return values;
  return values.map((v) => v / length);
}

/** pgvector が読む書式。'[0.1,0.2,...]' */
export function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

/**
 * まとめて埋め込む。返る順序は渡した順序と同じ。
 *
 * taskType を document / query で使い分ける。**片方だけ直すと無音で精度が落ちる**
 * ので、値は lib/ai/models.ts の 1 箇所に置いてある。
 */
export async function embedTexts(
  texts: string[],
  kind: keyof typeof EMBEDDING_TASK_TYPES,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new EmbeddingError("GEMINI_API_KEY が設定されていません。", 500);

  const ai = new GoogleGenAI({ apiKey });

  let response;
  try {
    response = await ai.models.embedContent({
      model: MODELS.embedding,
      contents: texts,
      config: {
        taskType: EMBEDDING_TASK_TYPES[kind],
        outputDimensionality: EMBEDDING_DIMENSIONS,
      },
    });
  } catch (cause) {
    throw new EmbeddingError(
      `埋め込みに失敗しました: ${cause instanceof Error ? cause.message : String(cause)}`,
      502,
    );
  }

  const embeddings = response.embeddings ?? [];
  if (embeddings.length !== texts.length) {
    // 数がずれたまま進むと、別の事実のベクトルを書き込むことになる。
    // 「その人だけ検索に出てこない」ではなく「別人として出てくる」なので、より悪い。
    throw new EmbeddingError("埋め込みの数が入力と一致しませんでした。", 502);
  }

  return embeddings.map((e) => {
    const values = e.values ?? [];
    if (values.length !== EMBEDDING_DIMENSIONS) {
      throw new EmbeddingError(
        `次元が ${EMBEDDING_DIMENSIONS} ではありません（${values.length}）。`,
        502,
      );
    }
    return normalize(values);
  });
}
