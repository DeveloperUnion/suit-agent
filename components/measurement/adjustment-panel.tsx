"use client";

import { AlertTriangle, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ADJUSTMENT_MASTERS, MAX_ADJUSTMENTS, adjustmentLabel } from "@/lib/constants/adjustments";
import type { AppliedAdjustmentView } from "@/lib/data/measurements";
import type { BodyPart } from "@/lib/types";
import { cn } from "@/lib/utils";

const PART_LABEL: Record<BodyPart, string> = { upper: "上半身補正", lower: "下半身補正" };

/**
 * 補正欄。
 * 紙に「上半身補正は5ヶ以内」「下半身補正は3ヶ以内」と印刷されている業務ルールを
 * 常時見える形で持ち込む。
 */
export function AdjustmentPanel({
  bodyPart,
  applied,
  editable,
  onToggle,
  className,
}: {
  bodyPart: BodyPart;
  applied: AppliedAdjustmentView[];
  editable: boolean;
  onToggle?: (code: number) => void;
  className?: string;
}) {
  const max = MAX_ADJUSTMENTS[bodyPart];
  const used = applied.length;
  const exceeded = used > max;
  const appliedCodes = new Set(applied.map((a) => a.master.code));

  return (
    <section className={cn("flex flex-col gap-1.5", className)}>
      <header className="flex items-center justify-between gap-2 border-b border-border pb-1">
        <span className="field-label">{PART_LABEL[bodyPart]}</span>
        <span
          className={cn(
            "tnum font-mono text-xs",
            exceeded ? "font-medium text-thread" : "text-muted-foreground",
          )}
        >
          {used} / {max}
        </span>
      </header>

      {exceeded && (
        <p className="flex items-start gap-1.5 rounded-sm bg-thread/10 px-2 py-1.5 text-xs text-thread">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {PART_LABEL[bodyPart]}は{max}ヶまでです。{used - max}ヶ外してください。
        </p>
      )}

      {applied.length === 0 ? (
        <p className="py-1 text-xs text-muted-foreground">補正なし</p>
      ) : (
        <ul className="flex flex-col">
          {applied.map(({ master, value }) => (
            <li
              key={master.code}
              className="flex items-center gap-2 border-b border-border/50 py-1 last:border-b-0"
            >
              <span className="tnum w-6 shrink-0 font-mono text-xs text-muted-foreground">
                {master.code}
              </span>
              <span className="flex-1 truncate font-label text-[0.8125rem]">
                {adjustmentLabel(master)}
              </span>
              <span className="tnum font-mono text-xs font-medium">{value.toFixed(1)}</span>
              {editable && (
                <button
                  type="button"
                  onClick={() => onToggle?.(master.code)}
                  className="shrink-0 rounded-sm px-1 text-xs text-muted-foreground hover:text-thread"
                  aria-label={`${adjustmentLabel(master)} を外す`}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="mt-1 h-9 justify-start gap-1.5">
              <Plus className="size-3.5" />
              補正を追加
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="max-h-72 w-64 overflow-y-auto p-1">
            {ADJUSTMENT_MASTERS.filter((m) => m.bodyPart === bodyPart).map((master) => (
              <button
                key={master.code}
                type="button"
                onClick={() => onToggle?.(master.code)}
                className={cn(
                  "flex w-full min-h-9 items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-accent",
                  appliedCodes.has(master.code) && "text-muted-foreground",
                )}
              >
                <span className="tnum w-6 shrink-0 font-mono text-xs text-muted-foreground">
                  {master.code}
                </span>
                <span className="flex-1 truncate">{adjustmentLabel(master)}</span>
                <span className="tnum font-mono text-xs text-muted-foreground">
                  {master.defaultValue.toFixed(1)}
                </span>
                {appliedCodes.has(master.code) && <span className="text-xs">適用中</span>}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </section>
  );
}
