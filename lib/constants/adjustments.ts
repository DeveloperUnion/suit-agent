import type { AdjustmentMaster, BodyPart } from "@/lib/types";

/**
 * 補正コードマスタ
 *
 * docs/採寸データ.jpg の右列「補正内容」に印刷されている番号付きリスト。
 * 紙には「上半身補正は5ヶ以内」「下半身補正は3ヶ以内」と明記されているため、
 * 個数制約も業務ルールとして持つ。
 *
 * 注意: 画像からの転記のため、下半身の項目数は紙に載っている一部のみ。
 * 実装確定前に全リストをクライアントに確認すること。
 */

export const MAX_ADJUSTMENTS: Record<BodyPart, number> = {
  upper: 5,
  lower: 3,
};

export const ADJUSTMENT_MASTERS: AdjustmentMaster[] = [
  // ── 上半身補正 ──
  { code: 11, name: "反身", strength: "弱", defaultValue: 0.7, bodyPart: "upper", silhouetteHint: "back" },
  { code: 13, name: "屈身", strength: "弱", defaultValue: 0.7, bodyPart: "upper", silhouetteHint: "back" },
  { code: 15, name: "衿ミツ入れ", defaultValue: 0.5, bodyPart: "upper", silhouetteHint: "neck" },
  { code: 17, name: "突き取り", defaultValue: 0.5, bodyPart: "upper", silhouetteHint: "back" },
  { code: 18, name: "猫背", defaultValue: 0.7, bodyPart: "upper", silhouetteHint: "back" },
  { code: 21, name: "怒り肩", strength: "弱", defaultValue: 0.5, bodyPart: "upper", silhouetteHint: "shoulder" },
  { code: 23, name: "撫で肩", strength: "弱", defaultValue: 0.5, bodyPart: "upper", silhouetteHint: "shoulder" },
  { code: 26, name: "前肩", strength: "弱", defaultValue: 1.0, bodyPart: "upper", silhouetteHint: "shoulder" },
  { code: 29, name: "AHマエクル", defaultValue: 1.0, bodyPart: "upper", silhouetteHint: "arm" },
  { code: 31, name: "ハト胸", defaultValue: 1.2, bodyPart: "upper", silhouetteHint: "chest" },
  { code: 34, name: "前巾出し", strength: "弱", defaultValue: 0.7, bodyPart: "upper", silhouetteHint: "chest" },
  { code: 36, name: "ケマワシ入", strength: "強", defaultValue: 2.0, bodyPart: "upper", silhouetteHint: "arm" },
  { code: 37, name: "前下り", strength: "強", defaultValue: 1.0, bodyPart: "upper", silhouetteHint: "chest" },
  { code: 40, name: "ケマワシ出", defaultValue: 2.0, bodyPart: "upper", silhouetteHint: "arm" },
  { code: 52, name: "前釦（下げ）", defaultValue: -1.5, bodyPart: "upper", silhouetteHint: "chest" },
  { code: 53, name: "前釦（上げ）", defaultValue: 1.5, bodyPart: "upper", silhouetteHint: "chest" },

  // ── 下半身補正 ──
  { code: 5, name: "出尻", defaultValue: 1.0, bodyPart: "lower", silhouetteHint: "hip" },
  { code: 72, name: "平尻", defaultValue: 1.0, bodyPart: "lower", silhouetteHint: "hip" },
  { code: 73, name: "ライン抜け", defaultValue: 2.0, bodyPart: "lower", silhouetteHint: "leg" },
];

export const ADJUSTMENT_MAP = new Map<number, AdjustmentMaster>(
  ADJUSTMENT_MASTERS.map((a) => [a.code, a]),
);

export function adjustmentLabel(master: AdjustmentMaster): string {
  return master.strength ? `${master.name}(${master.strength})` : master.name;
}

export function adjustmentsFor(bodyPart: BodyPart): AdjustmentMaster[] {
  return ADJUSTMENT_MASTERS.filter((a) => a.bodyPart === bodyPart);
}
