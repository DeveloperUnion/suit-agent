"use client";

import { Sparkles } from "lucide-react";

import { useAgent } from "@/components/agent/agent-provider";
import { cn } from "@/lib/utils";

/**
 * どの画面からでも 1 タップで届く入口。
 *
 * 右下なのは、接客直後にスマホを片手で持ったまま親指が届くのがそこだけのため。
 * 同じ場所を sonner のトーストと dev インジケータが使っていたので、
 * トーストは app/layout.tsx の offset で上へ、インジケータは
 * next.config.ts で消してある。
 *
 * ツールチップは付けない。タッチでは最初の 1 回がツールチップの表示に吸われて
 * パネルが開かず、主戦場のスマホで入口が二度押しになるため。
 */
export function AgentFab() {
  const { open, setOpen } = useAgent();

  return (
    <button
      type="button"
      aria-label="AI アシスタントを開く"
      aria-expanded={open}
      onClick={(e) => {
        // Safari はボタンのクリックでフォーカスを移さない。
        // 明示しないと閉じたときのフォーカス復帰先が body になる
        e.currentTarget.focus();
        setOpen(true);
      }}
      className={cn(
        "fixed z-40 flex items-center justify-center rounded-full bg-brand-fill text-primary-foreground shadow-lg",
        "size-14 lg:size-12",
        // ホームバーぶんは viewport-fit=cover を入れるまで 0 に潰れる。将来の保険
        "right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] lg:right-6 lg:bottom-6",
        "transition-[transform,opacity] hover:bg-brand-fill/90",
        "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        // 開いている間は引っ込めるが、DOM からは外さない。
        // Radix が閉じるときフォーカスを戻す先がなくなるため
        open && "pointer-events-none scale-0 opacity-0",
        "motion-reduce:transition-none",
      )}
    >
      <Sparkles className="size-6 lg:size-5" strokeWidth={1.75} />
    </button>
  );
}
