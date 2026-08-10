"use client";

import { useCallback, useState } from "react";
import { ImageOff, PackageCheck } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, SectionTitle } from "@/components/common/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  FABRIC_SEASON_LABEL,
  ORDER_PURPOSE_LABEL,
  ORDER_STATUS_LABEL,
} from "@/lib/constants/labels";
import { ITEM_TYPE_MAP } from "@/lib/constants/measurement-fields";
import {
  clearOrderDelivery,
  getOwnedItemSummary,
  listOrders,
  markOrderDelivered,
} from "@/lib/data/orders";
import { useMockQuery } from "@/lib/hooks/use-mock-db";
import { POST_DELIVERY_MILESTONES } from "@/lib/constants/approach";
import { formatAmount, formatDateDot, toIsoDate } from "@/lib/utils/date";

export function OrdersTab({ customerId }: { customerId: string }) {
  const ordersLoader = useCallback(() => listOrders(customerId), [customerId]);
  const { data: orders, loading } = useMockQuery(ordersLoader, [customerId]);

  const summaryLoader = useCallback(() => getOwnedItemSummary(customerId), [customerId]);
  const { data: summary } = useMockQuery(summaryLoader, [customerId]);

  if (!loading && (!orders || orders.length === 0)) {
    return <EmptyState>注文履歴がまだありません。</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-8">
      {/* 手持ちと被らない提案をするための材料。注文の詳細より先に置く */}
      {summary?.hasOrders && (
        <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
          <SectionTitle>保有アイテム構成</SectionTitle>
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <span className="field-label">アイテム</span>
              <ul className="flex flex-col gap-1">
                {summary.byItemType.map((item) => (
                  <li key={item.itemTypeId} className="flex items-baseline justify-between gap-2">
                    <span className="text-sm">{item.name}</span>
                    <span className="tnum font-mono text-sm font-medium">{item.count}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="field-label">色柄の内訳（上衣）</span>
              {summary.byColorPattern.length === 0 ? (
                <span className="text-sm text-muted-foreground">—</span>
              ) : (
                <ul className="flex flex-col gap-1">
                  {summary.byColorPattern.map((entry) => (
                    <li key={entry.label} className="flex items-baseline justify-between gap-2">
                      <span className="text-sm">{entry.label}</span>
                      <span className="tnum font-mono text-sm font-medium">{entry.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="field-label">未保有</span>
              {summary.missingItemTypes.length === 0 ? (
                <span className="text-sm text-muted-foreground">なし</span>
              ) : (
                <span className="flex flex-wrap gap-1">
                  {summary.missingItemTypes.map((item) => (
                    <Badge key={item.itemTypeId} variant="outline" className="font-normal">
                      {item.name}
                    </Badge>
                  ))}
                </span>
              )}
            </div>

          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionTitle>注文履歴</SectionTitle>
        {/* 納品ボタンの意味を先に言う。言わないと誰も押さず、トリガーが壊れて見える */}
        <p className="text-xs text-muted-foreground">
          納品日を記録すると、その{POST_DELIVERY_MILESTONES.map((m) => m.label).join("後・")}後に「着心地確認」のアプローチが立ちます。
        </p>
        <ul className="flex flex-col gap-3">
          {(orders ?? []).map((order) => (
            <li key={order.id} className="rounded-md border border-border bg-card">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2.5">
                <span className="tnum font-mono text-sm font-medium">{order.orderNumber}</span>
                <span className="tnum font-mono text-sm text-muted-foreground">
                  {formatDateDot(order.orderedAt)}
                </span>
                <Badge variant="secondary" className="font-normal">
                  {ORDER_PURPOSE_LABEL[order.purpose]}
                </Badge>
                <Badge variant="outline" className="font-normal">
                  {ORDER_STATUS_LABEL[order.status]}
                </Badge>
                <DeliveryControl
                  orderId={order.id}
                  deliveredAt={order.deliveredAt}
                  isDelivered={order.status === "delivered"}
                />
                <span className="ml-auto flex items-center gap-4">
                  <span className="text-xs text-muted-foreground">受注者 {order.staffName}</span>
                  <span className="tnum font-mono text-sm font-medium">
                    ¥{formatAmount(order.totalAmount)}
                  </span>
                </span>
              </div>

              <div className="flex flex-col divide-y divide-border/60">
                {order.items.map((item) => (
                  <div key={item.id} className="flex flex-col gap-2.5 p-4 sm:flex-row sm:gap-4">
                    {/* 着装写真のプレースホルダ */}
                    <div className="flex h-24 w-full shrink-0 items-center justify-center rounded-sm border border-dashed border-border bg-muted/40 sm:h-28 sm:w-20">
                      <ImageOff className="size-4 text-muted-foreground/50" />
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="font-heading text-sm font-semibold uppercase tracking-[0.1em] text-brand">
                          {ITEM_TYPE_MAP[item.itemTypeId].sheetLabel}
                        </span>
                        {item.fabric && (
                          <>
                            <span className="text-sm">
                              {item.fabric.brand}{" "}
                              <span className="tnum font-mono text-xs text-muted-foreground">
                                {item.fabric.productNumber}
                              </span>
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {item.fabric.color}
                            </span>
                          </>
                        )}
                      </div>

                      {item.fabric && (
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                          <span>{item.fabric.composition}</span>
                          {item.fabric.yarnCount && <span>{item.fabric.yarnCount}</span>}
                          <span>{FABRIC_SEASON_LABEL[item.fabric.season]}</span>
                        </div>
                      )}

                    </div>

                    <span className="tnum shrink-0 self-start font-mono text-sm text-muted-foreground sm:self-center">
                      ¥{formatAmount(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * 納品の記録。
 * 納品日は「着心地確認」の起点になる唯一の入力なので、注文カードの見出しに置く。
 */
function DeliveryControl({
  orderId,
  deliveredAt,
  isDelivered,
}: {
  orderId: string;
  deliveredAt?: string;
  isDelivered: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(toIsoDate(new Date()));

  if (isDelivered && deliveredAt) {
    return (
      <span className="flex items-center gap-1.5">
        <span className="tnum font-mono text-sm">納品 {formatDateDot(deliveredAt)}</span>
        <button
          type="button"
          onClick={async () => {
            await clearOrderDelivery(orderId);
            toast.success("納品の記録を取り消しました");
          }}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          取り消す
        </button>
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          <PackageCheck className="size-3.5" />
          納品にする
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-64 flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`delivered-${orderId}`}>納品日</Label>
          <Input
            id={`delivered-${orderId}`}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-11 bg-card font-mono"
          />
        </div>
        <Button
          className="h-10"
          onClick={async () => {
            await markOrderDelivered(orderId, date);
            setOpen(false);
            toast.success("納品を記録しました", {
              description: "着心地確認のアプローチの起点になります。",
            });
          }}
        >
          記録する
        </Button>
      </PopoverContent>
    </Popover>
  );
}
