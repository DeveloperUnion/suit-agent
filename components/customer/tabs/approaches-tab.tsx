"use client";

import { useCallback } from "react";
import { ExternalLink, MessageSquarePlus } from "lucide-react";

import { EmptyState } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { APPROACH_STATUS_LABEL, TRIGGER_LABEL } from "@/lib/constants/labels";
import { getApproachForCustomer } from "@/lib/data/approaches";
import { listApproachHistory } from "@/lib/data/approaches";
import { listCompanyNews } from "@/lib/data/messages";
import { useMockQuery } from "@/lib/hooks/use-mock-db";
import { formatDateDot, formatDateTime } from "@/lib/utils/date";

export function ApproachesTab({
  customerId,
  onComposeMessage,
}: {
  customerId: string;
  /** 根拠を持ったままメッセージ作成へ渡す。ここが切れると下書きの材料が失われる */
  onComposeMessage: (approachTaskId: string) => void;
}) {
  const currentLoader = useCallback(() => getApproachForCustomer(customerId), [customerId]);
  const { data: current, loading } = useMockQuery(currentLoader, [customerId]);

  const historyLoader = useCallback(() => listApproachHistory(customerId), [customerId]);
  const { data: history } = useMockQuery(historyLoader, [customerId]);

  const newsLoader = useCallback(() => listCompanyNews(customerId), [customerId]);
  const { data: news } = useMockQuery(newsLoader, [customerId]);

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
                <span key={t} className="rounded-sm bg-navy/10 px-1.5 py-0.5 text-xs text-navy">
                  {TRIGGER_LABEL[t]}
                </span>
              ))}
              {current.status !== "open" && (
                <span className="rounded-sm border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
                  {current.status === "snoozed"
                    ? `${formatDateDot(current.snoozedUntil)}まで見送り`
                    : "対象外"}
                </span>
              )}
            </div>

            <ul className="mt-2.5 flex flex-col gap-1.5">
              {current.hits.map((hit) => (
                <li key={hit.type} className="border-l-2 border-navy/30 pl-3">
                  <p className="text-sm leading-relaxed">{hit.reason}</p>
                </li>
              ))}
            </ul>

            {current.status === "open" && (
              <Button
                size="sm"
                className="mt-3 h-10 gap-1.5"
                onClick={() => onComposeMessage(current.id)}
              >
                <MessageSquarePlus className="size-4" />
                メッセージを作成
              </Button>
            )}
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
                <span className="flex flex-wrap gap-1">
                  {task.triggerTypes.map((t) => (
                    <span key={t} className="rounded-sm bg-muted px-1.5 text-xs text-muted-foreground">
                      {TRIGGER_LABEL[t]}
                    </span>
                  ))}
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

      {news && news.length > 0 && (
        <section className="flex flex-col gap-2">
          <span className="field-label">収集された企業ニュース</span>
          <ul className="flex flex-col gap-2">
            {news.map((item) => (
              <li key={item.id} className="rounded-md border border-border bg-card p-3.5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-sm font-medium text-navy hover:underline"
                  >
                    {item.title}
                    <ExternalLink className="size-3" />
                  </a>
                  <span className="tnum font-mono text-xs text-muted-foreground">
                    {formatDateDot(item.publishedAt)}
                  </span>
                  <span className="tnum ml-auto font-mono text-xs text-muted-foreground">
                    活用度 {item.usabilityScore}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {item.aiSummary}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
