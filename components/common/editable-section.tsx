"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * セクション単位で編集するための枠。
 *
 * カルテ全体を一括で編集モードにすると項目が多すぎて保存単位が大きくなり、
 * 項目ごとの即編集は接客中の iPad で誤タップに気づけない。
 * 「今日聞けた家族構成だけ足す」が自然にできる粒度がセクション単位という判断。
 *
 * 下書きはこのコンポーネントが持ち、開くたびに initial() から作り直す。
 * キャンセルすれば下書きごと捨てられる。
 */
export function EditableSection<T>({
  title,
  initial,
  view,
  edit,
  onSave,
  canEdit = true,
  className,
}: {
  title: string;
  /** 編集を開いたときの初期値 */
  initial: () => T;
  view: React.ReactNode;
  edit: (value: T, update: (patch: Partial<T>) => void, set: (value: T) => void) => React.ReactNode;
  onSave: (value: T) => Promise<void> | void;
  /**
   * false なら編集の入口ごと出さない（鉛筆も保存も消える）。
   *
   * **RLS が弾く操作のボタンを出さないため。**出しておくと押せてしまい、
   * 通らないことが押したあとにしか分からない。読めるが書けない画面は
   * 実際にある（売上目標は全員が見られて、他人のぶんは管理者しか書けない）。
   */
  canEdit?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState<T | null>(null);
  const [saving, setSaving] = useState(false);

  /**
   * **例外を必ず捕まえる。**捕まえないと setSaving(false) すら走らず、
   * 保存ボタンが無効のまま編集画面が固まる（トーストも出ない）。
   * RLS は権限の無い書き込みを例外で返すので、ここは実際に通る道。
   *
   * 失敗しても下書きは捨てない。打ち直させるほうが害が大きい。
   */
  const handleSave = async () => {
    if (draft === null) return;
    setSaving(true);
    try {
      await onSave(draft);
      setDraft(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center gap-2 border-b border-border pb-1.5">
        <span className="h-3 w-0.5 shrink-0 bg-brand" />
        <h3 className="flex-1 font-heading text-sm font-medium tracking-wide">{title}</h3>
        {draft === null && canEdit && (
          <button
            type="button"
            onClick={() => setDraft(initial())}
            className="flex min-h-8 items-center gap-1 rounded-sm px-1.5 text-xs text-muted-foreground transition-colors hover:text-brand"
            aria-label={`${title}を編集`}
          >
            <Pencil className="size-3" />
            編集
          </button>
        )}
      </div>

      {draft === null ? (
        view
      ) : (
        <div className="flex flex-col gap-3 pt-2">
          {edit(
            draft,
            (patch) => setDraft((current) => ({ ...(current as T), ...patch })),
            (value) => setDraft(value),
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => setDraft(null)}
              disabled={saving}
            >
              キャンセル
            </Button>
            <Button size="sm" className="h-9" onClick={handleSave} disabled={saving}>
              保存
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

/** 編集フォームの 1 項目 */
export function FormField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1 py-1", className)}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
