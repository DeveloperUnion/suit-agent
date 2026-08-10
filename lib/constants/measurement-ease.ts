import type { ItemTypeId } from "@/lib/types";

/**
 * 上がり寸から実寸を割り戻すためのゆとり（差分）表。
 *
 * 工場発注書には上がり寸しか載らない。実寸 = 上がり寸 − ゆとり で埋められれば
 * 取り込んだ票でも体型の変化を追えるが、ゆとりはアイテム・シルエット・工場ごとに
 * 違い、値をまだクライアントに確認できていない。
 *
 * 確認が取れるまでは表を空のままにして、実寸欄は空欄で取り込む。
 * 推定値を実寸として保存すると、次の採寸で嘘の前回比が出て、
 * 職人の判断材料そのものを壊すため。
 *
 * TODO: ヒアリングでゆとりの一覧を受け取ったらこの表を埋める。
 *       埋めた時点で取り込み時に実寸が入るようになる（呼び出し側の変更は不要）。
 */
export const MEASUREMENT_EASE: Partial<Record<string, number>> = {
  // キーは `${itemTypeId}:${fieldKey}`
  // "jacket:bust": 12,            // 要確認
  // "jacket:ef_half_chest": 3.5,  // 要確認
  // "pants:waist": -1.5,          // 要確認
  // "pants:thigh_width": 3,       // 渡り巾は上がりが実寸の約1/2＋ゆとり。単純な引き算では足りない可能性
};

/** 上がり寸から実寸を割り戻す。差分表が空のあいだは常に undefined */
export function deriveActual(
  itemTypeId: ItemTypeId,
  fieldKey: string,
  finished: number,
): number | undefined {
  const ease = MEASUREMENT_EASE[`${itemTypeId}:${fieldKey}`];
  if (ease === undefined) return undefined;
  return Math.round((finished - ease) * 10) / 10;
}
