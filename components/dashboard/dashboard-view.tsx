"use client";

import Link from "next/link";
import { useCallback } from "react";
import { ChevronRight, Star } from "lucide-react";

import { ElapsedDays } from "@/components/common/elapsed-days";
import { PageHeader } from "@/components/common/page-header";
import { RecencyChart } from "@/components/dashboard/recency-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { TRIGGER_LABEL } from "@/lib/constants/labels";
import { getDashboardSummary } from "@/lib/data/dashboard";
import { useMockQuery } from "@/lib/hooks/use-mock-db";
import { formatAmount } from "@/lib/utils/date";
import { cn } from "@/lib/utils";

export function DashboardView() {
  const loader = useCallback(() => getDashboardSummary(), []);
  const { data, loading } = useMockQuery(loader, []);

  if (loading || !data) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Dashboard"
        title="今日やること"
        actions={
          <span className="text-sm text-muted-foreground">
            {data.staffName} / 担当 {data.customerCount}名
          </span>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="未対応のアプローチ"
          value={data.openApproaches}
          unit="件"
          emphasis={data.openApproaches > 0}
          href="/approaches"
        />
        <Stat
          label={`${data.elapsedDaysThreshold}日超の顧客`}
          value={data.overdueCount}
          unit="名"
          note={`担当${data.customerCount}名中`}
          emphasis={data.overdueCount > 0}
        />
        <Stat
          label="直近30日の受注"
          value={data.recentOrderCount}
          unit="件"
          note={`¥${formatAmount(data.recentRevenue)}`}
        />
        <Stat
          label="リピート率"
          value={data.repeatRate === null ? "—" : Math.round(data.repeatRate * 100)}
          unit={data.repeatRate === null ? "" : "%"}
          note={`2回以上 ${data.repeatCustomers} / 購入者 ${data.orderedCustomers}名`}
        />
      </div>

      <RecencyChart
        threshold={data.elapsedDaysThreshold}
        distribution={data.distribution}
        total={data.customerCount}
        neverContacted={data.neverContacted}
        overdueCount={data.overdueCount}
        overdueRatio={data.overdueRatio}
      />

      <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-4 sm:p-5">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
          <h2 className="font-heading text-sm font-medium tracking-wide">本日のアプローチ</h2>
          <Link
            href="/approaches"
            className="flex items-center gap-1 text-sm text-navy hover:underline"
          >
            すべて見る
            <ChevronRight className="size-4" />
          </Link>
        </header>

        {data.topApproaches.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            連絡すべき顧客はいません。
          </p>
        ) : (
          <ul className="flex flex-col">
            {data.topApproaches.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/customers/${item.customer.id}?tab=messages&approach=${item.id}`}
                  className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 py-2.5 transition-colors last:border-b-0 hover:bg-accent/30"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-medium">{item.customer.name}</span>
                    <span className="text-xs text-muted-foreground">様</span>
                    {item.customer.isKeyAccount && (
                      <Star className="size-3 shrink-0 fill-thread text-thread" />
                    )}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {item.triggerTypes.map((t) => (
                      <span key={t} className="rounded-sm bg-navy/10 px-1.5 text-xs text-navy">
                        {TRIGGER_LABEL[t]}
                      </span>
                    ))}
                  </span>
                  <span className="ml-auto shrink-0">
                    <ElapsedDays days={item.customer.elapsedDays} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  note,
  emphasis,
  href,
}: {
  label: string;
  value: number | string;
  unit: string;
  note?: string;
  emphasis?: boolean;
  href?: string;
}) {
  const body = (
    <>
      <span className="field-label">{label}</span>
      <span className="flex items-baseline gap-1">
        <span
          className={cn(
            "tnum font-mono text-3xl font-medium leading-none",
            emphasis ? "text-thread" : "text-foreground",
          )}
        >
          {value}
        </span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </span>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </>
  );

  const className = cn(
    "flex min-h-24 flex-col justify-center gap-1.5 rounded-md border border-border bg-card p-4",
    href && "transition-colors hover:border-navy/40 hover:bg-accent/30",
  );

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
