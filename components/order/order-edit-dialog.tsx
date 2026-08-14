"use client";

import { useState } from "react";
import { toast } from "sonner";

import { AmountGapDialog } from "@/components/order/amount-gap-dialog";
import { AmountSection } from "@/components/order/amount-section";
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
import {
  hasAmountGap,
  ORDER_PURPOSE_LABEL,
  type OrderAmountBreakdown,
} from "@/lib/constants/labels";
import { updateOrder, type OrderItemFabric, type OrderView } from "@/lib/data/orders";
import type { OrderPurpose } from "@/lib/types";
import { formatAmount } from "@/lib/utils/date";

/**
 * 注文の編集。
 *
 * 発注書の読み取りは完璧ではないし、紙そのものが後から直ることもある
 * （お渡し日はお客様の都合でずれる）。取り込んだあとに直せる口が無いと、
 * 紙とアプリのどちらが正なのかが分からなくなる。
 *
 * アイテム構成と採寸票の紐づけは触らない。あれは採寸票と表裏で、
 * ここで動かすと保有アイテム構成の集計と食い違う。
 *
 * 状態（受注済／納品済）も出さない。お渡し日から決まるので、人に選ばせると
 * 日付と状態が食い違った行が必ず生まれる。
 */
export function OrderEditDialog({
  order,
  open,
  onOpenChange,
}: {
  order: OrderView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [orderedAt, setOrderedAt] = useState(order.orderedAt);
  const [arrivedAt, setArrivedAt] = useState(order.arrivedAt ?? "");
  const [deliveredAt, setDeliveredAt] = useState(order.deliveredAt ?? "");
  const [purpose, setPurpose] = useState<OrderPurpose>(order.purpose);
  const [fabric, setFabric] = useState<OrderItemFabric>({
    fabricProductNumber: order.fabricProductNumber,
    fabricColorNumber: order.fabricColorNumber,
    fabricColorName: order.fabricColorName,
    fabricComposition: order.fabricComposition,
  });
  const [totalAmount, setTotalAmount] = useState(order.totalAmount);
  const [breakdown, setBreakdown] = useState<OrderAmountBreakdown>({
    amountSuit: order.amountSuit,
    amountCoat: order.amountCoat,
    amountAccessory: order.amountAccessory,
    amountShirt: order.amountShirt,
  });
  const [saving, setSaving] = useState(false);
  const [gapOpen, setGapOpen] = useState(false);

  // 初期値は useState だけで足りる。呼び出し側（orders-tab）が閉じるたびに
  // このコンポーネントごと外し、開くときに key を付けて作り直すので、
  // 「閉じただけで消えた編集」が次に開いたときに残ることはない。
  // gapOpen の後始末が要らないのも同じ理由。

  const setFabricField = (patch: Partial<OrderItemFabric>) =>
    setFabric((current) => ({ ...current, ...patch }));

  // 内訳と合計が食い違っていたら、書き込む前に一度確かめる。
  // ここで止めるのではなく、見たことを確かめるだけ（合計欄のほうが正）
  const handleSubmit = () => {
    if (saving || totalAmount <= 0) return;
    if (hasAmountGap(totalAmount, breakdown)) {
      setGapOpen(true);
      return;
    }
    void save();
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateOrder(order.id, {
        orderedAt,
        arrivedAt: arrivedAt || null,
        deliveredAt: deliveredAt || null,
        purpose,
        ...fabric,
        totalAmount,
        breakdown,
      });
      onOpenChange(false);
      toast.success("注文を更新しました");
    } catch {
      toast.error("更新できませんでした");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[92dvh] sm:w-[95vw] sm:max-w-3xl sm:rounded-md sm:border">
          <DialogHeader className="shrink-0 space-y-0 border-b border-border px-4 py-3 text-left sm:px-6">
            <span className="field-label">Order</span>
            <DialogTitle className="font-heading text-base font-medium sm:text-lg">
              注文を編集 — {order.orderNumber}
            </DialogTitle>
            <DialogDescription className="sr-only">
              受注日・納品日・お渡し日・用途・生地・金額を直します。
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto p-4 sm:p-6">
            <Section title="日付と用途">
              <div className="grid gap-4 sm:grid-cols-2">
                <DateField id="edit-ordered" label="受注日" value={orderedAt} onChange={setOrderedAt} />
                <DateField
                  id="edit-arrived"
                  label="納品日"
                  hint="工場から店に届く日"
                  value={arrivedAt}
                  onChange={setArrivedAt}
                />
                <DateField
                  id="edit-delivered"
                  label="お渡し日"
                  hint="着心地確認の起点。空なら納品日で代用します"
                  value={deliveredAt}
                  onChange={setDeliveredAt}
                />
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-purpose">用途</Label>
                  <Select value={purpose} onValueChange={(v) => setPurpose(v as OrderPurpose)}>
                    <SelectTrigger id="edit-purpose" className="h-11 w-full bg-card">
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
            </Section>

            <Section title="生地">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  id="edit-fabric-no"
                  label="原反NO"
                  mono
                  value={fabric.fabricProductNumber ?? ""}
                  onChange={(v) => setFabricField({ fabricProductNumber: v || undefined })}
                />
                <TextField
                  id="edit-fabric-color-no"
                  label="色番"
                  mono
                  value={fabric.fabricColorNumber ?? ""}
                  onChange={(v) => setFabricField({ fabricColorNumber: v || undefined })}
                />
                <TextField
                  id="edit-fabric-color"
                  label="色名"
                  value={fabric.fabricColorName ?? ""}
                  onChange={(v) => setFabricField({ fabricColorName: v || undefined })}
                />
                <TextField
                  id="edit-fabric-composition"
                  label="組成"
                  value={fabric.fabricComposition ?? ""}
                  onChange={(v) => setFabricField({ fabricComposition: v || undefined })}
                />
              </div>
            </Section>

            <Section title="金額">
              <AmountSection
                id="edit-amount"
                value={totalAmount}
                onChange={setTotalAmount}
                breakdown={breakdown}
                onBreakdownChange={setBreakdown}
              />
            </Section>
          </div>

          <DialogFooter className="shrink-0 flex-row items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-6">
            <span className="flex items-baseline gap-2">
              <span className="field-label">売上</span>
              <span className="tnum font-mono text-lg font-medium">
                ¥{formatAmount(totalAmount)}
              </span>
            </span>
            <span className="flex gap-2">
              <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
                キャンセル
              </Button>
              <Button className="h-11" onClick={handleSubmit} disabled={saving || totalAmount <= 0}>
                保存
              </Button>
            </span>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AmountGapDialog
        open={gapOpen}
        onOpenChange={setGapOpen}
        total={totalAmount}
        breakdown={breakdown}
        confirmLabel="保存する"
        onConfirm={() => {
          setGapOpen(false);
          void save();
        }}
      />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 border-b border-border pb-1.5">
        <span className="h-3 w-0.5 shrink-0 bg-brand" />
        <h3 className="font-heading text-sm font-medium tracking-wide">{title}</h3>
      </div>
      <div className="pt-1">{children}</div>
    </section>
  );
}

function DateField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
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
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  mono,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  mono?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={mono ? "h-11 bg-card font-mono" : "h-11 bg-card"}
      />
    </div>
  );
}
