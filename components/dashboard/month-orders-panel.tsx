import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { MonthOrder } from "@/lib/data/dashboard";
import { formatAmount, formatDateDot } from "@/lib/utils/date";

/**
 * その月に買ってくださった方の一覧。件数の数字を押すとその場で開く。
 *
 * 別の画面にしないのは、確認したいのが「今月の数字の中身」だからで、
 * 移動して戻ってくる間に見比べたかった数字が視界から消える。
 * 中だけがスクロールし、押した数字は画面に残したままにする。
 *
 * 1 行 = 1 注文。顧客単位にまとめない — 押した数字が注文の件数なので、
 * まとめると数字と行数が合わなくなる（同じ月に 2 着作る人がいる）。
 * その代わり同じ方が 2 行並ぶことはあり、それは事実として正しい。
 *
 * 累計購入額は出さない。個々の注文の金額は事実の記録だが、足し上げた額を
 * 顧客の横に置くと、それは格付けになる（lib/data/orders.ts と同じ判断）。
 */
export function MonthOrdersPanel({
  monthLabel,
  orders,
}: {
  /** 「2026年8月」。何の一覧を見ているかを見出しで言い切る */
  monthLabel: string;
  orders: MonthOrder[];
}) {
  // 0 件なら数字を押せる形にしていないので、ここには来ない
  if (orders.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-background p-3">
      <span className="field-label">{monthLabel}にご注文いただいた方</span>

      <ul className="flex max-h-72 flex-col overflow-y-auto rounded-md border border-border">
        {orders.map((order) => (
          <li key={order.id}>
            <Link
              href={`/customers/${order.customerId}`}
              className="flex min-h-14 items-center gap-3 border-b border-border/60 px-3 py-2 transition-colors last:border-b-0 hover:bg-accent/30"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">{order.customerName}</span>
                <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {order.customerCompanyName && (
                    <span className="truncate">{order.customerCompanyName}</span>
                  )}
                  <span className="tnum font-mono">{formatDateDot(order.orderedAt)}</span>
                  <span className="tnum font-mono">{order.orderNumber}</span>
                </span>
              </span>

              <span className="tnum shrink-0 font-mono text-sm">
                ¥{formatAmount(order.totalAmount)}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
