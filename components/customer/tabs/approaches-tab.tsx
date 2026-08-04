"use client";

import { useCallback } from "react";
import { ExternalLink } from "lucide-react";

import { EmptyState } from "@/components/common/field";
import { Badge } from "@/components/ui/badge";
import { APPROACH_STATUS_LABEL, TRIGGER_LABEL } from "@/lib/constants/labels";
import { listApproachTasks, listCompanyNews } from "@/lib/data/messages";
import { useMockQuery } from "@/lib/hooks/use-mock-db";
import type { ApproachStatus } from "@/lib/types";
import { formatDateDot } from "@/lib/utils/date";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<ApproachStatus, string> = {
  open: "border-thread/40 bg-thread/10 text-thread",
  done: "border-border bg-muted text-muted-foreground",
  snoozed: "border-border bg-muted text-muted-foreground",
  dismissed: "border-border bg-muted text-muted-foreground/70",
};

export function ApproachesTab({ customerId }: { customerId: string }) {
  const tasksLoader = useCallback(() => listApproachTasks(customerId), [customerId]);
  const { data: tasks, loading } = useMockQuery(tasksLoader, [customerId]);

  const newsLoader = useCallback(() => listCompanyNews(customerId), [customerId]);
  const { data: news } = useMockQuery(newsLoader, [customerId]);

  if (!loading && (!tasks || tasks.length === 0)) {
    return <EmptyState>アプローチの履歴はまだありません。</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-8">
      <ul className="flex flex-col gap-3">
        {(tasks ?? []).map((task) => (
          <li key={task.id} className="rounded-md border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              {task.triggerTypes.map((trigger) => (
                <Badge key={trigger} variant="secondary" className="font-normal">
                  {TRIGGER_LABEL[trigger]}
                </Badge>
              ))}
              <span
                className={cn(
                  "rounded-sm border px-1.5 py-0.5 text-xs",
                  STATUS_STYLE[task.status],
                )}
              >
                {APPROACH_STATUS_LABEL[task.status]}
              </span>
              <span className="tnum ml-auto font-mono text-xs text-muted-foreground">
                推奨 {formatDateDot(task.dueDate)}
              </span>
            </div>

            {/* 「なぜ今この顧客なのか」— スタッフが納得して連絡できることが要件 */}
            <p className="mt-2.5 border-l-2 border-navy/30 pl-3 text-sm leading-relaxed">
              {task.reason}
            </p>

            {task.relatedMessages.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                このアプローチから {task.relatedMessages.length} 件の連絡が発生しています
              </p>
            )}
          </li>
        ))}
      </ul>

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
