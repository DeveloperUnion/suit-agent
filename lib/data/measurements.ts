import type {
  AdjustmentMaster,
  AppliedAdjustment,
  BodyPart,
  IsoDate,
  ItemType,
  MeasurementField,
  MeasurementSection,
  MeasurementSheet,
  MeasurementValue,
  SilhouetteCorrection,
  Uuid,
} from "@/lib/types";
import { supabase } from "@/lib/supabase/client";
import { bump } from "@/lib/store/revision";
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
  /** シルエットに描く補正マーク（部位＋番号） */
  corrections: SilhouetteCorrection[];
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

/**
 * DB は縦持ち（1 項目 1 行）だが、画面が見る型は入れ子のまま。
 * 変換はこの層に閉じる。
 *
 * 縦持ちにしたのは型と制約のため。field_key は (item_type_id, key) の複合 FK
 * なので、存在しない項目名は制約違反で弾かれる。jsonb だと静かに NULL が
 * 返り、「記録がありません」と答えてしまう。
 */

/*
 * 値は区画の下にぶら下げて取る。
 *
 * measurement_values が票へ直接 FK を持っていないため（(sheet_id, item_type_id) で
 * 区画を、(item_type_id, field_key) でマスタを指す複合 FK）、票から直接は
 * 埋め込めない。区画を経由するのが実態に合っている。
 */
const SHEET_COLUMNS = `
  id, customerId:customer_id, orderId:order_id, measuredAt:measured_at,
  recordedByStaffId:recorded_by_staff_id, inputMethod:input_method,
  heightCm:height_cm, weightKg:weight_kg, note,
  staff:recorded_by_staff_id ( name ),
  sectionRows:measurement_sections (
    itemTypeId:item_type_id, silhouette, colorNumber:color_number,
    valueRows:measurement_values ( fieldKey:field_key, actual, finished )
  ),
  adjustmentRows:measurement_adjustments ( code, value )
`;

type ValueRow = { fieldKey: string; actual: number | null; finished: number | null };

type SheetRow = Omit<MeasurementSheet, "sections" | "adjustments"> & {
  staff: { name: string } | null;
  sectionRows: {
    itemTypeId: MeasurementSection["itemTypeId"];
    silhouette: string | null;
    colorNumber: string | null;
    valueRows: ValueRow[];
  }[];
  adjustmentRows: { code: number; value: number }[];
};

/** 縦持ちの行を入れ子へ組み直す */
function assemble(row: SheetRow): MeasurementSheet & { staffName: string } {
  const sections: MeasurementSection[] = (row.sectionRows ?? []).map((sec) => {
    const values: Record<string, MeasurementValue> = {};
    for (const v of sec.valueRows ?? []) {
      values[v.fieldKey] = {
        actual: v.actual ?? undefined,
        finished: v.finished ?? undefined,
      };
    }
    return {
      itemTypeId: sec.itemTypeId,
      silhouette: sec.silhouette ?? undefined,
      colorNumber: sec.colorNumber ?? undefined,
      values,
    };
  });

  return {
    id: row.id,
    customerId: row.customerId,
    orderId: row.orderId ?? undefined,
    measuredAt: row.measuredAt,
    recordedByStaffId: row.recordedByStaffId,
    inputMethod: row.inputMethod,
    heightCm: row.heightCm ?? undefined,
    weightKg: row.weightKg ?? undefined,
    note: row.note ?? undefined,
    sections,
    adjustments: (row.adjustmentRows ?? []).map((a) => ({ code: a.code, value: a.value })),
    staffName: row.staff?.name ?? "\u2014",
  };
}

