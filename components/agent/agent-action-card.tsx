"use client";

import { useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useOrderDraft } from "@/components/order/order-draft-provider";
import type { AgentAction, AgentCustomerRef } from "@/lib/types";
import { isMemoOnly } from "@/lib/ai/action-sentence";
import { DOMINANT_SIDE_LABEL } from "@/lib/constants/customer-fields";
import { ORDER_PURPOSE_LABEL } from "@/lib/constants/labels";
import { ITEM_TYPE_MAP } from "@/lib/constants/measurement-fields";
import { cn } from "@/lib/utils";
import { formatAmount, formatDateDot } from "@/lib/utils/date";

/** この店でまだ使われていない語か。適用するまで fact_labels には入らない */
function isNewWord(action: AgentAction, name: string): boolean {
  return action.kind === "add_fact" && action.newLabelNames.includes(name);
}

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
  const { setOrderDraft } = useOrderDraft();

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

  if (action.kind === "order_list") {
    const shown = expanded ? action.orders : action.orders.slice(0, LIST_PREVIEW);
    const hidden = action.orders.length - shown.length;
    return (
      <div className="flex flex-col gap-3">
        {/* **注文の数と人の数を両方出す。**片方だけだと「今月何件？」と
            「今月何人？」の答えが同じ数字に見える。合計額も並べる */}
        <span className="field-label">
          {action.countMeans} — {action.orderCount} 件 / {action.customerCount} 名 /{" "}
          {formatAmount(action.totalAmount)}
        </span>

        {/* 引けなかった分を黙らせない。生地は色名の部分一致でしか引けないので、
            紙に生地名が無い注文は静かに落ちる（色系統の列を持たない判断の帰結） */}
        {action.fabricUnknownCount > 0 && (
          <span className="text-xs text-muted-foreground">
            ほかに、生地名が入っていない注文が {action.fabricUnknownCount} 件あります。
          </span>
        )}

        <ul className="flex flex-col gap-2">
          {shown.map((order) => (
            <li key={order.orderId}>
              <OrderRow order={order} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>

        {hidden > 0 && (
          <Button variant="ghost" className="h-11 sm:h-9" onClick={() => setExpanded(true)}>
            残り {hidden} 件を見る
          </Button>
        )}
      </div>
    );
  }

  if (action.kind === "revenue") {
    return (
      <div className="flex flex-col gap-3">
        {/* 何をどう数えた数字かを先に出す。金額は「どの範囲の」で意味が変わる */}
        <span className="field-label">
          {action.scopeLabel} — {action.countsBy}
        </span>

        <ul className="flex flex-col gap-1.5">
          {action.months.map((m) => (
            <li key={m.month} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="tnum w-16 shrink-0 font-mono text-xs text-muted-foreground">
                {m.month}
              </span>
              <span className="tnum font-mono text-sm font-medium">
                {formatAmount(m.revenue)}
              </span>
              <span className="text-xs text-muted-foreground">{m.orderCount} 件</span>
              {/* 目標は自分の担当のときだけ。店全体では扱わない */}
              {m.target != null && m.rate != null && (
                <span className="text-xs text-muted-foreground">
                  目標 {formatAmount(m.target)} / {Math.round(m.rate * 100)}%
                </span>
              )}
              {/* 今月は途中なので、月の進み具合を添える。
                  README「図から読めることは書かない」に従い、
                  「順調です」のような判断の文は置かない */}
              {m.isCurrent && (
                <span className="text-xs text-muted-foreground">
                  （今月・{Math.round(m.monthProgress * 100)}% 経過）
                </span>
              )}
            </li>
          ))}
        </ul>

        {/* 店全体のときだけ。**どの期間の内訳かを必ず添える** */}
        {action.byStaff && action.byStaff.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="field-label">{action.byStaffMeans ?? "スタッフ別"}</span>
            <ul className="flex flex-col gap-1">
              {action.byStaff.map((b) => (
                <li key={b.staffName} className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm">{b.staffName}</span>
                  <span className="tnum shrink-0 font-mono text-sm">
                    {formatAmount(b.revenue)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="button"
          onClick={() => onNavigate("/dashboard")}
          className="w-fit text-xs text-brand underline-offset-4 hover:underline"
        >
          ダッシュボードで見る
        </button>
      </div>
    );
  }

  if (action.kind === "order_draft") {
    const d = action.draft;
    return (
      <div className="flex flex-col gap-3 rounded-md border border-brand/25 bg-accent/40 p-3">
        <div className="flex flex-col gap-1">
          {/* **「注文を登録する」と書かない。**押した瞬間に書き込まれる他のカードと
              同じに見えると、承認が演劇になる。ここで起きるのは画面が開くことだけ */}
          <span className="field-label">注文の登録へ進む</span>
          <span className="text-sm font-medium">{action.customer.name} 様</span>
          {action.subjectFrom !== "spoken_name" && (
            <span className="text-xs text-muted-foreground">
              {ORIGIN_NOTE[action.subjectFrom]}
            </span>
          )}
        </div>

        {/* 拾えたものを並べる。**金額は無い** — 紙にも会話にも無い項目なので、
            ここに空欄として出しても埋められない */}
        <dl className="flex flex-col gap-1 text-sm">
          {d.orderedAt && (
            <div className="flex items-baseline gap-2">
              <dt className="field-label">受注日</dt>
              <dd>{formatDateDot(d.orderedAt)}</dd>
            </div>
          )}
          {d.items && d.items.length > 0 && (
            <div className="flex items-baseline gap-2">
              <dt className="field-label">アイテム</dt>
              <dd>{d.items.map((i) => ITEM_LABEL[i] ?? i).join("・")}</dd>
            </div>
          )}
          {d.fabric?.fabricColorName && (
            <div className="flex items-baseline gap-2">
              <dt className="field-label">生地</dt>
              <dd>{d.fabric.fabricColorName}</dd>
            </div>
          )}
          {d.purpose && (
            <div className="flex items-baseline gap-2">
              <dt className="field-label">用途</dt>
              <dd>{ORDER_PURPOSE_LABEL[d.purpose]}</dd>
            </div>
          )}
        </dl>

        {action.quote && (
          <span className="text-xs text-muted-foreground">「{action.quote}」より</span>
        )}

        <Button
          className="h-11 w-full sm:h-9 sm:w-fit"
          onClick={() => {
            setOrderDraft({
              // 中身が同じ下書きを 2 回渡されても取り違えないための id。
              // ここでしか作らないので、カードごとに 1 つで足りる
              id: `${action.customer.id}:${action.quote ?? ""}:${Object.keys(d).join(",")}`,
              customerId: action.customer.id,
              orderedAt: d.orderedAt,
              arrivedAt: d.arrivedAt,
              purpose: d.purpose,
              items: d.items,
              fabric: d.fabric,
              quote: action.quote,
            });
            onNavigate(`/customers/${action.customer.id}?order=new`);
          }}
        >
          注文の登録へ
        </Button>
        {/* 何が足りないのかを先に言う。開いてから気づくと、聞き直しになる */}
        <span className="text-xs text-muted-foreground">
          金額（税込）は画面で入れてください。ここではまだ登録されません。
        </span>
      </div>
    );
  }

  if (action.kind === "ask") {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-brand/25 bg-accent/40 p-3">
        {/* 質問文はここに出さない。返答の吹き出しが同じ文（actionSentence が
            action.question を返す）なので、並べると同じ問いが 2 回出る */}
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

  const keep = action.kind === "add_fact"
    ? action.labelNames.filter((n) => !dropped.includes(n))
    : [];
  // **押したときに渡すものを先に組む。**見出しもこれを見る。
  // 「見せた行き先」と「書き込む行き先」が別の式から出ていると、静かにずれる
  // （メモに入ったのにトーストだけ「パーソナルに残しました」と言っていた）
  const edited: AgentAction =
    action.kind === "add_fact"
      ? { ...action, labelNames: keep, promotedWords: promoted }
      : action;
  // 見出しは**いまの行き先**に合わせる。トグルを入れた瞬間に「メモに追加」から
  // 「パーソナルに追加」へ変わる。押す前に、どこへ入るかが見出しで分かる
  const label = isMemoOnly(edited) ? "メモに追加" : PROPOSAL_LABELS[action.kind];

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
      onApply={() => onApply(edited)}
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
            {/* 語として立つものだけを＋で出す。新語はトグルを入れるまでメモなので、
                ここに出すと「パーソナルに入る」と読めてしまう（実際そう読まれた）。
                トグルを入れるとこの行に増えるので、何が起きるかが目で追える */}
            {action.labelNames.filter((l) => !isNewWord(action, l) || promoted.includes(l)).map((l) => {
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
              「ゴルフが趣味な人」を引くための軸として役に立たなくなるため。
              **「語にする」では何が起きるか分からない**と言われたので、
              起きること（パーソナルに追加される）をそのまま見出しにしてある */}
          {action.newLabelNames.filter((n) => keep.includes(n)).length > 0 && !applied && (
            <div className="flex flex-col gap-2">
              {action.newLabelNames
                .filter((n) => keep.includes(n))
                .map((n) => {
                  const on = promoted.includes(n);
                  return (
                    <Switch
                      key={n}
                      checked={on}
                      onCheckedChange={() =>
                        setPromoted((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]))
                      }
                    >
                      <span className="truncate text-sm font-medium">
                        「{n}」をパーソナルに追加
                      </span>
                      {/* オフのままだと何が残るのかを書く。「残らない」と読まれない */}
                      <span className="text-xs text-muted-foreground">
                        {on
                          ? "ほかのお客様にも付けられるようになります"
                          : "オフのままなら、メモとして残ります"}
                      </span>
                    </Switch>
                  );
                })}
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
                <span className="text-muted-foreground line-through">
                  {fieldValueLabel(c.field, c.before) || "（空）"}
                </span>
                <ArrowRight className="size-3 text-muted-foreground" />
                <span className="font-medium">{fieldValueLabel(c.field, c.after)}</span>
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

/**
 * 差分に出す値の見せ方。
 *
 * 利き手・利き足は DB では right / left で持っているが、そのまま出すと
 * 「right → left」と読ませることになる。押す前に何が変わるか分かることが
 * このカードの役目なので、ここで日本語に直す（適用する値は変えない）。
 */
function fieldValueLabel(field: string, value: string | undefined): string {
  if (value === undefined) return "";
  if (field !== "dominantHand" && field !== "dominantFoot") return value;
  return DOMINANT_SIDE_LABEL[value as keyof typeof DOMINANT_SIDE_LABEL] ?? value;
}

const PROPOSAL_LABELS: Record<string, string> = {
  // 語が付いた行は、パーソナルのチップとメモの両方に出る（同じ 1 行）。
  // 片方だけ書くと、もう片方を探さない
  add_fact: "パーソナルとメモに追加",
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
/** アイテムの表示名。マスタ（lib/constants/measurement-fields.ts）から引く */
const ITEM_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(ITEM_TYPE_MAP).map(([id, t]) => [id, t.name]),
);

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

/**
 * 注文 1 件の行。
 *
 * CustomerRow を流用しない。**見たいものが違う** — あちらは「誰か」で、
 * こちらは「いつ・いくら・何の生地か」。飛び先も注文履歴タブにする。
 */
function OrderRow({
  order,
  onNavigate,
}: {
  order: Extract<AgentAction, { kind: "order_list" }>["orders"][number];
  onNavigate: (href: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(`/customers/${order.customer.id}?tab=orders`)}
      className="flex min-h-11 w-full items-center gap-3 rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-brand/40 active:bg-accent/40"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="truncate text-sm font-medium">{order.customer.name}</span>
          <span className="tnum font-mono text-xs text-muted-foreground">
            {order.orderNumber}
          </span>
        </span>
        <span className="flex flex-wrap items-baseline gap-x-3 text-xs text-muted-foreground">
          {order.deliveryDate && (
            <span>
              {/* **予定と実績を同じ見た目にしない。**まだ渡していない日付を
                  「お渡し」と書くと、渡した相手として扱われる */}
              {order.deliveryIsPlanned ? "お渡し予定 " : "お渡し "}
              {formatDateDot(order.deliveryDate)}
            </span>
          )}
          {order.fabricColorName && <span className="truncate">{order.fabricColorName}</span>}
        </span>
      </div>
      <span className="tnum shrink-0 font-mono text-sm">{formatAmount(order.totalAmount)}</span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
