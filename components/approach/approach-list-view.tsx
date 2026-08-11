"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Check, ChevronRight, SkipForward } from "lucide-react";
import { toast } from "sonner";

import { DaysSinceDelivery } from "@/components/common/days-since-delivery";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TRIGGER_LABEL } from "@/lib/constants/labels";
import { listApproaches, resolveApproach, type ApproachItem } from "@/lib/data/approaches";
import { useQuery } from "@/lib/hooks/use-query";
import { usePostDeliveryMilestones } from "@/lib/hooks/use-settings";
import type { TriggerType } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS: { value: TriggerType | "all"; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "post_delivery", label: TRIGGER_LABEL.post_delivery },
  { value: "anniversary", label: TRIGGER_LABEL.anniversary },
];

export function ApproachListView() {
  const [trigger, setTrigger] = useState<TriggerType | "all">("all");
  const milestones = usePostDeliveryMilestones();

  const loader = useCallback(
    () => listApproaches({ triggerType: trigger === "all" ? undefined : trigger }),
    [trigger],
  );
  const { data: items, loading } = useQuery(loader, [trigger]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Approaches"
        title="本日のアプローチ"
        actions={
          !loading && items ? (
            <span className="tnum font-mono text-sm text-muted-foreground">{items.length}件</span>
          ) : null
        }
      />

      <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
        納品の{milestones.map((m) => m.label).join("後・")}後と、記念日の2つで全顧客を毎回評価しています。
        同じ顧客に両方あたった場合は1件にまとめます。
        連絡そのものは手で行ってください。ここから送ることはありません。
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setTrigger(f.value)}
            className={cn(
              "min-h-9 rounded-sm border px-3 text-sm transition-colors",
              trigger === f.value
                ? "border-brand-fill bg-brand-fill text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-brand/40",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading || !items ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-md" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
          連絡すべき顧客はいません。
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <ApproachRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ApproachRow({ item }: { item: ApproachItem }) {
  const { customer } = item;

  const handleDone = async () => {
    await resolveApproach(customer.id, "done");
    toast.success(`${customer.name}様を対応済みにしました`, {
      description: "最終接触日を更新しました。",
    });
  };

  const handleSkip = async () => {
    await resolveApproach(customer.id, "skipped");
    toast.success(`${customer.name}様の今回の通知を閉じました`, {
      description: "次の節目や来年の記念日が来れば、また出ます。",
    });
  };

  return (
    <li className="rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link
            href={`/customers/${customer.id}`}
            className="flex items-center gap-1.5 font-medium hover:underline"
          >
            {customer.name}
            <span className="text-sm font-normal text-muted-foreground">様</span>
          </Link>
          <span className="truncate text-xs text-muted-foreground">
            {customer.companyName ?? customer.nameKana}
          </span>
        </div>

        <span className="flex flex-col items-end">
          <span className="field-label">納品から</span>
          <DaysSinceDelivery days={customer.daysSinceDelivery} />
        </span>
      </div>

      {/* なぜ今この顧客なのか。トリガーごとに理由を出す */}
      <ul className="mt-3 flex flex-col gap-1.5">
        {item.hits.map((hit) => (
          <li key={hit.key} className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 rounded-sm bg-brand/10 px-1.5 py-0.5 text-xs text-brand">
              {TRIGGER_LABEL[hit.type]}
            </span>
            <p className="min-w-0 flex-1 text-sm leading-relaxed">{hit.reason}</p>
          </li>
        ))}
      </ul>

      {/* 押されるまで残る。時間で勝手に消えると見落としに気づけないため */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" className="h-10 gap-1.5" onClick={handleDone}>
          <Check className="size-4" />
          連絡した
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-10 gap-1.5 text-muted-foreground"
          onClick={handleSkip}
        >
          <SkipForward className="size-4" />
          スキップ
        </Button>

        <Link
          href={`/customers/${customer.id}`}
          className="ml-auto flex min-h-10 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          カルテを開く
          <ChevronRight className="size-4" />
        </Link>
      </div>
    </li>
  );
}
