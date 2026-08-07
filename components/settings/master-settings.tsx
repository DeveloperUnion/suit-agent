"use client";

import { useCallback, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EditableSection, FormField } from "@/components/common/editable-section";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  COLOR_FAMILY_LABEL,
  FABRIC_PATTERN_LABEL,
  FABRIC_SEASON_LABEL,
} from "@/lib/constants/labels";
import { ITEM_TYPES } from "@/lib/constants/measurement-fields";
import {
  createFabric,
  deleteFabric,
  listFabricsWithUsage,
  updateFabric,
  updateSettings,
  type FabricWithUsage,
} from "@/lib/data/settings";
import { useMockQuery } from "@/lib/hooks/use-mock-db";
import { useSettings } from "@/lib/hooks/use-settings";
import type { ColorFamily, Fabric, FabricPattern, FabricSeason, ItemTypeId } from "@/lib/types";
import { formatAmount } from "@/lib/utils/date";

const EMPTY_FABRIC: Omit<Fabric, "id"> = {
  brand: "",
  productNumber: "",
  color: "",
  colorFamily: "navy",
  pattern: "solid",
  composition: "Wool 100%",
  yarnCount: "",
  season: "all_season",
};

export function MasterSettings() {
  const settings = useSettings();
  const loader = useCallback(() => listFabricsWithUsage(), []);
  const { data: fabrics } = useMockQuery(loader, []);
  const [editing, setEditing] = useState<FabricWithUsage | null>(null);
  const [creating, setCreating] = useState(false);

  const handleDelete = async (fabric: FabricWithUsage) => {
    const result = await deleteFabric(fabric.id);
    if (result.ok) {
      toast.success(`${fabric.brand} ${fabric.productNumber} を削除しました`);
    } else {
      // 過去の注文から生地が消えると履歴が壊れるため拒否する
      toast.error("この生地は削除できません", {
        description: `${result.usageCount}件の注文で使われています。`,
      });
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
          <h3 className="font-heading text-sm font-medium tracking-wide">生地マスタ</h3>
          <Button
            variant="outline"
            size="sm"
            className="h-10 gap-1.5"
            onClick={() => setCreating(true)}
          >
            <Plus className="size-4" />
            生地を追加
          </Button>
        </div>

        <ul className="flex flex-col rounded-md border border-border bg-card">
          {(fabrics ?? []).map((fabric) => (
            <li
              key={fabric.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-3 py-2.5 last:border-b-0"
            >
              <span className="font-medium">{fabric.brand}</span>
              <span className="tnum font-mono text-xs text-muted-foreground">
                {fabric.productNumber}
              </span>
              <span className="text-sm">{fabric.color}</span>
              <span className="text-sm text-muted-foreground">
                {FABRIC_PATTERN_LABEL[fabric.pattern]}
              </span>
              <span className="text-xs text-muted-foreground">
                {fabric.composition}
                {fabric.yarnCount ? ` / ${fabric.yarnCount}` : ""} /{" "}
                {FABRIC_SEASON_LABEL[fabric.season]}
              </span>
              <span className="tnum ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                {fabric.usageCount > 0 ? `${fabric.usageCount}件で使用中` : "未使用"}
              </span>
              <span className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10"
                  aria-label={`${fabric.brand} ${fabric.productNumber} を編集`}
                  onClick={() => setEditing(fabric)}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10 text-muted-foreground hover:text-thread"
                  aria-label={`${fabric.brand} ${fabric.productNumber} を削除`}
                  onClick={() => handleDelete(fabric)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <EditableSection
        title="アイテムの標準価格"
        initial={() =>
          Object.fromEntries(
            ITEM_TYPES.map((t) => [t.id, String(settings.itemPrices[t.id] ?? 0)]),
          ) as Record<ItemTypeId, string>
        }
        onSave={async (v) => {
          const prices = Object.fromEntries(
            ITEM_TYPES.map((t) => [t.id, toAmount(v[t.id], settings.itemPrices[t.id])]),
          ) as Record<ItemTypeId, number>;
          await updateSettings({ itemPrices: prices });
          toast.success("標準価格を更新しました");
        }}
        view={
          <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
            {ITEM_TYPES.map((t) => (
              <div key={t.id} className="flex flex-col gap-0.5 py-1.5">
                <span className="field-label">{t.name}</span>
                <span className="tnum font-mono text-sm">
                  ¥{formatAmount(settings.itemPrices[t.id] ?? 0)}
                </span>
              </div>
            ))}
          </div>
        }
        edit={(v, set) => (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
              {ITEM_TYPES.map((t) => (
                <FormField key={t.id} label={t.name}>
                  <Input
                    value={v[t.id]}
                    onChange={(e) => set({ [t.id]: e.target.value } as Partial<typeof v>)}
                    inputMode="numeric"
                    className="h-11 bg-card text-right font-mono"
                  />
                </FormField>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              注文登録の初期金額に使います。実際は生地と仕様でも変わるため、あくまで目安です。
            </p>
          </div>
        )}
      />

      <FabricDialog
        fabric={editing}
        open={creating || editing !== null}
        onOpenChange={(next) => {
          if (!next) {
            setCreating(false);
            setEditing(null);
          }
        }}
      />
    </div>
  );
}

function FabricDialog({
  fabric,
  open,
  onOpenChange,
}: {
  fabric: FabricWithUsage | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [draft, setDraft] = useState<Omit<Fabric, "id">>(EMPTY_FABRIC);
  const [syncedId, setSyncedId] = useState<string | null>(null);
  const currentId = fabric?.id ?? null;
  if (open && currentId !== syncedId) {
    setSyncedId(currentId);
    setDraft(fabric ? { ...fabric } : EMPTY_FABRIC);
  }

  const set = (patch: Partial<Omit<Fabric, "id">>) => setDraft((d) => ({ ...d, ...patch }));
  const canSubmit = draft.brand.trim() !== "" && draft.color.trim() !== "";

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (fabric) {
      await updateFabric(fabric.id, draft);
      toast.success("生地を更新しました");
    } else {
      await createFabric(draft);
      toast.success("生地を追加しました");
    }
    setSyncedId(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg font-medium">
            {fabric ? "生地を編集" : "生地を追加"}
          </DialogTitle>
          <DialogDescription>
            色系統と柄は、同じ系統を重ねて勧めないための判定に使います。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-x-4 sm:grid-cols-2">
          <FormField label="ブランド">
            <Input
              value={draft.brand}
              onChange={(e) => set({ brand: e.target.value })}
              className="h-11 bg-card"
              autoFocus
            />
          </FormField>
          <FormField label="品番">
            <Input
              value={draft.productNumber}
              onChange={(e) => set({ productNumber: e.target.value })}
              className="h-11 bg-card font-mono"
            />
          </FormField>
          <FormField label="色（表示名）">
            <Input
              value={draft.color}
              onChange={(e) => set({ color: e.target.value })}
              placeholder="ミッドナイトネイビー"
              className="h-11 bg-card"
            />
          </FormField>
          <FormField label="色系統">
            <Select
              value={draft.colorFamily}
              onValueChange={(v) => set({ colorFamily: v as ColorFamily })}
            >
              <SelectTrigger className="h-11 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(COLOR_FAMILY_LABEL) as ColorFamily[]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {COLOR_FAMILY_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="柄">
            <Select
              value={draft.pattern}
              onValueChange={(v) => set({ pattern: v as FabricPattern })}
            >
              <SelectTrigger className="h-11 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(FABRIC_PATTERN_LABEL) as FabricPattern[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {FABRIC_PATTERN_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="季節">
            <Select value={draft.season} onValueChange={(v) => set({ season: v as FabricSeason })}>
              <SelectTrigger className="h-11 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(FABRIC_SEASON_LABEL) as FabricSeason[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {FABRIC_SEASON_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="組成">
            <Input
              value={draft.composition}
              onChange={(e) => set({ composition: e.target.value })}
              className="h-11 bg-card"
            />
          </FormField>
          <FormField label="番手">
            <Input
              value={draft.yarnCount ?? ""}
              onChange={(e) => set({ yarnCount: e.target.value || undefined })}
              placeholder="Super110's"
              className="h-11 bg-card"
            />
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button className="h-11" onClick={handleSubmit} disabled={!canSubmit}>
            {fabric ? "保存" : "追加"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 入力が数値でなければ元の値を保つ */
function toAmount(raw: string, fallback: number): number {
  const n = Number(raw.replace(/[,¥\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}
