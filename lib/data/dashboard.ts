import type { IsoDate, IsoMonth, Uuid } from "@/lib/types";
import { supabase } from "@/lib/supabase/client";
import { getCurrentStaffId, getViewingStaff, getViewingStaffId } from "@/lib/auth/current-staff";
import { listCustomers } from "@/lib/data/customers";
import { listApproaches, type ApproachItem } from "@/lib/data/approaches";
import { formatMonthLabel, monthProgress, recentMonths, toIsoMonth } from "@/lib/utils/date";

/**
 * ダッシュボードの集計。
 *
 * この画面は週次の打ち合わせで開き、状況と目標の達成度を確認するためのもの。
 * 顧客はスタッフごとに分割されているため、これはすべて「自分の顧客」の話。
 *
 * 売上は受注日（orderedAt）で数える。お渡し月で数えると受注の勢いが 1〜2ヶ月遅れて
 * 見えることになり、週次で手を打つ材料にならない。従来の集計もこの基準だった。
 */

/**
 * 一覧に出す注文 1 件。
 *
 * 顧客単位にまとめず注文単位で持つ。件数は注文の数なので、まとめると
 * 押した数字と並ぶ行数が食い違う（同じ月に 2 着作る人がいる）。
 */
export type MonthOrder = {
  id: Uuid;
  customerId: Uuid;
  customerName: string;
  customerCompanyName?: string;
  orderNumber: string;
  orderedAt: IsoDate;
  totalAmount: number;
};

export type MonthlyRevenuePoint = {
  month: IsoMonth;
  label: string;
  revenue: number;
  orderCount: number;
  /** その月の注文。受注日の新しい順。件数と必ず同じ数だけ入る */
  orders: MonthOrder[];
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

  /** いま立っているアプローチの総数 */
  openApproaches: number;
  topApproaches: ApproachItem[];

  thisMonth: GoalStatus;
  /** 今月の受注件数。金額だけでは、単価の大きい1本か数を積んだのかが読めない */
  thisMonthOrderCount: number;
  /** 直近12ヶ月。古い順 */
  monthly: MonthlyRevenuePoint[];
};

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const now = new Date();
  const months = recentMonths(12, now);
  const currentMonth = toIsoMonth(now);

  // 集計の対象は「表示中のスタッフの担当顧客」。管理者が他のスタッフの
  // ページを見ているときは、その人の数字が出る。
  const staffId = (await getViewingStaffId()) ?? (await getCurrentStaffId());

  const [customers, approaches, orders, targets] = await Promise.all([
    listCustomers(),
    listApproaches(),
    // 集計の単位は「担当している顧客の注文」。受注者で数えると、同僚が
    // 代わりに受けた注文が自分の実績から抜け落ちる。
    //
    // staff_id で明示的に絞る。RLS 任せにしていたときは、管理者は全顧客を
    // 読めるぶんダッシュボードに**全スタッフの注文が混ざっていた**
    // （設定画面の listMonthlyRevenue は絞っていたので、同じ月の実績が
    // 2 つの画面で違う数字になっていた）。
    //
    // キャンセルは数えない。売上でも件数でもないものを実績に入れると、
    // 目標の達成率が実態より高く出る。v_customers.order_count も除外している。
    supabase()
      .from("orders")
      .select(
        "id, order_number, ordered_at, total_amount," +
          " customers!inner ( id, name, company_name, staff_id )",
      )
      .eq("customers.staff_id", staffId ?? "")
      .neq("status", "cancelled")
      .gte("ordered_at", `${months[0]}-01`),
    supabase()
      .from("revenue_targets")
      .select("month, amount")
      .eq("staff_id", staffId ?? ""),
  ]);

  const targetByMonth = new Map<IsoMonth, number>(
    ((targets.data ?? []) as { month: string; amount: number }[]).map((t) => [t.month, t.amount]),
  );

  // 金額・件数・一覧を同じ 1 本のループから作る。別々に数えると、
  // 押した「N件」と開いた一覧の行数がずれても誰も気づけない。
  const revenueByMonth = new Map<IsoMonth, { revenue: number; orders: MonthOrder[] }>();
  for (const row of orders.data ?? []) {
    const o = row as unknown as {
      id: string;
      order_number: string;
      ordered_at: string;
      total_amount: number;
      customers: { id: string; name: string; company_name: string | null };
    };
    const month = o.ordered_at.slice(0, 7);
    const entry = revenueByMonth.get(month) ?? { revenue: 0, orders: [] };
    entry.revenue += o.total_amount;
    entry.orders.push({
      id: o.id,
      customerId: o.customers.id,
      customerName: o.customers.name,
      customerCompanyName: o.customers.company_name ?? undefined,
      orderNumber: o.order_number,
      orderedAt: o.ordered_at,
      totalAmount: o.total_amount,
    });
    revenueByMonth.set(month, entry);
  }

  const monthly: MonthlyRevenuePoint[] = months.map((month, i) => {
    const entry = revenueByMonth.get(month) ?? { revenue: 0, orders: [] };
    return {
      month,
      label: formatMonthLabel(month, months[i - 1]),
      revenue: entry.revenue,
      orderCount: entry.orders.length,
      orders: entry.orders.sort((a, b) => b.orderedAt.localeCompare(a.orderedAt)),
      target: targetByMonth.get(month) ?? null,
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
    staffName: (await getViewingStaff())?.name ?? "—",
    customerCount: customers.length,

    openApproaches: approaches.length,
    topApproaches: approaches.slice(0, 5),

    thisMonth,
    thisMonthOrderCount: current.orderCount,
    monthly,
  };
}
