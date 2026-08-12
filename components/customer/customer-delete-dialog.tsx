"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { deleteCustomer } from "@/lib/data/customers";
import type { Uuid } from "@/lib/types";

/**
 * 顧客の削除。
 *
 * この DB で唯一の物理削除で、元に戻せない（PITR を入れていないので
 * バックアップからの復旧もできない）。誤登録を消すための口なので、
 * 「何が一緒に消えるか」を数ではなく名前で並べて出す。
 *
 * 取り消しの導線は作らない。消したものを戻せない以上、
 * 「元に戻す」トーストは嘘になる。
 */
export function CustomerDeleteDialog({
  customerId,
  customerName,
  open,
  onOpenChange,
}: {
  customerId: Uuid;
  customerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const remove = async () => {
    setPending(true);
    try {
      await deleteCustomer(customerId);
      toast.success(`${customerName} 様のカルテを削除しました`);
      router.push("/customers");
    } catch {
      toast.error("削除できませんでした", {
        description: "担当している顧客か確認してください。",
      });
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{customerName} 様のカルテを削除します</DialogTitle>
          <DialogDescription>
            採寸票・注文履歴・着装写真・パーソナル・メモ・注意事項・記念日・
            アプローチの記録が、すべて一緒に消えます。
            <strong className="mt-2 block text-foreground">元に戻せません。</strong>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            やめる
          </Button>
          <Button variant="destructive" onClick={() => void remove()} disabled={pending}>
            {pending ? "削除しています…" : "削除する"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
