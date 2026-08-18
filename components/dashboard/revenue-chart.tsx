import type { MonthlyRevenuePoint } from "@/lib/data/dashboard";
import type { IsoMonth } from "@/lib/types";
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
export function RevenueChart({
  points,
  openMonth,
  onToggleMonth,
  children,
}: {
  points: MonthlyRevenuePoint[];
  /** 購入者一覧を開いている月。バーの強調に使う */
  openMonth: IsoMonth | null;
  /** バーを押したとき。注文が 0 件の月は押せる形にしない */
  onToggleMonth: (month: IsoMonth) => void;
  /** 開いている購入者一覧。図の下に置く */
  children?: React.ReactNode;
}) {
  const max = Math.max(1, ...points.flatMap((p) => [p.revenue, p.target ?? 0]));
  const closedWithTarget = points.filter((p) => !p.isCurrent && p.target !== null).length;

  return (
    <section className="flex flex-col gap-4 rounded-md border border-border bg-card p-4 sm:p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
        <h2 className="font-heading text-sm font-medium tracking-wide">売上の月次推移</h2>
        <span className="text-xs text-muted-foreground">直近12ヶ月・受注日で集計</span>
      </header>

      <div className="flex items-end gap-1 sm:gap-1.5">
        {points.map((point) => {
          const open = point.month === openMonth;
          const label = `${point.label} ¥${formatAmount(point.revenue)}（${
            point.target === null ? "目標未設定" : `目標 ¥${formatAmount(point.target)}`
          }／${point.orderCount}件）`;

          return (
            <div key={point.month} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              {/*
                バーそのものを押して、その月の購入者一覧を開く。
                件数は title の hover にしか出ていなかったので、タッチ端末では
                そもそも読めなかった。押せるようにしたことで両方が片付く。
                注文が無い月は押しても出すものが無いので、ボタンにしない。
              */}
              <button
                type="button"
                disabled={point.orderCount === 0}
                onClick={() => onToggleMonth(point.month)}
                aria-pressed={open}
                aria-label={`${label}。押すとご購入者の一覧が開きます`}
                title={label}
                className="relative h-32 w-full rounded-t-[3px] transition-colors enabled:hover:bg-accent/40 disabled:cursor-default"
              >
                <span
                  className={cn(
                    "absolute bottom-0 left-0 w-full rounded-t-[3px]",
                    point.isCurrent ? "bg-brand-fill/45" : "bg-brand-fill",
                    // 開いている月は、下の一覧がどの棒のものかが分かるよう縁取る
                    open && "ring-2 ring-brand ring-offset-1 ring-offset-card",
                  )}
                  style={{
                    height: `${Math.max(point.revenue === 0 ? 0 : 2, (point.revenue / max) * 100)}%`,
                  }}
                />
                {point.target !== null && (
                  <span
                    className="absolute left-0 w-full border-t border-dashed border-thread/60"
                    style={{ bottom: `${(point.target / max) * 100}%` }}
                    aria-hidden
                  />
                )}
              </button>
              <span
                className={cn(
                  "tnum whitespace-nowrap font-mono text-[0.625rem]",
                  point.isCurrent || open ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {point.label}
              </span>
            </div>
          );
        })}
      </div>

      {children}

      {/* 図から読めることは書かない。破線だけは図では言えないので注記する */}
      {closedWithTarget === 0 && (
        <footer className="border-t border-border pt-3">
          <p className="text-sm text-muted-foreground">
            目標を登録すると、各月に破線で表示されます。
          </p>
        </footer>
      )}
    </section>
  );
}
