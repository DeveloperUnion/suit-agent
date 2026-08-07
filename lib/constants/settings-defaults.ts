import type { AppSettings } from "@/lib/types";

/**
 * 設定の既定値。
 *
 * seed と lib/data/settings.ts の両方から参照するため、ストアに依存しない
 * ここに置いている（seed → settings → store → seed の循環を避ける）。
 */
export const DEFAULT_SETTINGS: AppSettings = {
  elapsedDaysThreshold: 90,
  anniversaryLeadDays: 21,
  dailyApproachLimit: 24,
  // 要件は「春夏(3月)・秋冬(9月)」だが、実際の入荷と案内は前後にまたがるため幅を持たせる
  seasonWindows: [
    { season: "spring_summer", label: "春夏", months: [2, 3, 4] },
    { season: "autumn_winter", label: "秋冬", months: [8, 9, 10] },
  ],
  itemPrices: {
    jacket: 95000,
    pants: 45000,
    vest: 30000,
    shirt: 18000,
    coat: 120000,
  },
  message: {
    politeness: "formal",
    allowEmoji: false,
    // 要件4.5「100〜200字程度。LINEで読みやすい長さに収める」
    lengthMin: 100,
    lengthMax: 200,
  },
};
