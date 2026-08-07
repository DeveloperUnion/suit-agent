"use client";

import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/hooks/use-settings";

/**
 * 最終接触からの経過日数。
 * カルテを開いた瞬間に判断できる必要があるため、この数値だけは大きく出す。
 */
export function ElapsedDays({
  days,
  size = "sm",
  className,
}: {
  days: number | null;
  size?: "sm" | "lg";
  className?: string;
}) {
  const threshold = useSettings().elapsedDaysThreshold;
  const overdue = days !== null && days > threshold;

  if (days === null) {
    return <span className={cn("text-muted-foreground", className)}>未接触</span>;
  }

  if (size === "lg") {
    return (
      <div className={cn("flex flex-col gap-0.5", className)}>
        <span className="field-label">最終接触から</span>
        <span className="flex items-baseline gap-1">
          <span
            className={cn(
              "tnum font-mono text-3xl font-medium leading-none sm:text-4xl",
              overdue ? "text-thread" : "text-foreground",
            )}
          >
            {days}
          </span>
          <span className={cn("text-sm", overdue ? "text-thread" : "text-muted-foreground")}>日</span>
        </span>
        {overdue && (
          <span className="text-xs text-thread">閾値 {threshold}日を超過</span>
        )}
      </div>
    );
  }

  return (
    <span
      className={cn(
        "tnum font-mono text-sm",
        overdue ? "font-medium text-thread" : "text-foreground",
        className,
      )}
    >
      {days}日
    </span>
  );
}
