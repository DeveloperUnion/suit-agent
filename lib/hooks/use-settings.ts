"use client";

import { useCallback } from "react";

import type { AppSettings } from "@/lib/types";
import { postDeliveryMilestones, type PostDeliveryMilestone } from "@/lib/constants/approach";
import { DEFAULT_APP_SETTINGS, getAppSettings } from "@/lib/data/settings";
import { useQuery } from "@/lib/hooks/use-query";

/**
 * 店舗共通の設定を画面から読む。
 *
 * 未取得のあいだは既定値を返す。SSR とクライアント初回描画がどちらも既定値に
 * なるため、ハイドレーションが崩れない。保存すれば revision の購読経由で再描画される。
 */
export function useAppSettings(): AppSettings {
  const loader = useCallback(() => getAppSettings(), []);
  const { data } = useQuery(loader, []);
  return data ?? DEFAULT_APP_SETTINGS;
}

/** 画面で節目を並べたいときはこちら。ラベルと trigger_key の作り方を 1 か所に閉じる */
export function usePostDeliveryMilestones(): PostDeliveryMilestone[] {
  return postDeliveryMilestones(useAppSettings().postDeliveryMonths);
}
