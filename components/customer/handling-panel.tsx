"use client";

import { useCallback, useState } from "react";
import { AlertTriangle, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addNgNote, invalidateNgNote, listNgNotes } from "@/lib/data/facts";
import { updateCustomer } from "@/lib/data/customers";
import { useQuery } from "@/lib/hooks/use-query";
import type { Uuid } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * 取り扱い — NG 事項と、写真掲載・夜間連絡の可否。
 *
 * 取りこぼしが許されない情報を 1 箇所に集めてある。人となりのチップは
 * 類似検索で「引っ張り出す」もので、こちらはカルテを開いた瞬間に
 * **無条件で全件**目に入るべきもの。同じ機構に載せない。
 *
 * 同意の既定はどちらも「不可」。設定し忘れが「まだ許可を得ていない」に
 * 倒れる向きに揃えてある。逆だと、同意の無い人の写真を使う事故が無音で起きる。
 */
export function HandlingPanel({
  customerId,
  photoConsent,
  nightContactOk,
}: {
  customerId: Uuid;
  photoConsent: boolean;
  nightContactOk: boolean;
}) {
  const loadNotes = useCallback(() => listNgNotes(customerId), [customerId]);
  const { data: notes } = useQuery(loadNotes, [customerId]);

  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);

  const rows = notes ?? [];
  const hasNg = rows.length > 0;

  const add = async () => {
    const text = body.trim();
    if (!text) return;
    setPending(true);
    try {
      await addNgNote(customerId, text);
      setBody("");
    } catch {
      toast.error("足せませんでした。同じ内容がすでに入っているかもしれません。");
    } finally {
      setPending(false);
    }
  };

  const toggle = async (patch: { photoConsent?: boolean; nightContactOk?: boolean }) => {
    await updateCustomer(customerId, patch);
  };

  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-md border p-3.5",
        // NG が 1 件でもあれば枠の色で気づかせる。無ければ静かにしておく
        hasNg ? "border-thread/30 bg-thread/5" : "border-border bg-card",
      )}
    >
      <div className="flex items-center gap-2">
        {hasNg && <AlertTriangle className="size-4 shrink-0 text-thread" />}
        <span className={cn("field-label", hasNg && "text-thread")}>取り扱い</span>
      </div>

      {rows.length > 0 && (
        <ul className="flex flex-col gap-1">
          {rows.map((note) => (
            <li key={note.id} className="flex items-start gap-2">
              <span className="flex-1 text-sm leading-relaxed">{note.body}</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                onClick={() => void invalidateNgNote(note.id)}
                aria-label="この NG 事項を解消する"
              >
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void add();
            }
          }}
          placeholder="断られた提案、避けるべき話題など"
          className="h-10 bg-background"
        />
        <Button
          variant="outline"
          size="icon"
          className="size-10 shrink-0"
          onClick={() => void add()}
          disabled={pending || !body.trim()}
          aria-label="NG 事項を足す"
        >
          <Plus className="size-4" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border/60 pt-3">
        <Consent
          label="写真掲載"
          value={photoConsent}
          onChange={(next) => void toggle({ photoConsent: next })}
        />
        <Consent
          label="夜間連絡"
          value={nightContactOk}
          onChange={(next) => void toggle({ nightContactOk: next })}
        />
      </div>
    </section>
  );
}

/**
 * 可・不可の 2 択。
 *
 * 「未設定」を作らない。同意は取れているか取れていないかのどちらかで、
 * 中間を置くと「まだ聞いていない」と「不可」が混ざる。既定は不可。
 */
function Consent({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="field-label">{label}</span>
      <div className="flex overflow-hidden rounded-sm border border-border">
        {[true, false].map((option) => (
          <button
            key={String(option)}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              "min-h-8 px-2.5 text-xs transition-colors",
              value === option
                ? "bg-brand-fill text-primary-foreground"
                : "bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {option ? "可" : "不可"}
          </button>
        ))}
      </div>
    </div>
  );
}