async function fetchSheets(customerId: Uuid) {
  const { data, error } = await supabase()
    .from("measurement_sheets")
    .select(SHEET_COLUMNS)
    .eq("customer_id", customerId)
    .order("measured_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => assemble(r as unknown as SheetRow));
}

export async function listSheets(customerId: Uuid): Promise<MeasurementSheet[]> {
  return fetchSheets(customerId);
}

/**
 * 指定の採寸票を、1 つ前の採寸票との差分付きで返す。
 * sheetId を省略すると最新を返す。
 */
export async function getSheetView(customerId: Uuid, sheetId?: Uuid): Promise<SheetView | null> {
  const sheets = await fetchSheets(customerId);
  if (sheets.length === 0) return null;

  const index = sheetId ? sheets.findIndex((s) => s.id === sheetId) : 0;
  if (index < 0) return null;
  const sheet = sheets[index];
  const previousSheet = sheets[index + 1];

  const adjustments: Record<BodyPart, AppliedAdjustmentView[]> = { upper: [], lower: [] };
  const corrections: SilhouetteCorrection[] = [];
  for (const applied of sheet.adjustments) {
    const master = ADJUSTMENT_MAP.get(applied.code);
    if (!master) continue;
    adjustments[master.bodyPart].push({ master, value: applied.value });
    if (master.silhouetteHint) {
      corrections.push({ region: master.silhouetteHint, code: master.code });
    }
  }

  return {
    sheet,
    previousSheet,
    staffName: sheet.staffName,
    upper: buildSections(sheet, previousSheet, "upper"),
    lower: buildSections(sheet, previousSheet, "lower"),
    adjustments,
    corrections,
  };
}

/** 顧客の最新採寸票から、シルエットに出す補正だけを取り出す */
export async function getSilhouetteState(customerId: Uuid): Promise<{
  corrections: SilhouetteCorrection[];
  measuredAt?: string;
  adjustmentCount: number;
}> {
  const sheets = await fetchSheets(customerId);
  const latest = sheets[0];
  if (!latest) return { corrections: [], adjustmentCount: 0 };
  const corrections: SilhouetteCorrection[] = [];
  for (const applied of latest.adjustments) {
    const master = ADJUSTMENT_MAP.get(applied.code);
    if (master?.silhouetteHint) {
      corrections.push({ region: master.silhouetteHint, code: master.code });
    }
  }
  return {
    corrections,
    measuredAt: latest.measuredAt,
    adjustmentCount: latest.adjustments.length,
  };
}

/** 票の本体と、その配下の区画・値・補正をまとめて入れる */
async function insertSheet(input: {
  customerId: Uuid;
  measuredAt: IsoDate;
  inputMethod: MeasurementSheet["inputMethod"];
  sections: MeasurementSection[];
  adjustments: AppliedAdjustment[];
  note?: string;
}): Promise<Uuid> {
  // recorded_by_staff_id は渡さない。DB の default が app.current_staff_id()。
  const { data, error } = await supabase()
    .from("measurement_sheets")
    .insert({
      customer_id: input.customerId,
      measured_at: input.measuredAt,
      input_method: input.inputMethod,
      note: input.note ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  const sheetId = (data as { id: string }).id;

  const sections = input.sections.map((s) => ({
    sheet_id: sheetId,
    item_type_id: s.itemTypeId,
    silhouette: s.silhouette ?? null,
    color_number: s.colorNumber ?? null,
  }));
  if (sections.length > 0) {
    const { error: e } = await supabase().from("measurement_sections").insert(sections);
    if (e) throw e;
  }

  const values = input.sections.flatMap((s) =>
    Object.entries(s.values)
      .filter(([, v]) => v.actual !== undefined || v.finished !== undefined)
      .map(([fieldKey, v]) => ({
        sheet_id: sheetId,
        item_type_id: s.itemTypeId,
        field_key: fieldKey,
        actual: v.actual ?? null,
        finished: v.finished ?? null,
      })),
  );
  if (values.length > 0) {
    const { error: e } = await supabase().from("measurement_values").insert(values);
    if (e) throw e;
  }

  if (input.adjustments.length > 0) {
    const { error: e } = await supabase()
      .from("measurement_adjustments")
      .insert(input.adjustments.map((a) => ({ sheet_id: sheetId, code: a.code, value: a.value })));
    if (e) throw e;
  }

  bump();
  return sheetId;
}

/**
 * 前回値をプリセットした新規採寸票を作る（差分だけ入力できるようにするため）。
 * 過去票は書き換えず、測定日ごとの履歴を壊さない。
 */
export async function createSheetFromPrevious(customerId: Uuid): Promise<Uuid> {
  const sheets = await fetchSheets(customerId);
  const previous = sheets[0];
  const today = new Date().toISOString().slice(0, 10);

  return insertSheet({
    customerId,
    measuredAt: today,
    inputMethod: "tablet",
    sections: previous?.sections ?? [
      { itemTypeId: "jacket", values: {} },
      { itemTypeId: "pants", values: {} },
    ],
    adjustments: previous?.adjustments ?? [],
  });
}

/**
 * 工場発注書から採寸票を作る。
 *
 * inputMethod: "ocr" を書くのはここだけ。採寸票の出どころが手入力か紙かは、
 * 値を疑うときに真っ先に知りたい情報なので、票そのものに残す。
 */
export async function createSheetFromImport(input: {
  customerId: Uuid;
  measuredAt: IsoDate;
  sections: MeasurementSection[];
  adjustments: AppliedAdjustment[];
  note?: string;
}): Promise<Uuid> {
  return insertSheet({ ...input, inputMethod: "ocr" });
}

export async function updateMeasurementValue(
  sheetId: Uuid,
  itemTypeId: MeasurementField["itemTypeId"],
  fieldKey: string,
  column: "actual" | "finished",
  value: number | undefined,
): Promise<void> {
  // 値を消したときに行ごと消さないのは、実寸だけ消して上がり寸を残す操作が
  // あるため。両方 null の行は残るが、読み出しで undefined に均される。
  const { error } = await supabase()
    .from("measurement_values")
    .upsert(
      {
        sheet_id: sheetId,
        item_type_id: itemTypeId,
        field_key: fieldKey,
        [column]: value ?? null,
      },
      { onConflict: "sheet_id,item_type_id,field_key" },
    );
  if (error) throw error;
  bump();
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

  const { data } = await supabase()
    .from("measurement_adjustments")
    .select("code")
    .eq("sheet_id", sheetId)
    .eq("code", code)
    .maybeSingle();

  if (data) {
    const { error } = await supabase()
      .from("measurement_adjustments")
      .delete()
      .eq("sheet_id", sheetId)
      .eq("code", code);
    if (error) throw error;
  } else {
    const { error } = await supabase()
      .from("measurement_adjustments")
      .insert({ sheet_id: sheetId, code, value: master.defaultValue });
    if (error) throw error;
  }
  bump();
}
