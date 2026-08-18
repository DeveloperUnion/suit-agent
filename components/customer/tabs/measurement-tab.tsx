"use client";

import { useCallback } from "react";
import { ChevronRight } from "lucide-react";

import { DiffBadge } from "@/components/common/diff-badge";
import { EmptyState, Field, SectionTitle } from "@/components/common/field";
import { adjustmentLabel } from "@/lib/constants/adjustments";
import { INPUT_METHOD_LABEL } from "@/lib/constants/labels";
import { getSheetView, listSheets } from "@/lib/data/measurements";
import { useQuery } from "@/lib/hooks/use-query";
import { formatDateDot } from "@/lib/utils/date";
import { cn } from "@/lib/utils";

/** 最新採寸票のサマリと、採寸票の一覧。行から全画面ビューを開く */
export function MeasurementTab({
  customerId,
  onOpenSheet,
}: {
  customerId: string;
  onOpenSheet: () => void;
}) {
  const sheetsLoader = useCallback(() => listSheets(customerId), [customerId]);
  const { data: sheets, loading } = useQuery(sheetsLoader, [customerId]);

  const viewLoader = useCallback(() => getSheetView(customerId), [customerId]);
  const { data: view } = useQuery(viewLoader, [customerId]);

  if (!loading && (!sheets || sheets.length === 0)) {
    return <EmptyState>採寸データがまだありません。次回の来店時に採寸してください。</EmptyState>;
  }

  const sections = view ? [...view.upper, ...view.lower] : [];
  const totalAdjustments = view
    ? view.adjustments.upper.length + view.adjustments.lower.length
    : 0;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle className="flex-1">
            最新の採寸
            {view && (
              <span className="ml-2 tnum font-mono text-xs font-normal text-muted-foreground">
                {formatDateDot(view.sheet.measuredAt)}
              </span>
            )}
          </SectionTitle>
          <button
            type="button"
            onClick={onOpenSheet}
            className="flex min-h-11 items-center gap-1 text-sm text-brand hover:underline"
          >
            採寸票を開く
            <ChevronRight className="size-4" />
          </button>
        </div>

        {/* 票が持つ身長・体重。アイテムごとの区画に入らないので、その手前に置く。
            片方しか入っていない票もあるので、入っているものだけ出す */}
        {view && (view.sheet.heightCm !== undefined || view.sheet.weightKg !== undefined) && (
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            {view.sheet.heightCm !== undefined && (
              <Field label="身長" value={`${view.sheet.heightCm} cm`} mono />
            )}
            {view.sheet.weightKg !== undefined && (
              <Field label="体重" value={`${view.sheet.weightKg} kg`} mono />
            )}
          </div>
        )}

        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => (
            <div key={section.itemType.id} className="flex flex-col rounded-md border border-border bg-card p-3">
              <div className="flex items-baseline gap-2 border-b border-border pb-1.5">
                <span className="font-heading text-xs font-semibold uppercase tracking-[0.1em] text-brand">
                  {section.itemType.sheetLabel}
                </span>
                {section.silhouette && (
                  <span className="tnum font-mono text-xs text-muted-foreground">
                    {section.silhouette}
                    {section.colorNumber ? ` / C#${section.colorNumber}` : ""}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_3rem_3rem_3.5rem] gap-1.5 pb-0.5 pt-2">
                <span />
                <span className="field-label text-center">実寸</span>
                <span className="field-label text-center">上がり</span>
                <span />
              </div>
              {section.rows
                .filter((row) => row.value.actual !== undefined || row.value.finished !== undefined)
                .map((row) => (
                  <div
                    key={row.field.key}
                    className="grid grid-cols-[minmax(0,1fr)_3rem_3rem_3.5rem] items-center gap-1.5 border-b border-border/50 py-1 last:border-b-0"
                  >
                    <span className="truncate font-label text-[0.8125rem]">{row.field.label}</span>
                    <span
                      className={cn(
                        "tnum text-right font-mono text-sm",
                        row.value.actual === undefined && "text-muted-foreground/40",
                      )}
                    >
                      {row.value.actual ?? "—"}
                    </span>
                    <span
                      className={cn(
                        "tnum text-right font-mono text-sm",
                        row.value.finished === undefined
                          ? "text-muted-foreground/40"
                          : "font-medium",
                      )}
                    >
                      {row.value.finished ?? "—"}
                    </span>
                    <span className="flex justify-end">
                      <DiffBadge diff={row.actualDiff ?? row.finishedDiff} />
                    </span>
                  </div>
                ))}
            </div>
          ))}
        </div>
      </section>

      {view && totalAdjustments > 0 && (
        <section className="flex flex-col gap-2">
          <SectionTitle>体型補正</SectionTitle>
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {(["upper", "lower"] as const).map((part) => (
              <div key={part} className="flex flex-col gap-1">
                <span className="field-label">{part === "upper" ? "上半身" : "下半身"}</span>
                {view.adjustments[part].length === 0 ? (
                  <span className="py-1 text-sm text-muted-foreground">なし</span>
                ) : (
                  <ul className="flex max-w-sm flex-col">
                    {view.adjustments[part].map(({ master, value }) => (
                      <li
                        key={master.code}
                        className="flex items-center gap-2 border-b border-border/50 py-1.5 last:border-b-0"
                      >
                        <span className="tnum w-6 font-mono text-xs text-muted-foreground">
                          {master.code}
                        </span>
                        <span className="flex-1 text-sm">{adjustmentLabel(master)}</span>
                        <span className="tnum font-mono text-sm font-medium">
                          {value.toFixed(1)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <SectionTitle>採寸履歴</SectionTitle>
        <ul className="flex flex-col">
          {(sheets ?? []).map((sheet, i) => (
            <li key={sheet.id}>
              <button
                type="button"
                onClick={onOpenSheet}
                className="flex min-h-12 w-full items-center gap-3 border-b border-border/60 px-1 text-left transition-colors hover:bg-accent/40"
              >
                <span className="tnum w-24 shrink-0 font-mono text-sm">
                  {formatDateDot(sheet.measuredAt)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {sheet.sections.map((s) => s.itemTypeId.toUpperCase()).join(" / ")}
                </span>
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                  {INPUT_METHOD_LABEL[sheet.inputMethod]}
                </span>
                <span className="tnum shrink-0 font-mono text-xs text-muted-foreground">
                  補正 {sheet.adjustments.length}
                </span>
                {i === 0 && (
                  <span className="shrink-0 rounded-sm bg-brand/10 px-1.5 py-0.5 text-xs text-brand">
                    最新
                  </span>
                )}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
