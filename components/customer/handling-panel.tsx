"use client";

import { useCallback, useState } from "react";
import { AlertTriangle, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addNgNote, invalidateNgNote, listNgNotes } from "@/lib/data/facts";
import { useQuery } from "@/lib/hooks/use-query";
import type { Uuid } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * 注意事項 — 断られた提案、避けるべき話題。
 *
 * 取りこぼしが許されない情報を 1 箇所に集めてある。パーソナルのチップは
 * 類似検索で「引っ張り出す」もので、こちらはカルテを開いた瞬間に
 * **無条件で全件**目に入るべきもの。同じ機構に載せない。
 *
 * もとは写真掲載・夜間連絡の可否も同じ枠に置いていたが、運用で一度も
 * 使われないまま枠の下半分を占め、本来ここで読ませたい注意事項から
 * 視線を奪っていた。Phase 3 で列ごと落とした。
 */
export function HandlingPanel({ customerId }: { customerId: Uuid }) {
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

  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-md border p-3.5",
        // 1 件でもあれば枠の色で気づかせる。無ければ静かにしておく
        hasNg ? "border-thread/30 bg-thread/5" : "border-border bg-card",
      )}
    >
      <div className="flex items-center gap-2">
        {hasNg && <AlertTriangle className="size-4 shrink-0 text-thread" />}
        <span className={cn("field-label", hasNg && "text-thread")}>注意事項</span>
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
                aria-label="この注意事項を解消する"
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
          aria-label="注意事項を足す"
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </section>
  );
}
