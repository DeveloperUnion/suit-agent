"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ArrowLeft, Eraser, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AgentComposer } from "@/components/agent/agent-composer";
import { AgentMessageList } from "@/components/agent/agent-message-list";
import { useAgent } from "@/components/agent/agent-provider";
import { interpret } from "@/lib/ai/agent";
import { actionCustomerName, appliedMessage, applyAgentAction } from "@/lib/data/agent-apply";
import {
  appendAgentMessage,
  clearAgentMessages,
  listAgentMessages,
  markAgentActionApplied,
} from "@/lib/data/agent-chat";
import { useIsDesktop } from "@/lib/hooks/use-media-query";
import { useQuery } from "@/lib/hooks/use-query";
import { useVisualViewport } from "@/lib/hooks/use-visual-viewport";
import type { AgentAction, AgentCustomerRef, AgentMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * スマホは全画面、lg 以上は右の側パネル。
 *
 * ui/dialog.tsx をそのまま使えないのは、DialogContent が必ずオーバーレイを描画し、
 * そこに className を渡せないため。lg では暗幕を消して背後のカルテを見ながら
 * 話せる状態にしたい。ui/sheet.tsx も data-[side=right] のクラスが
 * tailwind-merge の衝突判定に載らず上書きできないので、Radix から直接組む。
 */
export function AgentPanel() {
  const { open, setOpen, contextRef, dismissContext } = useAgent();
  const isDesktop = useIsDesktop();
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const [pending, setPending] = useState(false);

  // 書き込みは必ず mutateDb を通るので、追記も削除もこの購読だけで反映される
  const loader = useCallback(() => listAgentMessages(), []);
  const { data: messages } = useQuery(loader, []);

  // スマホだけ visual viewport の実測を当てる。iOS はキーボードで dvh が変わらない
  const viewport = useVisualViewport(open && !isDesktop);

  // 依存は id だけ。contextRef ごと依存にすると、名前だけ変わった同じ顧客でも作り直る
  const contextCustomerId = contextRef?.id;

  const send = useCallback(
    async (text: string) => {
      setPending(true);
      try {
        await appendAgentMessage({ role: "user", body: text });
        // 履歴は送る前のものを渡す。いま打った 1 行は text として別に渡すので、
        // 両方入れると同じ発話が 2 回並ぶ。
        const turn = await interpret(text, { customerId: contextCustomerId, history: messages });
        await appendAgentMessage({ role: "assistant", body: turn.reply, action: turn.action });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "うまく聞き取れませんでした");
      } finally {
        // finally が要る。ここを抜かすと、失敗したとき入力欄が
        // disabled のまま固まり、閉じて開き直すまで打てなくなる
        setPending(false);
      }
    },
    [contextCustomerId, messages],
  );

  /**
   * 提案を書き込む。
   *
   * 受け取る action はカードの上で編集されたもの（外したラベルが落ちている）。
   * 提案時のスナップショットではなく、**人が見て押した内容**をそのまま書く。
   */
  const apply = useCallback(async (message: AgentMessage, action: AgentAction) => {
    try {
      await applyAgentAction(action);
    } catch {
      toast.error("カルテに残せませんでした");
      return;
    }
    try {
      await markAgentActionApplied(message.id);
    } catch {
      // 適用は一度きり（agent_messages のトリガー）。二度押しはここで落ちるが、
      // 書き込み自体は上で終わっているので、成功として畳んでよい。
      // 押したか分からず もう一度押す、は普通に起きる。
    }
    toast.success(appliedMessage(action), { description: actionCustomerName(action) });
  }, []);

  /** 同姓の候補から選ばれたとき。誰の話かを言い直して、もう一度考えさせる */
  const pickCustomer = useCallback(
    async (customer: AgentCustomerRef) => {
      await send(`${customer.name} さんのことです`);
    },
    [send],
  );

  /**
   * カルテへ移る。
   *
   * スマホは全画面なので、閉じないと遷移先が見えない。ただし閉じる処理は
   * 積んだ履歴エントリを history.back() で戻すため、そのまま遷移させると
   * 打ち消し合って動かない。戻り終わってから進む、と順序を明示する。
   */
  const navigateTo = useCallback(
    (href: string) => {
      if (isDesktop || !window.history.state?.agentPanel) {
        router.push(href);
        return;
      }
      const afterBack = () => {
        window.removeEventListener("popstate", afterBack);
        router.push(href);
      };
      window.addEventListener("popstate", afterBack);
      window.history.back();
    },
    [isDesktop, router],
  );

  const clear = useCallback(async () => {
    await clearAgentMessages();
  }, []);

  /**
   * スマホの全画面は、端末の戻る操作で閉じられないと
   * 「戻ったつもりがアプリごと前の画面へ行く」ことになる。
   * URL は変えず、履歴のエントリだけ積んで戻る操作を受け止める。
   */
  useEffect(() => {
    if (!open || isDesktop) return;
    window.history.pushState({ agentPanel: true }, "");
    const onPop = () => setOpen(false);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // ✕ や遷移で閉じたときは、自分が積んだ分を戻しておく
      if (window.history.state?.agentPanel) window.history.back();
    };
  }, [open, isDesktop, setOpen]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen} modal={!isDesktop}>
      <DialogPrimitive.Portal>
        {/* 暗幕はスマホだけ。lg で出すと背後のカルテに触れなくなる */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:animate-none lg:hidden" />
        <DialogPrimitive.Content
          // h-dvh は JS が測る前の 1 フレームと visualViewport 非対応環境のための下敷き
          style={
            isDesktop || !viewport
              ? undefined
              : { top: viewport.offsetTop, height: viewport.height }
          }
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden bg-background text-sm text-foreground",
            "inset-x-0 top-0 h-dvh border-0",
            "lg:inset-y-0 lg:right-0 lg:left-auto lg:h-auto lg:w-[26rem] lg:border-l lg:border-border lg:shadow-lg",
            "data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-10 lg:data-open:slide-in-from-right-10 lg:data-open:slide-in-from-bottom-0",
            "data-closed:animate-out data-closed:fade-out-0",
            "motion-reduce:animate-none motion-reduce:transition-none",
          )}
          onOpenAutoFocus={(e) => {
            // スマホで開いた瞬間にキーボードが立ち上がると会話が見えない。PC だけ入力欄へ
            e.preventDefault();
            if (isDesktop) inputRef.current?.focus({ preventScroll: true });
          }}
          // 側パネルは作業と併走させたいので、外側を触っても閉じない
          onInteractOutside={(e) => {
            if (isDesktop) e.preventDefault();
          }}
          // 変換中の Esc は「変換の取り消し」。パネルまで閉じては困る
          onEscapeKeyDown={(e) => {
            if (composingRef.current) e.preventDefault();
          }}
        >
          <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
            {/* 全画面を閉じるのは左上の戻る。スマホの慣習であり、親指も届く */}
            <DialogPrimitive.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="閉じる"
                className="size-11 shrink-0 lg:hidden"
              >
                <ArrowLeft className="size-5" />
              </Button>
            </DialogPrimitive.Close>

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="field-label">Assistant</span>
              <DialogPrimitive.Title className="truncate font-heading text-base font-medium">
                AI アシスタント
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Description className="sr-only">
              話しかけると、顧客の趣味をカルテに残したり、趣味から顧客を探したりできます。
            </DialogPrimitive.Description>
            {messages && messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="会話を消す"
                onClick={clear}
                className="size-11 shrink-0 lg:size-9"
              >
                <Eraser className="size-4" />
              </Button>
            )}
            {/* 側パネルは常駐させて使うので、閉じるは右上の × のまま */}
            <DialogPrimitive.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="閉じる"
                className="hidden size-9 shrink-0 lg:inline-flex"
              >
                <X className="size-4" />
              </Button>
            </DialogPrimitive.Close>
          </header>

          {/* いま誰の話をしているか。全画面にすると背後のカルテが見えなくなるため必ず出す */}
          {contextRef && (
            <div className="flex shrink-0 items-center gap-2 border-b border-border bg-accent/40 px-3 py-2">
              <span className="field-label shrink-0">この人の話</span>
              <span className="min-w-0 flex-1 truncate text-sm">{contextRef.label}</span>
              <button
                type="button"
                onClick={dismissContext}
                aria-label="この人の話をやめる"
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          <AgentMessageList
            messages={messages ?? []}
            pending={pending}
            keyboardHeight={viewport?.height ?? 0}
            onApply={apply}
            onPickCustomer={pickCustomer}
            onNavigate={navigateTo}
            onPickExample={send}
          />

          <div
            className="shrink-0 border-t border-border px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
            }}
          >
            <AgentComposer
              inputRef={inputRef}
              disabled={pending}
              onSend={send}
              isDesktop={isDesktop}
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
