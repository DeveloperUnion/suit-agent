"use client";

import { useCallback } from "react";
import { AlertTriangle, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { EditableSection, FormField } from "@/components/common/editable-section";
import { EmptyState, Field } from "@/components/common/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ANNIVERSARY_LABEL } from "@/lib/constants/labels";
import { PREFECTURES } from "@/lib/constants/prefectures";
import {
  listAnniversaries,
  saveAnniversaries,
  updateCustomer,
  type CustomerListItem,
} from "@/lib/data/customers";
import { useMockQuery } from "@/lib/hooks/use-mock-db";
import type { AnniversaryType } from "@/lib/types";
import { daysUntilNextAnniversary, formatDateLong } from "@/lib/utils/date";

const INPUT = "h-11 bg-card";

/** Select は空文字を値に取れないため、未設定を表す番兵を置く */
const NO_PREFECTURE = "__none__";

/** カンマ区切りの文字列と配列を行き来する。タグや好みの色に使う */
const toList = (value: string) =>
  value
    .split(/[,、\s]+/)
    .map((v) => v.trim())
    .filter(Boolean);
const fromList = (value?: string[]) => (value ?? []).join("、");

export function ProfileTab({ customer }: { customer: CustomerListItem }) {
  const loader = useCallback(() => listAnniversaries(customer.id), [customer.id]);
  const { data: anniversaries } = useMockQuery(loader, [customer.id]);

  const save = async (patch: Parameters<typeof updateCustomer>[1], label: string) => {
    await updateCustomer(customer.id, patch);
    toast.success(`${label}を更新しました`);
  };

  return (
    <div className="flex flex-col gap-8">
      {/* NG事項は事故防止の情報なので、他の項目に埋もれさせない */}
      {customer.ngNotes && (
        <div className="flex items-start gap-2.5 rounded-md border border-thread/30 bg-thread/5 p-3.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-thread" />
          <div className="flex flex-col gap-0.5">
            <span className="field-label text-thread">NG事項</span>
            <p className="text-sm leading-relaxed">{customer.ngNotes}</p>
          </div>
        </div>
      )}

      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
        {/* ── 連絡先 ── */}
        <EditableSection
          title="連絡先"
          initial={() => ({
            phone: customer.phone ?? "",
            email: customer.email ?? "",
            birthDate: customer.birthDate ?? "",
            lineDisplayName: customer.lineDisplayName ?? "",
            residencePrefecture: customer.residencePrefecture ?? NO_PREFECTURE,
            address: customer.address ?? "",
          })}
          onSave={(v) =>
            save(
              {
                phone: v.phone || undefined,
                email: v.email || undefined,
                birthDate: v.birthDate || undefined,
                lineDisplayName: v.lineDisplayName || undefined,
                residencePrefecture:
                  v.residencePrefecture === NO_PREFECTURE ? undefined : v.residencePrefecture,
                address: v.address || undefined,
              },
              "連絡先",
            )
          }
          view={
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <Field label="電話" value={customer.phone} mono />
              <Field label="メール" value={customer.email} />
              <Field label="生年月日" value={formatDateLong(customer.birthDate)} />
              <Field
                label="LINE"
                value={
                  customer.lineUserId ? (
                    <span className="flex items-center gap-1.5">
                      連携済
                      <span className="text-muted-foreground">{customer.lineDisplayName}</span>
                    </span>
                  ) : (
                    "未連携"
                  )
                }
              />
              <Field label="居住地" value={customer.residencePrefecture} />
              <Field label="住所" value={customer.address} className="sm:col-span-2" />
            </div>
          }
          edit={(v, set) => (
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <FormField label="電話">
                <Input
                  value={v.phone}
                  onChange={(e) => set({ phone: e.target.value })}
                  inputMode="tel"
                  className={`${INPUT} font-mono`}
                />
              </FormField>
              <FormField label="メール">
                <Input
                  value={v.email}
                  onChange={(e) => set({ email: e.target.value })}
                  inputMode="email"
                  className={INPUT}
                />
              </FormField>
              <FormField label="生年月日">
                <Input
                  type="date"
                  value={v.birthDate}
                  onChange={(e) => set({ birthDate: e.target.value })}
                  className={`${INPUT} font-mono`}
                />
              </FormField>
              <FormField label="LINE表示名">
                <Input
                  value={v.lineDisplayName}
                  onChange={(e) => set({ lineDisplayName: e.target.value })}
                  className={INPUT}
                />
              </FormField>
              {/* 災害時にこの地域の顧客をまとめて拾えるよう、住所とは別に県だけ持つ */}
              <FormField label="居住地">
                <Select
                  value={v.residencePrefecture}
                  onValueChange={(next) => set({ residencePrefecture: next })}
                >
                  <SelectTrigger className={`${INPUT} w-full`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PREFECTURE}>未設定</SelectItem>
                    {PREFECTURES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="住所" className="sm:col-span-2">
                <Input
                  value={v.address}
                  onChange={(e) => set({ address: e.target.value })}
                  className={INPUT}
                />
              </FormField>
            </div>
          )}
        />

        {/* ── 勤務先 ── */}
        <EditableSection
          title="勤務先"
          initial={() => ({
            companyName: customer.companyName ?? "",
            department: customer.department ?? "",
            jobTitle: customer.jobTitle ?? "",
            industry: customer.industry ?? "",
          })}
          onSave={(v) =>
            save(
              {
                companyName: v.companyName || undefined,
                department: v.department || undefined,
                jobTitle: v.jobTitle || undefined,
                industry: v.industry || undefined,
              },
              "勤務先",
            )
          }
          view={
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <Field label="会社名" value={customer.companyName} className="sm:col-span-2" />
              <Field label="部署" value={customer.department} />
              <Field label="役職" value={customer.jobTitle} />
              <Field label="業種" value={customer.industry} />
            </div>
          }
          edit={(v, set) => (
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <FormField label="会社名" className="sm:col-span-2">
                <Input
                  value={v.companyName}
                  onChange={(e) => set({ companyName: e.target.value })}
                  className={INPUT}
                />
              </FormField>
              <FormField label="部署">
                <Input
                  value={v.department}
                  onChange={(e) => set({ department: e.target.value })}
                  className={INPUT}
                />
              </FormField>
              <FormField label="役職">
                <Input
                  value={v.jobTitle}
                  onChange={(e) => set({ jobTitle: e.target.value })}
                  className={INPUT}
                />
              </FormField>
              <FormField label="業種">
                <Input
                  value={v.industry}
                  onChange={(e) => set({ industry: e.target.value })}
                  className={INPUT}
                />
              </FormField>
            </div>
          )}
        />

        {/* ── パーソナル ── */}
        <EditableSection
          title="パーソナル"
          initial={() => ({
            hobbies: customer.hobbies ?? "",
            colors: fromList(customer.preferences?.colors),
            patterns: fromList(customer.preferences?.patterns),
            silhouette: customer.preferences?.silhouette ?? "",
            scenes: fromList(customer.preferences?.scenes),
            familyInfo: customer.familyInfo ?? "",
            embroideryName: customer.embroideryName ?? "",
          })}
          onSave={(v) =>
            save(
              {
                hobbies: v.hobbies || undefined,
                familyInfo: v.familyInfo || undefined,
                embroideryName: v.embroideryName || undefined,
                preferences: {
                  colors: toList(v.colors),
                  patterns: toList(v.patterns),
                  silhouette: v.silhouette || undefined,
                  scenes: toList(v.scenes),
                },
              },
              "パーソナル",
            )
          }
          view={
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <Field label="趣味・嗜好" value={customer.hobbies} className="sm:col-span-2" />
              <Field
                label="好みの色"
                value={
                  customer.preferences?.colors?.length ? (
                    <ChipList items={customer.preferences.colors} />
                  ) : undefined
                }
              />
              <Field
                label="好みの柄"
                value={
                  customer.preferences?.patterns?.length ? (
                    <ChipList items={customer.preferences.patterns} />
                  ) : undefined
                }
              />
              <Field label="好みのシルエット" value={customer.preferences?.silhouette} />
              <Field
                label="着用シーン"
                value={
                  customer.preferences?.scenes?.length ? (
                    <ChipList items={customer.preferences.scenes} />
                  ) : undefined
                }
              />
              <Field label="家族構成" value={customer.familyInfo} className="sm:col-span-2" />
              {/* 発注書に毎回入れる文字。人に紐づくので票ではなくここに置く */}
              <Field label="ネーム刺繍" value={customer.embroideryName} />
            </div>
          }
          edit={(v, set) => (
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <FormField label="趣味・嗜好" className="sm:col-span-2">
                <Input
                  value={v.hobbies}
                  onChange={(e) => set({ hobbies: e.target.value })}
                  placeholder="ゴルフ・ワイン"
                  className={INPUT}
                />
              </FormField>
              <FormField label="好みの色（読点区切り）">
                <Input
                  value={v.colors}
                  onChange={(e) => set({ colors: e.target.value })}
                  placeholder="ネイビー、チャコール"
                  className={INPUT}
                />
              </FormField>
              <FormField label="好みの柄（読点区切り）">
                <Input
                  value={v.patterns}
                  onChange={(e) => set({ patterns: e.target.value })}
                  placeholder="無地、ストライプ"
                  className={INPUT}
                />
              </FormField>
              <FormField label="好みのシルエット">
                <Input
                  value={v.silhouette}
                  onChange={(e) => set({ silhouette: e.target.value })}
                  className={INPUT}
                />
              </FormField>
              <FormField label="着用シーン（読点区切り）">
                <Input
                  value={v.scenes}
                  onChange={(e) => set({ scenes: e.target.value })}
                  placeholder="商談、会食"
                  className={INPUT}
                />
              </FormField>
              <FormField label="家族構成" className="sm:col-span-2">
                <Input
                  value={v.familyInfo}
                  onChange={(e) => set({ familyInfo: e.target.value })}
                  className={INPUT}
                />
              </FormField>
              <FormField label="ネーム刺繍">
                <Input
                  value={v.embroideryName}
                  onChange={(e) => set({ embroideryName: e.target.value })}
                  placeholder="T.TOKIEDA"
                  className={INPUT}
                />
              </FormField>
            </div>
          )}
        />

        {/* ── 記念日 ── */}
        <EditableSection
          title="記念日"
          initial={() =>
            (anniversaries ?? []).map((a) => ({
              type: a.type,
              date: a.date,
              label: a.label,
            }))
          }
          onSave={async (entries) => {
            await saveAnniversaries(
              customer.id,
              entries.filter((e) => e.date),
            );
            toast.success("記念日を更新しました");
          }}
          view={
            anniversaries && anniversaries.length > 0 ? (
              <ul className="flex flex-col">
                {anniversaries.map((a) => {
                  const until = daysUntilNextAnniversary(a.date);
                  return (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-b-0"
                    >
                      <span className="flex flex-col">
                        <span className="text-sm">{a.label || ANNIVERSARY_LABEL[a.type]}</span>
                        <span className="tnum font-mono text-xs text-muted-foreground">
                          {formatDateLong(a.date)}
                        </span>
                      </span>
                      <span className="tnum font-mono text-xs text-muted-foreground">
                        {until === 0 ? "本日" : `あと ${until}日`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-3 text-sm text-muted-foreground">登録なし</p>
            )
          }
          edit={(entries, _update, setAll) => (
            <div className="flex flex-col gap-2">
              {entries.map((entry, i) => (
                <div key={i} className="flex items-end gap-2">
                  <FormField label="種別" className="w-32 shrink-0">
                    <Select
                      value={entry.type}
                      onValueChange={(next) =>
                        setAll(
                          entries.map((e, j) =>
                            j === i ? { ...e, type: next as AnniversaryType } : e,
                          ),
                        )
                      }
                    >
                      <SelectTrigger className={INPUT}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(ANNIVERSARY_LABEL) as AnniversaryType[]).map((type) => (
                          <SelectItem key={type} value={type}>
                            {ANNIVERSARY_LABEL[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="日付" className="w-40 shrink-0">
                    <Input
                      type="date"
                      value={entry.date}
                      onChange={(e) =>
                        setAll(entries.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))
                      }
                      className={`${INPUT} font-mono`}
                    />
                  </FormField>
                  <FormField label="表示名" className="min-w-0 flex-1">
                    <Input
                      value={entry.label}
                      onChange={(e) =>
                        setAll(
                          entries.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                        )
                      }
                      className={INPUT}
                    />
                  </FormField>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mb-1 size-11 shrink-0"
                    onClick={() => setAll(entries.filter((_, j) => j !== i))}
                    aria-label="この記念日を削除"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="h-10 w-fit gap-1.5"
                onClick={() => setAll([...entries, { type: "other", date: "", label: "" }])}
              >
                <Plus className="size-3.5" />
                記念日を追加
              </Button>
            </div>
          )}
        />

        {/* ── 営業管理 ── */}
        <EditableSection
          title="営業管理"
          initial={() => ({
            firstVisitDate: customer.firstVisitDate ?? "",
            acquisitionChannel: customer.acquisitionChannel ?? "",
            tags: fromList(customer.tags),
            ngNotes: customer.ngNotes ?? "",
          })}
          onSave={(v) =>
            save(
              {
                firstVisitDate: v.firstVisitDate || undefined,
                acquisitionChannel: v.acquisitionChannel || undefined,
                tags: toList(v.tags),
                ngNotes: v.ngNotes || undefined,
              },
              "営業管理",
            )
          }
          view={
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <Field label="初回来店日" value={formatDateLong(customer.firstVisitDate)} />
              <Field label="流入経路" value={customer.acquisitionChannel} />
              <Field
                label="タグ"
                value={customer.tags?.length ? <ChipList items={customer.tags} /> : undefined}
              />
              <Field label="NG事項" value={customer.ngNotes} className="sm:col-span-2" />
            </div>
          }
          edit={(v, set) => (
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <FormField label="初回来店日">
                <Input
                  type="date"
                  value={v.firstVisitDate}
                  onChange={(e) => set({ firstVisitDate: e.target.value })}
                  className={`${INPUT} font-mono`}
                />
              </FormField>
              <FormField label="流入経路">
                <Input
                  value={v.acquisitionChannel}
                  onChange={(e) => set({ acquisitionChannel: e.target.value })}
                  className={INPUT}
                />
              </FormField>
              <FormField label="タグ（読点区切り）">
                <Input
                  value={v.tags}
                  onChange={(e) => set({ tags: e.target.value })}
                  className={INPUT}
                />
              </FormField>
              <FormField label="NG事項" className="sm:col-span-2">
                <Textarea
                  value={v.ngNotes}
                  onChange={(e) => set({ ngNotes: e.target.value })}
                  rows={2}
                  placeholder="断られた提案、避けるべき話題など"
                  className="resize-none bg-card"
                />
              </FormField>
            </div>
          )}
        />

        {/* ── メモ ── */}
        <EditableSection
          title="メモ"
          initial={() => ({ memo: customer.memo ?? "" })}
          onSave={(v) => save({ memo: v.memo || undefined }, "メモ")}
          view={
            customer.memo ? (
              <p className="whitespace-pre-wrap py-2 text-sm leading-relaxed">{customer.memo}</p>
            ) : (
              <p className="py-3 text-sm text-muted-foreground">記載なし</p>
            )
          }
          edit={(v, set) => (
            <Textarea
              value={v.memo}
              onChange={(e) => set({ memo: e.target.value })}
              rows={4}
              className="resize-none bg-card"
            />
          )}
        />
      </div>

      {!customer.companyName && !customer.hobbies && (
        <EmptyState>
          この顧客はまだ氏名と連絡先しか登録されていません。各セクションの「編集」から、聞けたことを少しずつ足していけます。
        </EmptyState>
      )}
    </div>
  );
}

function ChipList({ items }: { items: string[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((item) => (
        <Badge key={item} variant="secondary" className="font-normal">
          {item}
        </Badge>
      ))}
    </span>
  );
}
