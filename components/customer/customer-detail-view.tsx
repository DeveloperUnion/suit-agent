"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ArrowLeft, FileUp, MoreHorizontal, Trash2 } from "lucide-react";

import { useAgentContext } from "@/components/agent/agent-provider";
import { DaysSinceDelivery } from "@/components/common/days-since-delivery";
import { CustomerDeleteDialog } from "@/components/customer/customer-delete-dialog";
import { ApproachesTab } from "@/components/customer/tabs/approaches-tab";
import { MeasurementTab } from "@/components/customer/tabs/measurement-tab";
import { OrdersTab } from "@/components/customer/tabs/orders-tab";
import { ProfileTab } from "@/components/customer/tabs/profile-tab";
import { MeasurementSheetView } from "@/components/measurement/measurement-sheet-view";
import { OrderSheetImportDialog } from "@/components/measurement/order-sheet-import-dialog";
import { OrderCreateDialog } from "@/components/order/order-create-dialog";
import { SilhouetteThumb } from "@/components/silhouette/silhouette-thumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCustomer } from "@/lib/data/customers";
import { getSilhouetteState } from "@/lib/data/measurements";
import { useQuery } from "@/lib/hooks/use-query";

const TABS = [
  { value: "profile", label: "基本情報" },
  { value: "measurement", label: "採寸" },
  { value: "orders", label: "注文履歴" },
  { value: "approaches", label: "アプローチ" },
];

export function CustomerDetailView({
  customerId,
  initialTab,
}: {
  customerId: string;
  /** アプローチリストから遷移してきたときに開くタブ */
  initialTab?: string;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  /** 取り込んだ直後に、その票を開いた状態で採寸ビューへ戻すため */
  const [sheetId, setSheetId] = useState<string | undefined>();
  const [tab, setTab] = useState(
    initialTab && TABS.some((t) => t.value === initialTab) ? initialTab : "profile",
  );

  const customerLoader = useCallback(() => getCustomer(customerId), [customerId]);
  const { data: customer, loading } = useQuery(customerLoader, [customerId]);

  const silhouetteLoader = useCallback(() => getSilhouetteState(customerId), [customerId]);
  const { data: silhouette } = useQuery(silhouetteLoader, [customerId]);

  // AI アシスタントに「いま誰のカルテを見ているか」を伝える。
  // 名前を言わずに「ゴルフが趣味らしい」と話しかけられるようにするため
  useAgentContext(
    customer ? { kind: "customer", id: customer.id, label: `${customer.name} 様` } : null,
  );

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!customer) {
    // 存在しないか、他のスタッフが担当している顧客。どちらかは区別しない
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-3 p-8">
        <p className="text-sm text-muted-foreground">
          このカルテは開けません。存在しないか、他のスタッフが担当している顧客です。
        </p>
        <Link href="/customers" className="text-sm text-brand hover:underline">
          顧客一覧に戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <Link
        href="/customers"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        顧客一覧
      </Link>

      {/* ── ヘッダー ── */}
      <header className="flex flex-col gap-4 rounded-md border border-border bg-card p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h1 className="font-heading text-xl font-medium tracking-tight sm:text-2xl">
              {customer.name}
              <span className="ml-1 text-base font-normal text-muted-foreground">様</span>
            </h1>

            <p className="text-sm text-muted-foreground">{customer.nameKana}</p>

            {/* スマホでは勤務先まわりを畳んで、氏名・経過日数・シルエットに絞る */}
            <div className="hidden flex-wrap gap-x-5 gap-y-1 text-sm sm:flex">
              {customer.companyName && (
                <span>
                  {customer.companyName}
                  {customer.department && (
                    <span className="text-muted-foreground"> / {customer.department}</span>
                  )}
                  {customer.jobTitle && <span className="text-muted-foreground"> {customer.jobTitle}</span>}
                </span>
              )}
              {customer.industry && (
                <span className="text-muted-foreground">{customer.industry}</span>
              )}
            </div>
          </div>

          {/* 右上のシルエット — 採寸ビューの入口。適用中の補正がそのまま形に出る */}
          {silhouette && (
            <SilhouetteThumb
              corrections={silhouette.corrections}
              measuredAt={silhouette.measuredAt}
              adjustmentCount={silhouette.adjustmentCount}
              onClick={() => setSheetOpen(true)}
              className="shrink-0"
            />
          )}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 border-t border-border pt-4">
          {/*
            出すのはお渡しからの日数だけ。「最終連絡」は持たないことにした —
            実際の連絡は個人の連絡手段で行われるので、システムが拾えるのは
            一部でしかなく、それを最終連絡として出すと読み手を誤らせる。
          */}
          <div className="flex flex-wrap items-end gap-5">
            <DaysSinceDelivery days={customer.daysSinceDelivery} size="lg" />
          </div>

          {/*
            採寸は右上のシルエットが入口なので、ここに同じ動作のボタンは置かない。
            注文は来店時に必ず通る動線のため 1タップで届くようヘッダーに残している。
            その動線の中身は手入力ではなく工場発注書の取り込みで、
            寸法・補正・生地・日付が 1 枚で揃うぶん、注文と採寸が同時に片付く。
            紙がまだ無いときの手入力は、取り込み画面の中のリンクから開く。
          */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="h-11 gap-1.5 sm:h-10"
              onClick={() => setImportOpen(true)}
            >
              <FileUp className="size-4" />
              <span className="hidden sm:inline">発注書を取り込む</span>
            </Button>

            {/*
              削除はメニューの奥に置く。主動線の隣に裸のボタンとして出すと、
              取り込みボタンの押し間違いが「元に戻せない削除」になる。
            */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 sm:size-10"
                  aria-label="このカルテの操作"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                  <Trash2 className="size-4" />
                  この顧客を削除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* ── タブ ── */}
      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <ScrollArea className="w-full">
          <TabsList className="w-max">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="min-h-9 px-4">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <TabsContent value="profile">
          <ProfileTab customer={customer} />
        </TabsContent>
        <TabsContent value="measurement">
          <MeasurementTab customerId={customerId} onOpenSheet={() => setSheetOpen(true)} />
        </TabsContent>
        <TabsContent value="orders">
          <OrdersTab customerId={customerId} />
        </TabsContent>
        <TabsContent value="approaches">
          <ApproachesTab customerId={customerId} customerName={customer.name} />
        </TabsContent>
      </Tabs>

      <MeasurementSheetView
        // 取り込んだ票を開いた状態で見せるため、その票に切り替わったら作り直す
        key={sheetId ?? "latest"}
        customerId={customerId}
        customerName={customer.name}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        initialSheetId={sheetId}
      />

      {/* 採寸ビューの中に入れ子にせず、兄弟として置く（閉じる操作が噛み合わなくなるため） */}
      <OrderSheetImportDialog
        customerId={customerId}
        customerName={customer.name}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(id) => {
          setSheetId(id);
          setSheetOpen(true);
        }}
        onOpenManual={() => setOrderOpen(true)}
      />

      <OrderCreateDialog
        customerId={customerId}
        customerName={customer.name}
        open={orderOpen}
        onOpenChange={setOrderOpen}
        onOpenMeasurement={() => setSheetOpen(true)}
      />

      <CustomerDeleteDialog
        customerId={customer.id}
        customerName={customer.name}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </div>
  );
}
