"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getCurrentStaffId } from "@/lib/auth/current-staff";
import { MESSAGE_CHANNEL_LABEL, TRIGGER_LABEL } from "@/lib/constants/labels";
import { useSettings } from "@/lib/hooks/use-settings";
import { generateDrafts, type MessageDraft } from "@/lib/ai/draft-messages";
import { listMessages, sendMessage } from "@/lib/data/messages";
import { getApproachForCustomer } from "@/lib/data/approaches";
import { useMockQuery } from "@/lib/hooks/use-mock-db";
import { formatDateTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils";

/**
 * メッセージタブ。履歴と作成を同じ画面に置く。
 *
 * 要件4.5でAIに「過去のやり取り（トーンを合わせるため）」を渡すと決めている以上、
 * 書く側も過去を見ながら書けるべきだという判断。
 */
export function MessagesTab({
  customerId,
  elapsedDays,
  approachTaskId,
  onClearApproach,
}: {
  customerId: string;
  elapsedDays: number | null;
  /** アプローチから遷移してきた場合。送信時に紐づけて効果測定に使う */
  approachTaskId?: string;
  onClearApproach?: () => void;
}) {
  const [body, setBody] = useState("");
  const [drafts, setDrafts] = useState<MessageDraft[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [usedDraft, setUsedDraft] = useState(false);
  const [sending, setSending] = useState(false);

  const messagesLoader = useCallback(() => listMessages(customerId), [customerId]);
  const { data: messages, loading } = useMockQuery(messagesLoader, [customerId]);

  const approachLoader = useCallback(() => getApproachForCustomer(customerId), [customerId]);
  const { data: currentApproach } = useMockQuery(approachLoader, [customerId]);
  // 画面から渡された ID と、いま評価されているアプローチが一致するときだけ根拠を出す
  const approach = approachTaskId && currentApproach?.id === approachTaskId ? currentApproach : undefined;

  const settings = useSettings();
  const overdue = elapsedDays !== null && elapsedDays > settings.elapsedDaysThreshold;

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      setDrafts(await generateDrafts(customerId, { approachTaskId }));
    } finally {
      setGenerating(false);
    }
  }, [customerId, approachTaskId]);

  /**
   * アプローチから「メッセージを作成」で来たときは、着いた時点で下書きを出す。
   * 連絡すると決めた直後にもう一度ボタンを押させても得るものがないため。
   * 同じアプローチで二度走らせない（閉じたのに勝手に出直すのを防ぐ）。
   */
  const generatedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!approachTaskId || generatedFor.current === approachTaskId) return;
    generatedFor.current = approachTaskId;
    void handleGenerate();
  }, [approachTaskId, handleGenerate]);

  const handleSend = async () => {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    await sendMessage({
      customerId,
      staffId: getCurrentStaffId(),
      body: text,
      channel: "line",
      isAiGenerated: usedDraft,
      approachTaskId,
      approachContext: approach
        ? {
            triggerTypes: approach.triggerTypes,
            reason: approach.hits.map((h) => h.reason).join(" "),
          }
        : undefined,
    });
    setBody("");
    setDrafts(null);
    setUsedDraft(false);
    setSending(false);
    onClearApproach?.();
    toast.success("送信しました", {
      description: approach ? "このアプローチを対応済みにしました。" : "最終接触日を更新しました。",
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ── 履歴 ── */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : messages && messages.length > 0 ? (
        <ul className="flex flex-col gap-4">
          {messages.map((message) => {
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
                  {message.staffName && (
                    <span className="text-muted-foreground">{message.staffName}</span>
                  )}
                  {message.isAiGenerated && (
                    <span className="flex items-center gap-1 text-chalk">
                      <Sparkles className="size-3" />
                      AI下書き
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    "max-w-[min(34rem,88%)] whitespace-pre-wrap rounded-md px-3.5 py-2.5 text-sm leading-relaxed",
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
      ) : (
        <p className="rounded-md border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
          メッセージの記録はまだありません。下から最初の連絡を送れます。
        </p>
      )}

      {/* ── 作成 ── */}
      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-border bg-background/95 px-4 pb-4 pt-3 backdrop-blur sm:-mx-6 sm:px-6">
        {approach && (
          <div className="flex items-start gap-2 rounded-md border border-navy/25 bg-accent/50 px-3 py-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="field-label">きっかけ</span>
                {approach.triggerTypes.map((t) => (
                  <span key={t} className="rounded-sm bg-navy/10 px-1.5 text-xs text-navy">
                    {TRIGGER_LABEL[t]}
                  </span>
                ))}
              </span>
              {approach.hits.map((hit) => (
                <p key={hit.type} className="text-xs leading-relaxed text-muted-foreground">
                  {hit.reason}
                </p>
              ))}
            </div>
            <button
              type="button"
              onClick={onClearApproach}
              className="shrink-0 rounded-sm p-1 text-muted-foreground hover:text-foreground"
              aria-label="きっかけの紐づけを外す"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {!approach && overdue && (
          <p className="flex items-center gap-1.5 text-xs text-thread">
            <AlertTriangle className="size-3.5" />
            {elapsedDays}日連絡がありません
          </p>
        )}

        {/* 自動生成のときは押していないのに待たされるので、生成中であることを場所ごと見せる */}
        {generating && !drafts && (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
            <span className="field-label">AI下書き 3案</span>
            <div className="grid gap-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-sm" />
              ))}
            </div>
          </div>
        )}

        {drafts && drafts.length > 0 && (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="field-label">AI下書き 3案</span>
              <button
                type="button"
                onClick={() => setDrafts(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                閉じる
              </button>
            </div>
            <div className="grid gap-2 lg:grid-cols-3">
              {drafts.map((draft) => (
                <button
                  key={draft.id}
                  type="button"
                  onClick={() => {
                    setBody(draft.body);
                    setUsedDraft(true);
                    setDrafts(null);
                  }}
                  className="flex flex-col gap-1.5 rounded-sm border border-border p-2.5 text-left transition-colors hover:border-navy/40 hover:bg-accent/40"
                >
                  <span className="field-label text-navy">{draft.angle}</span>
                  <span className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                    {draft.body}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              選ぶと入力欄に入ります。そのままでは送られません。必ず目を通して調整してください。
            </p>
          </div>
        )}

        <Textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            if (usedDraft) setUsedDraft(false);
          }}
          placeholder="メッセージを入力"
          rows={3}
          className="resize-none bg-card"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="outline"
            className="h-11 gap-1.5 sm:h-10"
            onClick={handleGenerate}
            disabled={generating}
          >
            <Sparkles className="size-4" />
            {generating ? "作成中…" : drafts ? "AI下書きを出し直す" : "AI下書きを出す"}
          </Button>
          <div className="flex items-center gap-3">
            {/* 目安字数は設定から。LINE で読みやすい長さに収める（要件4.5） */}
            <span
              className={cn(
                "tnum font-mono text-xs",
                body.length > 0 &&
                  (body.length < settings.message.lengthMin ||
                    body.length > settings.message.lengthMax)
                  ? "text-thread"
                  : "text-muted-foreground",
              )}
              title={`目安 ${settings.message.lengthMin}〜${settings.message.lengthMax}字`}
            >
              {body.length}字
            </span>
            <Button
              className="h-11 gap-1.5 sm:h-10"
              onClick={handleSend}
              disabled={!body.trim() || sending}
            >
              <Send className="size-4" />
              LINEで送信
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
