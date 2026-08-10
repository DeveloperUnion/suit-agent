"use client";

import { useCallback, useState } from "react";
import { FileUp, Plus } from "lucide-react";
import { toast } from "sonner";

import { AdjustmentPanel } from "@/components/measurement/adjustment-panel";
import { MeasurementSection } from "@/components/measurement/measurement-section";
import { BodySilhouette } from "@/components/silhouette/body-silhouette";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentStaffId } from "@/lib/auth/current-staff";
import { MAX_ADJUSTMENTS } from "@/lib/constants/adjustments";
import { INPUT_METHOD_LABEL } from "@/lib/constants/labels";
import {
  createSheetFromPrevious,
  getSheetView,
  listSheets,
  toggleAdjustment,
  updateMeasurementValue,
} from "@/lib/data/measurements";
import { useMockQuery } from "@/lib/hooks/use-mock-db";
import { useIsPhone } from "@/lib/hooks/use-media-query";
import type { BodyPart, ItemTypeId } from "@/lib/types";
import { formatDateDot } from "@/lib/utils/date";
import { cn } from "@/lib/utils";

type Props = {
  customerId: string;
  customerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * 発注書の取り込みを開く。
   * ダイアログを入れ子にすると閉じる操作が噛み合わなくなるため、
   * ここでは閉じるだけにして、開くのは親に任せる（注文ダイアログと同じ流儀）。
   */
  onOpenImport: () => void;
  /**
   * 取り込み直後など、開いたときに特定の票を表示したい場合。
   * 途中で差し替わることはない前提で、親が key を変えて作り直す。
   */
  initialSheetId?: string;
};

