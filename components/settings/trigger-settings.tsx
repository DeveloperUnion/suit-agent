"use client";

import { useCallback } from "react";
import { toast } from "sonner";

import { EditableSection, FormField } from "@/components/common/editable-section";
import { Field } from "@/components/common/field";
import { Input } from "@/components/ui/input";
import { listApproaches } from "@/lib/data/approaches";
import { updateSettings } from "@/lib/data/settings";
import { useMockQuery } from "@/lib/hooks/use-mock-db";
import { useSettings } from "@/lib/hooks/use-settings";
import { cn } from "@/lib/utils";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const NUM_INPUT = "h-11 w-24 bg-card font-mono";

/**
 * トリガーの閾値。
 *
 * アプローチは毎回評価する作りなので、保存すればリストの出方が即座に変わる。
 * その効果がこの場で見えるよう、現在の件数を各項目に添える。
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
          <span className="tnum mx-1 font-mono font-medium">{approaches.total}件</span>
          が対象になり、
          <span className="tnum mx-1 font-mono font-medium">{approaches.items.length}件</span>
          をリストに出しています。
          {approaches.hidden > 0 && (
            <span className="text-muted-foreground">（{approaches.hidden}件は上限で保留）</span>
          )}
        </p>
      )}

      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
        <EditableSection
          title="経過日数トリガー"
          initial={() => ({ value: String(settings.elapsedDaysThreshold) })}
          onSave={(v) =>
            save({ elapsedDaysThreshold: clamp(v.value, 7, 730, 90) }, "経過日数トリガー")
          }
          view={
            <Field
              label="最終接触からの日数"
              value={`${settings.elapsedDaysThreshold}日を超えたら連絡対象にする`}
            />
          }
          edit={(v, set) => (
            <FormField label="最終接触から何日で発火するか">
              <span className="flex items-center gap-2">
                <Input
                  value={v.value}
                  onChange={(e) => set({ value: e.target.value })}
                  inputMode="numeric"
                  className={NUM_INPUT}
                />
                <span className="text-sm text-muted-foreground">日</span>
              </span>
            </FormField>
          )}
        />

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

        <EditableSection
          title="1日に出す上限"
          initial={() => ({ value: String(settings.dailyApproachLimit) })}
          onSave={(v) =>
            save({ dailyApproachLimit: clamp(v.value, 1, 200, 24) }, "1日に出す上限")
          }
          view={
            <Field
              label="リストに出す件数"
              value={`根拠の強い順に${settings.dailyApproachLimit}件まで`}
            />
          }
          edit={(v, set) => (
            <FormField label="さばける件数に合わせる">
              <span className="flex items-center gap-2">
                <Input
                  value={v.value}
                  onChange={(e) => set({ value: e.target.value })}
                  inputMode="numeric"
                  className={NUM_INPUT}
                />
                <span className="text-sm text-muted-foreground">件</span>
              </span>
              <span className="text-xs text-muted-foreground">
                これを超えて出しても消化されず、リスト全体が見られなくなります。
              </span>
            </FormField>
          )}
        />

        <EditableSection
          title="季節の入荷期"
          initial={() => settings.seasonWindows.map((w) => ({ ...w, months: [...w.months] }))}
          onSave={(windows) => save({ seasonWindows: windows }, "季節の入荷期")}
          view={
            <div className="flex flex-col">
              {settings.seasonWindows.map((w) => (
                <Field
                  key={w.season}
                  label={w.label}
                  value={
                    w.months.length > 0
                      ? w.months.map((m) => `${m}月`).join("・")
                      : "設定なし（発火しない）"
                  }
                />
              ))}
            </div>
          }
          edit={(windows, _update, setAll) => (
            <div className="flex flex-col gap-3">
              {windows.map((w, i) => (
                <FormField key={w.season} label={w.label}>
                  <span className="flex flex-wrap gap-1">
                    {MONTHS.map((m) => {
                      const on = w.months.includes(m);
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() =>
                            setAll(
                              windows.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      months: on
                                        ? x.months.filter((v) => v !== m)
                                        : [...x.months, m].sort((a, b) => a - b),
                                    }
                                  : x,
                              ),
                            )
                          }
                          className={cn(
                            "tnum min-h-9 w-10 rounded-sm border font-mono text-sm transition-colors",
                            on
                              ? "border-navy bg-navy text-primary-foreground"
                              : "border-border bg-card text-muted-foreground hover:border-navy/40",
                          )}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </span>
                </FormField>
              ))}
              <p className="text-xs text-muted-foreground">
                季節は単独では出しません。他のトリガーが立ったときの加点と文脈に使います。
              </p>
            </div>
          )}
        />
      </div>
    </div>
  );
}

/** 入力が数値でない・範囲外のときは既定値へ戻す */
function clamp(raw: string, min: number, max: number, fallback: number): number {
  const n = Number(raw.trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
