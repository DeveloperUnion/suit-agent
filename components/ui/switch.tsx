"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * オン・オフ。**行そのものがスイッチ**になる。
 *
 * Radix を使っていないのは、つまみだけを押させたくないため。片手で操作する前提だと
 * 22px のつまみは小さすぎるので、説明文ごと 1 つのボタンにして行全体を当たり判定にする。
 * ボタンの入れ子は作れないので、つまみ側は見た目だけの span で描く。
 */
function Switch({
  checked,
  onCheckedChange,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"button">, "onChange"> & {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-slot="switch"
      data-state={checked ? "checked" : "unchecked"}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 rounded-md border p-3 text-left transition-colors",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "border-brand/40 bg-card" : "border-border bg-card",
        className
      )}
      {...props}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">{children}</span>
      <span
        aria-hidden
        className={cn(
          "flex h-6 w-10 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-brand-fill" : "bg-input"
        )}
      >
        <span
          className={cn(
            "block size-5 rounded-full bg-background shadow-sm transition-transform",
            checked ? "translate-x-[1.125rem]" : "translate-x-0.5"
          )}
        />
      </span>
    </button>
  )
}

export { Switch }
