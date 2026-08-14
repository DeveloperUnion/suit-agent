"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sumAmountBreakdown, type OrderAmountBreakdown } from "@/lib/constants/labels";
import { formatAmount } from "@/lib/utils/date";

/**
 * 売上金額と内訳の合計が食い違ったまま保存しようとしたときの確認。
 *
 * 差額そのものは異常ではない。「その他」区分を作らない判断なので、4つの和が
 * 合計に届かないのは既定の状態で、合計欄のほうが正。**それでも保存の手前で
 * 1度だけ見せる**のは、打ち間違い（桁落ち・二重計上）も区分に無い売上も、
 * 画面ではまったく同じ「差がある」という形で現れるから。注記のままでは
 * 前者だけが黙って保存されていた。
 *
 * だから**止めるための関門ではなく、見たことを確かめるための関門**。
 * destructive にしないのも、進む側を既定の見た目にしているのもそのため。
 *
 * 金額を2つ並べるのは、「一致しません」だけでは、どちらをいくら直せばよいか
 * 分からないから。直す場所（内訳の入力欄）は「戻って直す」の先にそのまま残る。
 */
export function AmountGapDialog({
  open,
  onOpenChange,
  total,
  breakdown,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number;
  breakdown: OrderAmountBreakdown;
  /** 進む側のボタン文言。元の送信ボタンと同じ語にする（「登録する」「保存する」「取り込む」） */
  confirmLabel: string;
  onConfirm: () => void;
}) {
  const breakdownTotal = sumAmountBreakdown(breakdown);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>合計金額が一致しません</DialogTitle>
          <DialogDescription className="tnum">
            内訳の合計 ¥{formatAmount(breakdownTotal)} は、売上金額 ¥{formatAmount(total)}{" "}
            と一致しません。このまま進めてよろしいでしょうか。
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            戻って直す
          </Button>
          <Button onClick={onConfirm}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
