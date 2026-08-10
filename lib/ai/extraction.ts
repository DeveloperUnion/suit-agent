/**
 * 読み取り（OCR）結果の共通の器。
 *
 * ここでは実際に画像や PDF を読まず、決まったフィクスチャを返す。
 * 差し替えるときに呼び出し側を書き換えずに済むよう、入出力は実の Vision API を
 * 想定した形にしてある。
 *
 * どの項目にも確信度を付けて返すのは、確認画面が「どこを人が見るべきか」を
 * 出せるようにするため。全項目が同じ見た目で並ぶと、結局すべて読み直すことになり、
 * 読み取りの意味がなくなる。
 */

export type ExtractedField<T = string> = {
  value: T;
  /** 0–1 */
  confidence: number;
  /** 紙に何と書いてあったか。数値に直したあとでも原文を残す */
  raw?: string;
};

/** これを下回ったら確認画面で「要確認」を出す */
export const CONFIDENCE_WARN = 0.7;

export type ExtractionMeta = {
  /** 実 API に差し替えたらモデル名が入る */
  source: "stub" | string;
  elapsedMs: number;
};

export function isLowConfidence(field?: { confidence: number }): boolean {
  return field !== undefined && field.confidence < CONFIDENCE_WARN;
}

/** 読み取れた項目として組み立てるときの短縮形 */
export function field<T>(value: T, confidence = 0.95, raw?: string): ExtractedField<T> {
  return raw === undefined ? { value, confidence } : { value, confidence, raw };
}

/**
 * ファイル名とサイズから決まる番号。同じファイルなら必ず同じ結果になる。
 * デモの途中で結果が入れ替わると、何を見せているのか説明できなくなるため。
 */
export function fixtureIndex(file: File, count: number, keywords: string[] = []): number {
  const name = file.name.toLowerCase();
  // デモ用のファイル名は狙ったフィクスチャに固定する
  const hit = keywords.findIndex((k) => k !== "" && name.includes(k));
  if (hit >= 0) return hit % count;

  let hash = 0x811c9dc5;
  const seed = `${file.name}:${file.size}`;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % count;
}

/** 解析中の状態を確かめられるだけの待ち。実 API の応答時間に相当する */
export function simulateLatency(ms = 900): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
