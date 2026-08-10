"use client";

import { useCallback } from "react";
import { ImageOff } from "lucide-react";

import { EmptyState, SectionTitle } from "@/components/common/field";
import { Badge } from "@/components/ui/badge";
import {
  FABRIC_SEASON_LABEL,
  ORDER_PURPOSE_LABEL,
  ORDER_STATUS_LABEL,
} from "@/lib/constants/labels";
import { specGroupsFor, specLabel } from "@/lib/constants/specs";
import { ITEM_TYPE_MAP } from "@/lib/constants/measurement-fields";
import { getOwnedItemSummary, listOrders } from "@/lib/data/orders";
import { useMockQuery } from "@/lib/hooks/use-mock-db";
import { formatAmount, formatDateDot } from "@/lib/utils/date";

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

                      <SpecList itemTypeId={item.itemTypeId} specs={item.specs} />
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

/** 仕様はマスタからラベルを引いて表示する。コードのまま出さない */
function SpecList({
  itemTypeId,
  specs,
}: {
  itemTypeId: keyof typeof ITEM_TYPE_MAP;
  specs: Record<string, string>;
}) {
  const groups = specGroupsFor(itemTypeId).filter((g) => specs[g.key]);
  if (groups.length === 0) return null;

  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1">
      {groups.map((g) => (
        <div key={g.key} className="flex items-baseline gap-1.5">
          <dt className="field-label">{g.label}</dt>
          <dd className="text-xs">{specLabel(itemTypeId, g.key, specs[g.key]) ?? specs[g.key]}</dd>
        </div>
      ))}
    </dl>
  );
}
