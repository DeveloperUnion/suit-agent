"use client";

import { ArrowDown, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AgentActionCard } from "@/components/agent/agent-action-card";
import type { AgentAction, AgentMessage } from "@/lib/types";
import { useStickToBottom } from "@/lib/hooks/use-stick-to-bottom";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "時枝さんゴルフが趣味らしい",
  "ゴルフが趣味な人だれだっけ",
  "時枝さんってどんな人だっけ",
  "時枝さん電話番号が変わったって",
];

export function AgentMessageList({
  messages,
  pending,
  progress,
  keyboardHeight,
  onApply,
  onAnswer,
  onNavigate,
  onPickExample,
}: {
  messages: AgentMessage[];
  pending: boolean;
  /** いま何をしているか。空なら「考えています」に倒す */
  progress: string;
  /** キーボードで容器が縮んだ瞬間にも最新へ寄せ直すため、依存として受け取る */
  keyboardHeight: number;
  /** カードの上で編集された action がそのまま渡る（部分承認） */
  onApply: (message: AgentMessage, action: AgentAction) => Promise<void> | void;
  /** 聞き返しの選択肢が押されたとき。その文がそのまま次の発話になる */
  onAnswer: (answer: string) => void;
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
                  {/* 吹き出しの見た目はメッセージタブと揃える。別物のチャットに見せない。
                      **markdown を描かない。**ここは素のテキストのまま出すこと。
                      カルテの自由記述はモデルの文脈に入るので、描画側がリンクや
                      画像を解釈した瞬間に「仕込んだ文字列で情報を外へ運ぶ」経路が
                      開く（実害が報告されている形はほぼ全部これ）。読みやすさが
                      要るなら whitespace-pre-wrap の範囲で足す */}
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
                        onApply={(action) => onApply(message, action)}
                        onAnswer={onAnswer}
                        onNavigate={onNavigate}
                      />
                    </div>
                  )}
                </li>
              );
            })}

            {pending && (
              <li className="flex flex-col items-start gap-2">
                {/* 何をしているかを出す。スマホで無音の 4 秒は「固まった」に見える。
                    道具を呼ぶ前は言えることが無いので「考えています」に倒す */}
                <p className="flex items-center gap-2 rounded-md rounded-tl-sm border border-border bg-card px-3.5 py-2.5 text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Dot delay="0ms" />
                    <Dot delay="150ms" />
                    <Dot delay="300ms" />
                  </span>
                  <span aria-live="polite">{progress || "考えています"}</span>
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
