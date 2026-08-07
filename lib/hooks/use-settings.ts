"use client";

import { useCallback } from "react";
import type { AppSettings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/constants/settings-defaults";
import { getSettings } from "@/lib/data/settings";
import { useMockQuery } from "@/lib/hooks/use-mock-db";

/**
 * 設定を画面から読む。
 *
 * 未取得のあいだは既定値を返す。SSR とクライアント初回描画がどちらも既定値に
 * なるため、ハイドレーションが崩れない。保存すればストアの購読経由で再描画される。
 */
export function useSettings(): AppSettings {
  const loader = useCallback(async () => getSettings(), []);
  const { data } = useMockQuery(loader, []);
  return data ?? DEFAULT_SETTINGS;
}
