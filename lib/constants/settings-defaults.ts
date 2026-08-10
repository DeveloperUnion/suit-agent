import type { AppSettings } from "@/lib/types";

/**
 * 設定の既定値。
 *
 * seed と lib/data/settings.ts の両方から参照するため、ストアに依存しない
 * ここに置いている（seed → settings → store → seed の循環を避ける）。
 */
export const DEFAULT_SETTINGS: AppSettings = {
  anniversaryLeadDays: 21,
  itemPrices: {
    jacket: 95000,
    pants: 45000,
    vest: 30000,
    shirt: 18000,
    coat: 120000,
  },
};
