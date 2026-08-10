"use client";

import { useCallback, useState } from "react";
import { AlertTriangle, Search } from "lucide-react";
import { toast } from "sonner";

import { FileDrop } from "@/components/common/file-drop";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getCurrentStaffId } from "@/lib/auth/current-staff";
import { extractOrderSheet } from "@/lib/ai/extract-order-sheet";
import { CONFIDENCE_WARN } from "@/lib/ai/extraction";
import { ADJUSTMENT_MAP, MAX_ADJUSTMENTS } from "@/lib/constants/adjustments";
import { ITEM_TYPE_MAP } from "@/lib/constants/measurement-fields";
import { ORDER_PURPOSE_LABEL, FABRIC_PATTERN_LABEL } from "@/lib/constants/labels";
import {
  buildImportPlan,
  commitOrderSheetImport,
  type ImportPlan,
  type ImportPlanSection,
} from "@/lib/data/order-sheet-import";
import { listFabrics } from "@/lib/data/orders";
import { useMockQuery } from "@/lib/hooks/use-mock-db";
import type { OrderPurpose } from "@/lib/types";
import { formatAmount, parseAmount } from "@/lib/utils/date";
import { cn } from "@/lib/utils";

/**
 * 工場発注書の取り込み。
 *
 * 読み取り → 確認 → 書き込み の 3 段。確認画面を飛ばさないのは、
 * 紙は上がり寸しか持たず、顧客も生地も文字列からの推測になるため。
 * 黙って書くと、誰も気づけない誤りがそのまま採寸履歴に残る。
 */
