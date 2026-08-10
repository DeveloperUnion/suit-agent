import type { MonthlyRevenuePoint } from "@/lib/data/dashboard";
import { formatAmount } from "@/lib/utils/date";
import { cn } from "@/lib/utils";

/**
 * 売上の月次推移。
 *
 * 高さの基準は全列で共通にする。列ごとに基準を変えると、
 * 各列に引いた目標の破線どうしが比べられなくなり、図の意味が消えるため。
 *
 * 当月はまだ締まっておらず、閉じた月と同列に比べられない。
 * それを不透明度で示し、色相は使わない（色相は良し悪しの判断に取ってある）。
 */
export function RevenueChart({ points }: { points: MonthlyRevenuePoint[] }) {
  const max = Math.max(1, ...points.flatMap((p) => [p.revenue, p.target ?? 0]));
  const achieved = points.filter(
    (p) => !p.isCurrent && p.target !== null && p.revenue >= p.target,
  ).length;
  const closedWithTarget = points.filter((p) => !p.isCurrent && p.target !== null).length;

  return (
    <section className="flex flex-col gap-4 rounded-md border border-border bg-card p-4 sm:p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
        <h2 className="font-heading text-sm font-medium tracking-wide">売上の月次推移</h2>
        <span className="text-xs text-muted-foreground">直近12ヶ月・受注日で集計</span>
      </header>

      <div className="flex items-end gap-1 sm:gap-1.5">
        {points.map((point) => (
          <div key={point.month} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div
              className="relative h-32 w-full"
              title={`${point.label} ¥${formatAmount(point.revenue)}（${
                point.target === null ? "目標未設定" : `目標 ¥${formatAmount(point.target)}`
              }／${point.orderCount}件）`}
            >
              <span
                className={cn(
                  "absolute bottom-0 w-full rounded-t-[3px]",
                  point.isCurrent ? "bg-navy/45" : "bg-navy",
                )}
                style={{
                  height: `${Math.max(point.revenue === 0 ? 0 : 2, (point.revenue / max) * 100)}%`,
                }}
              />
              {point.target !== null && (
                <span
                  className="absolute w-full border-t border-dashed border-thread/60"
                  style={{ bottom: `${(point.target / max) * 100}%` }}
                  aria-hidden
                />
              )}
            </div>
            <span
              className={cn(
                "tnum whitespace-nowrap font-mono text-[0.625rem]",
                point.isCurrent ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {point.label}
            </span>
          </div>
        ))}
      </div>

      <footer className="flex flex-col gap-1 border-t border-border pt-3">
        <p className="text-sm text-muted-foreground">
          {closedWithTarget === 0 ? (
            "目標を登録すると、各月に破線で表示されます。"
          ) : (
            <>
              締まった
              <span className="tnum mx-1 font-mono font-medium text-foreground">
                {closedWithTarget}ヶ月
              </span>
              のうち、目標を達成したのは
              <span className="tnum mx-1 font-mono font-medium text-foreground">
                {achieved}ヶ月
              </span>
              です。
            </>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          いちばん右は当月で、まだ途中の数字です。
        </p>
      </footer>
    </section>
  );
}
