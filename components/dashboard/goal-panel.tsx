import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { GoalStatus } from "@/lib/data/dashboard";
import { formatAmount } from "@/lib/utils/date";
import { cn } from "@/lib/utils";

/**
 * 今月の目標達成状況。
 *
 * 週次で見る画面なので、達成率だけでは「順調か」が判断できない。
 * 月がどこまで進んだかを同じバー上に破線で置き、バーがその手前か奥かで読ませる。
 *
 * 「上回っています」のような判断の文は置かない。数字とバーを見れば分かることを
 * 言い直しているだけで、毎週見る画面では読み飛ばす行が増えるだけのため。
 * 遅れているときだけ、達成率とバーを警告色に振る。
 */
export function GoalPanel({
  status,
  orderCount,
  ordersOpen,
  onToggleOrders,
  children,
}: {
  status: GoalStatus;
  /** 今月の受注件数。金額だけだと、単価の大きい1本で埋めたのか数を積んだのか分からない */
  orderCount: number;
  /** 購入者一覧が開いているか。件数の見た目と aria-expanded に使う */
  ordersOpen: boolean;
  /** 件数を押したとき。0 件のときは押せる形にしない */
  onToggleOrders: () => void;
  /** 開いている購入者一覧。パネルの中に置き、押した数字を画面に残す */
  children?: React.ReactNode;
}) {
  const [year, month] = status.month.split("-");
  const progressPct = Math.round(status.progress * 100);

  const count = (
    <OrderCount
      count={orderCount}
      open={ordersOpen}
      onToggle={onToggleOrders}
      monthLabel={`${year}年${Number(month)}月`}
    />
  );

  if (status.target === null) {
    return (
      <section className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-card p-4 sm:p-5">
        <Header year={year} month={month} />
        <p className="text-sm text-muted-foreground">
          今月の売上目標が未設定です。
          <Link
            href={TARGET_SETTINGS_HREF}
            className="ml-1 text-brand underline underline-offset-2"
          >
            設定で登録する
          </Link>
        </p>
        <p className="tnum flex items-baseline gap-1 font-mono text-sm">
          実績 ¥{formatAmount(status.actual)}（{count}）
        </p>
        {children}
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
        <Figure label="実績" value={`¥${formatAmount(status.actual)}`} note={count} />
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
            behind ? "bg-thread/70" : "bg-brand-fill",
          )}
          style={{ width: `${Math.min(100, rate * 100)}%` }}
        />
        <span
          className="absolute -top-1 bottom-[-0.25rem] border-l border-dashed border-measure"
          style={{ left: `${Math.min(100, progressPct)}%` }}
          aria-hidden
        />
      </div>

      {children}
    </section>
  );
}

/**
 * 実績の横の件数。押すとその月の購入者一覧が開く。
 *
 * 数字がそのままボタンになっているので、押せることが見た目で分からない。
 * 破線の下線を敷いて、色は brand に振る（実線にすると数字が読みにくくなる）。
 * 0 件のときはボタンにしない — 押しても何も出ないものを押させない。
 */
function OrderCount({
  count,
  open,
  onToggle,
  monthLabel,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
  monthLabel: string;
}) {
  if (count === 0) return <span className="tnum font-mono">0件</span>;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${monthLabel}の${count}件の注文をご購入者で見る`}
      className={cn(
        "tnum font-mono underline decoration-dashed underline-offset-4 transition-colors",
        open ? "text-brand decoration-solid" : "text-brand/90 hover:text-brand",
      )}
    >
      {count}件
    </button>
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
          className="flex items-center gap-1 text-sm text-brand hover:underline"
        >
          目標を設定
          <ChevronRight className="size-4" />
        </Link>
      </span>
    </header>
  );
}

function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: React.ReactNode;
}) {
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