export function OrderSheetImportDialog({
  customerId,
  customerName,
  open,
  onOpenChange,
  onImported,
}: {
  customerId: string;
  customerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 取り込んだ採寸票を親が開けるようにする */
  onImported: (sheetId: string) => void;
}) {
  const [phase, setPhase] = useState<"select" | "reading" | "confirm">("select");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [nameMismatchAccepted, setNameMismatchAccepted] = useState(false);
  const [fabricKeyword, setFabricKeyword] = useState("");
  const [saving, setSaving] = useState(false);

  const fabricsLoader = useCallback(() => listFabrics(fabricKeyword), [fabricKeyword]);
  const { data: fabrics } = useMockQuery(fabricsLoader, [fabricKeyword]);

  const allFabricsLoader = useCallback(() => listFabrics(), []);
  const { data: allFabrics } = useMockQuery(allFabricsLoader, []);
  const selectedFabric = allFabrics?.find((f) => f.id === plan?.fabricId);

  const reset = () => {
    setPhase("select");
    setPlan(null);
    setNameMismatchAccepted(false);
    setFabricKeyword("");
  };

  const handleFile = async (file: File) => {
    setPhase("reading");
    const extraction = await extractOrderSheet(file);
    const next = buildImportPlan(extraction, {
      customerId,
      fabrics: await listFabrics(),
    });
    setPlan(next);
    setFabricKeyword(next.fabricId ? "" : (next.fabricHint ?? ""));
    setPhase("confirm");
  };

  const update = (patch: Partial<ImportPlan>) =>
    setPlan((current) => (current ? { ...current, ...patch } : current));

  const nameMismatch =
    plan?.paperCustomerName !== undefined &&
    normalize(plan.paperCustomerName) !== normalize(customerName);

  const upperCount = plan?.adjustments.filter((a) => !a.unknown && isUpper(a.code)).length ?? 0;
  const lowerCount = (plan?.adjustments.filter((a) => !a.unknown).length ?? 0) - upperCount;

  const canSubmit =
    plan !== null &&
    plan.fabricId !== undefined &&
    plan.sections.length > 0 &&
    (!nameMismatch || nameMismatchAccepted);

  const handleSubmit = async () => {
    if (!plan || !canSubmit) return;
    setSaving(true);
    const { sheetId } = await commitOrderSheetImport(plan, getCurrentStaffId());
    setSaving(false);
    onOpenChange(false);
    reset();
    toast.success("発注書を取り込みました", {
      description: "採寸票と注文を作成しました。実寸は空欄のままです。",
    });
    onImported(sheetId);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[92dvh] sm:w-[95vw] sm:max-w-4xl sm:rounded-md sm:border">
        <DialogHeader className="shrink-0 space-y-0 border-b border-border px-4 py-3 text-left sm:px-6">
          <span className="field-label">Order Sheet</span>
          <DialogTitle className="font-heading text-base font-medium sm:text-lg">
            発注書を取り込む — {customerName} 様
          </DialogTitle>
          <DialogDescription className="sr-only">
            工場発注書を読み取り、内容を確認してから採寸票と注文を作成します。
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto p-4 sm:p-6">
          {phase === "select" && (
            <FileDrop
              accept="image/*,application/pdf"
              onFile={handleFile}
              label="工場発注書（PDF・画像）をここにドロップ"
              hint="受注日・寸法・補正・生地・備考を読み取ります。紙は上がり寸のみのため、実寸欄は空のままになります。"
            />
          )}

          {phase === "reading" && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">発注書を読み取っています…</p>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          {phase === "confirm" && plan && (
            <>
              {nameMismatch && (
                <div className="flex flex-col gap-2 rounded-md border border-thread/30 bg-thread/5 p-3">
                  <span className="flex items-start gap-1.5 text-sm text-thread">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    紙のお客様名「{plan.paperCustomerName}」は、いま開いている「{customerName}{" "}
                    様」と一致しません。別の方の発注書かもしれません。
                  </span>
                  <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={nameMismatchAccepted}
                      onChange={(e) => setNameMismatchAccepted(e.target.checked)}
                      className="size-4 accent-[var(--navy)]"
                    />
                    同じ方として取り込む
                  </label>
                </div>
              )}

              {plan.lowConfidenceCount > 0 && (
                <p className="text-sm text-thread">
                  読み取りが不確かな寸法が {plan.lowConfidenceCount}項目あります。
                  紙と見比べて直してください。
                </p>
              )}

              {/* ① 受注情報 */}
              <Step number={1} title="受注情報">
                <div className="grid gap-4 sm:grid-cols-4">
                  <DateField
                    id="import-ordered"
                    label="受注日"
                    value={plan.orderedAt}
                    onChange={(v) => update({ orderedAt: v, measuredAt: v })}
                  />
                  <DateField
                    id="import-due"
                    label="納期"
                    value={plan.dueDate ?? ""}
                    onChange={(v) => update({ dueDate: v || undefined })}
                  />
                  <DateField
                    id="import-delivered"
                    label="お渡し日"
                    value={plan.deliveredAt ?? ""}
                    onChange={(v) => update({ deliveredAt: v || undefined })}
                  />
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="import-purpose">用途</Label>
                    <Select
                      value={plan.purpose}
                      onValueChange={(v) => update({ purpose: v as OrderPurpose })}
                    >
                      <SelectTrigger id="import-purpose" className="h-11 bg-card">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(ORDER_PURPOSE_LABEL) as OrderPurpose[]).map((p) => (
                          <SelectItem key={p} value={p}>
                            {ORDER_PURPOSE_LABEL[p]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  <span className="field-label">生地</span>
                  {plan.fabricId === undefined ? (
                    <p className="text-sm text-thread">
                      原反NO「{plan.fabricHint ?? "—"}」に一致する生地がありません。一覧から選んでください。
                    </p>
                  ) : (
                    // 一覧の中で選ばれている行は下にあって見えないことがある。
                    // 何が選ばれているかは、探さなくても分かる位置に出す
                    <p className="text-sm">
                      選択中
                      <span className="ml-2 font-medium">{selectedFabric?.brand}</span>
                      <span className="tnum ml-2 font-mono text-xs text-muted-foreground">
                        {selectedFabric?.productNumber}
                      </span>
                      <span className="ml-2">{selectedFabric?.color}</span>
                      {plan.fabricHint && selectedFabric?.productNumber !== plan.fabricHint && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          （紙の原反NO「{plan.fabricHint}」）
                        </span>
                      )}
                    </p>
                  )}
                  <div className="relative max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={fabricKeyword}
                      onChange={(e) => setFabricKeyword(e.target.value)}
                      placeholder="ブランド・品番・色で絞り込む"
                      className="h-11 bg-card pl-9"
                    />
                  </div>
                  <ul className="flex max-h-40 flex-col overflow-y-auto rounded-md border border-border">
                    {(fabrics ?? []).map((fabric) => (
                      <li key={fabric.id}>
                        <button
                          type="button"
                          onClick={() => update({ fabricId: fabric.id })}
                          className={cn(
                            "flex min-h-11 w-full flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-border/60 px-3 py-2 text-left transition-colors last:border-b-0",
                            plan.fabricId === fabric.id ? "bg-accent/60" : "hover:bg-accent/30",
                          )}
                        >
                          <span className="font-medium">{fabric.brand}</span>
                          <span className="tnum font-mono text-xs text-muted-foreground">
                            {fabric.productNumber}
                          </span>
                          <span className="text-sm">{fabric.color}</span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {FABRIC_PATTERN_LABEL[fabric.pattern]}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-4 flex flex-col gap-1.5">
                  <Label htmlFor="import-amount">合計金額</Label>
                  <Input
                    id="import-amount"
                    value={formatAmount(plan.totalAmount)}
                    onChange={(e) => update({ totalAmount: parseAmount(e.target.value) })}
                    inputMode="numeric"
                    className="h-11 max-w-[12rem] bg-card text-right font-mono"
                  />
                  <span className="text-xs text-muted-foreground">
                    {plan.totalFromPaper
                      ? "紙の合計金額欄から読み取った額です。"
                      : "紙の金額欄が空欄のため、標準価格の合算を入れています。実額に直してください。"}
                  </span>
                </div>
              </Step>

              {/* ② 採寸 */}
              <Step number={2} title="採寸（上がり寸のみ）">
                <div className="flex flex-col gap-4">
                  {plan.sections.map((section, i) => (
                    <ImportSectionTable
                      key={section.itemTypeId}
                      section={section}
                      onChange={(next) =>
                        update({
                          sections: plan.sections.map((s, k) => (k === i ? next : s)),
                        })
                      }
                    />
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  紙には上がり寸しか載りません。実寸は次の採寸時に測って入れてください。
                </p>
              </Step>

              {/* ③ 補正 */}
              <Step number={3} title="補正">
                <ul className="flex flex-col gap-1">
                  {plan.adjustments.map((adjustment) => (
                    <li
                      key={adjustment.code}
                      className="flex min-h-9 flex-wrap items-baseline gap-x-3 gap-y-1"
                    >
                      <span className="tnum w-8 shrink-0 font-mono text-sm text-muted-foreground">
                        {adjustment.code}
                      </span>
                      <span className="text-sm">{adjustment.label}</span>
                      <span className="tnum font-mono text-sm">
                        {adjustment.value === 0 ? "—" : adjustment.value}
                      </span>
                      {adjustment.unknown && (
                        <span className="ml-auto text-xs text-thread">
                          未登録のため取り込みません（備考へ回します）
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  上半身 {upperCount}/{MAX_ADJUSTMENTS.upper}・下半身 {lowerCount}/
                  {MAX_ADJUSTMENTS.lower}
                </p>
                {(upperCount > MAX_ADJUSTMENTS.upper || lowerCount > MAX_ADJUSTMENTS.lower) && (
                  <p className="mt-1 text-xs text-thread">
                    紙の上限を超えています。取り込んだあと採寸票で整理してください。
                  </p>
                )}
              </Step>

              {/* ④ 備考 */}
              <Step number={4} title="備考">
                <Textarea
                  value={plan.note}
                  onChange={(e) => update({ note: e.target.value })}
                  rows={5}
                  className="bg-card"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  販売店・フィッター・原反NO・色番など、項目として持っていない情報をここに残しています。
                </p>
              </Step>

              {/* ⑤ カルテ */}
              {plan.embroideryName && (
                <Step number={5} title="顧客カルテ">
                  <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={plan.updateEmbroideryName}
                      onChange={(e) => update({ updateEmbroideryName: e.target.checked })}
                      className="size-4 accent-[var(--navy)]"
                    />
                    ネーム刺繍「{plan.embroideryName}」をカルテに保存する
                  </label>
                </Step>
              )}
            </>
          )}
        </div>

        {phase === "confirm" && plan && (
          <DialogFooter className="shrink-0 flex-row items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-6">
            <span className="text-xs text-muted-foreground">
              採寸票 1枚 と 注文 1件（
              {plan.sections.map((s) => ITEM_TYPE_MAP[s.itemTypeId].sheetLabel).join(" / ")}
              ）を作成します。
            </span>
            <span className="flex shrink-0 gap-2">
              <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
                キャンセル
              </Button>
              <Button className="h-11" onClick={handleSubmit} disabled={!canSubmit || saving}>
                取り込む
              </Button>
            </span>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * 確認用の採寸表。
 *
 * 既存の MeasurementSection は データ層の SectionView と
 * 「実寸 / 上がり寸 / 前回比」のレイアウトに縛られている。ここで要るのは
 * 「上がり寸のみ＋確信度＋説明付きの空の実寸列」で、曲げると両方が悪くなるため
 * 別に持つ。重複に見えるが、意図して分けている。
 */
function ImportSectionTable({
  section,
  onChange,
}: {
  section: ImportPlanSection;
  onChange: (next: ImportPlanSection) => void;
}) {
  const itemType = ITEM_TYPE_MAP[section.itemTypeId];

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-3 py-2">
        <span className="font-heading text-sm font-semibold uppercase tracking-[0.1em] text-navy">
          {itemType.sheetLabel}
        </span>
        <label className="flex items-center gap-1.5">
          <span className="field-label">シルエット</span>
          <Input
            value={section.silhouette ?? ""}
            onChange={(e) => onChange({ ...section, silhouette: e.target.value })}
            className="h-9 w-16 bg-card text-center font-mono"
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="field-label">C#</span>
          <Input
            value={section.colorNumber ?? ""}
            onChange={(e) => onChange({ ...section, colorNumber: e.target.value })}
            className="h-9 w-16 bg-card text-center font-mono"
          />
        </label>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_6rem_4rem] items-center gap-x-3 border-b border-border/60 px-3 py-1.5">
        <span className="field-label">項目</span>
        <span className="field-label text-right">上がり寸</span>
        <span className="field-label text-right">実寸</span>
      </div>

      {section.values.map((value, i) => {
        const warn = value.confidence < CONFIDENCE_WARN;
        return (
          <div
            key={value.fieldKey}
            className="grid grid-cols-[minmax(0,1fr)_6rem_4rem] items-center gap-x-3 border-b border-border/60 px-3 py-1.5 last:border-b-0"
          >
            <span className="flex items-baseline gap-2 text-sm">
              {value.label}
              {warn && <span className="text-xs text-thread">要確認</span>}
            </span>
            <Input
              value={value.finished ?? ""}
              onChange={(e) =>
                onChange({
                  ...section,
                  values: section.values.map((v, k) =>
                    k === i
                      ? { ...v, finished: e.target.value === "" ? undefined : Number(e.target.value) }
                      : v,
                  ),
                })
              }
              inputMode="decimal"
              className={cn("h-9 bg-card text-right font-mono", warn && "border-thread/40")}
            />
            <span className="text-right text-sm text-muted-foreground">
              {value.actual ?? "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-border pb-1.5">
        <span className="tnum font-mono text-sm text-navy">{number}</span>
        <h3 className="font-heading text-sm font-medium tracking-wide">{title}</h3>
      </div>
      <div>{children}</div>
    </section>
  );
}

function DateField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 bg-card font-mono"
      />
    </div>
  );
}

function normalize(name: string): string {
  return name.replace(/[\s　]/g, "");
}

/** 個数制約の表示に使う。上半身か下半身かはマスタが持っている */
function isUpper(code: number): boolean {
  return ADJUSTMENT_MAP.get(code)?.bodyPart === "upper";
}
