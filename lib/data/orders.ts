import type {
  ColorFamily,
  Fabric,
  IsoDate,
  ItemTypeId,
  Order,
  OrderItem,
  OrderPurpose,
  SpecSelection,
  Uuid,
} from "@/lib/types";
import { getDb, mutateDb, newId } from "@/lib/store/mock-db";
import { ITEM_TYPE_MAP } from "@/lib/constants/measurement-fields";
import { COLOR_FAMILY_LABEL, FABRIC_PATTERN_LABEL } from "@/lib/constants/labels";
import { toIsoDate } from "@/lib/utils/date";

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
  /** まだ 1 着も持っていないアイテム種別 */
  missingItemTypes: { itemTypeId: ItemTypeId; name: string }[];
  /** 注文が 1 件でもあるか。表示の出し分けにだけ使う */
  hasOrders: boolean;
};

/**
 * 保有アイテム構成の集計。
 * 「紺の無地を既に3着持つ顧客に紺の無地を勧める」事故を防ぐための材料であり、
 * 注文タブの最上部に出す。
 *
 * 累計購入額・購入回数はここに含めない。顧客を金額で格付けする表示は、
 * 本システムが信頼関係の維持を目的としていることと衝突するため
 * （個々の注文の金額は事実の記録として注文カードに残す）。
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
    hasOrders: orders.length > 0,
    missingItemTypes: tracked
      .filter((id) => !itemCounts.get(id))
      .map((id) => ({ itemTypeId: id, name: ITEM_TYPE_MAP[id].name })),
  };
}

// ── 注文の登録 ──────────────────────────────────

export async function listFabrics(keyword = ""): Promise<Fabric[]> {
  const q = keyword.trim().toLowerCase();
  return getDb().fabrics.filter((f) => {
    if (!q) return true;
    return `${f.brand} ${f.productNumber} ${f.color}`.toLowerCase().includes(q);
  });
}

/**
 * その生地と同系統のものを、顧客がすでに何着持っているか。
 *
 * 「紺の無地を既に3着持つ顧客に紺の無地を勧める」事故は高価格帯の信頼商売で
 * 致命的（要件3.1）。注文履歴を見に行かないと気づけないのでは遅いため、
 * 生地を選ぶその瞬間に出す。
 */
export type FabricOverlap = { label: string; count: number };

export async function checkFabricOverlap(
  customerId: Uuid,
  fabricId: Uuid,
): Promise<FabricOverlap | null> {
  const db = getDb();
  const fabric = db.fabrics.find((f) => f.id === fabricId);
  if (!fabric) return null;

  const orderIds = new Set(db.orders.filter((o) => o.customerId === customerId).map((o) => o.id));
  const count = db.orderItems.filter((item) => {
    if (!orderIds.has(item.orderId)) return false;
    // 上衣だけ数える。同じ生地のジャケットとパンツを二重に数えないため
    if (item.itemTypeId !== "jacket" && item.itemTypeId !== "coat") return false;
    const f = db.fabrics.find((x) => x.id === item.fabricId);
    return f?.colorFamily === fabric.colorFamily && f?.pattern === fabric.pattern;
  }).length;

  if (count === 0) return null;
  return {
    label: `${COLOR_FAMILY_LABEL[fabric.colorFamily]}${FABRIC_PATTERN_LABEL[fabric.pattern]}`,
    count,
  };
}

/** 直近の注文で使った仕様。リピートが多いためプリセットに使う */
export async function getPreviousSpecs(
  customerId: Uuid,
  itemTypeId: ItemTypeId,
): Promise<SpecSelection | null> {
  const db = getDb();
  const orders = db.orders
    .filter((o) => o.customerId === customerId)
    .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt));
  for (const order of orders) {
    const item = db.orderItems.find(
      (i) => i.orderId === order.id && i.itemTypeId === itemTypeId,
    );
    if (item) return item.specs;
  }
  return null;
}

export type CreateOrderInput = {
  customerId: Uuid;
  staffId: Uuid;
  orderedAt: IsoDate;
  dueDate?: IsoDate;
  purpose: OrderPurpose;
  /** どの寸法で作るか。リピートは前回の採寸票をそのまま使うことが多い */
  measurementSheetId?: Uuid;
  items: { itemTypeId: ItemTypeId; fabricId: Uuid; specs: SpecSelection; amount: number }[];
};

export async function createOrder(input: CreateOrderInput): Promise<Uuid> {
  const orderId = newId("ord");
  const total = input.items.reduce((sum, i) => sum + i.amount, 0);
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
        totalAmount: total,
        staffId: input.staffId,
      },
    ],
    orderItems: [
      ...db.orderItems,
      ...input.items.map((item, i) => ({
        id: `${orderId}-item-${i + 1}`,
        orderId,
        itemTypeId: item.itemTypeId,
        fabricId: item.fabricId,
        specs: item.specs,
        amount: item.amount,
      })),
    ],
    // 採寸票を注文に紐づける（どの寸法で作ったかを後から追えるように）
    measurementSheets: input.measurementSheetId
      ? db.measurementSheets.map((s) =>
          s.id === input.measurementSheetId ? { ...s, orderId } : s,
        )
      : db.measurementSheets,
    // 注文＝来店なので最終接触日も動く。放置リストに残り続けるのを防ぐ
    customers: db.customers.map((c) =>
      c.id === input.customerId ? { ...c, lastContactedAt: toIsoDate(new Date()) } : c,
    ),
  }));

  return orderId;
}


