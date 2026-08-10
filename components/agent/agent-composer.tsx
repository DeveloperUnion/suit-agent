"use client";

import { useCallback, useRef, useState } from "react";
import { Mic, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSpeechRecognition } from "@/lib/hooks/use-speech-recognition";
import { cn } from "@/lib/utils";

export function AgentComposer({
  inputRef,
  disabled,
  onSend,
  isDesktop,
}: {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  disabled: boolean;
  onSend: (text: string) => void;
  isDesktop: boolean;
}) {
  const [draft, setDraft] = useState("");
  /** IME 変換中か。Enter での誤送信を防ぐ */
  const composingRef = useRef(false);
  const warnedRef = useRef(false);

  const appendTranscript = useCallback((text: string) => {
    setDraft((prev) => (prev ? `${prev}${text}` : text));
  }, []);

  const notifyUnavailable = useCallback((reason: string) => {
    // 端末側で音声認識が切られている場合など。何度も出しても直せないので 1 度だけ
    if (warnedRef.current) return;
    warnedRef.current = true;
    toast.info(reason, { description: "キーボードのマイクをお使いください。" });
  }, []);

  const speech = useSpeechRecognition({
    onResult: appendTranscript,
    onUnavailable: notifyUnavailable,
  });

  const send = () => {
    const text = draft.trim();
    if (!text || disabled) return;
    setDraft("");
    onSend(text);
  };

  return (
    <div className="flex flex-col gap-2">
      {speech.listening && (
        <div
          className="flex items-center gap-2 rounded-md border border-brand/25 bg-accent/40 px-3 py-2"
          aria-live="polite"
        >
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-brand motion-reduce:animate-none" />
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {speech.interim || "聴いています…"}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">離すと確定</span>
        </div>
      )}

      <div className="flex items-end gap-2">
        <Textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="聞いたことを話しかける"
          rows={1}
          disabled={disabled}
          aria-label="アシスタントへの入力"
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey) return;
            // スマホの Enter はキーボードの改行キーそのもの。送信に割り当てると必ず事故る
            if (!isDesktop) return;
            // 変換確定の Enter を送信と取り違えないよう三重に見る。
            // isComposing は Safari で false になることがあり、229 は古い IME の名残
            if (composingRef.current || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) {
              return;
            }
            e.preventDefault();
            send();
          }}
          // md:text-sm のままだと iPad で 16px を切り、iOS が入力欄に寄って拡大する
          className="max-h-40 min-h-11 resize-none bg-card text-base md:text-base"
        />

        {speech.supported && (
          <Button
            type="button"
            variant={speech.listening ? "default" : "outline"}
            size="icon"
            aria-label="押している間、音声入力"
            aria-pressed={speech.listening}
            disabled={disabled}
            // touch-none が無いと、マイクの上で指が動いた瞬間にログがスクロールする
            className="size-11 shrink-0 touch-none select-none lg:size-9"
            onPointerDown={(e) => {
              // 合成 mousedown・テキスト選択・iOS の長押しメニューを止める
              e.preventDefault();
              // 指がボタンの外へ流れても pointerup / cancel を確実に受け取る
              e.currentTarget.setPointerCapture(e.pointerId);
              speech.start();
            }}
            onPointerUp={speech.stop}
            // 着信やシステムジェスチャで飛んでくる。取りこぼすと録りっぱなしになる
            onPointerCancel={speech.stop}
            onLostPointerCapture={speech.stop}
            onContextMenu={(e) => e.preventDefault()}
            // 押しっぱなしができない人向け。キーボードではトグルにする
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              if (speech.listening) speech.stop();
              else speech.start();
            }}
          >
            <Mic className={cn("size-5 lg:size-4", speech.listening && "animate-pulse motion-reduce:animate-none")} />
          </Button>
        )}

        <Button
          type="button"
          size="icon"
          aria-label="送信"
          disabled={disabled || draft.trim() === ""}
          onClick={send}
          className="size-11 shrink-0 lg:size-9"
        >
          <Send className="size-5 lg:size-4" />
        </Button>
      </div>
    </div>
  );
}
