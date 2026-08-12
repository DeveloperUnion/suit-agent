import type { IsoDate, ItemTypeId, Order, OrderItem, OrderPurpose, Uuid } from "@/lib/types";
import { supabase } from "@/lib/supabase/client";
import { bump } from "@/lib/store/revision";
import { ITEM_TYPE_MAP } from "@/lib/constants/measurement-fields";

/**
 * 注文のデータアクセス。
 *
 * 生地は orders 側に持つ（紙が原反ＮＯ を 1 つしか持たないため）。
 * 明細は「何を作ったか」だけで、金額も生地も持たない。
 */

export type OrderView = Order & {
  staffName: string;
  items: OrderItem[];
};

const ORDER_COLUMNS = `
  id, customerId:customer_id, orderNumber:order_number,
  orderedAt:ordered_at, dueDate:due_date, deliveredAt:delivered_at,
  status, purpose,
  fabricProductNumber:fabric_product_number, fabricColorNumber:fabric_color_number,
  fabricColorName:fabric_color_name, fabricComposition:fabric_composition,
  subtotalAmount:subtotal_amount, surchargeAmount:surcharge_amount,
  taxAmount:tax_amount, totalAmount:total_amount,
  takenByStaffId:taken_by_staff_id,
  staff:taken_by_staff_id ( name ),
  items:order_items ( id, orderId:order_id, itemTypeId:item_type_id )
`;

type OrderRow = Order & {
  staff: { name: string } | null;
  items: OrderItem[];
};

function toView(row: OrderRow): OrderView {
  const { staff, ...order } = row;
  return {
    ...order,
    dueDate: order.dueDate ?? undefined,
    deliveredAt: order.deliveredAt ?? undefined,
    staffName: staff?.name ?? "—",
    items: row.items ?? [],
  };
}

