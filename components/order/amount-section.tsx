"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AMOUNT_CATEGORIES,
  hasAmountBreakdown,
  sumAmountBreakdown,
  type OrderAmountBreakdown,
} from "@/lib/constants/labels";
import { formatAmount, parseAmount } from "@/lib/utils/date";
import { cn } from "@/lib/utils";

/**
 * 売上金額と、その内訳。
 *
 * 注文が生まれる 3 経路（新規登録・発注書の取り込み・編集）がこれを共有する。
 * かつては幅 40 の入力が 1 つあるだけで、3 画面とも他の欄の末尾に紛れていて
 * 「どこに金額を打つのか分からない」状態だった。1 箇所直せば 3 画面直るように、
 * 見出しごとここへ寄せてある。
 *
 * 紙の右上と同じ 4 欄（売上・割増・消費税・合計）を並べていた時期があるが、
 * その欄は実運用では空欄のまま流れていて、店が実際に持っているのは税込の
 * 1 本だけだった。**紙の形を写すことと、店が持っている情報の形を写すことは別物。**
 *
 * 内訳はその学びを踏まえて**既定では出さない**。ボタンを押した人だけが見る。
 */
export function AmountSection({
  value,
  onChange,
  breakdown,
  onBreakdownChange,
  id,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  breakdown: OrderAmountBreakdown;
  onBreakdownChange: (breakdown: OrderAmountBreakdown) => void;
  id: string;
  className?: string;
}) {
  // 内訳が 1 つでも入っていれば開いた状態で始める。編集で開いたときに
  // 「入れたはずの内訳が見当たらない」が起きないように。
  const [open, setOpen] = useState(() => hasAmountBreakdown(breakdown));

  const breakdownTotal = sumAmountBreakdown(breakdown);
  const gap = value - breakdownTotal;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id} className="flex items-baseline gap-2">
          売上金額（税込）
          <span className="text-xs font-normal text-thread">必須</span>
        </Label>
        <div className="relative w-56">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-base text-muted-foreground">
            ¥
          </span>
          <Input
            id={id}
            value={formatAmount(value)}
            onChange={(e) => onChange(parseAmount(e.target.value))}
            inputMode="numeric"
            aria-invalid={value <= 0}
            className="h-14 bg-card pl-8 pr-3 text-right font-mono text-xl"
          />
        </div>
        {value <= 0 && (
          <span className="text-xs text-thread">金額を入れてください</span>
        )}
      </div>

      {open ? (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-3">
          <div className="flex items-center justify-between">
            <span className="field-label">内訳（任意）</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-muted-foreground"
              onClick={() => {
                setOpen(false);
                onBreakdownChange({});
              }}
            >
              <X className="size-3.5" />
              やめる
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {AMOUNT_CATEGORIES.map((category) => (
              <div key={category.key} className="flex items-center gap-2">
                <Label htmlFor={`${id}-${category.key}`} className="w-14 shrink-0">
                  {category.label}
                </Label>
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
                    ¥
                  </span>
                  <Input
                    id={`${id}-${category.key}`}
                    // 未入力は空欄のまま出す。0 と書くと「0 円で売れた」に見える
                    value={
                      breakdown[category.key] === undefined
                        ? ""
                        : formatAmount(breakdown[category.key] ?? 0)
                    }
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      onBreakdownChange({
                        ...breakdown,
                        [category.key]: raw === "" ? undefined : parseAmount(raw),
                      });
                    }}
                    inputMode="numeric"
                    className="h-11 bg-card pl-7 pr-2.5 text-right font-mono"
                  />
                </div>
              </div>
            ))}
          </div>

          {/*
            差額は注記であってエラーではない。「その他」区分を作らない判断なので、
            4 つの和が合計に届かないのが既定の状態。赤くしない。
          */}
          <p className="tnum text-xs text-muted-foreground">
            内訳の合計 ¥{formatAmount(breakdownTotal)}
            {gap !== 0 && (
              <>
                {" ／ "}
                合計との差 {gap > 0 ? "" : "−"}¥{formatAmount(Math.abs(gap))}
              </>
            )}
          </p>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 w-fit gap-1.5"
          onClick={() => setOpen(true)}
        >
          <Plus className="size-4" />
          内訳を入れる
        </Button>
      )}
    </div>
  );
}
