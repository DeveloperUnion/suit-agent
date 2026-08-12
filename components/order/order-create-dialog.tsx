"use client";

import { useCallback, useEffect, useState } from "react";
import { Ruler } from "lucide-react";
import { toast } from "sonner";

import { AmountField } from "@/components/order/amount-field";
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
import { ORDER_PURPOSE_LABEL } from "@/lib/constants/labels";
import { ITEM_TYPE_MAP } from "@/lib/constants/measurement-fields";
import { listSheets } from "@/lib/data/measurements";
import { createOrder, type OrderItemFabric } from "@/lib/data/orders";
import { useQuery } from "@/lib/hooks/use-query";
import type { ItemTypeId, OrderPurpose } from "@/lib/types";
import { addDays, formatAmount, formatDateDot, toIsoDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils";

/** 注文で扱うアイテム。紙の採寸票と同じ 3 種を既定にする */
const ITEM_TYPES: ItemTypeId[] = ["jacket", "pants", "vest"];

/**
 * 手入力の注文追加。
 *
 * 主動線は工場発注書の取り込み（components/measurement/order-sheet-import-dialog.tsx）で、
 * ここはその逃げ道。紙がまだ出ていない受注を先に入れたいときに使う。
 * 入口も取り込み画面の中のリンクだけにしてある。
 */
export function OrderCreateDialog({
  customerId,
  customerName,
  open,
  onOpenChange,
  onOpenMeasurement,
}: {
  customerId: string;
  customerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 体型が変わっていた場合に採寸ビューへ送る */
  onOpenMeasurement: () => void;
}) {
  const today = toIsoDate(new Date());

  const [sheetId, setSheetId] = useState<string>("");
  const [fabric, setFabric] = useState<OrderItemFabric>({});
  const [orderedAt, setOrderedAt] = useState(today);
  const [arrivedAt, setArrivedAt] = useState(toIsoDate(addDays(new Date(), 43)));
  const [purpose, setPurpose] = useState<OrderPurpose>("business");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [totalAmount, setTotalAmount] = useState(0);
  const [saving, setSaving] = useState(false);

  const sheetsLoader = useCallback(() => listSheets(customerId), [customerId]);
  const { data: sheets } = useQuery(sheetsLoader, [customerId, open]);

  // 開いたときに最新の採寸票をプリセットする。
  // リピートは前回と同じ寸法で作ることが多いため
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void listSheets(customerId).then((sheetList) => {
      if (!alive) return;
      setSheetId(sheetList[0]?.id ?? "");
      setSelected(Object.fromEntries(ITEM_TYPES.map((type) => [type, type !== "vest"])));
      setFabric({});
      setTotalAmount(0);
    });
    return () => {
      alive = false;
    };
  }, [open, customerId]);

  const selectedItems = ITEM_TYPES.filter((t) => selected[t]);
  const canSubmit = selectedItems.length > 0;

  const setFabricField = (patch: Partial<OrderItemFabric>) =>
    setFabric((current) => ({ ...current, ...patch }));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    await createOrder({
      customerId,
      orderedAt,
      arrivedAt,
      purpose,
      measurementSheetId: sheetId || undefined,
      fabric,
      totalAmount,
      items: selectedItems.map((type) => ({ itemTypeId: type })),
    });
    setSaving(false);
    onOpenChange(false);
    toast.success("注文を登録しました", { description: "最終接触日も更新しました。" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[92dvh] sm:w-[95vw] sm:max-w-4xl sm:rounded-md sm:border">
        <DialogHeader className="shrink-0 space-y-0 border-b border-border px-4 py-3 text-left sm:px-6">
          <span className="field-label">Order</span>
          <DialogTitle className="font-heading text-base font-medium sm:text-lg">
            注文を追加 — {customerName} 様
          </DialogTitle>
          <DialogDescription className="sr-only">
            使う寸法・生地・アイテム・受注情報を入力して注文を登録します。
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto p-4 sm:p-6">
          {/* ① 使う寸法 */}
          <Step number={1} title="使う寸法">
            {sheets && sheets.length > 0 ? (
              <div className="flex flex-wrap items-center gap-3">
                <Select value={sheetId} onValueChange={setSheetId}>
                  <SelectTrigger className="h-11 w-56 bg-card font-mono">
                    <SelectValue placeholder="採寸票を選ぶ" />
                  </SelectTrigger>
                  <SelectContent>
                    {sheets.map((sheet, i) => (
                      <SelectItem key={sheet.id} value={sheet.id} className="font-mono">
                        {formatDateDot(sheet.measuredAt)}
                        {i === 0 && <span className="ml-2 text-xs text-muted-foreground">最新</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">
                  体型が変わっていれば
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChange(false);
                      onOpenMeasurement();
                    }}
                    className="mx-1 text-brand underline underline-offset-2"
                  >
                    新しく採寸する
                  </button>
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-border p-3">
                <span className="text-sm text-muted-foreground">
                  採寸データがありません。寸法なしでも登録できますが、先に採寸することを勧めます。
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 gap-1.5"
                  onClick={() => {
                    onOpenChange(false);
                    onOpenMeasurement();
                  }}
                >
                  <Ruler className="size-4" />
                  採寸する
                </Button>
              </div>
            )}
          </Step>

          {/* ② 生地。マスタは引かず、発注書に書くのと同じ値をそのまま入れる */}
          <Step number={2} title="生地" note="決まっていなければ空のままで構いません">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="order-fabric-no">原反NO</Label>
                <Input
                  id="order-fabric-no"
                  value={fabric.fabricProductNumber ?? ""}
                  onChange={(e) =>
                    setFabricField({ fabricProductNumber: e.target.value || undefined })
                  }
                  placeholder="AC5601"
                  className="h-11 bg-card font-mono"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="order-fabric-color-no">色番</Label>
                <Input
                  id="order-fabric-color-no"
                  value={fabric.fabricColorNumber ?? ""}
                  onChange={(e) =>
                    setFabricField({ fabricColorNumber: e.target.value || undefined })
                  }
                  placeholder="3330"
                  className="h-11 bg-card font-mono"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="order-fabric-color">色名</Label>
                <Input
                  id="order-fabric-color"
                  value={fabric.fabricColorName ?? ""}
                  onChange={(e) =>
                    setFabricField({ fabricColorName: e.target.value || undefined })
                  }
                  placeholder="カーキ無地"
                  className="h-11 bg-card"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="order-fabric-composition">組成</Label>
                <Input
                  id="order-fabric-composition"
                  value={fabric.fabricComposition ?? ""}
                  onChange={(e) =>
                    setFabricField({ fabricComposition: e.target.value || undefined })
                  }
                  placeholder="Wool 100% / Super110's"
                  className="h-11 bg-card"
                />
              </div>
            </div>
          </Step>

          {/* ③ アイテム */}
          <Step number={3} title="アイテム">
            <div className="flex flex-col gap-3">
              {ITEM_TYPES.map((type) => (
                <div
                  key={type}
                  className={cn(
                    "rounded-md border p-3 transition-colors",
                    selected[type] ? "border-border bg-card" : "border-dashed border-border",
                  )}
                >
                  <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={selected[type] ?? false}
                      onChange={(e) =>
                        setSelected((s) => ({ ...s, [type]: e.target.checked }))
                      }
                      className="size-4 accent-[var(--brand)]"
                    />
                    <span className="font-heading text-sm font-semibold uppercase tracking-[0.1em] text-brand">
                      {ITEM_TYPE_MAP[type].sheetLabel}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {ITEM_TYPE_MAP[type].name}
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </Step>

          {/* ④ 受注情報 */}
          <Step number={4} title="受注情報">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ordered-at">受注日</Label>
                <Input
                  id="ordered-at"
                  type="date"
                  value={orderedAt}
                  onChange={(e) => setOrderedAt(e.target.value)}
                  className="h-11 bg-card font-mono"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                {/* 工場から店に届く日。お渡し日は紙が出てから編集で入れる */}
                <Label htmlFor="arrived-at">納品日</Label>
                <Input
                  id="arrived-at"
                  type="date"
                  value={arrivedAt}
                  onChange={(e) => setArrivedAt(e.target.value)}
                  className="h-11 bg-card font-mono"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="purpose">用途</Label>
                <Select value={purpose} onValueChange={(v) => setPurpose(v as OrderPurpose)}>
                  <SelectTrigger id="purpose" className="h-11 bg-card">
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

            {/* 取り込みと同じ1欄。どちらから入れても同じ形で残す */}
            <div className="mt-4">
              <AmountField id="order-amount" value={totalAmount} onChange={setTotalAmount} />
            </div>
          </Step>
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
            <Button className="h-11" onClick={handleSubmit} disabled={!canSubmit || saving}>
              注文を登録
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Step({
  number,
  title,
  note,
  children,
}: {
  number: number;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-border pb-1.5">
        <span className="tnum font-mono text-sm text-brand">{number}</span>
        <h3 className="font-heading text-sm font-medium tracking-wide">{title}</h3>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
      <div>{children}</div>
    </section>
  );
}
