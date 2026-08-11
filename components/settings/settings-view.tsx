"use client";

import { PageHeader } from "@/components/common/page-header";
import { RevenueTargetSettings } from "@/components/settings/revenue-target-settings";
import { StaffSettings } from "@/components/settings/staff-settings";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * 残ったのは 2 つだけ。
 *
 * マスタのタブは無い。生地は発注書に書かれた値をそのまま保存し、
 * 価格は注文ごとに紙から転記するので、店舗が育てるマスタが残らなかった。
 *
 * トリガーのタブも無い。記念日は 1 週間前から出す、というのは店舗として
 * 確定した決めごとで、試しに動かして様子を見る数字ではないため
 * lib/constants/approach.ts へ移した（納品後フォローの節目と同じ扱い）。
 */
const TABS = [
  { value: "targets", label: "売上目標" },
  { value: "staff", label: "スタッフ" },
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
      </Tabs>
    </div>
  );
}
