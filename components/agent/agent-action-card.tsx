"use client";

import { useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AgentAction, AgentCustomerRef } from "@/lib/types";
import { isMemoOnly } from "@/lib/ai/action-sentence";
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
  rejected,
  onApply,
  onReject,
  onAnswer,
  onNavigate,
}: {
  action: AgentAction;
  applied: boolean;
  rejected: boolean;
  /** カードの上で外した分を反映した action が渡る（部分承認） */
  onApply: (action: AgentAction) => Promise<void> | void;
  /** 「違う」。書き込みは起きず、判断だけ残る */
  onReject: () => Promise<void> | void;
  /** 選択肢が押されたとき。その文がそのまま次の発話になる */
  onAnswer: (answer: string) => void;
  /** カルテへ移る。スマホは全画面なので、閉じてから進む順序をパネル側が握る */
  onNavigate: (href: string) => void;
}) {
  // 適用対象から外した語。**チェックボックスを足さない** — 既に出している
  // Badge をタップで灰色に落とすだけで、新しい UI 要素をゼロ個で部分承認が入る。
  const [dropped, setDropped] = useState<string[]>([]);
  // 「語として登録」を押した新語。**既定は空** — 新しい語は走り書きのまま残る
  const [promoted, setPromoted] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);

  if (action.kind === "search_result") {
    // 大きい一覧は畳む。**落としているのではなく畳んでいる**と機械が言い切るので、
    // 「見えていない分がある」という不安は残らない（否定検索だと 300 人中 297 人になる）
    const shown = expanded ? action.customers : action.customers.slice(0, LIST_PREVIEW);
    const hidden = action.customers.length - shown.length;
    return (
      <div className="flex flex-col gap-3">
        {/* 件数は一覧と別に出す。「12 名」と言い切れることがこの検索の存在理由で、
            並べた数を人に数え直させない。**何の数かも一緒に出す** —
            「両方」と「いずれか」で同じ文言になると、取り違えに誰も気づけない */}
        <span className="field-label">
          {action.keyword
            ? `${action.keyword}の${action.match === "all" ? "全部" : "いずれか"}`
            : ""}
          {action.excluded?.length ? `（${action.excluded.join("・")}を除く）` : ""}
          {action.keyword || action.excluded?.length ? " — " : ""}
          該当 {action.exactCount} 名
        </span>
        <ul className="flex flex-col gap-2">
          {shown.map((customer) => (
            <li key={customer.id}>
              <CustomerRow customer={customer} highlight={action.keyword} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>

        {hidden > 0 && (
          <Button variant="ghost" className="h-11 sm:h-9" onClick={() => setExpanded(true)}>
            残り {hidden} 名を見る
          </Button>
        )}

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

  if (action.kind === "ask") {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-brand/25 bg-accent/40 p-3">
        <span className="text-sm">{action.question}</span>
        {/* 選択肢はそのまま答えになる文。押すと次の発話として送られるので、
            打ち直させない（片手で操作していることを前提にする） */}
        <ul className="flex flex-col gap-2">
          {action.options.map((option) => (
            <li key={option.answer}>
              <button
                type="button"
                onClick={() => onAnswer(option.answer)}
                className="flex min-h-11 w-full items-center gap-3 rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-brand/40 active:bg-accent/40"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">{option.answer}</span>
                  {option.hint && (
                    <span className="truncate text-xs text-muted-foreground">{option.hint}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // 見出しも実際の行き先に合わせる。新しい語しか無ければ、入るのはメモ
  const label = isMemoOnly(action) ? "メモに追加" : PROPOSAL_LABELS[action.kind];
  const keep = action.kind === "add_fact"
    ? action.labelNames.filter((n) => !dropped.includes(n))
    : [];

  return (
    <Proposal
      title={label}
      customer={action.customer}
      subjectFrom={action.subjectFrom}
      quote={action.quote}
      applied={applied}
      rejected={rejected}
      onReject={onReject}
      disabled={action.kind === "add_fact" && keep.length === 0}
      onApply={() =>
        onApply(
          action.kind === "add_fact"
            ? { ...action, labelNames: keep, promotedWords: promoted }
            : action,
        )
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
          {/* 新しい語は既定で走り書きのまま。店で共有する語彙にするかは人が決める。
              1 人にしか当てはまらない語（屋号・その人だけの肩書き）が混ざると、
              「ゴルフが趣味な人」を引くための軸として役に立たなくなるため */}
          {action.newLabelNames.filter((n) => keep.includes(n)).length > 0 && !applied && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">
                下の語は、この店でまだ使われていません。このままならメモとして残ります。
              </span>
              <div className="flex flex-wrap gap-1">
                {action.newLabelNames
                  .filter((n) => keep.includes(n))
                  .map((n) => {
                    const on = promoted.includes(n);
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() =>
                          setPromoted((p) =>
                            p.includes(n) ? p.filter((x) => x !== n) : [...p, n],
                          )
                        }
                      >
                        <Badge
                          variant={on ? "default" : "outline"}
                          className={cn("font-normal", on && "bg-brand-fill text-primary-foreground")}
                        >
                          {on ? `${n} を語として登録` : `${n} を語にする`}
                        </Badge>
                      </button>
                    );
                  })}
              </div>
            </div>
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

/** 最初に見せる人数。スマホの親指で流せる長さに抑える */
const LIST_PREVIEW = 5;

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
const ORIGIN_NOTE: Record<string, string> = {
  open_karte: "いま開いているカルテから",
  recent_topic: "さきほどの話から",
};

function Proposal({
  title,
  customer,
  subjectFrom,
  quote,
  applied,
  rejected,
  disabled,
  onApply,
  onReject,
  onNavigate,
  children,
}: {
  title: string;
  customer: AgentCustomerRef;
  subjectFrom?: string;
  quote?: string;
  applied: boolean;
  rejected: boolean;
  disabled?: boolean;
  onApply: () => Promise<void> | void;
  onReject: () => Promise<void> | void;
  onNavigate: (href: string) => void;
  children: React.ReactNode;
}) {
  const [applying, setApplying] = useState(false);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-brand/25 bg-accent/40 p-3">
      <div className="flex flex-col gap-1">
        <span className="field-label">{title}</span>
        <span className="text-sm font-medium">{customer.name} 様</span>
        {/* どうやってこの人だと決めたか。名前を言われていないときこそ効く */}
        {subjectFrom && subjectFrom !== "spoken_name" && (
          <span className="text-xs text-muted-foreground">{ORIGIN_NOTE[subjectFrom]}</span>
        )}
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
      ) : rejected ? (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <X className="size-3.5" />
          見送りました
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
          {/* 「違う」の口。押されずに流れた提案と、見て違うと判断した提案は別物で、
              後者だけが精度を直すための材料になる */}
          <Button
            variant="ghost"
            className="h-11 sm:h-9"
            disabled={applying}
            onClick={() => onReject()}
          >
            違う
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="カルテを開く"
            className="size-11 shrink-0 sm:size-9"
            disabled={applying}
            onClick={() => onNavigate(`/customers/${customer.id}`)}
          >
            <ArrowRight className="size-4" />
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
