"use client";

import { useCallback, useState } from "react";
import { Pencil } from "lucide-react";

import { EmptyState, SectionTitle } from "@/components/common/field";
import { OrderEditDialog } from "@/components/order/order-edit-dialog";
import { OrderPhotos } from "@/components/order/order-photos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ORDER_PURPOSE_LABEL, ORDER_STATUS_LABEL } from "@/lib/constants/labels";
import { ITEM_TYPE_MAP } from "@/lib/constants/measurement-fields";
import { getOwnedItemSummary, listOrders, type OrderView } from "@/lib/data/orders";
import { useQuery } from "@/lib/hooks/use-query";
import { usePostDeliveryMilestones } from "@/lib/hooks/use-settings";
import { formatAmount, formatDateDot } from "@/lib/utils/date";

export function OrdersTab({ customerId }: { customerId: string }) {
  const milestones = usePostDeliveryMilestones();

  const ordersLoader = useCallback(() => listOrders(customerId), [customerId]);
  const { data: orders, loading } = useQuery(ordersLoader, [customerId]);

  const summaryLoader = useCallback(() => getOwnedItemSummary(customerId), [customerId]);
  const { data: summary } = useQuery(summaryLoader, [customerId]);

  // 編集中の注文。id ではなく行そのものを持つ（ダイアログが初期値に使う）
  const [editing, setEditing] = useState<OrderView | null>(null);

  if (!loading && (!orders || orders.length === 0)) {
    return <EmptyState>注文履歴がまだありません。</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-8">
      {/* 手持ちと被らない提案をするための材料。注文の詳細より先に置く */}
      {summary?.hasOrders && (
        <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
          <SectionTitle>保有アイテム構成</SectionTitle>
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
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
        {/*
          2 つの日付の役割を先に言う。言わないと「納品日が入っているのに
          アプローチが立たない」がバグに見える。
        */}
        <p className="text-xs text-muted-foreground">
          発注書から納品日（工場→店）とお渡し日を読み取ります。
          <strong className="font-medium text-foreground">お渡し日</strong>
          を入れると、その{milestones.map((m) => m.label).join("後・")}後に「着心地確認」のアプローチが立ちます。
        </p>
        <ul className="flex flex-col gap-3">
          {(orders ?? []).map((order) => (
            <li key={order.id} className="rounded-md border border-border bg-card">
              <div className="flex flex-col gap-1 border-b border-border px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
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
                  <DeliveryDates dueDate={order.dueDate} deliveredAt={order.deliveredAt} />
                  <span className="ml-auto flex items-center gap-3">
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      受注者 {order.staffName}
                    </span>
                    <span className="tnum font-mono text-sm font-medium">
                      ¥{formatAmount(order.totalAmount)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 gap-1.5"
                      onClick={() => setEditing(order)}
                    >
                      <Pencil className="size-3.5" />
                      編集
                    </Button>
                  </span>
                </div>
                {/* 内訳は割増か税が載っているときだけ。0 が並ぶと合計が読みにくくなる */}
                {(order.surchargeAmount > 0 || order.taxAmount > 0) && (
                  <span className="tnum ml-auto font-mono text-xs text-muted-foreground">
                    売上 ¥{formatAmount(order.subtotalAmount)}
                    {order.surchargeAmount > 0 && ` ・割増 ¥${formatAmount(order.surchargeAmount)}`}
                    {order.taxAmount > 0 && ` ・消費税 ¥${formatAmount(order.taxAmount)}`}
                  </span>
                )}
              </div>

              {/*
                生地は注文単位。紙が原反ＮＯ を 1 つしか持たないので、明細ごとに
                繰り返さず注文の見出しの下に 1 度だけ出す。
                マスタは引かず、発注書に書かれていた値をそのまま出す。
              */}
              <div className="flex flex-col gap-2.5 p-4 sm:flex-row sm:gap-4">
                {/* 着装写真。足す・消すは編集ダイアログの中だけ */}
                <OrderPhotos orderId={order.id} readOnly />

                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    {order.items.map((item) => (
                      <span
                        key={item.id}
                        className="font-heading text-sm font-semibold uppercase tracking-[0.1em] text-brand"
                      >
                        {ITEM_TYPE_MAP[item.itemTypeId].sheetLabel}
                      </span>
                    ))}
                    {order.fabricProductNumber && (
                      <span className="tnum font-mono text-sm">{order.fabricProductNumber}</span>
                    )}
                    {order.fabricColorNumber && (
                      <span className="tnum font-mono text-xs text-muted-foreground">
                        色番 {order.fabricColorNumber}
                      </span>
                    )}
                    {order.fabricColorName && (
                      <span className="text-sm text-muted-foreground">
                        {order.fabricColorName}
                      </span>
                    )}
                  </div>

                  {order.fabricComposition && (
                    <div className="text-xs text-muted-foreground">
                      {order.fabricComposition}
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {editing && (
        <OrderEditDialog
          // 別の注文を開いたら初期値を作り直す
          key={editing.id}
          order={editing}
          open
          onOpenChange={(next) => !next && setEditing(null)}
        />
      )}
    </div>
  );
}

/**
 * 納品日とお渡し日。
 *
 * 読むだけ。直すのは編集ダイアログの中で、他の項目と同じ扱いにしてある。
 * もとは「納品にする」ボタンで日付を手入力させていたが、発注書に両方とも
 * 書いてあるので、押させる操作そのものが要らなくなった。
 *
 * お渡し日が空でも黙って隠さない。着心地確認が立たない理由がここにあり、
 * 隠すと「アプローチが出ない」だけが見えて原因が画面から消える。
 */
function DeliveryDates({ dueDate, deliveredAt }: { dueDate?: string; deliveredAt?: string }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
      {dueDate && (
        <span className="tnum font-mono text-muted-foreground">納品 {formatDateDot(dueDate)}</span>
      )}
      {deliveredAt ? (
        <span className="tnum font-mono">お渡し {formatDateDot(deliveredAt)}</span>
      ) : (
        <span className="text-xs text-muted-foreground/70">お渡し 未設定</span>
      )}
    </span>
  );
}
