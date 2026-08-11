"use client";

import { useCallback } from "react";
import { toast } from "sonner";

import { EditableSection, FormField } from "@/components/common/editable-section";
import { Field } from "@/components/common/field";
import { Input } from "@/components/ui/input";
import { getCurrentStaff } from "@/lib/auth/current-staff";
import { ANNIVERSARY_LEAD_DAYS, postDeliveryLabel } from "@/lib/constants/approach";
import { listApproaches } from "@/lib/data/approaches";
import { updateAppSettings } from "@/lib/data/settings";
import { useQuery } from "@/lib/hooks/use-query";
import { useAppSettings } from "@/lib/hooks/use-settings";

/** DB の app.valid_post_delivery_months と同じ制約。片方だけ緩めない */
const MAX_MILESTONES = 3;
const MIN_MONTHS = 1;
const MAX_MONTHS = 60;

const NUM_INPUT = "h-11 w-24 bg-card font-mono";

/**
 * トリガーの設定。
 *
 * アプローチは毎回評価する作りなので、保存すればリストの出方が即座に変わる。
 * その効果がこの場で見えるよう、現在の件数を添える。
 *
 * ここで変えられるのは納品後フォローの節目だけ。記念日の 7 日前は店舗として
 * 確定した決めごとで、試しに動かして様子を見る数字ではないため出さない。
 * 「変えられない決めごと」も、どう動くかは見えている必要があるので表示はする。
 */
export function TriggerSettings() {
  const settings = useAppSettings();

  const meLoader = useCallback(() => getCurrentStaff(), []);
  const { data: me } = useQuery(meLoader, []);
  const isAdmin = me?.role === "admin";

  const countLoader = useCallback(() => listApproaches(), []);
  const { data: approaches } = useQuery(countLoader, []);

  const monthsText = settings.postDeliveryMonths.map(postDeliveryLabel).join("・");

  const save = async (raw: string[]) => {
    const months = normalize(raw);
    if (!months) {
      toast.error(`節目は ${MIN_MONTHS}〜${MAX_MONTHS} ヶ月の数字で、1〜${MAX_MILESTONES} 個まで入れてください。`);
      return;
    }
    try {
      await updateAppSettings({ postDeliveryMonths: months });
      toast.success("納品後フォローの節目を更新しました");
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
            title="納品後フォロー"
            initial={() => ({
              values: padTo(settings.postDeliveryMonths.map(String), MAX_MILESTONES),
            })}
            onSave={(v) => save(v.values)}
            view={<PostDeliveryView monthsText={monthsText} />}
            edit={(v, set) => (
              <div className="flex flex-col gap-3">
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
                <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">
                  空欄にすればその節目は無くなります。節目を変えると、変えた後の節目は
                  「まだ声をかけていないもの」として立ち直します。
                  すでに連絡した相手にもう一度出ることがあるのはそのためです。
                </p>
              </div>
            )}
          />
        ) : (
          <section className="flex flex-col gap-2">
            <h3 className="font-heading text-base font-medium">納品後フォロー</h3>
            <div className="flex flex-col gap-2 rounded-md border border-border bg-card px-4 py-3">
              <PostDeliveryView monthsText={monthsText} />
              <p className="text-xs leading-relaxed text-muted-foreground">
                店舗共通の設定です。変えられるのは管理者だけです。
              </p>
            </div>
          </section>
        )}

        {/* 変えられない決めごとも、どう動くかは見えている必要がある */}
        <section className="flex flex-col gap-2">
          <h3 className="font-heading text-base font-medium">記念日</h3>
          <div className="flex flex-col gap-2 rounded-md border border-border bg-card px-4 py-3">
            <Field
              label="出すタイミング"
              value={`誕生日・記念日の${ANNIVERSARY_LEAD_DAYS}日前から出す`}
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              店舗として確定した決めごとのため、ここでは変えられません。
              画面では「あと3日」のようなカウントダウンで見せています。
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function PostDeliveryView({ monthsText }: { monthsText: string }) {
  return (
    <>
      <Field label="出すタイミング" value={`最後の納品から${monthsText}が経った日`} />
      <p className="text-xs leading-relaxed text-muted-foreground">
        起点は最後の納品です。半年を逃したまま1年が来た場合は、1年のほうだけを出します。
      </p>
    </>
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
