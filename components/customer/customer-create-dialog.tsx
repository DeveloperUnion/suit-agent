"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { ElapsedDays } from "@/components/common/elapsed-days";
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
import { createCustomer, findSimilarCustomers } from "@/lib/data/customers";
import { useMockQuery } from "@/lib/hooks/use-mock-db";

/**
 * 顧客の新規登録。
 *
 * 聞くのは氏名・カナ・連絡手段だけ（要件4.1「最小項目のみで完了できること」）。
 * ここで会社名や来店日まで聞くと入力が重くなり、結局登録されなくなる。
 * 詳細はカルテのセクション編集で後から足していく。
 */
export function CustomerCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [nameKana, setNameKana] = useState("");
  const [phone, setPhone] = useState("");
  const [lineDisplayName, setLineDisplayName] = useState("");
  const [saving, setSaving] = useState(false);

  const similarLoader = useCallback(
    () => findSimilarCustomers({ name, nameKana, phone }),
    [name, nameKana, phone],
  );
  const { data: similar } = useMockQuery(similarLoader, [name, nameKana, phone]);

  const hasContact = phone.trim() !== "" || lineDisplayName.trim() !== "";
  const canSubmit = name.trim() !== "" && hasContact;

  const reset = () => {
    setName("");
    setNameKana("");
    setPhone("");
    setLineDisplayName("");
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    const id = await createCustomer({
      name: name.trim(),
      nameKana: nameKana.trim(),
      phone: phone.trim() || undefined,
      lineDisplayName: lineDisplayName.trim() || undefined,
      firstVisitDate: new Date().toISOString().slice(0, 10),
    });
    setSaving(false);
    reset();
    onOpenChange(false);
    toast.success("登録しました", { description: "続けてカルテに詳細を足せます。" });
    router.push(`/customers/${id}`);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg font-medium">顧客を登録</DialogTitle>
          <DialogDescription>
            氏名と連絡手段だけで登録できます。会社名や好みは、あとからカルテで足してください。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-name">
                氏名 <span className="text-thread">*</span>
              </Label>
              <Input
                id="new-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="時枝 正"
                className="h-11 bg-card"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-kana">カナ</Label>
              <Input
                id="new-kana"
                value={nameKana}
                onChange={(e) => setNameKana(e.target.value)}
                placeholder="ときえだ ただし"
                className="h-11 bg-card"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-phone">電話</Label>
              <Input
                id="new-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="090-1234-5678"
                inputMode="tel"
                className="h-11 bg-card font-mono"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-line">LINE表示名</Label>
              <Input
                id="new-line"
                value={lineDisplayName}
                onChange={(e) => setLineDisplayName(e.target.value)}
                placeholder="Tadashi"
                className="h-11 bg-card"
              />
            </div>
          </div>

          {!hasContact && name.trim() !== "" && (
            <p className="text-xs text-muted-foreground">
              電話か LINE のどちらかを入れてください。連絡手段がないとアプローチできません。
            </p>
          )}

          {/* 顧客1,000名規模では再来店の見落としと同姓同名が必ず起きる */}
          {similar && similar.length > 0 && (
            <div className="flex flex-col gap-2 rounded-md border border-thread/30 bg-thread/5 p-3">
              <span className="flex items-center gap-1.5 text-xs text-thread">
                <AlertTriangle className="size-3.5" />
                似た顧客がすでに登録されています
              </span>
              <ul className="flex flex-col">
                {similar.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onOpenChange(false);
                        reset();
                        router.push(`/customers/${c.id}`);
                      }}
                      className="flex min-h-10 w-full items-center gap-3 rounded-sm px-1 text-left text-sm hover:bg-accent/50"
                    >
                      <span className="font-medium">{c.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {c.companyName ?? c.nameKana}
                      </span>
                      <span className="ml-auto shrink-0">
                        <ElapsedDays days={c.elapsedDays} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                同じ方であれば、新しく登録せず既存のカルテを開いてください。
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button className="h-11" onClick={handleSubmit} disabled={!canSubmit || saving}>
            登録してカルテを開く
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
