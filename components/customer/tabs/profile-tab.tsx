"use client";

import { useCallback } from "react";
import { AlertTriangle } from "lucide-react";

import { EmptyState, Field, SectionTitle } from "@/components/common/field";
import { Badge } from "@/components/ui/badge";
import { ANNIVERSARY_LABEL } from "@/lib/constants/labels";
import { listAnniversaries } from "@/lib/data/customers";
import type { CustomerListItem } from "@/lib/data/customers";
import { useMockQuery } from "@/lib/hooks/use-mock-db";
import { daysUntilNextAnniversary, formatDateLong } from "@/lib/utils/date";

export function ProfileTab({ customer }: { customer: CustomerListItem }) {
  const loader = useCallback(() => listAnniversaries(customer.id), [customer.id]);
  const { data: anniversaries } = useMockQuery(loader, [customer.id]);

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
        <section className="flex flex-col gap-1">
          <SectionTitle>連絡先</SectionTitle>
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
            <Field label="住所" value={customer.address} className="sm:col-span-2" />
          </div>
        </section>

        <section className="flex flex-col gap-1">
          <SectionTitle>勤務先</SectionTitle>
          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            <Field label="会社名" value={customer.companyName} className="sm:col-span-2" />
            <Field label="法人番号" value={customer.corporateNumber} mono />
            <Field
              label="上場区分"
              value={
                customer.listingStatus
                  ? customer.listingStatus === "listed"
                    ? "上場"
                    : "非上場"
                  : undefined
              }
            />
            <Field label="部署" value={customer.department} />
            <Field label="役職" value={customer.jobTitle} />
            <Field label="業種" value={customer.industry} />
          </div>
        </section>

        <section className="flex flex-col gap-1">
          <SectionTitle>パーソナル</SectionTitle>
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
          </div>
        </section>

        <section className="flex flex-col gap-1">
          <SectionTitle>記念日</SectionTitle>
          {anniversaries && anniversaries.length > 0 ? (
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
          )}
        </section>

        <section className="flex flex-col gap-1">
          <SectionTitle>営業管理</SectionTitle>
          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            <Field label="担当スタッフ" value={customer.staffName} />
            <Field label="初回来店日" value={formatDateLong(customer.firstVisitDate)} />
            <Field label="流入経路" value={customer.acquisitionChannel} />
            <Field
              label="重要顧客"
              value={customer.isKeyAccount ? "対象（ニュース巡回あり）" : "対象外"}
            />
            <Field
              label="タグ"
              value={customer.tags?.length ? <ChipList items={customer.tags} /> : undefined}
            />
          </div>
        </section>

        <section className="flex flex-col gap-1">
          <SectionTitle>メモ</SectionTitle>
          {customer.memo ? (
            <p className="py-2 text-sm leading-relaxed">{customer.memo}</p>
          ) : (
            <p className="py-3 text-sm text-muted-foreground">記載なし</p>
          )}
        </section>
      </div>

      {!customer.companyName && !customer.hobbies && (
        <EmptyState>
          この顧客はまだ氏名と連絡先しか登録されていません。次回来店時に少しずつ埋めていく想定です。
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
