"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { CalendarClock, Check, ChevronRight, EyeOff, MessageSquarePlus, Star } from "lucide-react";
import { toast } from "sonner";

import { DaysSinceDelivery } from "@/components/common/days-since-delivery";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { TRIGGER_LABEL } from "@/lib/constants/labels";
import {
  dismissApproach,
  listApproaches,
  restoreApproach,
  snoozeApproach,
  type ApproachItem,
} from "@/lib/data/approaches";
import { useMockQuery } from "@/lib/hooks/use-mock-db";
import type { TriggerType } from "@/lib/types";
import { formatDateDot } from "@/lib/utils/date";
import { cn } from "@/lib/utils";

const FILTERS: { value: TriggerType | "all"; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "post_delivery", label: TRIGGER_LABEL.post_delivery },
  { value: "anniversary", label: TRIGGER_LABEL.anniversary },
  { value: "season", label: TRIGGER_LABEL.season },
  { value: "company_news", label: TRIGGER_LABEL.company_news },
];

const SNOOZE_OPTIONS = [
  { days: 7, label: "1週間後にまた出す" },
  { days: 30, label: "1ヶ月後にまた出す" },
  { days: 90, label: "3ヶ月後にまた出す" },
];

export function ApproachListView() {
  const [trigger, setTrigger] = useState<TriggerType | "all">("all");
  const [showParked, setShowParked] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const loader = useCallback(
    () =>
      listApproaches({
        triggerType: trigger === "all" ? undefined : trigger,
        includeParked: showParked,
        showAll,
      }),
    [trigger, showParked, showAll],
  );
  const { data: result, loading } = useMockQuery(loader, [trigger, showParked, showAll]);

  const items = result?.items;
  const openCount = items?.filter((i) => i.status === "open").length ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Approaches"
        title="本日のアプローチ"
        actions={
          !loading && result ? (
            <span className="tnum font-mono text-sm text-muted-foreground">
              未対応 {openCount}件
              {result.hidden > 0 && ` / 全${result.total}件`}
            </span>
          ) : null
        }
      />

      <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
        経過日数・記念日・季節・企業ニュースの4つで全顧客を毎回評価しています。同じ顧客に複数あたった場合は1件にまとめ、根拠の強い順に並べています。
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
        <label className="ml-auto flex min-h-9 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showParked}
            onChange={(e) => setShowParked(e.target.checked)}
            className="size-4 accent-[var(--brand)]"
          />
          スヌーズ中・対象外も表示
        </label>
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
        <>
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <ApproachRow key={item.id} item={item} />
            ))}
          </ul>

          {/* さばける量を超えて出すとリスト全体が見られなくなるため、既定では上位だけ出す */}
          {result && result.hidden > 0 && (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border bg-card/40 p-5 text-center">
              <p className="text-sm text-muted-foreground">
                同じ条件であと {result.hidden} 件あります。1日にさばける量を超えないよう、
                根拠の強い順に {items.length} 件だけ出しています。
              </p>
              <Button variant="outline" size="sm" className="h-10" onClick={() => setShowAll(true)}>
                残りも表示する
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ApproachRow({ item }: { item: ApproachItem }) {
  const { customer } = item;
  const parked = item.status !== "open";

  const handleSnooze = async (days: number) => {
    await snoozeApproach(customer.id, days);
    toast.success(`${customer.name}様を${days}日後まで見送りにしました`);
  };

  const handleDismiss = async () => {
    await dismissApproach(customer.id);
    toast.success(`${customer.name}様を対象外にしました`, {
      description: "「スヌーズ中・対象外も表示」から戻せます。",
    });
  };

  const handleRestore = async () => {
    await restoreApproach(customer.id);
    toast.success(`${customer.name}様をリストに戻しました`);
  };

  return (
    <li
      className={cn(
        "rounded-md border bg-card p-4",
        parked ? "border-dashed border-border opacity-70" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link
            href={`/customers/${customer.id}`}
            className="flex items-center gap-1.5 font-medium hover:underline"
          >
            {customer.name}
            <span className="text-sm font-normal text-muted-foreground">様</span>
            {customer.isKeyAccount && (
              <Star className="size-3.5 fill-thread text-thread" aria-label="重要顧客" />
            )}
          </Link>
          <span className="truncate text-xs text-muted-foreground">
            {customer.companyName ?? customer.nameKana}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {parked && (
            <span className="rounded-sm border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
              {item.status === "snoozed"
                ? `${formatDateDot(item.snoozedUntil)}まで見送り`
                : "対象外"}
            </span>
          )}
          <span className="flex flex-col items-end">
            <span className="field-label">納品から</span>
            <DaysSinceDelivery days={customer.daysSinceDelivery} />
          </span>
        </div>
      </div>

      {/* なぜ今この顧客なのか。トリガーごとに理由を出す */}
      <ul className="mt-3 flex flex-col gap-1.5">
        {item.hits.map((hit) => (
          <li key={hit.type} className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 rounded-sm bg-brand/10 px-1.5 py-0.5 text-xs text-brand">
              {TRIGGER_LABEL[hit.type]}
            </span>
            <p className="min-w-0 flex-1 text-sm leading-relaxed">{hit.reason}</p>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {parked ? (
          <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={handleRestore}>
            <Check className="size-4" />
            リストに戻す
          </Button>
        ) : (
          <>
            <Button size="sm" className="h-10 gap-1.5" asChild>
              <Link href={`/customers/${customer.id}?tab=messages&approach=${item.id}`}>
                <MessageSquarePlus className="size-4" />
                メッセージを作成
              </Link>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-10 gap-1.5">
                  <CalendarClock className="size-4" />
                  見送る
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {SNOOZE_OPTIONS.map((option) => (
                  <DropdownMenuItem key={option.days} onClick={() => handleSnooze(option.days)}>
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="ghost"
              size="sm"
              className="h-10 gap-1.5 text-muted-foreground"
              onClick={handleDismiss}
            >
              <EyeOff className="size-4" />
              対象外にする
            </Button>

            <Link
              href={`/customers/${customer.id}`}
              className="ml-auto flex min-h-10 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              カルテを開く
              <ChevronRight className="size-4" />
            </Link>
          </>
        )}
      </div>
    </li>
  );
}
