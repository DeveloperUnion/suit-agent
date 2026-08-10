import type {
  AppliedAdjustment,
  Fabric,
  IsoDate,
  ItemTypeId,
  MeasurementSection,
  OrderPurpose,
  Uuid,
} from "@/lib/types";
import type { OrderSheetExtraction } from "@/lib/ai/extract-order-sheet";
import { CONFIDENCE_WARN } from "@/lib/ai/extraction";
import { ADJUSTMENT_MAP, adjustmentLabel } from "@/lib/constants/adjustments";
import { deriveActual } from "@/lib/constants/measurement-ease";
import { findField } from "@/lib/constants/measurement-fields";
import { createSheetFromImport } from "@/lib/data/measurements";
import { createOrder, markOrderDelivered } from "@/lib/data/orders";
import { updateCustomer } from "@/lib/data/customers";
import { getItemPrice } from "@/lib/data/settings";
import { formatDateDot } from "@/lib/utils/date";

/**
 * 工場発注書の取り込み。
 *
 * 読み取り結果をそのまま書かず、必ず確認画面を通す。紙は上がり寸しか持たず、
 * 顧客も生地も紙の文字列からの推測になるため、黙って書くと誰も気づけない誤りが残る。
 *
 * ここは「確認画面がそのまま編集できる形」を組み立てるところまでを受け持ち、
 * 書き込みは commitOrderSheetImport でしか起きない。
 */

export type ImportPlanValue = {
  fieldKey: string;
  label: string;
  finished?: number;
  /**
   * 実寸。紙には載らないため、lib/constants/measurement-ease.ts の
   * ゆとり表が埋まるまで常に undefined になる。
   */
  actual?: number;
  confidence: number;
};

export type ImportPlanSection = {
  itemTypeId: ItemTypeId;
  silhouette?: string;
  colorNumber?: string;
  values: ImportPlanValue[];
};

export type ImportPlanAdjustment = {
  code: number;
  /** マスタに無いコード。取り込まず、備考へ回す */
  unknown: boolean;
  label: string;
  value: number;
};

export type ImportPlan = {
  customerId: Uuid;
  /** 紙のお客様名。開いているカルテと違えば確認画面が警告する */
  paperCustomerName?: string;
  embroideryName?: string;
  updateEmbroideryName: boolean;
  measuredAt: IsoDate;
  orderedAt: IsoDate;
  dueDate?: IsoDate;
  deliveredAt?: IsoDate;
  purpose: OrderPurpose;
  fabricId?: Uuid;
  /** 生地が特定できなかったときに、確認画面の検索へ初期値として渡す */
  fabricHint?: string;
  totalAmount: number;
  /** 合計を紙から読めたか。読めていなければ標準価格の合算だと画面に明示する */
  totalFromPaper: boolean;
  sections: ImportPlanSection[];
  adjustments: ImportPlanAdjustment[];
  note: string;
  /** 要確認の項目数。確認画面の冒頭に出す */
  lowConfidenceCount: number;
};

/** 読み取り結果を、確認画面がそのまま編集できる形へ組み直す（同期・副作用なし） */
export function buildImportPlan(
  extraction: OrderSheetExtraction,
  context: { customerId: Uuid; fabrics: Fabric[] },
): ImportPlan {
  const unknownFieldKeys: string[] = [];
  let lowConfidenceCount = 0;

  const sections: ImportPlanSection[] = extraction.sections.map((section) => {
    const values: ImportPlanValue[] = [];
    for (const [fieldKey, cell] of Object.entries(section.finished)) {
      const definition = findField(section.itemTypeId, fieldKey);
      if (!definition) {
        // 採寸項目に無いものは黙って捨てず、備考へ回して人が読めるようにする
        unknownFieldKeys.push(`${section.itemTypeId}:${fieldKey}=${cell.value}`);
        continue;
      }
      if (cell.confidence < CONFIDENCE_WARN) lowConfidenceCount += 1;
      values.push({
        fieldKey,
        label: definition.label,
        finished: cell.value,
        // ゆとり表が埋まれば、ここで自動的に実寸が入る
        actual: deriveActual(section.itemTypeId, fieldKey, cell.value),
        confidence: cell.confidence,
      });
    }
    return {
      itemTypeId: section.itemTypeId,
      silhouette: section.silhouette?.value,
      colorNumber: section.colorNumber?.value,
      values,
    };
  });

  const adjustments: ImportPlanAdjustment[] = extraction.adjustments.map((entry) => {
    const master = ADJUSTMENT_MAP.get(entry.code.value);
    return {
      code: entry.code.value,
      unknown: master === undefined,
      label: master ? adjustmentLabel(master) : entry.rawLabel,
      value: entry.value?.value ?? master?.defaultValue ?? 0,
    };
  });

  // 生地は原反NO で照合する。完全一致が取れなければ前方一致まで見る
  const hint = extraction.fabricProductNumber?.value?.trim();
  const normalized = hint?.toLowerCase() ?? "";
  const fabric =
    normalized === ""
      ? undefined
      : (context.fabrics.find((f) => f.productNumber.toLowerCase() === normalized) ??
        context.fabrics.find((f) => f.productNumber.toLowerCase().startsWith(normalized)));

  const orderedAt = extraction.orderedAt?.value ?? new Date().toISOString().slice(0, 10);

  const totalFromPaper = extraction.totalAmount !== undefined;
  const totalAmount =
    extraction.totalAmount?.value ??
    sections.reduce((sum, s) => sum + getItemPrice(s.itemTypeId), 0);

  return {
    customerId: context.customerId,
    paperCustomerName: extraction.customerName?.value,
    embroideryName: extraction.embroideryName?.value,
    updateEmbroideryName: extraction.embroideryName !== undefined,
    // 紙に採寸日は無い。今日にすると過去の紙が履歴の先頭に来て、前回比が全部壊れる
    measuredAt: orderedAt,
    orderedAt,
    dueDate: extraction.factoryDueDate?.value,
    deliveredAt: extraction.handoverDate?.value,
    purpose: "business",
    fabricId: fabric?.id,
    fabricHint: hint,
    totalAmount,
    totalFromPaper,
    sections,
    adjustments,
    note: buildNote(extraction, unknownFieldKeys),
    lowConfidenceCount,
  };
}

