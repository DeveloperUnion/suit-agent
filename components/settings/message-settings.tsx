"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { EditableSection, FormField } from "@/components/common/editable-section";
import { Field } from "@/components/common/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { POLITENESS_LABEL } from "@/lib/constants/labels";
import { generateDrafts } from "@/lib/ai/draft-messages";
import { listCustomers } from "@/lib/data/customers";
import { updateSettings } from "@/lib/data/settings";
import { useMockQuery } from "@/lib/hooks/use-mock-db";
import { useSettings } from "@/lib/hooks/use-settings";
import type { MessagePoliteness } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * メッセージ生成ルール（要件4.5）。
 *
 * 設定した内容が実際の下書きに反映されることを、この画面でそのまま見せる。
 * 効かない設定を並べないため。
 */
export function MessageSettings() {
  const settings = useSettings();
  const [previewOpen, setPreviewOpen] = useState(false);

  const save = async (patch: Partial<typeof settings.message>, label: string) => {
    await updateSettings({ message: { ...settings.message, ...patch } });
    toast.success(`${label}を更新しました`);
  };

  return (
    <div className="flex flex-col gap-7">
      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
        <EditableSection
          title="敬語レベル"
          initial={() => ({ politeness: settings.message.politeness })}
          onSave={(v) => save({ politeness: v.politeness }, "敬語レベル")}
          view={<Field label="文面のトーン" value={POLITENESS_LABEL[settings.message.politeness]} />}
          edit={(v, set) => (
            <FormField label="文面のトーン">
              <span className="flex flex-wrap gap-1">
                {(Object.keys(POLITENESS_LABEL) as MessagePoliteness[]).map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => set({ politeness: level })}
                    className={cn(
                      "min-h-11 rounded-sm border px-3 text-sm transition-colors",
                      v.politeness === level
                        ? "border-brand bg-brand text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-brand/40",
                    )}
                  >
                    {POLITENESS_LABEL[level]}
                  </button>
                ))}
              </span>
            </FormField>
          )}
        />

        <EditableSection
          title="絵文字"
          initial={() => ({ allowEmoji: settings.message.allowEmoji })}
          onSave={(v) => save({ allowEmoji: v.allowEmoji }, "絵文字の設定")}
          view={
            <Field label="下書きへの絵文字" value={settings.message.allowEmoji ? "使う" : "使わない"} />
          }
          edit={(v, set) => (
            <FormField label="下書きへの絵文字">
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={v.allowEmoji}
                  onChange={(e) => set({ allowEmoji: e.target.checked })}
                  className="size-4 accent-[var(--brand)]"
                />
                季節に合う絵文字を末尾に添える
              </label>
            </FormField>
          )}
        />

        <EditableSection
          title="目安の長さ"
          initial={() => ({
            min: String(settings.message.lengthMin),
            max: String(settings.message.lengthMax),
          })}
          onSave={(v) => {
            const min = clamp(v.min, 20, 800, 100);
            const max = clamp(v.max, min, 1000, 200);
            return save({ lengthMin: min, lengthMax: max }, "目安の長さ");
          }}
          view={
            <Field
              label="LINEで読みやすい長さ"
              value={`${settings.message.lengthMin}〜${settings.message.lengthMax}字`}
            />
          }
          edit={(v, set) => (
            <div className="flex flex-col gap-2">
              <FormField label="目安の字数">
                <span className="flex items-center gap-2">
                  <Input
                    value={v.min}
                    onChange={(e) => set({ min: e.target.value })}
                    inputMode="numeric"
                    className="h-11 w-20 bg-card text-right font-mono"
                  />
                  <span className="text-sm text-muted-foreground">〜</span>
                  <Input
                    value={v.max}
                    onChange={(e) => set({ max: e.target.value })}
                    inputMode="numeric"
                    className="h-11 w-20 bg-card text-right font-mono"
                  />
                  <span className="text-sm text-muted-foreground">字</span>
                </span>
              </FormField>
              <p className="text-xs text-muted-foreground">
                メッセージタブの文字数カウンタが、この範囲を外れると色で知らせます。
              </p>
            </div>
          )}
        />

        <section className="flex flex-col gap-1">
          <div className="flex items-center gap-2 border-b border-border pb-1.5">
            <span className="h-3 w-0.5 shrink-0 bg-brand" />
            <h3 className="flex-1 font-heading text-sm font-medium tracking-wide">
              生成しない内容
            </h3>
          </div>
          <ul className="flex flex-col gap-1 py-2 text-sm text-muted-foreground">
            <li>売り込み色を出さない。近況を気にかける文面を基本にする</li>
            <li>顧客データにない情報を創作しない</li>
            <li>下書きは必ず人が確認・編集してから送る（自動送信はしない）</li>
          </ul>
          <p className="text-xs text-muted-foreground">
            これらは変更できません。生成の前提として固定します（要件4.5）。
          </p>
        </section>
      </div>

      <section className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setPreviewOpen((v) => !v)}
          className="flex w-fit items-center gap-1 text-sm text-brand hover:underline"
        >
          {previewOpen ? "プレビューを閉じる" : "いまの設定で下書きを確認する"}
        </button>
        {previewOpen && <DraftPreview />}
      </section>
    </div>
  );
}

/** 設定がそのまま文面に出ることを確かめられるようにする */
function DraftPreview() {
  const loader = useCallback(async () => {
    const customers = await listCustomers();
    const target = customers[0];
    if (!target) return null;
    return { name: target.name, drafts: await generateDrafts(target.id) };
  }, []);
  const { data, loading } = useMockQuery(loader, []);

  if (loading) return <Skeleton className="h-40 w-full" />;
  if (!data) {
    return (
      <p className="rounded-md border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
        顧客がいないため下書きを作れません。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
      <span className="field-label">{data.name} 様 あての下書き</span>
      <div className="grid gap-2 lg:grid-cols-3">
        {data.drafts.map((draft) => (
          <div key={draft.id} className="flex flex-col gap-1.5 rounded-sm border border-border p-2.5">
            <span className="field-label text-brand">{draft.angle}</span>
            <span className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
              {draft.body}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function clamp(raw: string, min: number, max: number, fallback: number): number {
  const n = Number(raw.trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
