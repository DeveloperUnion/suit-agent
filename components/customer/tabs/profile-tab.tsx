"use client";

import { useCallback } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { EditableSection, FormField } from "@/components/common/editable-section";
import { Field } from "@/components/common/field";
import { HandlingPanel } from "@/components/customer/handling-panel";
import { PersonalityPanel, RecordsPanel } from "@/components/customer/personality-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ANNIVERSARY_LABEL } from "@/lib/constants/labels";
import { DOMINANT_SIDE_LABEL } from "@/lib/constants/customer-fields";
import { INDUSTRIES } from "@/lib/constants/industries";
import { PREFECTURES } from "@/lib/constants/prefectures";
import {
  listAnniversaries,
  saveAnniversaries,
  updateCustomer,
  type CustomerListItem,
} from "@/lib/data/customers";
import { getLatestBodyMetrics } from "@/lib/data/measurements";
import { useQuery } from "@/lib/hooks/use-query";
import type { AnniversaryType, DominantSide, Uuid } from "@/lib/types";
import { daysUntilNextAnniversary, formatDateDot, formatDateLong } from "@/lib/utils/date";

const INPUT = "h-11 bg-card";

/** Select は空文字を値に取れないため、未設定を表す番兵を置く */
const NO_PREFECTURE = "__none__";
const NO_INDUSTRY = "__none__";
/** 選択肢に無い業種を手で入れるための番兵 */
const OTHER_INDUSTRY = "__other__";
/** 利き手・利き足の未設定 */
const NO_SIDE = "__none__";

const isKnownIndustry = (value: string) => (INDUSTRIES as readonly string[]).includes(value);

