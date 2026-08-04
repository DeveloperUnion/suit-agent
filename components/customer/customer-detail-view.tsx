"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ArrowLeft, Plus, Star } from "lucide-react";

import { ElapsedDays } from "@/components/common/elapsed-days";
import { ApproachesTab } from "@/components/customer/tabs/approaches-tab";
import { MeasurementTab } from "@/components/customer/tabs/measurement-tab";
import { MessagesTab } from "@/components/customer/tabs/messages-tab";
import { OrdersTab } from "@/components/customer/tabs/orders-tab";
import { ProfileTab } from "@/components/customer/tabs/profile-tab";
import { MeasurementSheetView } from "@/components/measurement/measurement-sheet-view";
import { OrderCreateDialog } from "@/components/order/order-create-dialog";
import { SilhouetteThumb } from "@/components/silhouette/silhouette-thumb";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getCustomer } from "@/lib/data/customers";
import { getSilhouetteState } from "@/lib/data/measurements";
import { useMockQuery } from "@/lib/hooks/use-mock-db";

const TABS = [
  { value: "profile", label: "基本情報" },
  { value: "measurement", label: "採寸" },
  { value: "orders", label: "注文履歴" },
  { value: "messages", label: "やり取り" },
  { value: "approaches", label: "アプローチ" },
];

export function CustomerDetailView({
  customerId,
  initialTab,
  initialApproachId,
}: {
  customerId: string;
  /** アプローチリストから遷移してきたときに開くタブ */
  initialTab?: string;
  initialApproachId?: string;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [tab, setTab] = useState(
    initialTab && TABS.some((t) => t.value === initialTab) ? initialTab : "profile",
  );
  /** アプローチから「メッセージを作成」で来たときに引き継ぐ根拠 */
  const [approachTaskId, setApproachTaskId] = useState<string | undefined>(initialApproachId);

  const composeMessage = (taskId?: string) => {
    setApproachTaskId(taskId);
    setTab("messages");
  };

  const customerLoader = useCallback(() => getCustomer(customerId), [customerId]);
  const { data: customer, loading } = useMockQuery(customerLoader, [customerId]);

  const silhouetteLoader = useCallback(() => getSilhouetteState(customerId), [customerId]);
  const { data: silhouette } = useMockQuery(silhouetteLoader, [customerId]);

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
        <Link href="/customers" className="text-sm text-navy hover:underline">
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
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-xl font-medium tracking-tight sm:text-2xl">
                {customer.name}
                <span className="ml-1 text-base font-normal text-muted-foreground">様</span>
              </h1>
              {customer.isKeyAccount && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-1 rounded-sm bg-thread/10 px-1.5 py-0.5 text-xs text-thread">
                      <Star className="size-3 fill-current" />
                      重要顧客
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>企業ニュースの定期巡回対象です</TooltipContent>
                </Tooltip>
              )}
            </div>

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
              <span className="text-muted-foreground">
                LINE {customer.lineUserId ? "連携済" : "未連携"}
              </span>
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
          <ElapsedDays days={customer.elapsedDays} size="lg" />

          {/*
            採寸は右上のシルエット、メッセージはやり取りタブが入口なので、
            ここに同じ動作のボタンは置かない。注文は来店時に必ず通る動線のため
            1タップで届くようヘッダーに残している。
          */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="h-11 gap-1.5 sm:h-10"
              onClick={() => setOrderOpen(true)}
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">注文を追加</span>
            </Button>
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
        <TabsContent value="messages">
          <MessagesTab
            customerId={customerId}
            elapsedDays={customer.elapsedDays}
            approachTaskId={approachTaskId}
            onClearApproach={() => setApproachTaskId(undefined)}
          />
        </TabsContent>
        <TabsContent value="approaches">
          <ApproachesTab customerId={customerId} onComposeMessage={composeMessage} />
        </TabsContent>
      </Tabs>

      <MeasurementSheetView
        customerId={customerId}
        customerName={customer.name}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />

      <OrderCreateDialog
        customerId={customerId}
        customerName={customer.name}
        open={orderOpen}
        onOpenChange={setOrderOpen}
        onOpenMeasurement={() => setSheetOpen(true)}
      />
    </div>
  );
}
