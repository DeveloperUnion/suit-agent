"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Ruler, Search } from "lucide-react";
import { toast } from "sonner";

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
import { getCurrentStaffId } from "@/lib/auth/current-staff";
import {
  FABRIC_PATTERN_LABEL,
  FABRIC_SEASON_LABEL,
  ORDER_PURPOSE_LABEL,
} from "@/lib/constants/labels";
import { ITEM_TYPE_MAP } from "@/lib/constants/measurement-fields";
import { specGroupsFor } from "@/lib/constants/specs";
import { listSheets } from "@/lib/data/measurements";
import {
  checkFabricOverlap,
  createOrder,
  getPreviousSpecs,
  ITEM_BASE_PRICE,
  listFabrics,
} from "@/lib/data/orders";
import { useMockQuery } from "@/lib/hooks/use-mock-db";
import type { ItemTypeId, OrderPurpose, SpecSelection } from "@/lib/types";
import { addDays, formatAmount, formatDateDot, toIsoDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils";

/** 注文で扱うアイテム。紙の採寸票と同じ 3 種を既定にする */
const ITEM_TYPES: ItemTypeId[] = ["jacket", "pants", "vest"];

type ItemState = { selected: boolean; specs: SpecSelection; amount: number };

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
  const [fabricId, setFabricId] = useState<string>("");
  const [keyword, setKeyword] = useState("");
  const [orderedAt, setOrderedAt] = useState(today);
  const [dueDate, setDueDate] = useState(toIsoDate(addDays(new Date(), 45)));
  const [purpose, setPurpose] = useState<OrderPurpose>("business");
  const [items, setItems] = useState<Record<string, ItemState>>({});
  const [saving, setSaving] = useState(false);

  const sheetsLoader = useCallback(() => listSheets(customerId), [customerId]);
  const { data: sheets } = useMockQuery(sheetsLoader, [customerId, open]);

  const fabricsLoader = useCallback(() => listFabrics(keyword), [keyword]);
  const { data: fabrics } = useMockQuery(fabricsLoader, [keyword]);

  // 開いたときに、前回の仕様と最新の採寸票をプリセットする。
  // リピートは前回と同じ寸法・同じ仕様で作ることが多いため
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      const [sheetList, ...specsList] = await Promise.all([
        listSheets(customerId),
        ...ITEM_TYPES.map((t) => getPreviousSpecs(customerId, t)),
      ]);
      if (!alive) return;
      setSheetId(sheetList[0]?.id ?? "");
      setItems(
        Object.fromEntries(
          ITEM_TYPES.map((type, i) => [
            type,
            {
              selected: type !== "vest",
              specs: specsList[i] ?? {},
              amount: ITEM_BASE_PRICE[type],
            },
          ]),
        ),
      );
    })();
    return () => {
      alive = false;
    };
  }, [open, customerId]);

  const overlapLoader = useCallback(
    () => (fabricId ? checkFabricOverlap(customerId, fabricId) : Promise.resolve(null)),
    [customerId, fabricId],
  );
  const { data: overlap } = useMockQuery(overlapLoader, [customerId, fabricId]);

  const selectedItems = ITEM_TYPES.filter((t) => items[t]?.selected);
  const total = selectedItems.reduce((sum, t) => sum + (items[t]?.amount ?? 0), 0);
  const canSubmit = fabricId !== "" && selectedItems.length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    await createOrder({
      customerId,
      staffId: getCurrentStaffId(),
      orderedAt,
      dueDate,
      purpose,
      measurementSheetId: sheetId || undefined,
      items: selectedItems.map((type) => ({
        itemTypeId: type,
        fabricId,
        specs: items[type].specs,
        amount: items[type].amount,
      })),
    });
    setSaving(false);
    onOpenChange(false);
    toast.success("注文を登録しました", { description: "最終接触日も更新しました。" });
  };

  const selectedFabric = fabrics?.find((f) => f.id === fabricId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[92dvh] sm:w-[95vw] sm:max-w-4xl sm:rounded-md sm:border">
        <DialogHeader className="shrink-0 space-y-0 border-b border-border px-4 py-3 text-left sm:px-6">
          <span className="field-label">Order</span>
          <DialogTitle className="font-heading text-base font-medium sm:text-lg">
            注文を追加 — {customerName} 様
          </DialogTitle>
          <DialogDescription className="sr-only">
            使う寸法・生地・アイテムと仕様・受注情報を入力して注文を登録します。
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
                    className="mx-1 text-navy underline underline-offset-2"
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

          {/* ② 生地 */}
          <Step number={2} title="生地">
            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="ブランド・品番・色で絞り込む"
                className="h-11 bg-card pl-9"
              />
            </div>

            <ul className="mt-2 flex max-h-56 flex-col overflow-y-auto rounded-md border border-border">
              {(fabrics ?? []).map((fabric) => (
                <li key={fabric.id}>
                  <button
                    type="button"
                    onClick={() => setFabricId(fabric.id)}
                    className={cn(
                      "flex min-h-12 w-full flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-border/60 px-3 py-2 text-left transition-colors last:border-b-0",
                      fabricId === fabric.id ? "bg-accent/60" : "hover:bg-accent/30",
                    )}
                  >
                    <span className="font-medium">{fabric.brand}</span>
                    <span className="tnum font-mono text-xs text-muted-foreground">
                      {fabric.productNumber}
                    </span>
                    <span className="text-sm">{fabric.color}</span>
                    <span className="text-sm text-muted-foreground">
                      {FABRIC_PATTERN_LABEL[fabric.pattern]}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {fabric.composition}
                      {fabric.yarnCount ? ` / ${fabric.yarnCount}` : ""} /{" "}
                      {FABRIC_SEASON_LABEL[fabric.season]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {/* 選ぶその瞬間に出す。注文履歴を見に行かないと気づけないのでは遅い */}
            {overlap && (
              <p className="mt-2 flex items-start gap-2 rounded-md border border-thread/30 bg-thread/5 px-3 py-2 text-sm text-thread">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {overlap.label}はすでに {overlap.count} 着お持ちです。
                系統の違うものも見ていただくと喜ばれるかもしれません。
              </p>
            )}
          </Step>

          {/* ③ アイテムと仕様 */}
          <Step
            number={3}
            title="アイテムと仕様"
            note={selectedFabric ? "前回の注文と同じ仕様をあらかじめ入れています" : undefined}
          >
            <div className="flex flex-col gap-3">
              {ITEM_TYPES.map((type) => {
                const state = items[type];
                if (!state) return null;
                return (
                  <div
                    key={type}
                    className={cn(
                      "rounded-md border p-3 transition-colors",
                      state.selected ? "border-border bg-card" : "border-dashed border-border",
                    )}
                  >
                    <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={state.selected}
                        onChange={(e) =>
                          setItems((s) => ({
                            ...s,
                            [type]: { ...s[type], selected: e.target.checked },
                          }))
                        }
                        className="size-4 accent-[var(--navy)]"
                      />
                      <span className="font-heading text-sm font-semibold uppercase tracking-[0.1em] text-navy">
                        {ITEM_TYPE_MAP[type].sheetLabel}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {ITEM_TYPE_MAP[type].name}
                      </span>
                      <span className="tnum ml-auto font-mono text-sm">
                        ¥{formatAmount(state.amount)}
                      </span>
                    </label>

                    {state.selected && (
                      <div className="mt-2 grid gap-x-4 gap-y-2 border-t border-border/60 pt-2 sm:grid-cols-2 lg:grid-cols-3">
                        {specGroupsFor(type).map((group) => (
                          <label key={group.key} className="flex flex-col gap-1">
                            <span className="field-label">{group.label}</span>
                            <Select
                              value={state.specs[group.key] ?? "none"}
                              onValueChange={(next) =>
                                setItems((s) => ({
                                  ...s,
                                  [type]: {
                                    ...s[type],
                                    specs:
                                      next === "none"
                                        ? Object.fromEntries(
                                            Object.entries(s[type].specs).filter(
                                              ([k]) => k !== group.key,
                                            ),
                                          )
                                        : { ...s[type].specs, [group.key]: next },
                                  },
                                }))
                              }
                            >
                              <SelectTrigger className="h-10 bg-card">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">未指定</SelectItem>
                                {group.options.map((option) => (
                                  <SelectItem key={option.code} value={option.code}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
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
                <Label htmlFor="due-date">納期</Label>
                <Input
                  id="due-date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
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
          </Step>
        </div>

        <DialogFooter className="shrink-0 flex-row items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-6">
          <span className="flex items-baseline gap-2">
            <span className="field-label">合計</span>
            <span className="tnum font-mono text-lg font-medium">¥{formatAmount(total)}</span>
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
        <span className="tnum font-mono text-sm text-navy">{number}</span>
        <h3 className="font-heading text-sm font-medium tracking-wide">{title}</h3>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
      <div>{children}</div>
    </section>
  );
}
