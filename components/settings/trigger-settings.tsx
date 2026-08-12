"use client";

import { useCallback } from "react";
import { toast } from "sonner";

import { EditableSection, FormField } from "@/components/common/editable-section";
import { Field } from "@/components/common/field";
import { Input } from "@/components/ui/input";
import { getCurrentStaff } from "@/lib/auth/current-staff";
import { postDeliveryLabel } from "@/lib/constants/approach";
import { listApproaches } from "@/lib/data/approaches";
import { updateAppSettings } from "@/lib/data/settings";
import { useQuery } from "@/lib/hooks/use-query";
import { useAppSettings } from "@/lib/hooks/use-settings";

/** DB の app.valid_post_delivery_months と同じ制約。片方だけ緩めない */
const MAX_MILESTONES = 3;
const MIN_MONTHS = 1;
const MAX_MONTHS = 60;

/** DB の app_settings.anniversary_lead_days の CHECK と同じ */
const MIN_LEAD_DAYS = 0;
const MAX_LEAD_DAYS = 60;

const NUM_INPUT = "h-11 w-24 bg-card font-mono";

/**
 * トリガーの設定。
 *
 * アプローチは毎回評価する作りなので、保存すればリストの出方が即座に変わる。
 * その効果がこの場で見えるよう、現在の件数を添える。
 *
 * 節目も記念日の予告日数も、やってみないと適切な長さが分からなかったので
 * どちらも店舗に開けている。変えられるのは管理者だけ（RLS）。
 */
export function TriggerSettings() {
  const settings = useAppSettings();

  const meLoader = useCallback(() => getCurrentStaff(), []);
  const { data: me } = useQuery(meLoader, []);
  const isAdmin = me?.role === "admin";

  const countLoader = useCallback(() => listApproaches(), []);
  const { data: approaches } = useQuery(countLoader, []);

  const monthsText = settings.postDeliveryMonths.map(postDeliveryLabel).join("・");

  const saveMonths = async (raw: string[]) => {
    const months = normalize(raw);
    if (!months) {
      toast.error(`節目は ${MIN_MONTHS}〜${MAX_MONTHS} ヶ月の数字で、1〜${MAX_MILESTONES} 個まで入れてください。`);
      return;
    }
    await save({ postDeliveryMonths: months }, "お渡し後フォローの節目を更新しました");
  };

  const saveLeadDays = async (raw: string) => {
    const days = Number(raw.trim());
    if (!Number.isInteger(days) || days < MIN_LEAD_DAYS || days > MAX_LEAD_DAYS) {
      toast.error(`予告は ${MIN_LEAD_DAYS}〜${MAX_LEAD_DAYS} 日の数字で入れてください。`);
      return;
    }
    await save({ anniversaryLeadDays: days }, "記念日の予告日数を更新しました");
  };

  const save = async (patch: Parameters<typeof updateAppSettings>[0], message: string) => {
    try {
      await updateAppSettings(patch);
      toast.success(message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "更新できませんでした");
    }
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
        {isAdmin ? (
          <EditableSection
            title="お渡し後フォロー"
            initial={() => ({
              values: padTo(settings.postDeliveryMonths.map(String), MAX_MILESTONES),
            })}
            onSave={(v) => saveMonths(v.values)}
            view={<PostDeliveryView monthsText={monthsText} />}
            edit={(v, set) => (
              <div className="flex flex-wrap gap-4">
                {v.values.map((value, i) => (
                  <FormField key={i} label={`${i + 1}つめ`}>
                    <span className="flex items-center gap-2">
                      <Input
                        value={value}
                        onChange={(e) =>
                          set({
                            values: v.values.map((cur, j) => (j === i ? e.target.value : cur)),
                          })
                        }
                        inputMode="numeric"
                        placeholder="—"
                        className={NUM_INPUT}
                      />
                      <span className="text-sm text-muted-foreground">ヶ月後</span>
                    </span>
                  </FormField>
                ))}
              </div>
            )}
          />
        ) : (
          <ReadOnlySection title="お渡し後フォロー">
            <PostDeliveryView monthsText={monthsText} />
          </ReadOnlySection>
        )}

        {isAdmin ? (
          <EditableSection
            title="記念日"
            initial={() => ({ days: String(settings.anniversaryLeadDays) })}
            onSave={(v) => saveLeadDays(v.days)}
            view={<AnniversaryView leadDays={settings.anniversaryLeadDays} />}
            edit={(v, set) => (
              <FormField label="予告">
                <span className="flex items-center gap-2">
                  <Input
                    value={v.days}
                    onChange={(e) => set({ days: e.target.value })}
                    inputMode="numeric"
                    className={NUM_INPUT}
                  />
                  <span className="text-sm text-muted-foreground">日前から</span>
                </span>
              </FormField>
            )}
          />
        ) : (
          <ReadOnlySection title="記念日">
            <AnniversaryView leadDays={settings.anniversaryLeadDays} />
          </ReadOnlySection>
        )}
      </div>
    </div>
  );
}

function PostDeliveryView({ monthsText }: { monthsText: string }) {
  return <Field label="出すタイミング" value={`最後のお渡しから${monthsText}が経った日`} />;
}

function AnniversaryView({ leadDays }: { leadDays: number }) {
  return (
    <Field
      label="出すタイミング"
      value={
        leadDays === 0 ? "誕生日・記念日の当日に出す" : `誕生日・記念日の${leadDays}日前から出す`
      }
    />
  );
}

/** 一般スタッフに見せる形。EditableSection の枠だけ揃える */
function ReadOnlySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-heading text-base font-medium">{title}</h3>
      <div className="flex flex-col gap-2 rounded-md border border-border bg-card px-4 py-3">
        {children}
      </div>
    </section>
  );
}

function padTo(values: string[], length: number): string[] {
  return Array.from({ length }, (_, i) => values[i] ?? "");
}

/**
 * 入力を DB が受け取れる形に均す。
 * 昇順・重複なしは DB の CHECK でもあるので、ここで弾かずに並べ直す
 * （「12 と 6 を入れた」は間違いではなく、順番を気にしていないだけ）。
 * 数字でない・範囲外・1 つも無い、は直しようがないので null を返す。
 */
function normalize(raw: string[]): number[] | null {
  const parsed: number[] = [];
  for (const value of raw) {
    const text = value.trim();
    if (text === "") continue;
    const n = Number(text);
    if (!Number.isInteger(n) || n < MIN_MONTHS || n > MAX_MONTHS) return null;
    parsed.push(n);
  }
  const months = [...new Set(parsed)].sort((a, b) => a - b);
  if (months.length === 0 || months.length > MAX_MILESTONES) return null;
  return months;
}
