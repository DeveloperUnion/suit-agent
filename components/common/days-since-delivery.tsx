"use client";

import { cn } from "@/lib/utils";

/**
 * 納品からの経過日数。
 *
 * 「最終接触から」ではない。連絡の間隔そのものより「いつ着はじめたか」のほうが
 * 接客の材料になる。カルテを開いた瞬間に判断できる必要があるため、
 * この数値だけは大きく出す。
 *
 * 閾値による色分けはしない。フォローの節目（半年・1年）に来たかどうかは
 * アプローチが通知として教えるので、ここで二重に警告する意味がないため。
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
  if (days === null) {
    return <span className={cn("text-muted-foreground", className)}>納品なし</span>;
  }

  if (size === "lg") {
    return (
      <div className={cn("flex flex-col gap-0.5", className)}>
        <span className="field-label">納品から</span>
        <span className="flex items-baseline gap-1">
          <span className="tnum font-mono text-3xl font-medium leading-none sm:text-4xl">
            {days}
          </span>
          <span className="text-sm text-muted-foreground">日</span>
        </span>
      </div>
    );
  }

  return (
    <span className={cn("tnum font-mono text-sm", className)}>{days}日</span>
  );
}
