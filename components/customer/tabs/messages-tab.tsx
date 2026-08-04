"use client";

import { useCallback } from "react";
import { Sparkles } from "lucide-react";

import { EmptyState } from "@/components/common/field";
import { MESSAGE_CHANNEL_LABEL } from "@/lib/constants/labels";
import { listMessages } from "@/lib/data/messages";
import { useMockQuery } from "@/lib/hooks/use-mock-db";
import { formatDateTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils";

/** LINE 風のタイムライン。送受信を左右に分ける */
export function MessagesTab({ customerId }: { customerId: string }) {
  const loader = useCallback(() => listMessages(customerId), [customerId]);
  const { data: messages, loading } = useMockQuery(loader, [customerId]);

  if (!loading && (!messages || messages.length === 0)) {
    return <EmptyState>やり取りの記録がまだありません。</EmptyState>;
  }

  return (
    <ul className="flex flex-col gap-4">
      {(messages ?? []).map((message) => {
        const inbound = message.direction === "inbound";
        return (
          <li
            key={message.id}
            className={cn("flex flex-col gap-1", inbound ? "items-start" : "items-end")}
          >
            <div
              className={cn(
                "flex flex-wrap items-center gap-2 text-xs",
                inbound ? "flex-row" : "flex-row-reverse",
              )}
            >
              <span className="rounded-sm border border-border px-1.5 py-0.5 text-muted-foreground">
                {MESSAGE_CHANNEL_LABEL[message.channel]}
              </span>
              <span className="tnum font-mono text-muted-foreground">
                {formatDateTime(message.sentAt)}
              </span>
              {message.staffName && <span className="text-muted-foreground">{message.staffName}</span>}
              {message.isAiGenerated && (
                <span className="flex items-center gap-1 text-chalk">
                  <Sparkles className="size-3" />
                  AI下書き
                </span>
              )}
            </div>
            <p
              className={cn(
                "max-w-[min(34rem,88%)] rounded-md px-3.5 py-2.5 text-sm leading-relaxed",
                inbound
                  ? "rounded-tl-sm border border-border bg-card"
                  : "rounded-tr-sm bg-navy text-primary-foreground",
              )}
            >
              {message.body}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
