"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OrderAmounts } from "@/lib/data/orders";
import { formatAmount, parseAmount } from "@/lib/utils/date";
import { cn } from "@/lib/utils";

/**
 * 金額。工場発注書の右上とまったく同じ並びにしてある。
 *
 * 転記する人が紙とアプリの間で目移りしないことのほうが、画面の収まりより大事なので、
 * 4段を縦に積む形は崩さない。取り込みと手入力の両方から使う。
 */
export function AmountFields({
  amounts,
  onChange,
  idPrefix,
  hint,
}: {
  amounts: OrderAmounts;
  /** 3段を触ったら合計を引き直すかどうかは呼び出し側が決める */
  onChange: (key: keyof OrderAmounts, value: number) => void;
  idPrefix: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="field-label">金額</span>
      <div className="grid max-w-md gap-3 sm:grid-cols-2">
        <AmountField
          id={`${idPrefix}-subtotal`}
          label="売上金額"
          value={amounts.subtotalAmount}
          onChange={(v) => onChange("subtotalAmount", v)}
        />
        <AmountField
          id={`${idPrefix}-surcharge`}
          label="割増金額"
          value={amounts.surchargeAmount}
          onChange={(v) => onChange("surchargeAmount", v)}
        />
        <AmountField
          id={`${idPrefix}-tax`}
          label="消費税"
          value={amounts.taxAmount}
          onChange={(v) => onChange("taxAmount", v)}
        />
        <AmountField
          id={`${idPrefix}-total`}
          label="合計金額"
          value={amounts.totalAmount}
          onChange={(v) => onChange("totalAmount", v)}
          strong
        />
      </div>
      <span className="text-xs text-muted-foreground">
        {hint ? `${hint} ` : ""}
        上の3段を直すと合計を計算し直します。合計欄を直接直せばその額が残ります。
      </span>
    </div>
  );
}

/**
 * 3段のどれかを触ったら合計を引き直す。合計欄を直接触ったときはその値を正とする。
 * 紙では合計欄も手書きで、3段の和と一致しないことがあるため。
 */
export function applyAmountChange(
  amounts: OrderAmounts,
  key: keyof OrderAmounts,
  value: number,
): OrderAmounts {
  const next = { ...amounts, [key]: value };
  if (key === "totalAmount") return next;
  return {
    ...next,
    totalAmount: next.subtotalAmount + next.surchargeAmount + next.taxAmount,
  };
}

function AmountField({
  id,
  label,
  value,
  onChange,
  strong,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className={cn(strong && "font-medium")}>
        {label}
      </Label>
      <Input
        id={id}
        value={formatAmount(value)}
        onChange={(e) => onChange(parseAmount(e.target.value))}
        inputMode="numeric"
        className={cn("h-11 w-36 bg-card text-right font-mono", strong && "font-medium")}
      />
    </div>
  );
}
