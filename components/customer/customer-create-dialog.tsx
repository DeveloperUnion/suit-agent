"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ChevronDown, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { FileDrop } from "@/components/common/file-drop";
import {
  DifferentPersonCheck,
  SimilarCustomerList,
  useDifferentPersonGate,
} from "@/components/customer/similar-customer-list";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CARD_FIELD_LABEL,
  EXTRA_CARD_FIELDS,
  extractBusinessCard,
  type BusinessCardExtraction,
  type BusinessCardFieldKey,
} from "@/lib/ai/extract-business-card";
import { isLowConfidence } from "@/lib/ai/extraction";
import { createCustomer, findSimilarCustomers } from "@/lib/data/customers";
import { useQuery } from "@/lib/hooks/use-query";
import type { Uuid } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * 顧客の新規登録。
 *
 * 打ち込んでもらうのは氏名・カナ・連絡手段だけ（要件4.1「最小項目のみで完了できること」）。
 * ここで会社名や来店日まで聞くと入力が重くなり、結局登録されなくなる。
 *
 * 一方、名刺から読めた項目は誰も打っていないので、増えても入力の負担にならない。
 * 「打つ項目は最小、もらえる項目は最大」で、最小項目の方針とは矛盾しない。
 */
export function CustomerCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [nameKana, setNameKana] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  // 名刺の読み取り
  const [reading, setReading] = useState(false);
  const [card, setCard] = useState<BusinessCardExtraction | null>(null);
  const [extra, setExtra] = useState<Partial<Record<BusinessCardFieldKey, string>>>({});
  const [extraOpen, setExtraOpen] = useState(true);

  const similarLoader = useCallback(
    () => findSimilarCustomers({ name, nameKana, phone }),
    [name, nameKana, phone],
  );
  const { data: similar } = useQuery(similarLoader, [name, nameKana, phone]);
  const gate = useDifferentPersonGate(similar);

  // 連絡手段は必須にしない。出張採寸で名前しか分からないまま帰る場面があり、
  // その場で登録できないと結局どこにも残らない。
  // 唯一の関門は「似た方がいませんか」— 二重登録だけは後から直せない。
  const canSubmit = name.trim() !== "" && !gate.blocked;

  const reset = () => {
    setName("");
    setNameKana("");
    setPhone("");
    setCard(null);
    setExtra({});
    setReading(false);
    gate.reset();
  };

  /**
   * 氏名・カナ・電話は既存の入力欄にそのまま流し込む。
   * 別の state に持つと similarLoader の依存から外れ、
   * 読み取った氏名に対して重複チェックが効かなくなる。
   */
  const handleCard = async (file: File) => {
    setReading(true);
    let result: BusinessCardExtraction;
    try {
      result = await extractBusinessCard(file);
    } catch (error) {
      // 読めなければ何も埋めない。半端に埋まると、どこが読み取りでどこが空欄か分からなくなる
      setReading(false);
      toast.error("名刺を読み取れませんでした", {
        description: error instanceof Error ? error.message : undefined,
      });
      return;
    }
    setCard(result);
    if (result.fields.name) setName(result.fields.name.value);
    if (result.fields.nameKana) setNameKana(result.fields.nameKana.value);
    if (result.fields.phone) setPhone(result.fields.phone.value);
    setExtra(
      Object.fromEntries(
        EXTRA_CARD_FIELDS.filter((key) => result.fields[key]).map((key) => [
          key,
          result.fields[key]!.value,
        ]),
      ),
    );
    setExtraOpen(true);
    setReading(false);
  };

  const readCount = card ? Object.keys(card.fields).length : 0;
  const warnCount = card
    ? Object.values(card.fields).filter((f) => isLowConfidence(f)).length
    : 0;

  /**
   * 失敗しても必ず saving を戻す。
   *
   * ここが素の await だったとき、登録が失敗すると saving が true のまま固まり、
   * ボタンが disabled のまま**二度と押せなくなっていた**。ダイアログは一覧に
   * 常時マウントされているので、閉じて開き直しても戻らない（再読み込みが要る）。
   * 何が原因で失敗したかにかかわらず、押した人はもう一度試せる状態に戻す。
   */
  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    let id: Uuid;
    try {
      id = await createCustomer({
        name: name.trim(),
        nameKana: nameKana.trim(),
        phone: phone.trim() || undefined,
        // 名刺から読めた項目。createCustomer は Partial<Customer> を受けるのでそのまま渡せる
        ...Object.fromEntries(
          Object.entries(extra).filter(([, v]) => v !== undefined && v.trim() !== ""),
        ),
      });
    } catch (error) {
      // 読み取りの失敗（handleCard）と同じ出し方に揃える。無言で終わると、
      // 押した人には「効かないボタン」としか見えない。
      toast.error("登録できませんでした", {
        description: error instanceof Error ? error.message : undefined,
      });
      return;
    } finally {
      setSaving(false);
    }
    reset();
    onOpenChange(false);
    toast.success("登録しました", { description: "続けてカルテに詳細を足せます。" });
    router.push(`/customers/${id}`);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg font-medium">顧客を登録</DialogTitle>
          <DialogDescription>
            氏名だけで登録できます。連絡先や会社名、好みは、あとからカルテで足してください。
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[70dvh] flex-col gap-4 overflow-y-auto">
          {/* 名刺からの読み取り。埋まった内容は必ず人が見てから登録する */}
          {reading ? (
            <div className="flex flex-col items-center gap-3 rounded-md border border-border p-6">
              <Loader2 className="size-6 animate-spin text-brand" />
              <span className="text-sm text-muted-foreground">読み取り中です</span>
            </div>
          ) : card ? (
            <p className="text-sm">
              名刺から
              <span className="tnum mx-1 font-mono font-medium">{readCount}項目</span>
              を読み取りました。内容を確認してください。
              {warnCount > 0 && (
                <span className="ml-1 text-thread">要確認が{warnCount}項目あります。</span>
              )}
            </p>
          ) : (
            <FileDrop
              accept="image/*"
              onFile={handleCard}
              label="名刺の画像をここにドロップ、または撮影して読み取る"
              hint="氏名・会社名・部署・役職・連絡先を読み取って、下の欄に入れます。"
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-name">
                氏名 <span className="text-thread">*</span>
              </Label>
              <Input
                id="new-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="時枝 正"
                className={cn(
                  "h-11 bg-card",
                  isLowConfidence(card?.fields.name) && "border-thread/40",
                )}
                autoFocus
              />
              {isLowConfidence(card?.fields.name) && <WarnHint />}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-kana">カナ</Label>
              <Input
                id="new-kana"
                value={nameKana}
                onChange={(e) => setNameKana(e.target.value)}
                placeholder="ときえだ ただし"
                className={cn(
                  "h-11 bg-card",
                  isLowConfidence(card?.fields.nameKana) && "border-thread/40",
                )}
              />
              {isLowConfidence(card?.fields.nameKana) && <WarnHint />}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-phone">電話</Label>
              <Input
                id="new-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="090-1234-5678"
                inputMode="tel"
                className={cn(
                  "h-11 bg-card font-mono",
                  isLowConfidence(card?.fields.phone) && "border-thread/40",
                )}
              />
              {isLowConfidence(card?.fields.phone) && <WarnHint />}
            </div>
          </div>

          {/* 名刺から読めた分。打つ手間がゼロなのでカルテに入れておく */}
          {Object.keys(extra).length > 0 && (
            <div className="flex flex-col gap-2 rounded-md border border-border p-3">
              <button
                type="button"
                onClick={() => setExtraOpen((v) => !v)}
                className="flex min-h-9 items-center gap-1.5 text-left"
              >
                <span className="field-label">名刺から読み取った項目</span>
                <span className="tnum font-mono text-xs text-muted-foreground">
                  {Object.keys(extra).length}
                </span>
                <ChevronDown
                  className={cn(
                    "ml-auto size-4 text-muted-foreground transition-transform",
                    extraOpen && "rotate-180",
                  )}
                />
              </button>

              {extraOpen && (
                <div className="flex flex-col gap-2">
                  {EXTRA_CARD_FIELDS.filter((key) => extra[key] !== undefined).map((key) => {
                    const warn = isLowConfidence(card?.fields[key]);
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <span className="w-16 shrink-0 field-label">{CARD_FIELD_LABEL[key]}</span>
                        <Input
                          value={extra[key] ?? ""}
                          onChange={(e) => setExtra((s) => ({ ...s, [key]: e.target.value }))}
                          className={cn("h-10 bg-card", warn && "border-thread/40")}
                        />
                        {warn && (
                          <span className="shrink-0 text-xs text-thread">要確認</span>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setExtra((s) => {
                              const next = { ...s };
                              delete next[key];
                              return next;
                            })
                          }
                          className="shrink-0 rounded-sm p-1 text-muted-foreground hover:text-foreground"
                          aria-label={`${CARD_FIELD_LABEL[key]}を消す`}
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 顧客1,000名規模では再来店の見落としと同姓同名が必ず起きる */}
          {gate.found && (
            <div className="flex flex-col gap-2">
              <span className="field-label">同じ方がいませんか</span>
              {/* こちらは登録の手前なので、紐づける先が無い。開いて確かめてもらう */}
              <SimilarCustomerList
                candidates={similar ?? []}
                onSelect={(c) => {
                  onOpenChange(false);
                  reset();
                  router.push(`/customers/${c.id}`);
                }}
                actionLabel="カルテを開く"
              />
              <DifferentPersonCheck
                checked={gate.checked}
                onChange={gate.setChecked}
                count={gate.count}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button className="h-11" onClick={handleSubmit} disabled={!canSubmit || saving}>
            登録してカルテを開く
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 読み取りの確信度が低い欄に添える。読み直すべき場所を絞るためのもの */
function WarnHint() {
  return <span className="text-xs text-thread">読み取りが不確かです。確認してください。</span>;
}
