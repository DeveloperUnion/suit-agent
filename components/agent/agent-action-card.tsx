"use client";

import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AgentAction, AgentCustomerRef } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * アシスタントの提案。
 *
 * 書き込む前に必ずここを一度見せる。名刺・発注書の読み取りと同じで、
 * AI が出したものを黙って保存はしない。趣味は接客の材料として使うものなので、
 * 聞き違いがそのまま残ると次の接客で外す。
 *
 * カードに出す値は、モデルの散文ではなく action の構造から直接描く。
 * 要約を見せて別のものを書き込むと、承認が演劇になる。
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
  /** カードの上で外した分を反映した action が渡る（部分承認） */
  onApply: (action: AgentAction) => Promise<void> | void;
  onPickCustomer: (customer: AgentCustomerRef) => void;
  /** カルテへ移る。スマホは全画面なので、閉じてから進む順序をパネル側が握る */
  onNavigate: (href: string) => void;
}) {
  // 適用対象から外した語。**チェックボックスを足さない** — 既に出している
  // Badge をタップで灰色に落とすだけで、新しい UI 要素をゼロ個で部分承認が入る。
  const [dropped, setDropped] = useState<string[]>([]);

  if (action.kind === "search_result") {
    return (
      <div className="flex flex-col gap-3">
        {/* 件数は一覧と別に出す。「12 名」と言い切れることがこの検索の存在理由で、
            並べた数を人に数え直させない */}
        <span className="field-label">
          {action.keyword ? `${action.keyword} — ` : ""}
          該当 {action.exactCount} 名
        </span>
        <ul className="flex flex-col gap-2">
          {action.customers.map((customer) => (
            <li key={customer.id}>
              <CustomerRow customer={customer} highlight={action.keyword} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>

        {/* 「近いもの」は該当者ではない。枠を分けて、そう書く */}
        {action.similar && action.similar.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="field-label">近いかもしれない方</span>
            <ul className="flex flex-col gap-2">
              {action.similar.map((s) => (
                <li key={s.customer.id}>
                  <CustomerRow
                    customer={s.customer}
                    highlight=""
                    note={s.content}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  if (action.kind === "ask_customer") {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-brand/25 bg-accent/40 p-3">
        <span className="field-label">どちらの方ですか</span>
        <ul className="flex flex-col gap-2">
          {action.candidates.map((customer) => (
            <li key={customer.id}>
              <button
                type="button"
                onClick={() => onPickCustomer(customer)}
                className="flex min-h-11 w-full items-center gap-3 rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-brand/40 active:bg-accent/40"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">{customer.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {customer.nameKana}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const label = PROPOSAL_LABELS[action.kind];
  const keep = action.kind === "add_fact"
    ? action.labelNames.filter((n) => !dropped.includes(n))
    : [];

  return (
    <Proposal
      title={label}
      customer={action.customer}
      quote={action.quote}
      applied={applied}
      disabled={action.kind === "add_fact" && keep.length === 0}
      onApply={() =>
        onApply(action.kind === "add_fact" ? { ...action, labelNames: keep } : action)
      }
      onNavigate={onNavigate}
    >
      {action.kind === "add_fact" && (
        <>
          <div className="flex flex-wrap gap-1">
            {action.customer.labels.map((l) => (
              <Badge key={l} variant="secondary" className="font-normal">
                {l}
              </Badge>
            ))}
            {action.labelNames.map((l) => {
              const off = dropped.includes(l);
              return (
                // タップで外せる。「ゴルフとワイン」と聞こえて片方だけ違うのは
                // 並列助詞の切り出しで普通に起きるので、全部捨てて言い直させない
                <button
                  key={l}
                  type="button"
                  disabled={applied}
                  onClick={() =>
                    setDropped((d) => (d.includes(l) ? d.filter((x) => x !== l) : [...d, l]))
                  }
                >
                  <Badge
                    className={cn(
                      "font-normal",
                      off
                        ? "bg-muted text-muted-foreground line-through"
                        : "bg-brand-fill text-primary-foreground",
                    )}
                  >
                    ＋{l}
                  </Badge>
                </button>
              );
            })}
          </div>
          {action.newLabelNames.filter((n) => keep.includes(n)).length > 0 && (
            <span className="text-xs text-muted-foreground">
              {action.newLabelNames.filter((n) => keep.includes(n)).join("・")}{" "}
              は新しい語です。適用すると店舗の一覧に加わります。
            </span>
          )}
          <span className="text-sm">{action.body}</span>
        </>
      )}

      {action.kind === "add_ng_note" && <span className="text-sm">{action.body}</span>}

      {action.kind === "update_customer" && (
        <dl className="flex flex-col gap-1 text-sm">
          {action.changes.map((c) => (
            <div key={c.field} className="flex flex-wrap items-baseline gap-2">
              <dt className="field-label">{c.label}</dt>
              {/* 現在値を必ず出す。何が何に変わるかを見ずに押させない */}
              <dd className="flex items-baseline gap-1.5">
                <span className="text-muted-foreground line-through">{c.before || "（空）"}</span>
                <ArrowRight className="size-3 text-muted-foreground" />
                <span className="font-medium">{c.after}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}

      {action.kind === "add_anniversary" && (
        <span className="text-sm">
          {ANNIVERSARY_LABELS[action.anniversary.type] ?? action.anniversary.label ?? "記念日"}:{" "}
          {action.anniversary.date}
        </span>
      )}

      {action.kind === "invalidate_fact" && (
        <ul className="flex flex-col gap-1 text-sm">
          {action.facts.map((f) => (
            <li key={f.id} className="text-muted-foreground line-through">
              {f.label ? `${f.label} / ` : ""}
              {f.body}
            </li>
          ))}
        </ul>
      )}

      {action.kind === "resolve_approach" && (
        <span className="text-sm">
          本日のアプローチを{action.status === "done" ? "「連絡した」" : "「スキップ」"}にします
        </span>
      )}
    </Proposal>
  );
}

const PROPOSAL_LABELS: Record<string, string> = {
  add_fact: "パーソナルに追加",
  add_ng_note: "注意事項に追加",
  update_customer: "カルテの項目を更新",
  add_anniversary: "記念日を追加",
  invalidate_fact: "記録を無効にする",
  resolve_approach: "アプローチを畳む",
};

const ANNIVERSARY_LABELS: Record<string, string> = {
  birthday: "誕生日",
  first_purchase: "初回購入",
  wedding: "結婚記念日",
};

/** 提案カードの外枠。種類が増えても、見出し・根拠・ボタンの並びは動かさない */
function Proposal({
  title,
  customer,
  quote,
  applied,
  disabled,
  onApply,
  onNavigate,
  children,
}: {
  title: string;
  customer: AgentCustomerRef;
  quote?: string;
  applied: boolean;
  disabled?: boolean;
  onApply: () => Promise<void> | void;
  onNavigate: (href: string) => void;
  children: React.ReactNode;
}) {
  const [applying, setApplying] = useState(false);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-brand/25 bg-accent/40 p-3">
      <div className="flex flex-col gap-1">
        <span className="field-label">{title}</span>
        <span className="text-sm font-medium">{customer.name} 様</span>
      </div>

      {children}

      {/* 何を聞いてそう判断したか。片手で一目見て承認できるようにする。
          発話に含まれない引用はサーバ側で落としてある */}
      {quote && <span className="text-xs text-muted-foreground">「{quote}」より</span>}

      {applied ? (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Check className="size-3.5" />
          カルテに残しました
        </span>
      ) : (
        <div className="flex gap-2">
          <Button
            className="h-11 flex-1 sm:h-9"
            disabled={applying || disabled}
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
            onClick={() => onNavigate(`/customers/${customer.id}`)}
          >
            カルテを開く
          </Button>
        </div>
      )}
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
  note,
  onNavigate,
}: {
  customer: AgentCustomerRef;
  highlight: string;
  note?: string;
  onNavigate: (href: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(`/customers/${customer.id}`)}
      className="flex min-h-11 w-full items-center gap-3 rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-brand/40 active:bg-accent/40"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-medium">{customer.name}</span>
        {note && <span className="truncate text-xs text-muted-foreground">{note}</span>}
        <span className="flex flex-wrap gap-1">
          {customer.labels.map((label) => (
            // 引いた理由になった語だけ塗る。並べただけでは何が当たったか分からない
            <Badge
              key={label}
              variant="secondary"
              className={cn(
                "font-normal",
                highlight !== "" &&
                  highlight.includes(label) &&
                  "bg-brand-fill text-primary-foreground",
              )}
            >
              {label}
            </Badge>
          ))}
        </span>
      </div>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