/**
 * 備考。モデルに持ち場のない紙の事実を、解釈せず原文のまま1行ずつ残す。
 * ここを削ると「紙にはあったがアプリには無い」情報が完全に消える。
 */
function buildNote(extraction: OrderSheetExtraction, unknownFieldKeys: string[]): string {
  const lines: string[] = [];

  const shop = [extraction.shopName?.value, extraction.fitterName?.value].filter(Boolean);
  if (shop.length > 0) lines.push(`販売店 ${shop.join(" / フィッター ")}`);

  const fabric = [
    extraction.fabricProductNumber && `原反NO ${extraction.fabricProductNumber.value}`,
    extraction.fabricColorNumber && `色番 ${extraction.fabricColorNumber.value}`,
    extraction.liningCode && `裏地 ${extraction.liningCode.value}`,
  ].filter(Boolean);
  if (fabric.length > 0) lines.push(fabric.join(" "));

  if (extraction.factoryDueDate) {
    lines.push(`工場納品日 ${formatDateDot(extraction.factoryDueDate.value)}`);
  }
  if (unknownFieldKeys.length > 0) {
    lines.push(`採寸項目に無い記入: ${unknownFieldKeys.join(", ")}`);
  }
  if (extraction.note) lines.push(extraction.note.value);

  return lines.join("\n");
}

/** 確認後に初めて書く。採寸票1枚と注文1件を作る */
export async function commitOrderSheetImport(
  plan: ImportPlan,
  staffId: Uuid,
): Promise<{ sheetId: Uuid; orderId: Uuid }> {
  const sections: MeasurementSection[] = plan.sections.map((section) => ({
    itemTypeId: section.itemTypeId,
    silhouette: section.silhouette,
    colorNumber: section.colorNumber,
    values: Object.fromEntries(
      section.values
        .filter((v) => v.finished !== undefined)
        .map((v) => [v.fieldKey, { finished: v.finished, actual: v.actual }]),
    ),
  }));

  // マスタに無いコードは票に入れない。入れても getSheetView が拾えず、
  // 保存されているのに画面のどこにも出ない状態になる（備考には残してある）
  const adjustments: AppliedAdjustment[] = plan.adjustments
    .filter((a) => !a.unknown)
    .map((a) => ({ code: a.code, value: a.value }));

  const unknownAdjustments = plan.adjustments.filter((a) => a.unknown);
  const note = [
    plan.note,
    unknownAdjustments.length > 0
      ? `未登録の補正: ${unknownAdjustments.map((a) => `${a.code} ${a.label}`).join(", ")}`
      : "",
  ]
    .filter((line) => line !== "")
    .join("\n");

  const sheetId = await createSheetFromImport({
    customerId: plan.customerId,
    measuredAt: plan.measuredAt,
    staffId,
    sections,
    adjustments,
    note: note || undefined,
  });

  // 注文の作り方を二重に持たないよう、既存の createOrder に通す。
  // ミューテーションが2回に分かれるが、規則を2箇所へ分裂させるよりましだと判断した
  const orderId = await createOrder({
    customerId: plan.customerId,
    staffId,
    orderedAt: plan.orderedAt,
    dueDate: plan.dueDate,
    purpose: plan.purpose,
    measurementSheetId: sheetId,
    totalAmount: plan.totalAmount,
    // 過去日付の紙を取り込んだだけで「今日連絡した」ことにはしない
    touchLastContact: false,
    items: plan.sections
      .filter(() => plan.fabricId !== undefined)
      .map((section) => ({
        itemTypeId: section.itemTypeId,
        fabricId: plan.fabricId!,
        amount: getItemPrice(section.itemTypeId),
      })),
  });

  if (plan.deliveredAt) await markOrderDelivered(orderId, plan.deliveredAt);
  if (plan.updateEmbroideryName && plan.embroideryName) {
    await updateCustomer(plan.customerId, { embroideryName: plan.embroideryName });
  }

  return { sheetId, orderId };
}
