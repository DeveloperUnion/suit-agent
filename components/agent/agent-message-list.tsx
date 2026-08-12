"use client";

import { ArrowDown, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AgentActionCard } from "@/components/agent/agent-action-card";
import type { AgentCustomerRef, AgentMessage } from "@/lib/types";
import { useStickToBottom } from "@/lib/hooks/use-stick-to-bottom";
import { cn } from "@/lib/utils";

const EXAMPLES = ["時枝さんゴルフが趣味らしい", "ゴルフが趣味な人だれだっけ"];

export function AgentMessageList({
  messages,
  pending,
  keyboardHeight,
  onApply,
  onPickCustomer,
  onNavigate,
  onPickExample,
}: {
  messages: AgentMessage[];
  pending: boolean;
  /** キーボードで容器が縮んだ瞬間にも最新へ寄せ直すため、依存として受け取る */
  keyboardHeight: number;
  onApply: (message: AgentMessage) => Promise<void> | void;
  onPickCustomer: (customer: AgentCustomerRef, labels: string[], body: string) => void;
  onNavigate: (href: string) => void;
  onPickExample: (text: string) => void;
}) {
  const { ref, onScroll, hasNew, scrollToBottom } = useStickToBottom([
    messages.length,
    pending,
    keyboardHeight,
  ]);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={ref}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-busy={pending}
        className="h-full overflow-y-auto overscroll-contain px-4 py-3"
      >
        {messages.length === 0 && !pending ? (
          <div className="flex flex-col gap-3 pt-6">
            <p className="text-sm leading-relaxed text-muted-foreground">
              接客で聞いたことを、そのまま話しかけてください。
              カルテを開かなくても趣味を残せます。
            </p>
            <ul className="flex flex-col gap-2">
              {EXAMPLES.map((example) => (
                <li key={example}>
                  <button
                    type="button"
                    onClick={() => onPickExample(example)}
                    className="flex min-h-11 w-full items-center gap-2 rounded-md border border-dashed border-border bg-card/40 px-3 py-2 text-left text-sm transition-colors hover:border-brand/40 active:bg-accent/40"
                  >
                    <Sparkles className="size-3.5 shrink-0 text-brand" />
                    <span className="min-w-0 flex-1">{example}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {messages.map((message) => {
              const mine = message.role === "user";
              return (
                <li
                  key={message.id}
                  className={cn("flex flex-col gap-2", mine ? "items-end" : "items-start")}
                >
                  {/* 吹き出しの見た目はメッセージタブと揃える。別物のチャットに見せない */}
                  <p
                    className={cn(
                      "max-w-[min(34rem,88%)] whitespace-pre-wrap rounded-md px-3.5 py-2.5 text-sm leading-relaxed",
                      mine
                        ? "rounded-tr-sm bg-brand-fill text-primary-foreground"
                        : "rounded-tl-sm border border-border bg-card",
                    )}
                  >
                    {message.body}
                  </p>
                  {message.action && (
                    <div className="w-full max-w-[min(34rem,100%)]">
                      <AgentActionCard
                        action={message.action}
                        applied={Boolean(message.appliedAt)}
                        onApply={() => onApply(message)}
                        onPickCustomer={onPickCustomer}
                        onNavigate={onNavigate}
                      />
                    </div>
                  )}
                </li>
              );
            })}

            {pending && (
              <li className="flex flex-col items-start gap-2">
                <p className="flex items-center gap-1.5 rounded-md rounded-tl-sm border border-border bg-card px-3.5 py-2.5">
                  <Dot delay="0ms" />
                  <Dot delay="150ms" />
                  <Dot delay="300ms" />
                  <span className="sr-only">応答を作成しています</span>
                </p>
              </li>
            )}
          </ul>
        )}
      </div>

      {hasNew && (
        <Button
          type="button"
          size="sm"
          onClick={() => scrollToBottom()}
          className="absolute inset-x-0 bottom-2 mx-auto w-fit gap-1.5 shadow-md"
        >
          <ArrowDown className="size-3.5" />
          新着
        </Button>
      )}
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      style={{ animationDelay: delay }}
      className="size-1.5 animate-pulse rounded-full bg-muted-foreground motion-reduce:animate-none"
    />
  );
}
