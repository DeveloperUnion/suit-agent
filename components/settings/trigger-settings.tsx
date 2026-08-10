"use client";

import { useCallback } from "react";
import { toast } from "sonner";

import { EditableSection, FormField } from "@/components/common/editable-section";
import { Field } from "@/components/common/field";
import { Input } from "@/components/ui/input";
import { POST_DELIVERY_MILESTONES } from "@/lib/constants/approach";
import { listApproaches } from "@/lib/data/approaches";
import { updateSettings } from "@/lib/data/settings";
import { useMockQuery } from "@/lib/hooks/use-mock-db";
import { useSettings } from "@/lib/hooks/use-settings";

const NUM_INPUT = "h-11 w-24 bg-card font-mono";

/**
 * トリガーの設定。
 *
 * アプローチは毎回評価する作りなので、保存すればリストの出方が即座に変わる。
 * その効果がこの場で見えるよう、現在の件数を添える。
 *
 * 納品後フォローの節目は編集させない。半年と1年で確定した決めごとであり、
 * 入力欄を置くと「変えられる」という誤った期待を生むため。
 */
export function TriggerSettings() {
  const settings = useSettings();

  const countLoader = useCallback(() => listApproaches(), []);
  const { data: approaches } = useMockQuery(countLoader, []);

  const save = async (patch: Parameters<typeof updateSettings>[0], label: string) => {
    await updateSettings(patch);
    toast.success(`${label}を更新しました`);
  };

  return (
    <div className="flex flex-col gap-7">
      {approaches && (
        <p className="rounded-md border border-border bg-card px-4 py-3 text-sm">
          いまの設定では
          <span className="tnum mx-1 font-mono font-medium">{approaches.length}件</span>
          をリストに出しています。
        </p>
      )}

      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
        <EditableSection
          title="記念日トリガー"
          initial={() => ({ value: String(settings.anniversaryLeadDays) })}
          onSave={(v) =>
            save({ anniversaryLeadDays: clamp(v.value, 1, 90, 21) }, "記念日トリガー")
          }
          view={
            <Field
              label="通知を始めるタイミング"
              value={`記念日の${settings.anniversaryLeadDays}日前から出す`}
            />
          }
          edit={(v, set) => (
            <FormField label="何日前から出すか">
              <span className="flex items-center gap-2">
                <Input
                  value={v.value}
                  onChange={(e) => set({ value: e.target.value })}
                  inputMode="numeric"
                  className={NUM_INPUT}
                />
                <span className="text-sm text-muted-foreground">日前</span>
              </span>
            </FormField>
          )}
        />

        {/* 変えられない決めごとも、どう動くかは見えている必要がある */}
        <section className="flex flex-col gap-2">
          <h3 className="font-heading text-base font-medium">納品後フォロー</h3>
          <div className="flex flex-col gap-2 rounded-md border border-border bg-card px-4 py-3">
            <Field
              label="出すタイミング"
              value={`最後の納品から${POST_DELIVERY_MILESTONES.map((m) => m.label).join("・")}が経った日`}
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              店舗として確定した決めごとのため、ここでは変えられません。
              半年を逃したまま1年が来た場合は、1年のほうだけを出します。
            </p>
          </div>
        </section>
      </div>

      <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">
        春夏・秋冬の新作案内は公式LINEから一斉に送るもので、配信はLstepが担います。
        ここで出すのは1対1で声をかける相手だけです。
      </p>
    </div>
  );
}

/** 入力が数値でない・範囲外のときは既定値へ戻す */
function clamp(raw: string, min: number, max: number, fallback: number): number {
  const n = Number(raw.trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
