/**
 * 読み取り（OCR）結果の共通の器。
 *
 * 実際に読むのは Route Handler（app/api/extract/*）で、そこから Gemini を呼ぶ。
 * API キーをブラウザへ出さないため、読み取りだけはサーバを通す。
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

/**
 * 送れるファイルの上限。
 * Gemini のリクエスト全体の上限は 50MB だが、base64 化で約 4/3 に膨らむため
 * 元ファイル側を 20MB で切る。発注書はスキャン1枚なので実際は数MBに収まる。
 *
 * ここに置いてあるのは、入口（FileDrop）とサーバの両方が同じ値を見るため。
 * gemini.ts に置くと、client component から参照した時点で SDK ごとバンドルに入る。
 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * 1 回の読み取りで実際に使ったトークン数。
 *
 * 費用の見積もりを実測で裏取りするために持つ。見積もりが外れるのはほぼ出力側で、
 * その内訳が thinking なのか本文なのかで打ち手が変わるため、thought を別に残す。
 *
 * 省略可なのは、API が usage を返さない場合があるのと、これを足す前に
 * 読み取った記録には入っていないため。読めなくても取り込みは成立する。
 */
export type ExtractionUsage = {
  inputTokens?: number;
  outputTokens?: number;
  /** thinking の分。outputTokens に含まれる（Gemini は出力として課金する） */
  thoughtTokens?: number;
};

export type ExtractionMeta = {
  /** 読み取ったモデル名 */
  source: string;
  elapsedMs: number;
  usage?: ExtractionUsage;
};

export function isLowConfidence(field?: { confidence: number }): boolean {
  return field !== undefined && field.confidence < CONFIDENCE_WARN;
}

/** 解析中の状態を確かめられるだけの待ち。AI アシスタント（lib/ai/agent.ts）がまだ使っている */
export function simulateLatency(ms = 900): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 読み取りを依頼する。
 *
 * 失敗はここで例外にする。呼び出し側は「読めたか読めなかったか」だけを扱えばよく、
 * 半端な結果を確認画面へ流さない。
 */
export async function postExtraction<T extends ExtractionMeta>(
  endpoint: string,
  file: File,
): Promise<T> {
  const body = new FormData();
  body.append("file", file);

  const response = await fetch(endpoint, { method: "POST", body });
  if (!response.ok) {
    const detail = await response
      .json()
      .then((data: { message?: string }) => data.message)
      .catch(() => undefined);
    throw new Error(detail ?? "読み取りに失敗しました。");
  }
  return (await response.json()) as T;
}
