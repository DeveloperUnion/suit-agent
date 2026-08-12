"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAmount, parseAmount } from "@/lib/utils/date";
import { cn } from "@/lib/utils";

/**
 * 売上金額。
 *
 * かつては工場発注書の右上と同じ4欄（売上・割増・消費税・合計）を並べていた。
 * 紙に合わせたつもりだったが、その欄は実運用では空欄のまま流れていて、
 * 店が実際に持っているのは税込の1本だけだった。4欄を残すと、0 が3つ並んだ
 * ところに人が数字を入れる形になり、どれが正なのか毎回迷う。
 *
 * 割増を分けて持つかは審議中（todo.md）。DB には4列が残っている。
 */
export function AmountField({
  value,
  onChange,
  id,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  id: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>売上金額（税込）</Label>
      <Input
        id={id}
        value={formatAmount(value)}
        onChange={(e) => onChange(parseAmount(e.target.value))}
        inputMode="numeric"
        className="h-11 w-40 bg-card text-right font-mono"
      />
    </div>
  );
}
