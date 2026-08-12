"use client";

import { PageHeader } from "@/components/common/page-header";
import { RevenueTargetSettings } from "@/components/settings/revenue-target-settings";
import { StaffSettings } from "@/components/settings/staff-settings";
import { TriggerSettings } from "@/components/settings/trigger-settings";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * 並びは開く頻度の順。
 *
 * トリガーが一番右にあるのは、いちど決めたら滅多に触らないため。
 * 変えられるのはお渡し後フォローの節目と、記念日を何日前から出すかの 2 つ。
 *
 * マスタのタブは無い。生地は発注書に書かれた値をそのまま保存し、
 * 価格は注文ごとに紙から転記するので、店舗が育てるマスタが残らなかった。
 */
const TABS = [
  { value: "targets", label: "売上目標" },
  { value: "staff", label: "スタッフ" },
  { value: "triggers", label: "トリガー" },
];

export function SettingsView({ initialTab }: { initialTab?: string }) {
  const tab = initialTab && TABS.some((t) => t.value === initialTab) ? initialTab : "targets";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <PageHeader eyebrow="Settings" title="設定" />

      <Tabs defaultValue={tab} className="gap-5">
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

        <TabsContent value="targets">
          <RevenueTargetSettings />
        </TabsContent>
        <TabsContent value="staff">
          <StaffSettings />
        </TabsContent>
        <TabsContent value="triggers">
          <TriggerSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
