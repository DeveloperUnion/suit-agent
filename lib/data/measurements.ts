import type {
  AdjustmentMaster,
  BodyPart,
  ItemType,
  MeasurementField,
  MeasurementSheet,
  MeasurementValue,
  SilhouetteRegion,
  Uuid,
} from "@/lib/types";
import { getDb, mutateDb, newId } from "@/lib/store/mock-db";
import { fieldsForItemType, ITEM_TYPE_MAP } from "@/lib/constants/measurement-fields";
import { ADJUSTMENT_MAP, MAX_ADJUSTMENTS } from "@/lib/constants/adjustments";

/** 採寸票 1 行分。前回値との差分まで組み立てて返す */
export type FieldRow = {
  field: MeasurementField;
  value: MeasurementValue;
  previous?: MeasurementValue;
  /** 実寸の前回比。前回値が無ければ undefined */
  actualDiff?: number;
  finishedDiff?: number;
};

export type SectionView = {
  itemType: ItemType;
  silhouette?: string;
  colorNumber?: string;
  rows: FieldRow[];
};

export type AppliedAdjustmentView = {
  master: AdjustmentMaster;
  value: number;
};

export type SheetView = {
  sheet: MeasurementSheet;
  previousSheet?: MeasurementSheet;
  staffName: string;
  upper: SectionView[];
  lower: SectionView[];
  adjustments: Record<BodyPart, AppliedAdjustmentView[]>;
  /** 補正から導いたシルエットの強調部位 */
  highlights: SilhouetteRegion[];
};

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function buildSections(
  sheet: MeasurementSheet,
  previous: MeasurementSheet | undefined,
  bodyPart: BodyPart,
): SectionView[] {
  return sheet.sections
    .filter((section) => ITEM_TYPE_MAP[section.itemTypeId].bodyPart === bodyPart)
    .map((section) => {
      const prevSection = previous?.sections.find((s) => s.itemTypeId === section.itemTypeId);
      const rows: FieldRow[] = fieldsForItemType(section.itemTypeId).map((field) => {
        const value = section.values[field.key] ?? {};
        const prev = prevSection?.values[field.key];
        return {
          field,
          value,
          previous: prev,
          actualDiff:
            value.actual !== undefined && prev?.actual !== undefined
              ? round(value.actual - prev.actual)
              : undefined,
          finishedDiff:
            value.finished !== undefined && prev?.finished !== undefined
              ? round(value.finished - prev.finished)
              : undefined,
        };
      });
      return {
        itemType: ITEM_TYPE_MAP[section.itemTypeId],
        silhouette: section.silhouette,
        colorNumber: section.colorNumber,
        rows,
      };
    });
}

function sortByDateDesc(sheets: MeasurementSheet[]): MeasurementSheet[] {
  return [...sheets].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
}

export async function listSheets(customerId: Uuid): Promise<MeasurementSheet[]> {
  return sortByDateDesc(getDb().measurementSheets.filter((s) => s.customerId === customerId));
}

/**
 * 指定の採寸票を、1 つ前の採寸票との差分付きで返す。
 * sheetId を省略すると最新を返す。
 */
export async function getSheetView(customerId: Uuid, sheetId?: Uuid): Promise<SheetView | null> {
  const db = getDb();
  const sheets = sortByDateDesc(db.measurementSheets.filter((s) => s.customerId === customerId));
  if (sheets.length === 0) return null;

  const index = sheetId ? sheets.findIndex((s) => s.id === sheetId) : 0;
  if (index < 0) return null;
  const sheet = sheets[index];
  const previousSheet = sheets[index + 1];

  const adjustments: Record<BodyPart, AppliedAdjustmentView[]> = { upper: [], lower: [] };
  const highlights = new Set<SilhouetteRegion>();
  for (const applied of sheet.adjustments) {
    const master = ADJUSTMENT_MAP.get(applied.code);
    if (!master) continue;
    adjustments[master.bodyPart].push({ master, value: applied.value });
    if (master.silhouetteHint) highlights.add(master.silhouetteHint);
  }

  return {
    sheet,
    previousSheet,
    staffName: db.staff.find((s) => s.id === sheet.staffId)?.name ?? "—",
    upper: buildSections(sheet, previousSheet, "upper"),
    lower: buildSections(sheet, previousSheet, "lower"),
    adjustments,
    highlights: [...highlights],
  };
}

