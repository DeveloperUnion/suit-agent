"use client";

import { useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";

import type { SimilarCustomer } from "@/lib/data/customers";
import { formatDateDot } from "@/lib/utils/date";
import { cn } from "@/lib/utils";

/**
 * 似た顧客の候補。
 *
 * 顧客1,000名規模では同姓同名と再来店の見落としが必ず起きる。分裂したカルテを
 * 後から統合する手段がこのシステムには無いので、登録の手前で止めるのが唯一の防波堤。
 *
 * 止めるだけでは足りない。「田中 健一」が3人並んだとき、どれが目の前の人かを
 * 判断できなければ結局「別人だろう」で新規登録される。だからカルテの一部
 * （会社名・生年月日・お渡し履歴）を並べて、その場で見分けられるようにしている。
 *
 * 他のスタッフが担当している顧客は氏名・カナ・担当者名しか返ってこない
 * （app.find_similar_customers が意図的に絞っている）。開くこともできないので、
 * 誰に聞けばよいかだけを伝える。
 */
export function SimilarCustomerList({
  candidates,
  onSelect,
  actionLabel,
}: {
  candidates: SimilarCustomer[];
  /** 自分の担当の候補を選んだとき。他スタッフ担当の行は押せない */
  onSelect: (candidate: SimilarCustomer) => void;
  /**
   * 行を押すと何が起きるか。押せることも、押した結果も、行の見た目からは
   * 分からないので必ず書く（取り込みなら「選ぶ」、登録の手前なら「カルテを開く」）。
   */
  actionLabel: string;
}) {
  // 0 件のときは何も描かない。「見つかりませんでした」は、
  // 出したところで人が次に取る行動が変わらない
  if (candidates.length === 0) return null;

  return (
    <ul className="flex max-h-56 flex-col overflow-y-auto rounded-md border border-border">
      {candidates.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            disabled={c.isOtherStaff}
            onClick={() => onSelect(c)}
            className={cn(
              "group flex w-full items-center gap-3 border-b border-border/60 px-3 py-2 text-left",
              "transition-colors last:border-b-0 hover:bg-accent/30",
              "disabled:pointer-events-none disabled:opacity-70",
            )}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="font-medium">{c.name}</span>
                {c.nameKana && (
                  <span className="text-xs text-muted-foreground">{c.nameKana}</span>
                )}
              </span>

              {/* 他人の担当については、存在と担当者しか分からない */}
              {!c.isOtherStaff && <Detail candidate={c} />}
            </span>

            {c.isOtherStaff ? (
              // 開くことも取り込むこともできない。誰に聞けばよいかだけを伝える
              <span className="shrink-0 text-xs text-muted-foreground">
                {c.staffName} が担当
              </span>
            ) : (
              <span className="flex shrink-0 items-center gap-1 text-xs text-brand">
                {actionLabel}
                <ChevronRight className="size-3.5" />
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** 同姓同名を見分けるための材料。空の項目は詰めて出す */
function Detail({ candidate }: { candidate: SimilarCustomer }) {
  const affiliation = [candidate.companyName, candidate.department].filter(Boolean).join(" ");
  const history =
    candidate.lastDeliveredAt !== undefined
      ? `最終お渡し ${formatDateDot(candidate.lastDeliveredAt)}・${candidate.orderCount}件`
      : "お渡し履歴なし";

  return (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {affiliation && <span className="truncate">{affiliation}</span>}
      {candidate.birthDate && (
        <span className="tnum font-mono">{formatDateDot(candidate.birthDate)}生</span>
      )}
      <span className="tnum font-mono">{history}</span>
    </span>
  );
}

/**
 * 別人として登録してよいかの関門。
 *
 * 候補が出ている状態で新規登録に進めるのは、押した人が「別人だ」と判断したときだけ。
 * 既定を「進めない」にしてあるのは、二重登録が起きたあとに直す手段が無いため。
 *
 * find_similar_customers は氏名2文字以上の部分一致で引くので、苗字が同じだけの
 * 別人も候補に上がる。それでも「1件でも出たら止める」にしているのは、
 * 分裂したカルテを後から統合する手段がこのシステムに無いから。迷ったら止める側に倒す。
 *
 * 同意は**そのとき出ていた候補に対してだけ**有効にする。真偽値で持つと、
 * 「田中」で確認したあと氏名を「佐藤」に打ち直したときにチェックが残り、
 * 一度も見ていない候補を承認したことになってしまう。
 */
export function useDifferentPersonGate(candidates: SimilarCustomer[] | undefined) {
  const [acceptedFor, setAcceptedFor] = useState<string | null>(null);

  const list = candidates ?? [];
  const key = list.map((c) => c.id).join(",");
  const found = list.length > 0;

  return {
    /** 候補が出ていて、まだ承認されていない */
    blocked: found && acceptedFor !== key,
    found,
    count: list.length,
    checked: acceptedFor === key,
    setChecked: (next: boolean) => setAcceptedFor(next ? key : null),
    reset: () => setAcceptedFor(null),
  };
}

export function DifferentPersonCheck({
  checked,
  onChange,
  count,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  count: number;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-thread/30 bg-thread/5 p-3">
      <span className="flex items-start gap-1.5 text-sm text-thread">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        似た方が {count}件 見つかっています。同じ方であれば、新しく登録しないでください。
      </span>
      <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="size-4 accent-[var(--brand)]"
        />
        上に出ている方とは別の方です
      </label>
    </div>
  );
}
