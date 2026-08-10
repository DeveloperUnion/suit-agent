import type { IsoMonth } from "@/lib/types";
import { getDb } from "@/lib/store/mock-db";
import { getCurrentStaff, getCurrentStaffId } from "@/lib/auth/current-staff";
import { getRevenueTarget } from "@/lib/data/settings";
import { listCustomers } from "@/lib/data/customers";
import { listApproaches, type ApproachItem } from "@/lib/data/approaches";
import { formatMonthLabel, monthProgress, recentMonths, toIsoMonth } from "@/lib/utils/date";

/**
 * ダッシュボードの集計。
 *
 * この画面は週次の打ち合わせで開き、状況と目標の達成度を確認するためのもの。
 * 顧客はスタッフごとに分割されているため、これはすべて「自分の顧客」の話。
 *
 * 売上は受注日（orderedAt）で数える。納品月で数えると受注の勢いが 1〜2ヶ月遅れて
 * 見えることになり、週次で手を打つ材料にならない。従来の集計もこの基準だった。
 */

export type MonthlyRevenuePoint = {
  month: IsoMonth;
  label: string;
  revenue: number;
  orderCount: number;
  /** 目標未設定は null。0 と区別して、線そのものを引かない */
  target: number | null;
  /** まだ締まっていない月。閉じた月と同列に比べられない */
  isCurrent: boolean;
};

export type GoalStatus = {
  month: IsoMonth;
  target: number | null;
  actual: number;
  /** 達成率（0–）。目標未設定なら null */
  rate: number | null;
  /** 残り。達成済みは 0 */
  remaining: number | null;
  /** 月がどこまで進んだか（0–1）。達成率と並べて初めて「順調か」が読める */
  progress: number;
};

export type DashboardSummary = {
  staffName: string;
  customerCount: number;

  /** 上限で切る前の未対応総数 */
  openApproaches: number;
  topApproaches: ApproachItem[];

  thisMonth: GoalStatus;
  /** 今月の受注件数。金額だけでは、単価の大きい1本か数を積んだのかが読めない */
  thisMonthOrderCount: number;
  /** 直近12ヶ月。古い順 */
  monthly: MonthlyRevenuePoint[];
};

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const db = getDb();
  const customers = await listCustomers();
  const approaches = await listApproaches();

  const customerIds = new Set(customers.map((c) => c.id));
  const staffId = getCurrentStaffId();
  const now = new Date();

  // ── 月次の売上 ──
  const months = recentMonths(12, now);
  const currentMonth = toIsoMonth(now);
  const revenueByMonth = new Map<IsoMonth, { revenue: number; count: number }>();
  for (const order of db.orders) {
    if (!customerIds.has(order.customerId)) continue;
    const month = order.orderedAt.slice(0, 7);
    const entry = revenueByMonth.get(month) ?? { revenue: 0, count: 0 };
    entry.revenue += order.totalAmount;
    entry.count += 1;
    revenueByMonth.set(month, entry);
  }

  const monthly: MonthlyRevenuePoint[] = months.map((month, i) => {
    const entry = revenueByMonth.get(month) ?? { revenue: 0, count: 0 };
    return {
      month,
      label: formatMonthLabel(month, months[i - 1]),
      revenue: entry.revenue,
      orderCount: entry.count,
      target: getRevenueTarget(staffId, month),
      isCurrent: month === currentMonth,
    };
  });

  const current = monthly[monthly.length - 1];
  const thisMonth: GoalStatus = {
    month: currentMonth,
    target: current.target,
    actual: current.revenue,
    rate: current.target ? current.revenue / current.target : null,
    remaining: current.target ? Math.max(0, current.target - current.revenue) : null,
    progress: monthProgress(now),
  };

  return {
    staffName: getCurrentStaff()?.name ?? "—",
    customerCount: customers.length,

    openApproaches: approaches.total,
    topApproaches: approaches.items.slice(0, 5),

    thisMonth,
    thisMonthOrderCount: current.orderCount,
    monthly,
  };
}
