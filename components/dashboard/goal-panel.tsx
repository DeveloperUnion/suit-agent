import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { GoalStatus } from "@/lib/data/dashboard";
import { formatAmount } from "@/lib/utils/date";
import { cn } from "@/lib/utils";

/**
 * 今月の目標達成状況。
 *
 * 週次で見る画面なので、達成率だけでは「順調か」が判断できない。
 * 月がどこまで進んだかを同じバー上に破線で置き、その手前か奥かで読ませる。
 * 判断は破線と文章が担い、色は「達成率が月の進みに負けている」ときだけ警告に振る。
 */
export function GoalPanel({
  status,
  orderCount,
}: {
  status: GoalStatus;
  /** 今月の受注件数。金額だけだと、単価の大きい1本で埋めたのか数を積んだのか分からない */
  orderCount: number;
}) {
  const [year, month] = status.month.split("-");
  const progressPct = Math.round(status.progress * 100);

  if (status.target === null) {
    return (
      <section className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-card p-4 sm:p-5">
        <Header year={year} month={month} />
        <p className="text-sm text-muted-foreground">
          今月の売上目標が未設定です。
          <Link
            href={TARGET_SETTINGS_HREF}
            className="ml-1 text-navy underline underline-offset-2"
          >
            設定で登録する
          </Link>
        </p>
        <p className="tnum font-mono text-sm">
          実績 ¥{formatAmount(status.actual)}（{orderCount}件）
        </p>
      </section>
    );
  }

  const rate = status.rate ?? 0;
  const behind = rate < status.progress;

  return (
    <section className="flex flex-col gap-4 rounded-md border border-border bg-card p-4 sm:p-5">
      <Header year={year} month={month} />

      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="flex flex-col gap-0.5">
          <span className="field-label">達成率</span>
          <span className="flex items-baseline gap-1">
            <span
              className={cn(
                "tnum font-mono text-4xl font-medium leading-none",
                behind ? "text-thread" : "text-foreground",
              )}
            >
              {Math.round(rate * 100)}
            </span>
            <span className={cn("text-sm", behind ? "text-thread" : "text-muted-foreground")}>
              %
            </span>
          </span>
        </div>
        <Figure label="目標" value={`¥${formatAmount(status.target)}`} />
        <Figure label="実績" value={`¥${formatAmount(status.actual)}`} note={`${orderCount}件`} />
        <Figure
          label="残り"
          value={status.remaining === 0 ? "達成" : `¥${formatAmount(status.remaining ?? 0)}`}
        />
      </div>

      {/* バーは進捗、破線は月の経過位置。追い越していれば手前で交差して見える */}
      <div className="relative h-3 w-full overflow-visible rounded-sm bg-muted">
        <div
          className={cn(
            "h-full rounded-sm transition-[width]",
            behind ? "bg-thread/70" : "bg-navy",
          )}
          style={{ width: `${Math.min(100, rate * 100)}%` }}
        />
        <span
          className="absolute -top-1 bottom-[-0.25rem] border-l border-dashed border-measure"
          style={{ left: `${Math.min(100, progressPct)}%` }}
          aria-hidden
        />
      </div>

      <p className="text-sm text-muted-foreground">
        {year}年{Number(month)}月は {progressPct}% 経過しています。
        {behind
          ? "月の進みに対して実績が遅れています。"
          : "月の進みを上回っています。"}
      </p>
    </section>
  );
}

/** 目標は設定画面でしか変えられない。数字を見て直したくなるのはこの場所なので導線を置く */
const TARGET_SETTINGS_HREF = "/settings?tab=targets";

function Header({ year, month }: { year: string; month: string }) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
      <h2 className="font-heading text-sm font-medium tracking-wide">今月の目標</h2>
      <span className="flex items-baseline gap-3">
        <span className="tnum font-mono text-xs text-muted-foreground">
          {year}年{Number(month)}月
        </span>
        <Link
          href={TARGET_SETTINGS_HREF}
          className="flex items-center gap-1 text-sm text-navy hover:underline"
        >
          目標を設定
          <ChevronRight className="size-4" />
        </Link>
      </span>
    </header>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="field-label">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="tnum font-mono text-lg font-medium leading-none">{value}</span>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </span>
    </div>
  );
}
