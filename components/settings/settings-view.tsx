"use client";

import { PageHeader } from "@/components/common/page-header";
import { MasterSettings } from "@/components/settings/master-settings";
import { MessageSettings } from "@/components/settings/message-settings";
import { StaffSettings } from "@/components/settings/staff-settings";
import { TriggerSettings } from "@/components/settings/trigger-settings";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  { value: "triggers", label: "トリガー" },
  { value: "staff", label: "スタッフ" },
  { value: "masters", label: "マスタ" },
  { value: "messages", label: "メッセージ" },
];

export function SettingsView() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <PageHeader eyebrow="Settings" title="設定" />

      <Tabs defaultValue="triggers" className="gap-5">
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

        <TabsContent value="triggers">
          <TriggerSettings />
        </TabsContent>
        <TabsContent value="staff">
          <StaffSettings />
        </TabsContent>
        <TabsContent value="masters">
          <MasterSettings />
        </TabsContent>
        <TabsContent value="messages">
          <MessageSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