export function ProfileTab({ customer }: { customer: CustomerListItem }) {
  const loader = useCallback(() => listAnniversaries(customer.id), [customer.id]);
  const { data: anniversaries } = useQuery(loader, [customer.id]);

  const save = async (patch: Parameters<typeof updateCustomer>[1], label: string) => {
    await updateCustomer(customer.id, patch);
    toast.success(`${label}を更新しました`);
  };

  return (
    <div className="flex flex-col gap-8">
      {/* 取りこぼしが許されない情報は 1 箇所にまとめ、他の項目に埋もれさせない */}
      <HandlingPanel customerId={customer.id} />

      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
        {/* ── 連絡先 ── */}
        <EditableSection
          title="基本情報"
          initial={() => ({
            phone: customer.phone ?? "",
            email: customer.email ?? "",
            birthDate: customer.birthDate ?? "",
            residencePrefecture: customer.residencePrefecture ?? NO_PREFECTURE,
            address: customer.address ?? "",
            embroideryName: customer.embroideryName ?? "",
          })}
          onSave={(v) =>
            save(
              {
                phone: v.phone || undefined,
                email: v.email || undefined,
                birthDate: v.birthDate || undefined,
                residencePrefecture:
                  v.residencePrefecture === NO_PREFECTURE ? undefined : v.residencePrefecture,
                address: v.address || undefined,
                embroideryName: v.embroideryName || undefined,
              },
              "基本情報",
            )
          }
          view={
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <Field label="電話" value={customer.phone} mono />
              <Field label="メール" value={customer.email} />
              <Field label="生年月日" value={formatDateLong(customer.birthDate)} />
              <Field label="居住地" value={customer.residencePrefecture} />
              <Field label="住所" value={customer.address} className="sm:col-span-2" />
              {/* 発注書に毎回入れる文字。人に紐づくので票ではなくここに置く */}
              <Field label="ネーム刺繍" value={customer.embroideryName} />
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

        {/* ── 勤務先 ── */}
        <EditableSection
          title="勤務先"
          initial={() => ({
            companyName: customer.companyName ?? "",
            department: customer.department ?? "",
            jobTitle: customer.jobTitle ?? "",
            industry: customer.industry ?? "",
            // 選択肢に無い業種が入っている顧客は、開いた時点で自由記述側にしておく
            industryFree: !!customer.industry && !isKnownIndustry(customer.industry),
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
              {/* 業種は絞り込みのキーなので選択肢から選ばせる。
                  表記が揺れると同じ業界の顧客がまとまらないため。
                  ただし選択肢に無い勤務先は必ず出るので、その他で自由記述も残す */}
              <FormField label="業種">
                <Select
                  value={v.industryFree ? OTHER_INDUSTRY : v.industry || NO_INDUSTRY}
                  onValueChange={(next) =>
                    set(
                      next === OTHER_INDUSTRY
                        ? { industryFree: true, industry: "" }
                        : { industryFree: false, industry: next === NO_INDUSTRY ? "" : next },
                    )
                  }
                >
                  <SelectTrigger className={`${INPUT} w-full`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_INDUSTRY}>未設定</SelectItem>
                    {INDUSTRIES.map((i) => (
                      <SelectItem key={i} value={i}>
                        {i}
                      </SelectItem>
                    ))}
                    <SelectItem value={OTHER_INDUSTRY}>その他（自由記述）</SelectItem>
                  </SelectContent>
                </Select>
                {v.industryFree && (
                  <Input
                    value={v.industry}
                    onChange={(e) => set({ industry: e.target.value })}
                    placeholder="業種を入力"
                    className={`${INPUT} mt-2`}
                  />
                )}
              </FormField>
            </div>
          )}
        />

        {/* ── からだ ── */}
        {/*
          仕立ての前提になる 4 項目。持ち場は 2 つに分かれる。

          利き手・利き足は生涯変わらないので顧客の列。身長・体重は時間で動くので
          採寸票の属性で、ここでは**最新の 1 枚を読むだけ**にしてある。
          両方をここで編集できるようにすると同じ数字が 2 箇所に入り、
          どちらが正か分からなくなる（採寸履歴があるのに古い値が上に出る、が起きる）。
        */}
        <BodySection customer={customer} onSave={save} />

        {/* ── パーソナル ── */}
        {/*
          チップは表示だけ。「＋」で足せるが、消す口は下の「メモ」に 1 つだけ置いてある。
          同じ 1 行に入り口を 2 つ作ると、どちらで消したのかが分からなくなる。
        */}
        <EditableSection
          title="パーソナル"
          className="lg:col-span-2"
          initial={() => ({ familyInfo: customer.familyInfo ?? "" })}
          onSave={(v) => save({ familyInfo: v.familyInfo || undefined }, "家族構成")}
          view={
            <div className="flex flex-col gap-4 pt-1">
              <PersonalityPanel customerId={customer.id} />
              {/* 分解しない。「長男がいる人」を全員引く場面が無いうえ、年齢は時間で古びる */}
              <Field label="家族構成" value={customer.familyInfo} />
            </div>
          }
          edit={(v, set) => (
            <FormField label="家族構成">
              <Input
                value={v.familyInfo}
                onChange={(e) => set({ familyInfo: e.target.value })}
                className={INPUT}
              />
            </FormField>
          )}
        />

        {/* ── 記念日 ── */}
        {/*
          誕生日の行は基本情報の生年月日から DB のトリガーが作る。ここで消せるが、
          生年月日を次に編集したときに作り直される。

          id を落とさずに渡すのが要点。落とすと saveAnniversaries が全行を
          delete + insert し、uuid が振り直される。approach_resolutions が
          anniversary:{id}:{年} で解決を覚えているので、スキップした誕生日の判断が
          結婚記念日へ移る、といった無音の誤りが起きる。
        */}
        <EditableSection
          title="記念日"
          initial={() =>
            (anniversaries ?? []).map((a) => ({
              // 「足す」で増えた行にはまだ id が無い。saveAnniversaries はそれを
              // 新規として扱う（id?: Uuid を受ける設計になっている）
              id: a.id as Uuid | undefined,
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
                onClick={() =>
                  setAll([...entries, { id: undefined, type: "other", date: "", label: "" }])
                }
              >
                <Plus className="size-3.5" />
                記念日を追加
              </Button>
            </div>
          )}
        />

        {/*
          メモ — ラベルの付いていない走り書きも、付いている行もここに並ぶ。
          もとは textarea 1 枚で、上書きすると前の内容が消えていた。
          追記式にしたので日付と書いた人が残る。

          営業管理（初回来店日・流入経路・タグ）は畳んだ。3 つとも表示専用で、
          集計にもトリガーにも出てこなかった。紹介は「高橋様のご紹介」と
          ここへ書けば、確定検索の全文一致で引ける。
        */}
        <section className="flex flex-col gap-1 lg:col-span-2">
          <div className="flex items-center gap-2 border-b border-border pb-1.5">
            <span className="h-3 w-0.5 shrink-0 bg-brand" />
            <h3 className="flex-1 font-heading text-sm font-medium tracking-wide">メモ</h3>
          </div>
          <div className="pt-2">
            <RecordsPanel customerId={customer.id} />
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * からだ。仕立ての前提になる 4 項目を 1 箇所に集める。
 *
 * 利き手・利き足は編集でき、身長・体重は読むだけ。同じ枠に編集できる項目と
 * できない項目が混ざるので、身長・体重には測った日を必ず添えて「これは採寸票の値だ」と
 * 分かるようにし、直しに行く先も書いておく。
 */
function BodySection({
  customer,
  onSave,
}: {
  customer: CustomerListItem;
  onSave: (patch: Parameters<typeof updateCustomer>[1], label: string) => Promise<void>;
}) {
  const bodyLoader = useCallback(() => getLatestBodyMetrics(customer.id), [customer.id]);
  const { data: body } = useQuery(bodyLoader, [customer.id]);

  const measured = body?.measuredAt ? `${formatDateDot(body.measuredAt)} 採寸` : undefined;

  return (
    <EditableSection
      title="からだ"
      initial={() => ({
        dominantHand: customer.dominantHand ?? NO_SIDE,
        dominantFoot: customer.dominantFoot ?? NO_SIDE,
      })}
      onSave={(v) =>
        onSave(
          {
            // 番兵は「未設定に戻す」。EditableSection の値は string に均されるので、
            // 番兵を除いた残りが DominantSide であることをここで示す
            dominantHand: v.dominantHand === NO_SIDE ? undefined : (v.dominantHand as DominantSide),
            dominantFoot: v.dominantFoot === NO_SIDE ? undefined : (v.dominantFoot as DominantSide),
          },
          "からだ",
        )
      }
      view={
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          <Field
            label="利き手"
            value={customer.dominantHand && DOMINANT_SIDE_LABEL[customer.dominantHand]}
          />
          <Field
            label="利き足"
            value={customer.dominantFoot && DOMINANT_SIDE_LABEL[customer.dominantFoot]}
          />
          {/* 採寸票の値。いつ測ったかが分からない身長体重は、目の前の人に
              当てはまるのか判断できないので、日付を外さない */}
          <Field
            label={measured ? `身長（${measured}）` : "身長"}
            value={body?.heightCm !== undefined ? `${body.heightCm} cm` : undefined}
            mono
          />
          <Field
            label={measured ? `体重（${measured}）` : "体重"}
            value={body?.weightKg !== undefined ? `${body.weightKg} kg` : undefined}
            mono
          />
        </div>
      }
      edit={(v, set) => (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            <SideField
              label="利き手"
              value={v.dominantHand}
              onChange={(next) => set({ dominantHand: next })}
            />
            <SideField
              label="利き足"
              value={v.dominantFoot}
              onChange={(next) => set({ dominantFoot: next })}
            />
          </div>
          {/* ここで身長・体重も直せるようにすると、採寸票の値と 2 箇所に分かれる。
              直す先を 1 つに保ったまま、どこへ行けばよいかだけを伝える */}
          <p className="text-sm text-muted-foreground">
            身長・体重は採寸票に入ります。右上のシルエットから採寸を開いて入力してください。
          </p>
        </div>
      )}
    />
  );
}

/** 右 / 左 / 未設定。Select は空文字を値に取れないので番兵を置く */
function SideField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: DominantSide | typeof NO_SIDE) => void;
}) {
  return (
    <FormField label={label}>
      <Select value={value} onValueChange={(next) => onChange(next as DominantSide)}>
        <SelectTrigger className={`${INPUT} w-full`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_SIDE}>未設定</SelectItem>
          {/* 「両利き」は入れない。仕立てはどちらかに合わせて 1 つ決める必要があり、
              決めていないことが決めた顔をして残るのを避ける */}
          <SelectItem value="right">{DOMINANT_SIDE_LABEL.right}</SelectItem>
          <SelectItem value="left">{DOMINANT_SIDE_LABEL.left}</SelectItem>
        </SelectContent>
      </Select>
    </FormField>
  );
}
