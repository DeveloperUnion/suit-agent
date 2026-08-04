import type { ColorFamily, Fabric, ItemTypeId, Order, OrderItem, Uuid } from "@/lib/types";
import { getDb } from "@/lib/store/mock-db";
import { ITEM_TYPE_MAP } from "@/lib/constants/measurement-fields";
import { COLOR_FAMILY_LABEL, FABRIC_PATTERN_LABEL } from "@/lib/constants/labels";

export type OrderItemView = OrderItem & { fabric?: Fabric };

export type OrderView = Order & {
  staffName: string;
  items: OrderItemView[];
};

export async function listOrders(customerId: Uuid): Promise<OrderView[]> {
  const db = getDb();
  return db.orders
    .filter((o) => o.customerId === customerId)
    .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt))
    .map((order) => ({
      ...order,
      staffName: db.staff.find((s) => s.id === order.staffId)?.name ?? "—",
      items: db.orderItems
        .filter((item) => item.orderId === order.id)
        .map((item) => ({ ...item, fabric: db.fabrics.find((f) => f.id === item.fabricId) })),
    }));
}

export type OwnedItemSummary = {
  /** アイテム種別ごとの保有数 */
  byItemType: { itemTypeId: ItemTypeId; name: string; count: number }[];
  /** 色×柄の内訳。同系統を重ねて勧めないための判定材料 */
  byColorPattern: { label: string; count: number }[];
  totalOrders: number;
  totalAmount: number;
  /** まだ 1 着も持っていないアイテム種別 */
  missingItemTypes: { itemTypeId: ItemTypeId; name: string }[];
};

/**
 * 保有アイテム構成の集計。
 * 「紺の無地を既に3着持つ顧客に紺の無地を勧める」事故を防ぐための材料であり、
 * 注文タブの最上部に出す。
 */
export async function getOwnedItemSummary(customerId: Uuid): Promise<OwnedItemSummary> {
  const db = getDb();
  const orders = db.orders.filter((o) => o.customerId === customerId);
  const orderIds = new Set(orders.map((o) => o.id));
  const items = db.orderItems.filter((item) => orderIds.has(item.orderId));

  const itemCounts = new Map<ItemTypeId, number>();
  const colorPatternCounts = new Map<string, number>();

  for (const item of items) {
    itemCounts.set(item.itemTypeId, (itemCounts.get(item.itemTypeId) ?? 0) + 1);
    const fabric = db.fabrics.find((f) => f.id === item.fabricId);
    if (!fabric) continue;
    // ジャケットとパンツで同じ生地が二重計上されるのを避け、上衣だけを数える
    if (item.itemTypeId !== "jacket" && item.itemTypeId !== "coat") continue;
    const label = `${COLOR_FAMILY_LABEL[fabric.colorFamily as ColorFamily]}${FABRIC_PATTERN_LABEL[fabric.pattern]}`;
    colorPatternCounts.set(label, (colorPatternCounts.get(label) ?? 0) + 1);
  }

  const tracked: ItemTypeId[] = ["jacket", "pants", "vest", "shirt", "coat"];

  return {
    byItemType: tracked
      .filter((id) => (itemCounts.get(id) ?? 0) > 0)
      .map((id) => ({ itemTypeId: id, name: ITEM_TYPE_MAP[id].name, count: itemCounts.get(id) ?? 0 })),
    byColorPattern: [...colorPatternCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    totalOrders: orders.length,
    totalAmount: orders.reduce((sum, o) => sum + o.totalAmount, 0),
    missingItemTypes: tracked
      .filter((id) => !itemCounts.get(id))
      .map((id) => ({ itemTypeId: id, name: ITEM_TYPE_MAP[id].name })),
  };
}
