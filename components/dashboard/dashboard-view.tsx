"use client";

import Link from "next/link";
import { useCallback } from "react";
import { ChevronRight } from "lucide-react";

import { DaysSinceDelivery } from "@/components/common/days-since-delivery";
import { PageHeader } from "@/components/common/page-header";
import { GoalPanel } from "@/components/dashboard/goal-panel";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { TRIGGER_LABEL } from "@/lib/constants/labels";
import { getDashboardSummary } from "@/lib/data/dashboard";
import { useMockQuery } from "@/lib/hooks/use-mock-db";
import { cn } from "@/lib/utils";

export function DashboardView() {
  const loader = useCallback(() => getDashboardSummary(), []);
  const { data, loading } = useMockQuery(loader, []);

  if (loading || !data) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Dashboard"
        actions={
          <span className="text-sm text-muted-foreground">
            {data.staffName} / 担当 {data.customerCount}名
          </span>
        }
      />

      <GoalPanel status={data.thisMonth} orderCount={data.thisMonthOrderCount} />

      <RevenueChart points={data.monthly} />

      <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-4 sm:p-5">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
          <h2 className="flex items-baseline gap-2 font-heading text-sm font-medium tracking-wide">
            本日のアプローチ
            {/* 件数はカードをやめた分ここに寄せる。リストの上限で切られた件数も含む総数 */}
            <span
              className={cn(
                "tnum font-mono text-xs font-normal",
                data.openApproaches > 0 ? "text-thread" : "text-muted-foreground",
              )}
            >
              未対応 {data.openApproaches}件
            </span>
          </h2>
          <Link
            href="/approaches"
            className="flex items-center gap-1 text-sm text-brand hover:underline"
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
                  href={`/customers/${item.customer.id}?tab=approaches`}
                  className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 py-2.5 transition-colors last:border-b-0 hover:bg-accent/30"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-medium">{item.customer.name}</span>
                    <span className="text-xs text-muted-foreground">様</span>
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {item.triggerTypes.map((t) => (
                      <span key={t} className="rounded-sm bg-brand/10 px-1.5 text-xs text-brand">
                        {TRIGGER_LABEL[t]}
                      </span>
                    ))}
                  </span>
                  <span className="ml-auto shrink-0">
                    <DaysSinceDelivery days={item.customer.daysSinceDelivery} />
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
