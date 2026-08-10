"use client";

import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AgentAction, AgentCustomerRef } from "@/lib/types";
import { splitHobbies } from "@/lib/ai/agent-tools";
import { cn } from "@/lib/utils";

/**
 * アシスタントの提案。
 *
 * 書き込む前に必ずここを一度見せる。名刺・発注書の読み取りと同じで、
 * AI が出したものを黙って保存はしない。趣味は接客の材料として使うものなので、
 * 聞き違いがそのまま残ると次の接客で外す。
 */
export function AgentActionCard({
  action,
  applied,
  onApply,
  onPickCustomer,
  onNavigate,
}: {
  action: AgentAction;
  applied: boolean;
  onApply: () => Promise<void> | void;
  onPickCustomer: (customer: AgentCustomerRef, hobbies: string[]) => void;
  /** カルテへ移る。スマホは全画面なので、閉じてから進む順序をパネル側が握る */
  onNavigate: (href: string) => void;
}) {
  const [applying, setApplying] = useState(false);

  if (action.kind === "add_hobby") {
    const before = splitHobbies(action.before);
    return (
      <div className="flex flex-col gap-3 rounded-md border border-brand/25 bg-accent/40 p-3">
        <div className="flex flex-col gap-1">
          <span className="field-label">趣味に追加</span>
          <span className="text-sm font-medium">{action.customer.name} 様</span>
        </div>

        <div className="flex flex-wrap gap-1">
          {before.map((hobby) => (
            <Badge key={hobby} variant="secondary" className="font-normal">
              {hobby}
            </Badge>
          ))}
          {action.added.map((hobby) => (
            // 増える分だけ塗る。どこが変わるのかを見た瞬間に分かるように
            <Badge key={hobby} className="bg-brand-fill font-normal text-primary-foreground">
              ＋{hobby}
            </Badge>
          ))}
        </div>

        {applied ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Check className="size-3.5" />
            カルテに残しました
          </span>
        ) : (
          <div className="flex gap-2">
            <Button
              className="h-11 flex-1 sm:h-9"
              disabled={applying}
              onClick={async () => {
                setApplying(true);
                await onApply();
                setApplying(false);
              }}
            >
              {applying ? "保存中…" : "適用する"}
            </Button>
            <Button
              variant="ghost"
              className="h-11 sm:h-9"
              disabled={applying}
              onClick={() => onNavigate(`/customers/${action.customer.id}`)}
            >
              カルテを開く
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (action.kind === "search_result") {
    return (
      <ul className="flex flex-col gap-2">
        {action.customers.map((customer) => (
          <li key={customer.id}>
            <CustomerRow customer={customer} highlight={action.keyword} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-brand/25 bg-accent/40 p-3">
      <span className="field-label">どちらの{action.keyword}さんですか</span>
      <ul className="flex flex-col gap-2">
        {action.candidates.map((customer) => (
          <li key={customer.id}>
            <button
              type="button"
              onClick={() => onPickCustomer(customer, action.pendingHobbies)}
              className="flex min-h-11 w-full items-center gap-3 rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-brand/40 active:bg-accent/40"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">{customer.name}</span>
                <span className="truncate text-xs text-muted-foreground">{customer.nameKana}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 検索結果の 1 行。顧客一覧のスマホ版カードと同じ見た目にして、別物に見せない。
 *
 * Link ではなく button なのは、スマホでは「パネルを閉じてから進む」順序を
 * 守る必要があり、素の遷移と混ぜると打ち消し合うため（agent-panel.tsx を参照）。
 */
function CustomerRow({
  customer,
  highlight,
  onNavigate,
}: {
  customer: AgentCustomerRef;
  highlight: string;
  onNavigate: (href: string) => void;
}) {
  const hobbies = splitHobbies(customer.hobbies);
  return (
    <button
      type="button"
      onClick={() => onNavigate(`/customers/${customer.id}`)}
      className="flex min-h-11 w-full items-center gap-3 rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-brand/40 active:bg-accent/40"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-medium">{customer.name}</span>
        <span className="flex flex-wrap gap-1">
          {hobbies.map((hobby) => (
            // 引いた理由になった趣味だけ塗る。並べただけでは何が当たったか分からない
            <Badge
              key={hobby}
              variant="secondary"
              className={cn(
                "font-normal",
                hobby.includes(highlight) && "bg-brand-fill text-primary-foreground",
              )}
            >
              {hobby}
            </Badge>
          ))}
        </span>
      </div>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
