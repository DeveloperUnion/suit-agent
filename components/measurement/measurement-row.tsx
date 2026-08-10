"use client";

import { useState } from "react";

import { DiffBadge } from "@/components/common/diff-badge";
import { cn } from "@/lib/utils";
import type { FieldRow } from "@/lib/data/measurements";

/**
 * 採寸票の 1 行。
 * 実寸と上がり寸を必ず横に並べる — この対比が紙の採寸票の本質なので、
 * 画面幅が狭くても縦積みには崩さない。
 */
export function MeasurementRow({
  row,
  editable,
  onChange,
  onFocus,
  active,
}: {
  row: FieldRow;
  editable: boolean;
  onChange?: (column: "actual" | "finished", value: number | undefined) => void;
  onFocus?: () => void;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(4.5rem,1fr)_4.5rem_4.5rem_2.75rem] items-center gap-1 border-b border-border/60 py-1 last:border-b-0 sm:grid-cols-[minmax(5rem,1fr)_5rem_5rem_3.25rem]",
        active && "bg-accent/40",
      )}
    >
      <span className="truncate font-label text-[0.8125rem] text-foreground">{row.field.label}</span>

      <ValueCell
        value={row.value.actual}
        enabled={row.field.hasActual}
        editable={editable}
        onFocus={onFocus}
        onCommit={(v) => onChange?.("actual", v)}
      />
      <ValueCell
        value={row.value.finished}
        enabled={row.field.hasFinished}
        editable={editable}
        emphasis
        onFocus={onFocus}
        onCommit={(v) => onChange?.("finished", v)}
      />

      <span className="flex justify-end">
        <DiffBadge diff={row.actualDiff ?? row.finishedDiff} />
      </span>
    </div>
  );
}

function toDraft(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

function ValueCell({
  value,
  enabled,
  editable,
  emphasis,
  onCommit,
  onFocus,
}: {
  value: number | undefined;
  enabled: boolean;
  editable: boolean;
  emphasis?: boolean;
  onCommit: (value: number | undefined) => void;
  onFocus?: () => void;
}) {
  const [draft, setDraft] = useState(toDraft(value));
  // 測定日を切り替えたときに外から値が変わる。描画中に同期する（副作用にしない）
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    setDraft(toDraft(value));
  }

  if (!enabled) {
    return <span className="text-center text-xs text-muted-foreground/40">—</span>;
  }

  if (!editable) {
    return (
      <span
        className={cn(
          "tnum rounded-sm px-1.5 py-1 text-right font-mono text-sm",
          value === undefined && "text-muted-foreground/40",
          emphasis && value !== undefined && "font-medium text-foreground",
        )}
      >
        {value ?? "—"}
      </span>
    );
  }

  return (
    <input
      value={draft}
      inputMode="decimal"
      onFocus={onFocus}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const trimmed = draft.trim();
        if (trimmed === "") return onCommit(undefined);
        const parsed = Number(trimmed);
        if (Number.isFinite(parsed)) onCommit(parsed);
        else setDraft(toDraft(value));
      }}
      className={cn(
        "tnum h-9 w-full rounded-sm border border-input bg-card px-1.5 text-right font-mono text-sm",
        "focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/30",
        emphasis && "font-medium",
      )}
    />
  );
}
