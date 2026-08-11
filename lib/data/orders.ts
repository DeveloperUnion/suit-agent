import type { IsoDate, ItemTypeId, Order, OrderItem, OrderPurpose, Uuid } from "@/lib/types";
import { getDb, mutateDb, newId } from "@/lib/store/mock-db";
import { ITEM_TYPE_MAP } from "@/lib/constants/measurement-fields";
import { toIsoDate } from "@/lib/utils/date";

export type OrderView = Order & {
  staffName: string;
  items: OrderItem[];
};

export async function listOrders(customerId: Uuid): Promise<OrderView[]> {
  const db = getDb();
  return db.orders
    .filter((o) => o.customerId === customerId)
    .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt))
    .map((order) => ({
      ...order,
      staffName: db.staff.find((s) => s.id === order.staffId)?.name ?? "—",
      items: db.orderItems.filter((item) => item.orderId === order.id),
    }));
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
 * 色×柄の内訳は持たない。生地マスタを廃して紙の値をそのまま保存するようにしたため、
 * 「ネイビー」「無地」といった正規化された系統がどこにも無くなった。
 * 原反NO の文字列だけでは同系統かどうかを判定できず、
 * 当てにならない集計を出すくらいなら出さないほうがよい。
 *
 * 累計購入額・購入回数もここに含めない。顧客を金額で格付けする表示は、
 * 本システムが信頼関係の維持を目的としていることと衝突するため
 * （個々の注文の金額は事実の記録として注文カードに残す）。
 */
export async function getOwnedItemSummary(customerId: Uuid): Promise<OwnedItemSummary> {
  const db = getDb();
  const orders = db.orders.filter((o) => o.customerId === customerId);
  const orderIds = new Set(orders.map((o) => o.id));
  const items = db.orderItems.filter((item) => orderIds.has(item.orderId));

  const itemCounts = new Map<ItemTypeId, number>();
  for (const item of items) {
    itemCounts.set(item.itemTypeId, (itemCounts.get(item.itemTypeId) ?? 0) + 1);
  }

  const tracked: ItemTypeId[] = ["jacket", "pants", "vest", "shirt", "coat"];

  return {
    byItemType: tracked
      .filter((id) => (itemCounts.get(id) ?? 0) > 0)
      .map((id) => ({ itemTypeId: id, name: ITEM_TYPE_MAP[id].name, count: itemCounts.get(id) ?? 0 })),
    hasOrders: orders.length > 0,
    missingItemTypes: tracked
      .filter((id) => !itemCounts.get(id))
      .map((id) => ({ itemTypeId: id, name: ITEM_TYPE_MAP[id].name })),
  };
}

// ── 注文の登録 ──────────────────────────────────

/** 紙の生地欄。原反NO・色番・色名・組成をそのまま持つ */
export type OrderItemFabric = Pick<
  OrderItem,
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
 */
export function defaultTotal(amounts: Omit<OrderAmounts, "totalAmount">): number {
  return amounts.subtotalAmount + amounts.surchargeAmount + amounts.taxAmount;
}

export type CreateOrderInput = {
  customerId: Uuid;
  staffId: Uuid;
  orderedAt: IsoDate;
  dueDate?: IsoDate;
  purpose: OrderPurpose;
  /** どの寸法で作るか。リピートは前回の採寸票をそのまま使うことが多い */
  measurementSheetId?: Uuid;
  /** 生地は 1 注文で 1 種類。紙が原反NO を 1 つしか持たない */
  items: { itemTypeId: ItemTypeId }[];
  fabric: OrderItemFabric;
  amounts: OrderAmounts;
  /**
   * 最終接触日を今日に更新するか。過去日付の紙を取り込むときは false。
   * 取り込みは来店ではないうえ、今日に更新すると
   * 「連絡済みなら出さない」判定まで誤って抑止してしまう
   */
  touchLastContact?: boolean;
};

export async function createOrder(input: CreateOrderInput): Promise<Uuid> {
  const orderId = newId("ord");
  const touchLastContact = input.touchLastContact ?? true;
  const seq = Math.floor(Math.random() * 900) + 100;

  mutateDb((db) => ({
    ...db,
    orders: [
      ...db.orders,
      {
        id: orderId,
        customerId: input.customerId,
        orderNumber: `J1-${seq}-${Math.floor(Math.random() * 900) + 100}`,
        orderedAt: input.orderedAt,
        dueDate: input.dueDate,
        status: "ordered",
        purpose: input.purpose,
        ...input.amounts,
        staffId: input.staffId,
      },
    ],
    orderItems: [
      ...db.orderItems,
      ...input.items.map((item, i) => ({
        id: `${orderId}-item-${i + 1}`,
        orderId,
        itemTypeId: item.itemTypeId,
        ...input.fabric,
      })),
    ],
    // 採寸票を注文に紐づける（どの寸法で作ったかを後から追えるように）
    measurementSheets: input.measurementSheetId
      ? db.measurementSheets.map((s) =>
          s.id === input.measurementSheetId ? { ...s, orderId } : s,
        )
      : db.measurementSheets,
    // 注文＝来店なので最終接触日も動く。放置リストに残り続けるのを防ぐ
    customers: touchLastContact
      ? db.customers.map((c) =>
          c.id === input.customerId ? { ...c, lastContactedAt: toIsoDate(new Date()) } : c,
        )
      : db.customers,
  }));

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
  mutateDb((db) => ({
    ...db,
    orders: db.orders.map((o) =>
      o.id === orderId ? { ...o, deliveredAt, status: "delivered" as const } : o,
    ),
  }));
}

/** 誤操作の取り消し。受注済みまで戻す */
export async function clearOrderDelivery(orderId: Uuid): Promise<void> {
  mutateDb((db) => ({
    ...db,
    orders: db.orders.map((o) =>
      o.id === orderId ? { ...o, deliveredAt: undefined, status: "ordered" as const } : o,
    ),
  }));
}