export async function listOrders(customerId: Uuid): Promise<OrderView[]> {
  const { data, error } = await supabase()
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("customer_id", customerId)
    .order("ordered_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => toView(r as unknown as OrderRow));
}

export type OwnedItemSummary = {
  /** アイテム種別ごとの保有数 */
  byItemType: { itemTypeId: ItemTypeId; name: string; count: number }[];
  /** まだ 1 着も持っていないアイテム種別 */
  missingItemTypes: { itemTypeId: ItemTypeId; name: string }[];
  /** 注文が 1 件でもあるか。表示の出し分けにだけ使う */
  hasOrders: boolean;
};

/**
 * 保有アイテム構成の集計。注文タブの最上部に出す。
 *
 * 色×柄の内訳は持たない。生地マスタを廃して紙の値をそのまま保存するように
 * したため、「ネイビー」「無地」といった正規化された系統がどこにも無くなった。
 * 原反ＮＯ の文字列だけでは同系統かどうかを判定できず、当てにならない集計を
 * 出すくらいなら出さないほうがよい。
 *
 * 累計購入額・購入回数もここに含めない。顧客を金額で格付けする表示は、
 * 本システムが信頼関係の維持を目的としていることと衝突するため
 * （個々の注文の金額は事実の記録として注文カードに残す）。
 */
export async function getOwnedItemSummary(customerId: Uuid): Promise<OwnedItemSummary> {
  const { data, error } = await supabase()
    .from("order_items")
    .select("item_type_id, orders!inner ( customer_id )")
    .eq("orders.customer_id", customerId);
  if (error) throw error;

  const itemCounts = new Map<ItemTypeId, number>();
  for (const row of data ?? []) {
    const id = (row as { item_type_id: ItemTypeId }).item_type_id;
    itemCounts.set(id, (itemCounts.get(id) ?? 0) + 1);
  }

  const tracked: ItemTypeId[] = ["jacket", "pants", "vest", "shirt", "coat"];
  return {
    byItemType: tracked
      .filter((id) => (itemCounts.get(id) ?? 0) > 0)
      .map((id) => ({ itemTypeId: id, name: ITEM_TYPE_MAP[id].name, count: itemCounts.get(id) ?? 0 })),
    hasOrders: (data ?? []).length > 0,
    missingItemTypes: tracked
      .filter((id) => !itemCounts.get(id))
      .map((id) => ({ itemTypeId: id, name: ITEM_TYPE_MAP[id].name })),
  };
}

// ── 注文の登録 ──────────────────────────────────

/** 紙の生地欄。原反NO・色番・色名・組成をそのまま持つ */
export type OrderItemFabric = Pick<
  Order,
  "fabricProductNumber" | "fabricColorNumber" | "fabricColorName" | "fabricComposition"
>;

/** 紙の右上と同じ4欄 */
export type OrderAmounts = Pick<
  Order,
  "subtotalAmount" | "surchargeAmount" | "taxAmount" | "totalAmount"
>;

/**
 * 合計の既定値。
 * 紙では合計欄も手書きなので、人が上書きするまでの初期値としてだけ使う。
 * DB 側には CHECK もトリガーも置いていない — 3 つの和と一致しないことが
 * 正常な状態だから。
 */
export function defaultTotal(amounts: Omit<OrderAmounts, "totalAmount">): number {
  return amounts.subtotalAmount + amounts.surchargeAmount + amounts.taxAmount;
}

export type CreateOrderInput = {
  customerId: Uuid;
  orderedAt: IsoDate;
  dueDate?: IsoDate;
  purpose: OrderPurpose;
  /** どの寸法で作るか。リピートは前回の採寸票をそのまま使うことが多い */
  measurementSheetId?: Uuid;
  /** 生地は 1 注文で 1 種類。紙が原反NO を 1 つしか持たない */
  items: { itemTypeId: ItemTypeId }[];
  fabric: OrderItemFabric;
  amounts: OrderAmounts;
};

/**
 * 注文の登録。
 *
 * 受注者（taken_by_staff_id）を渡さない。DB の default が
 * app.current_staff_id() なので、アプリは自分が誰かを知らなくてよい。
 * 顧客の担当（customers.staff_id）とは別物で、あちらはアクセス境界、
 * こちらは「誰が操作したか」の記録。
 */
export async function createOrder(input: CreateOrderInput): Promise<Uuid> {
  const seq = Math.floor(Math.random() * 900) + 100;

  const { data, error } = await supabase()
    .from("orders")
    .insert({
      customer_id: input.customerId,
      order_number: `J1-${seq}-${Math.floor(Math.random() * 900) + 100}`,
      ordered_at: input.orderedAt,
      due_date: input.dueDate ?? null,
      status: "ordered",
      purpose: input.purpose,
      fabric_product_number: input.fabric.fabricProductNumber ?? null,
      fabric_color_number: input.fabric.fabricColorNumber ?? null,
      fabric_color_name: input.fabric.fabricColorName ?? null,
      fabric_composition: input.fabric.fabricComposition ?? null,
      subtotal_amount: input.amounts.subtotalAmount,
      surcharge_amount: input.amounts.surchargeAmount,
      tax_amount: input.amounts.taxAmount,
      total_amount: input.amounts.totalAmount,
    })
    .select("id")
    .single();
  if (error) throw error;
  const orderId = (data as { id: string }).id;

  if (input.items.length > 0) {
    const { error: itemError } = await supabase()
      .from("order_items")
      .insert(input.items.map((i) => ({ order_id: orderId, item_type_id: i.itemTypeId })));
    if (itemError) throw itemError;
  }

  // 採寸票を注文に紐づける（どの寸法で作ったかを後から追えるように）
  if (input.measurementSheetId) {
    const { error: sheetError } = await supabase()
      .from("measurement_sheets")
      .update({ order_id: orderId })
      .eq("id", input.measurementSheetId);
    if (sheetError) throw sheetError;
  }

  bump();
  return orderId;
}

// ── 納品の記録 ──────────────────────────────────

/**
 * 納品を記録する。
 *
 * 納品日は「納品後フォロー（着心地確認）」トリガーの起点そのもので、
 * ここが動かないとアプローチが一切立たない。
 */
export async function markOrderDelivered(orderId: Uuid, deliveredAt: IsoDate): Promise<void> {
  const { error } = await supabase()
    .from("orders")
    .update({ delivered_at: deliveredAt, status: "delivered" })
    .eq("id", orderId);
  if (error) throw error;
  bump();
}

/** 誤操作の取り消し。受注済みまで戻す */
export async function clearOrderDelivery(orderId: Uuid): Promise<void> {
  const { error } = await supabase()
    .from("orders")
    .update({ delivered_at: null, status: "ordered" })
    .eq("id", orderId);
  if (error) throw error;
  bump();
}