/** 顧客の最新採寸票から、シルエットに出す強調部位だけを取り出す */
export async function getSilhouetteState(customerId: Uuid): Promise<{
  highlights: SilhouetteRegion[];
  measuredAt?: string;
  adjustmentCount: number;
} > {
  const sheets = await listSheets(customerId);
  const latest = sheets[0];
  if (!latest) return { highlights: [], adjustmentCount: 0 };
  const highlights = new Set<SilhouetteRegion>();
  for (const applied of latest.adjustments) {
    const hint = ADJUSTMENT_MAP.get(applied.code)?.silhouetteHint;
    if (hint) highlights.add(hint);
  }
  return {
    highlights: [...highlights],
    measuredAt: latest.measuredAt,
    adjustmentCount: latest.adjustments.length,
  };
}

/**
 * 前回値をプリセットした新規採寸票を作る（差分だけ入力できるようにするため）。
 * 過去票は書き換えず、測定日ごとの履歴を壊さない。
 */
export async function createSheetFromPrevious(customerId: Uuid, staffId: Uuid): Promise<Uuid> {
  const sheets = await listSheets(customerId);
  const previous = sheets[0];
  const id = newId("sheet");
  const today = new Date().toISOString().slice(0, 10);

  const sheet: MeasurementSheet = previous
    ? {
        ...structuredClone(previous),
        id,
        measuredAt: today,
        staffId,
        orderId: undefined,
        note: undefined,
      }
    : {
        id,
        customerId,
        measuredAt: today,
        staffId,
        inputMethod: "tablet",
        sections: [
          { itemTypeId: "jacket", values: {} },
          { itemTypeId: "pants", values: {} },
        ],
        adjustments: [],
      };

  mutateDb((db) => ({ ...db, measurementSheets: [...db.measurementSheets, sheet] }));
  return id;
}

export async function updateMeasurementValue(
  sheetId: Uuid,
  itemTypeId: MeasurementField["itemTypeId"],
  fieldKey: string,
  column: "actual" | "finished",
  value: number | undefined,
): Promise<void> {
  mutateDb((db) => ({
    ...db,
    measurementSheets: db.measurementSheets.map((sheet) => {
      if (sheet.id !== sheetId) return sheet;
      return {
        ...sheet,
        sections: sheet.sections.map((section) => {
          if (section.itemTypeId !== itemTypeId) return section;
          const current = section.values[fieldKey] ?? {};
          return {
            ...section,
            values: { ...section.values, [fieldKey]: { ...current, [column]: value } },
          };
        }),
      };
    }),
  }));
}

/** 上半身5ヶ・下半身3ヶの制約に対して、いま何個使っているか */
export function adjustmentUsage(
  adjustments: Record<BodyPart, AppliedAdjustmentView[]>,
): Record<BodyPart, { used: number; max: number; exceeded: boolean }> {
  const build = (part: BodyPart) => {
    const used = adjustments[part].length;
    return { used, max: MAX_ADJUSTMENTS[part], exceeded: used > MAX_ADJUSTMENTS[part] };
  };
  return { upper: build("upper"), lower: build("lower") };
}

export async function toggleAdjustment(sheetId: Uuid, code: number): Promise<void> {
  const master = ADJUSTMENT_MAP.get(code);
  if (!master) return;
  mutateDb((db) => ({
    ...db,
    measurementSheets: db.measurementSheets.map((sheet) => {
      if (sheet.id !== sheetId) return sheet;
      const exists = sheet.adjustments.some((a) => a.code === code);
      return {
        ...sheet,
        adjustments: exists
          ? sheet.adjustments.filter((a) => a.code !== code)
          : [...sheet.adjustments, { code, value: master.defaultValue }],
      };
    }),
  }));
}
