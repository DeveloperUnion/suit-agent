"use client";

import { useCallback } from "react";
import { Check, SkipForward } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { APPROACH_STATUS_LABEL, TRIGGER_LABEL } from "@/lib/constants/labels";
import { getApproachForCustomer, listApproachHistory, resolveApproach } from "@/lib/data/approaches";
import { useQuery } from "@/lib/hooks/use-query";
import { formatDateTime } from "@/lib/utils/date";

export function ApproachesTab({
  customerId,
  customerName,
}: {
  customerId: string;
  customerName: string;
}) {
  const currentLoader = useCallback(() => getApproachForCustomer(customerId), [customerId]);
  const { data: current, loading } = useQuery(currentLoader, [customerId]);

  const historyLoader = useCallback(() => listApproachHistory(customerId), [customerId]);
  const { data: history } = useQuery(historyLoader, [customerId]);

  const handleDone = async () => {
    await resolveApproach(customerId, "done");
    toast.success(`${customerName}様を対応済みにしました`, {
      description: "最終接触日を更新しました。",
    });
  };

  const handleSkip = async () => {
    await resolveApproach(customerId, "skipped");
    toast.success("今回の通知を閉じました", {
      description: "次の節目や来年の記念日が来れば、また出ます。",
    });
  };

  const nothing = !loading && !current && (!history || history.length === 0);
  if (nothing) {
    return <EmptyState>いまこの顧客に立っているアプローチはありません。</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-8">
      {current && (
        <section className="flex flex-col gap-2">
          <span className="field-label">いま立っているアプローチ</span>
          <div className="rounded-md border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              {current.triggerTypes.map((t) => (
                <span key={t} className="rounded-sm bg-brand/10 px-1.5 py-0.5 text-xs text-brand">
                  {TRIGGER_LABEL[t]}
                </span>
              ))}
            </div>

            <ul className="mt-2.5 flex flex-col gap-1.5">
              {current.hits.map((hit) => (
                <li key={hit.key} className="border-l-2 border-brand/30 pl-3">
                  <p className="text-sm leading-relaxed">{hit.reason}</p>
                </li>
              ))}
            </ul>

            {/* 連絡は個人 LINE から手で行う。ここでやるのはその結果を残すことだけ */}
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
            </div>
          </div>
        </section>
      )}

      {history && history.length > 0 && (
        <section className="flex flex-col gap-2">
          <span className="field-label">対応履歴</span>
          <ul className="flex flex-col">
            {history.map((task) => (
              <li
                key={task.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/60 py-2.5 last:border-b-0"
              >
                <span className="tnum w-24 shrink-0 font-mono text-sm text-muted-foreground">
                  {formatDateTime(task.resolvedAt)}
                </span>
                <span className="rounded-sm bg-muted px-1.5 text-xs text-muted-foreground">
                  {TRIGGER_LABEL[task.triggerType]}
                </span>
                <span className="min-w-0 flex-1 text-sm text-muted-foreground">{task.reason}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {APPROACH_STATUS_LABEL[task.status]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
