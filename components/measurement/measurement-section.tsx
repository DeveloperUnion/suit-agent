"use client";

import { MeasurementRow } from "@/components/measurement/measurement-row";
import type { SectionView } from "@/lib/data/measurements";
import type { ItemTypeId } from "@/lib/types";
import { cn } from "@/lib/utils";

/** JACKET / PANTS / VEST など、採寸票のアイテム 1 ブロック分 */
export function MeasurementSection({
  section,
  editable,
  onChange,
  onFocusField,
  activeKey,
  className,
}: {
  section: SectionView;
  editable: boolean;
  onChange?: (
    itemTypeId: ItemTypeId,
    fieldKey: string,
    column: "actual" | "finished",
    value: number | undefined,
  ) => void;
  onFocusField?: (key: string) => void;
  activeKey?: string;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col", className)}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b-2 border-navy/25 pb-1.5">
        <h3 className="font-heading text-sm font-semibold uppercase tracking-[0.1em] text-navy">
          {section.itemType.sheetLabel}
        </h3>
        <span className="text-xs text-muted-foreground">{section.itemType.name}</span>
        {section.silhouette && (
          <span className="tnum font-mono text-xs text-foreground">
            シルエット <span className="font-medium">{section.silhouette}</span>
          </span>
        )}
        {section.colorNumber && (
          <span className="tnum font-mono text-xs text-muted-foreground">C#{section.colorNumber}</span>
        )}
      </header>

      <div className="grid grid-cols-[minmax(4.5rem,1fr)_4.5rem_4.5rem_2.75rem] gap-1 pb-1 pt-2 sm:grid-cols-[minmax(5rem,1fr)_5rem_5rem_3.25rem]">
        <span />
        <span className="field-label text-center">実寸</span>
        <span className="field-label text-center">上がり</span>
        <span className="field-label text-right">前回比</span>
      </div>

      <div>
        {section.rows.map((row) => (
          <MeasurementRow
            key={row.field.key}
            row={row}
            editable={editable}
            active={activeKey === `${section.itemType.id}:${row.field.key}`}
            onFocus={() => onFocusField?.(`${section.itemType.id}:${row.field.key}`)}
            onChange={(column, value) => onChange?.(section.itemType.id, row.field.key, column, value)}
          />
        ))}
      </div>
    </section>
  );
}
