import { getDb } from "@/lib/store/mock-db";
import { getCurrentStaff } from "@/lib/auth/current-staff";
import { ELAPSED_DAYS_THRESHOLD } from "@/lib/constants/labels";
import { listCustomers } from "@/lib/data/customers";
import { listApproaches, type ApproachItem } from "@/lib/data/approaches";
import { daysAgo } from "@/lib/utils/date";

/**
 * ダッシュボードの集計。
 *
 * 顧客はスタッフごとに分割されているため、これはすべて「自分の顧客」の話。
 * 要件4.6にある「担当別の対応状況」は、他人の顧客が見えない以上ここでは出せない。
 *
 * この画面の主目的は放置の可視化（要件4.4）。経過日数の分布が中心で、
 * 他の数値はその文脈を与えるために置いている。
 */

export type RecencyBucket = {
  key: string;
  label: string;
  count: number;
  /** 閾値を超えているバケットか */
  overdue: boolean;
};

export type DashboardSummary = {
  staffName: string;
  customerCount: number;
  /** 未接触（連絡した記録がない）顧客。分布には入れず注記で出す */
  neverContacted: number;

  openApproaches: number;
  topApproaches: ApproachItem[];

  overdueCount: number;
  overdueRatio: number;

  /**
   * 直近30日の受注。
   * 要件4.6は「今月の受注・売上」だが、月初は必ず 0 近辺になり指標として働かない。
   * 移動30日にすると、いつ見ても同じ意味で読める。
   */
  recentOrderCount: number;
  recentRevenue: number;

  /** 2回以上注文した顧客 ÷ 注文が1件以上ある顧客 */
  repeatRate: number | null;
  repeatCustomers: number;
  orderedCustomers: number;

  distribution: RecencyBucket[];
};

const BUCKETS: { key: string; label: string; max: number | null }[] = [
  { key: "b1", label: "30日以内", max: 30 },
  { key: "b2", label: "31–90日", max: ELAPSED_DAYS_THRESHOLD },
  { key: "b3", label: "91–180日", max: 180 },
  { key: "b4", label: "181日〜", max: null },
];

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const db = getDb();
  const customers = await listCustomers();
  const approaches = await listApproaches();

  const customerIds = new Set(customers.map((c) => c.id));
  const now = new Date();
  const since = daysAgo(30, now);

  // ── 経過日数の分布 ──
  const counts = new Map(BUCKETS.map((b) => [b.key, 0]));
  let neverContacted = 0;
  for (const customer of customers) {
    if (customer.elapsedDays === null) {
      neverContacted += 1;
      continue;
    }
    const bucket = BUCKETS.find((b) => b.max === null || customer.elapsedDays! <= b.max);
    if (bucket) counts.set(bucket.key, (counts.get(bucket.key) ?? 0) + 1);
  }

  const distribution: RecencyBucket[] = BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    count: counts.get(b.key) ?? 0,
    overdue: b.max === null || b.max > ELAPSED_DAYS_THRESHOLD,
  }));

  const overdueCount = distribution
    .filter((b) => b.overdue)
    .reduce((sum, b) => sum + b.count, 0);

  // ── 直近30日の受注 ──
  const recentOrders = db.orders.filter(
    (o) => customerIds.has(o.customerId) && o.orderedAt >= since,
  );

  // ── リピート率 ──
  const orderCountByCustomer = new Map<string, number>();
  for (const order of db.orders) {
    if (!customerIds.has(order.customerId)) continue;
    orderCountByCustomer.set(
      order.customerId,
      (orderCountByCustomer.get(order.customerId) ?? 0) + 1,
    );
  }
  const orderedCustomers = orderCountByCustomer.size;
  const repeatCustomers = [...orderCountByCustomer.values()].filter((n) => n >= 2).length;

  return {
    staffName: getCurrentStaff()?.name ?? "—",
    customerCount: customers.length,
    neverContacted,

    openApproaches: approaches.total,
    topApproaches: approaches.items.slice(0, 5),

    overdueCount,
    overdueRatio: customers.length > 0 ? overdueCount / customers.length : 0,

    recentOrderCount: recentOrders.length,
    recentRevenue: recentOrders.reduce((sum, o) => sum + o.totalAmount, 0),

    repeatRate: orderedCustomers > 0 ? repeatCustomers / orderedCustomers : null,
    repeatCustomers,
    orderedCustomers,

    distribution,
  };
}
