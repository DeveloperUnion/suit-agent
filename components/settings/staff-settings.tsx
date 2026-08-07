"use client";

import { useCallback, useState } from "react";
import { Pencil, Plus, UserMinus, UserPlus } from "lucide-react";
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
import { STAFF_ROLE_LABEL } from "@/lib/constants/labels";
import {
  activateStaff,
  createStaff,
  deactivateStaff,
  listAllStaff,
  updateStaff,
  type StaffWithLoad,
} from "@/lib/data/settings";
import { useMockQuery } from "@/lib/hooks/use-mock-db";
import type { StaffRole } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StaffSettings() {
  const loader = useCallback(() => listAllStaff(), []);
  const { data: staff } = useMockQuery(loader, []);

  const [editing, setEditing] = useState<StaffWithLoad | null>(null);
  const [creating, setCreating] = useState(false);
  const [deactivating, setDeactivating] = useState<StaffWithLoad | null>(null);

  const active = (staff ?? []).filter((s) => s.isActive);
  const inactive = (staff ?? []).filter((s) => !s.isActive);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-prose text-sm text-muted-foreground">
          顧客はスタッフごとに分かれています。ログインした人には自分の顧客だけが見えます。
        </p>
        <Button className="h-11 gap-1.5 sm:h-10" onClick={() => setCreating(true)}>
          <UserPlus className="size-4" />
          スタッフを追加
        </Button>
      </div>

      <ul className="flex flex-col rounded-md border border-border bg-card">
        {active.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-4 py-3 last:border-b-0"
          >
            <span className="flex min-w-0 flex-col">
              <span className="flex items-center gap-2 font-medium">
                {s.name}
                {s.isCurrent && (
                  <span className="rounded-sm bg-navy/10 px-1.5 text-xs text-navy">ログイン中</span>
                )}
              </span>
              <span className="truncate text-xs text-muted-foreground">{s.email}</span>
            </span>
            <span className="text-sm text-muted-foreground">{STAFF_ROLE_LABEL[s.role]}</span>
            <span className="tnum ml-auto font-mono text-sm">担当 {s.customerCount}名</span>
            <span className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-10 gap-1.5"
                onClick={() => setEditing(s)}
              >
                <Pencil className="size-3.5" />
                編集
              </Button>
              {/* 自分自身は無効化できない。ログインできる人が0になるのを防ぐ */}
              {!s.isCurrent && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 gap-1.5 text-muted-foreground hover:text-thread"
                  onClick={() => setDeactivating(s)}
                >
                  <UserMinus className="size-3.5" />
                  無効化
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>

      {inactive.length > 0 && (
        <section className="flex flex-col gap-2">
          <span className="field-label">無効になっているスタッフ</span>
          <ul className="flex flex-col rounded-md border border-dashed border-border">
            {inactive.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-4 py-3 last:border-b-0"
              >
                <span className="flex min-w-0 flex-col opacity-70">
                  <span className="font-medium">{s.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{s.email}</span>
                </span>
                <span className="tnum ml-auto font-mono text-sm text-muted-foreground">
                  担当 {s.customerCount}名
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10"
                  onClick={async () => {
                    await activateStaff(s.id);
                    toast.success(`${s.name}を有効に戻しました`);
                  }}
                >
                  有効に戻す
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <StaffFormDialog
        staff={editing}
        open={creating || editing !== null}
        onOpenChange={(next) => {
          if (!next) {
            setCreating(false);
            setEditing(null);
          }
        }}
      />

      <DeactivateDialog
        staff={deactivating}
        candidates={active.filter((s) => s.id !== deactivating?.id)}
        onOpenChange={(next) => {
          if (!next) setDeactivating(null);
        }}
      />
    </div>
  );
}

function StaffFormDialog({
  staff,
  open,
  onOpenChange,
}: {
  staff: StaffWithLoad | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("member");
  // ダイアログを開くたびに対象が変わるので、描画中に同期する
  const [syncedId, setSyncedId] = useState<string | null>(null);
  const currentId = staff?.id ?? null;
  if (open && currentId !== syncedId) {
    setSyncedId(currentId);
    setName(staff?.name ?? "");
    setEmail(staff?.email ?? "");
    setRole(staff?.role ?? "member");
  }

  const handleSubmit = async () => {
    if (!name.trim()) return;
    if (staff) {
      await updateStaff(staff.id, { name: name.trim(), email: email.trim(), role });
      toast.success("スタッフを更新しました");
    } else {
      await createStaff({ name: name.trim(), email: email.trim(), role });
      toast.success("スタッフを追加しました");
    }
    setSyncedId(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg font-medium">
            {staff ? "スタッフを編集" : "スタッフを追加"}
          </DialogTitle>
          <DialogDescription>
            追加した人は顧客を1名も持たない状態から始まります。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="staff-name">
              氏名 <span className="text-thread">*</span>
            </Label>
            <Input
              id="staff-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 bg-card"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="staff-email">メール</Label>
            <Input
              id="staff-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              inputMode="email"
              className="h-11 bg-card"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="staff-role">権限</Label>
            <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
              <SelectTrigger id="staff-role" className="h-11 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STAFF_ROLE_LABEL) as StaffRole[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {STAFF_ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button className="h-11 gap-1.5" onClick={handleSubmit} disabled={!name.trim()}>
            <Plus className={cn("size-4", staff && "hidden")} />
            {staff ? "保存" : "追加"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 無効化と顧客の引き継ぎを一度に行う。
 *
 * 顧客はスタッフごとに分割されているため、引き継がずに無効化すると
 * その顧客が誰からも見えなくなる。引き継ぎ先の選択を必須にして構造的に防ぐ。
 */
function DeactivateDialog({
  staff,
  candidates,
  onOpenChange,
}: {
  staff: StaffWithLoad | null;
  candidates: StaffWithLoad[];
  onOpenChange: (open: boolean) => void;
}) {
  const [reassignTo, setReassignTo] = useState("");
  const [syncedId, setSyncedId] = useState<string | null>(null);
  const currentId = staff?.id ?? null;
  if (staff && currentId !== syncedId) {
    setSyncedId(currentId);
    setReassignTo(candidates[0]?.id ?? "");
  }

  const needsReassign = (staff?.customerCount ?? 0) > 0;
  const canSubmit = staff !== null && (!needsReassign || reassignTo !== "");

  const handleSubmit = async () => {
    if (!staff || !canSubmit) return;
    await deactivateStaff(staff.id, reassignTo);
    const to = candidates.find((c) => c.id === reassignTo);
    toast.success(`${staff.name}を無効化しました`, {
      description: needsReassign
        ? `担当していた${staff.customerCount}名を${to?.name}に引き継ぎました。`
        : undefined,
    });
    setSyncedId(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={staff !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg font-medium">
            {staff?.name} を無効化します
          </DialogTitle>
          <DialogDescription>
            無効化するとログインできなくなります。顧客・採寸・注文の記録は残ります。
          </DialogDescription>
        </DialogHeader>

        {needsReassign ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              担当している
              <span className="tnum mx-1 font-mono font-medium">{staff?.customerCount}名</span>
              の顧客を引き継ぎます。引き継がないと、この顧客は誰からも見えなくなります。
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reassign-to">
                引き継ぎ先 <span className="text-thread">*</span>
              </Label>
              <Select value={reassignTo} onValueChange={setReassignTo}>
                <SelectTrigger id="reassign-to" className="h-11 bg-card">
                  <SelectValue placeholder="引き継ぎ先を選ぶ" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        現在 {c.customerCount}名
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">担当している顧客はいません。</p>
        )}

        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button className="h-11" onClick={handleSubmit} disabled={!canSubmit}>
            無効化する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