export function MeasurementSheetView({
  customerId,
  customerName,
  open,
  onOpenChange,
  onOpenImport,
  initialSheetId,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | undefined>(initialSheetId);
  const [editing, setEditing] = useState(false);
  const [activeKey, setActiveKey] = useState<string | undefined>();
  const isPhone = useIsPhone();
  const [tab, setTab] = useState<"upper" | "lower" | "adjust">("upper");

  const sheetsLoader = useCallback(() => listSheets(customerId), [customerId]);
  const { data: sheets } = useMockQuery(sheetsLoader, [customerId, open]);

  const viewLoader = useCallback(
    () => getSheetView(customerId, selectedId),
    [customerId, selectedId],
  );
  const { data: view, loading } = useMockQuery(viewLoader, [customerId, selectedId, open]);

  const handleValueChange = (
    itemTypeId: ItemTypeId,
    fieldKey: string,
    column: "actual" | "finished",
    value: number | undefined,
  ) => {
    if (!view) return;
    void updateMeasurementValue(view.sheet.id, itemTypeId, fieldKey, column, value);
  };

  const handleToggleAdjustment = (bodyPart: BodyPart) => (code: number) => {
    if (!view) return;
    const already = view.adjustments[bodyPart].some((a) => a.master.code === code);
    if (!already && view.adjustments[bodyPart].length >= MAX_ADJUSTMENTS[bodyPart]) {
      toast.warning(
        `${bodyPart === "upper" ? "上半身" : "下半身"}補正は${MAX_ADJUSTMENTS[bodyPart]}ヶまでです`,
        { description: "既存の補正を外してから追加してください。" },
      );
    }
    void toggleAdjustment(view.sheet.id, code);
  };

  const handleNewSheet = async () => {
    const isFirst = !view;
    // 採寸票には「誰が採寸したか」を残す。顧客の担当ではなく操作者
    const id = await createSheetFromPrevious(customerId, getCurrentStaffId());
    setSelectedId(id);
    setEditing(true);
    toast.success(
      isFirst ? "採寸票を作成しました" : "前回値をプリセットした採寸票を作成しました",
      { description: isFirst ? undefined : "変わったところだけ書き換えてください。" },
    );
  };

  const upperSections = view?.upper ?? [];
  const lowerSections = view?.lower ?? [];

  const silhouette = (
    <div className="flex flex-col items-center gap-3">
      <div
        className={cn(
          "text-brand",
          // iPad 縦ではシルエットが上に載るため、数値を押し下げないよう小さく保つ
          isPhone ? "h-28 w-14" : "h-52 w-26 lg:h-[26rem] lg:w-52",
        )}
      >
        <BodySilhouette
          corrections={view?.corrections ?? []}
          variant={isPhone ? "thumb" : "full"}
        />
      </div>
      {!isPhone && (
        <div className="flex flex-col gap-1 text-center">
          <CounterLine label="上半身補正" used={view?.adjustments.upper.length ?? 0} part="upper" />
          <CounterLine label="下半身補正" used={view?.adjustments.lower.length ?? 0} part="lower" />
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[92dvh] sm:max-h-[92dvh] sm:w-[96vw] sm:max-w-[92rem] sm:rounded-md sm:border"
      >
        <DialogHeader className="shrink-0 space-y-0 border-b border-border px-4 py-3 text-left sm:px-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pr-8">
            <div className="flex flex-col">
              <span className="field-label">Measurement</span>
              <DialogTitle className="font-heading text-base font-medium sm:text-lg">
                {customerName} 様 — 採寸
              </DialogTitle>
            </div>

            {/* 採寸票が 1 枚もないときは、本文の「採寸を始める」に導線を一本化する */}
            {view && (
              <>
                <Select value={view.sheet.id} onValueChange={(v) => setSelectedId(v)}>
                  <SelectTrigger className="h-10 w-[10.5rem] bg-card font-mono">
                    <SelectValue placeholder="測定日" />
                  </SelectTrigger>
                  <SelectContent>
                    {(sheets ?? []).map((sheet, i) => (
                      <SelectItem key={sheet.id} value={sheet.id} className="font-mono">
                        {formatDateDot(sheet.measuredAt)}
                        {i === 0 && <span className="ml-2 text-xs text-muted-foreground">最新</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant={editing ? "default" : "outline"}
                    size="sm"
                    className="h-10"
                    onClick={() => setEditing((e) => !e)}
                  >
                    {editing ? "入力を終える" : "この票を編集"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 gap-1.5"
                    onClick={() => {
                      onOpenChange(false);
                      onOpenImport();
                    }}
                  >
                    <FileUp className="size-3.5" />
                    発注書を取り込む
                  </Button>
                  <Button size="sm" className="h-10 gap-1.5" onClick={handleNewSheet}>
                    <Plus className="size-3.5" />
                    新規採寸
                  </Button>
                </div>
              </>
            )}
          </div>
          <DialogDescription className="sr-only">
            実寸と上がり寸、および体型補正を表示します。測定日を切り替えると過去の採寸票を確認できます。
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col gap-3 p-6">
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : !view ? (
            /* 一度も採寸していない顧客。ここが最初の採寸の入口になる */
            <div className="flex flex-col items-center gap-5 px-6 py-12 text-center">
              <div className="h-52 w-26 text-brand">
                <BodySilhouette animate={false} />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">まだ採寸データがありません</p>
                <p className="max-w-xs text-sm text-muted-foreground">
                  最初の採寸票を作ります。前回値がないため、すべて空の状態から入力します。
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button className="h-11 gap-1.5" onClick={handleNewSheet}>
                  <Plus className="size-4" />
                  採寸を始める
                </Button>
                {/* 紙の取り込みは 1 枚目の票として十分に成り立つ */}
                <Button
                  variant="outline"
                  className="h-11 gap-1.5"
                  onClick={() => {
                    onOpenChange(false);
                    onOpenImport();
                  }}
                >
                  <FileUp className="size-4" />
                  発注書を取り込む
                </Button>
              </div>
            </div>
          ) : isPhone ? (
            /* ── スマートフォン: シルエットを縮めて sticky、上半身/下半身/補正をタブで切替 ── */
            <div className="flex flex-col">
              <div className="sticky top-0 z-10 flex flex-col items-center gap-2 border-b border-border bg-card/95 py-2 backdrop-blur">
                {silhouette}
                <div className="flex w-full gap-1 px-3">
                  {(
                    [
                      ["upper", "上半身"],
                      ["lower", "下半身"],
                      ["adjust", "補正"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTab(key)}
                      className={cn(
                        "min-h-11 flex-1 rounded-sm border text-sm transition-colors",
                        tab === key
                          ? "border-brand bg-brand text-primary-foreground"
                          : "border-border bg-card text-muted-foreground",
                      )}
                    >
                      {label}
                      {key === "adjust" && (
                        <span className="tnum ml-1 font-mono text-xs">
                          {view.adjustments.upper.length + view.adjustments.lower.length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-5 p-3">
                {tab === "upper" &&
                  upperSections.map((section) => (
                    <MeasurementSection
                      key={section.itemType.id}
                      section={section}
                      editable={editing}
                      activeKey={activeKey}
                      onFocusField={setActiveKey}
                      onChange={handleValueChange}
                    />
                  ))}
                {tab === "lower" &&
                  lowerSections.map((section) => (
                    <MeasurementSection
                      key={section.itemType.id}
                      section={section}
                      editable={editing}
                      activeKey={activeKey}
                      onFocusField={setActiveKey}
                      onChange={handleValueChange}
                    />
                  ))}
                {tab === "adjust" && (
                  <>
                    <AdjustmentPanel
                      bodyPart="upper"
                      applied={view.adjustments.upper}
                      editable={editing}
                      onToggle={handleToggleAdjustment("upper")}
                    />
                    <AdjustmentPanel
                      bodyPart="lower"
                      applied={view.adjustments.lower}
                      editable={editing}
                      onToggle={handleToggleAdjustment("lower")}
                    />
                  </>
                )}
              </div>
            </div>
          ) : (
            /* ── iPad縦: シルエット上部＋2カラム / PC: 左 上半身・中央 シルエット・右 下半身 ── */
            <div className="grid gap-x-8 gap-y-6 p-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_15rem_minmax(0,1fr)] lg:gap-x-10 lg:p-6">
              <div className="md:col-span-2 md:row-start-1 md:justify-self-center lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:self-start lg:pt-6">
                {silhouette}
              </div>

              <div className="flex flex-col gap-6 md:col-start-1 md:row-start-2 lg:col-start-1 lg:row-start-1">
                <SideHeading label="上半身" />
                {upperSections.map((section) => (
                  <MeasurementSection
                    key={section.itemType.id}
                    section={section}
                    editable={editing}
                    activeKey={activeKey}
                    onFocusField={setActiveKey}
                    onChange={handleValueChange}
                  />
                ))}
                <AdjustmentPanel
                  bodyPart="upper"
                  applied={view.adjustments.upper}
                  editable={editing}
                  onToggle={handleToggleAdjustment("upper")}
                />
              </div>

              <div className="flex flex-col gap-6 md:col-start-2 md:row-start-2 lg:col-start-3 lg:row-start-1">
                <SideHeading label="下半身" />
                {lowerSections.map((section) => (
                  <MeasurementSection
                    key={section.itemType.id}
                    section={section}
                    editable={editing}
                    activeKey={activeKey}
                    onFocusField={setActiveKey}
                    onChange={handleValueChange}
                  />
                ))}
                <AdjustmentPanel
                  bodyPart="lower"
                  applied={view.adjustments.lower}
                  editable={editing}
                  onToggle={handleToggleAdjustment("lower")}
                />
              </div>
            </div>
          )}

          {view && (
            <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-6">
              <span>
                採寸者 <span className="text-foreground">{view.staffName}</span>
              </span>
              <span>{INPUT_METHOD_LABEL[view.sheet.inputMethod]}</span>
              {/* 補正マークの意味を明示しておく。丸だけでは何の印か伝わらない */}
              {view.corrections.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-2 rounded-full bg-thread/70" />
                  図の丸印と番号は補正箇所
                </span>
              )}
              {view.previousSheet && (
                <span>
                  前回比の基準 <span className="font-mono">{formatDateDot(view.previousSheet.measuredAt)}</span>
                </span>
              )}
              {view.sheet.note && <span className="w-full text-foreground">{view.sheet.note}</span>}
            </footer>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SideHeading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-3 w-0.5 bg-brand" />
      <span className="font-heading text-sm font-medium tracking-wide">{label}</span>
    </div>
  );
}

function CounterLine({ label, used, part }: { label: string; used: number; part: BodyPart }) {
  const max = MAX_ADJUSTMENTS[part];
  const exceeded = used > max;
  return (
    <span className="tnum font-mono text-xs">
      <span className="text-muted-foreground">{label} </span>
      <span className={cn(exceeded ? "font-medium text-thread" : "text-foreground")}>
        {used}/{max}
      </span>
    </span>
  );
}
