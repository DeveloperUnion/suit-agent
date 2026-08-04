"use client";

import { BodySilhouette } from "@/components/silhouette/body-silhouette";
import { cn } from "@/lib/utils";
import type { SilhouetteCorrection } from "@/lib/types";
import { formatDateDot } from "@/lib/utils/date";

/**
 * カルテ右上に置く採寸ビューの入口。
 * 単なるアイコンではなく、適用中の補正をそのまま反映した図にすることで、
 * 開かなくても「この人はこういう体型」が伝わるようにしている。
 */
export function SilhouetteThumb({
  corrections,
  measuredAt,
  adjustmentCount,
  onClick,
  className,
}: {
  corrections: SilhouetteCorrection[];
  measuredAt?: string;
  adjustmentCount: number;
  onClick: () => void;
  className?: string;
}) {
  const hasMeasurement = Boolean(measuredAt);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex min-h-11 items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-left transition-colors",
        "hover:border-navy/40 hover:bg-accent/40",
        "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        className,
      )}
      aria-label={hasMeasurement ? "採寸ビューを開く" : "採寸を始める"}
    >
      <span className="h-[4.5rem] w-9 shrink-0 sm:h-24 sm:w-12">
        <BodySilhouette corrections={corrections} animate={false} variant="thumb" />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="field-label">採寸</span>
        {hasMeasurement ? (
          <>
            <span className="tnum font-mono text-sm font-medium text-foreground">
              {formatDateDot(measuredAt)}
            </span>
            <span className="text-xs text-muted-foreground">
              {adjustmentCount > 0 ? `補正 ${adjustmentCount}ヶ` : "補正なし"}
            </span>
          </>
        ) : (
          <span className="text-sm text-navy">採寸する</span>
        )}
      </span>
    </button>
  );
}
