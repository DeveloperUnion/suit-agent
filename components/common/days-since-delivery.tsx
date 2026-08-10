"use client";

import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/hooks/use-settings";

/**
 * 納品からの経過日数。
 *
 * 「最終接触から」ではない。季節が変われば案内の口実は自然に生まれるので、
 * 連絡の間隔そのものより「いつ着はじめたか」のほうが接客の材料になる。
 * カルテを開いた瞬間に判断できる必要があるため、この数値だけは大きく出す。
 */
export function DaysSinceDelivery({
  days,
  size = "sm",
  className,
}: {
  days: number | null;
  size?: "sm" | "lg";
  className?: string;
}) {
  const threshold = useSettings().deliveryFollowUpDays;
  const due = days !== null && days >= threshold;

  if (days === null) {
    return <span className={cn("text-muted-foreground", className)}>納品なし</span>;
  }

  if (size === "lg") {
    return (
      <div className={cn("flex flex-col gap-0.5", className)}>
        <span className="field-label">納品から</span>
        <span className="flex items-baseline gap-1">
          <span
            className={cn(
              "tnum font-mono text-3xl font-medium leading-none sm:text-4xl",
              due ? "text-thread" : "text-foreground",
            )}
          >
            {days}
          </span>
          <span className={cn("text-sm", due ? "text-thread" : "text-muted-foreground")}>日</span>
        </span>
        {due && <span className="text-xs text-thread">フォロー期限 {threshold}日を超過</span>}
      </div>
    );
  }

  return (
    <span
      className={cn(
        "tnum font-mono text-sm",
        due ? "font-medium text-thread" : "text-foreground",
        className,
      )}
    >
      {days}日
    </span>
  );
}
