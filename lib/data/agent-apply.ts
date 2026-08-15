import type { AgentAction, Customer, Uuid } from "@/lib/types";
import {
  addFact,
  addNgNote,
  createLabel,
  findLabel,
  invalidateFact,
  listLabels,
} from "@/lib/data/facts";
import { factLabelNames, isMemoOnly } from "@/lib/ai/action-sentence";
import { listAnniversaries, saveAnniversaries, updateCustomer } from "@/lib/data/customers";
import { resolveApproach } from "@/lib/data/approaches";
import { factCategoryKey } from "@/lib/constants/facts";

/**
 * 提案を実際に書き込む。**人が「適用」を押したあとにだけ呼ばれる。**
 *
 * ここが「提案 → 適用」機構の効き目の本体。AI が返せるのは AgentAction だけで、
 * 実際に書くのはこのハンドラなので、**ここが実装していない種類の書き込みは
 * 原理的に起こせない。**採寸値に触れるには kind を型に足し、ここに分岐を書き、
 * カードにボタンを出す、という明確な行為が要る。GRANT が「テーブル単位で拒否」
 * なのに対し、こちらはそもそも経路が存在しない。
 *
 * lib/ai/ ではなく lib/data/ に置いてある。ここは会話の解釈ではなく
 * **人が押したあとの書き込み**だから。lib/ai/ からは lib/data/* を import
 * できない（ESLint で禁じている。読み取りが app.search_customers を迂回する
 * 経路を作らせないため）。
 */

export async function applyAgentAction(action: AgentAction): Promise<void> {
  switch (action.kind) {
    case "add_fact": {
      // **新しい語は、既定では語彙にしない。**
      //
      // fact_labels は店で共有される語で、「ゴルフが趣味な人」を全員引くための軸。
      // そこに屋号・社名・その人だけの肩書き（「◯◯ジム」）が混ざると、
      // 1 人にしか当てはまらない語が増えて軸として役に立たなくなる。
      // 図書館情報学でも、総称概念（AAT）と法人・個人の固有名（ULAN）は別の器に置く。
      //
      // 未昇格の新語は**行を作らない**。聞いた文（body）に既に含まれているので、
      // 確定検索の本文一致で引ける。行を分けると同じ文が何行も並ぶ。
      //
      // 絞り込みの式は factLabelNames に置いてある。カードの見出しもトーストも
      // 同じ関数を見るので、**書いた場所と言った場所がずれない**。
      const asLabel = factLabelNames(action);

      const labels = await listLabels();
      const categoryKey = factCategoryKey(action.categoryKey);
      for (const name of asLabel) {
        const label = findLabel(labels, name) ?? (await createLabel({ name, categoryKey }));
        await addFact({
          customerId: action.customer.id,
          labelId: label.id,
          body: action.body,
          source: "agent",
        });
      }

      // 語が 1 つも立たないときだけ、聞いた文を走り書きとして残す。
      // ここを抜かすと「新語しか無い発話」が丸ごと消える。
      if (asLabel.length === 0) {
        await addFact({ customerId: action.customer.id, body: action.body, source: "agent" });
      }
      return;
    }

    case "add_ng_note":
      await addNgNote(action.customer.id, action.body);
      return;

    case "update_customer": {
      const patch: Partial<Customer> = {};
      for (const change of action.changes) {
        // 空文字は「消す」の意味にしない。会話から列を空にする経路は作らない
        // （聞き取れなかっただけ、と区別がつかないため）。
        if (change.after.trim().length === 0) continue;
        Object.assign(patch, { [change.field]: change.after });
      }
      if (Object.keys(patch).length === 0) return;
      await updateCustomer(action.customer.id, patch);
      return;
    }

    case "add_anniversary": {
      // saveAnniversaries は全置換なので、既存を読んでから足す。
      // 上書きすると、会話で 1 件足しただけで他の記念日が消える。
      const existing = await listAnniversaries(action.customer.id);
      await saveAnniversaries(action.customer.id, [
        ...existing.map((a) => ({ id: a.id, type: a.type, date: a.date, label: a.label })),
        {
          type: action.anniversary.type,
          date: action.anniversary.date,
          label: action.anniversary.label ?? "",
        },
      ]);
      return;
    }

    case "invalidate_fact":
      for (const fact of action.facts) await invalidateFact(fact.id as Uuid);
      return;

    case "resolve_approach":
      await resolveApproach(action.customer.id, action.status);
      return;

    // 検索結果と聞き返しは、押して書き込むものではない
    case "search_result":
    case "ask":
      return;
  }
}

/** トーストの副題に出す相手。検索結果と候補の問い合わせには相手がいない */
export function actionCustomerName(action: AgentAction): string | undefined {
  return "customer" in action ? action.customer.name : undefined;
}

/**
 * 適用したときに出す一言。**どこを見れば在るかを言い切る。**
 *
 * 記録は 1 行で、**必ずカルテの「メモ」に並ぶ**。語が付いた行だけが、加えて
 * 「パーソナル」にチップとしても出る（personality-panel.tsx はラベルのある行だけを
 * チップにし、メモ側は全行を時系列で出す）。
 *
 * ここを一律「パーソナルに残しました」と言っていたので、語にしなかったときは
 * パーソナルを探しても無い、という形になっていた。逆に語にしたときも、
 * メモにも残ることが伝わらない。行き先は 2 つとも名指しする。
 */
export function appliedMessage(action: AgentAction): string {
  switch (action.kind) {
    case "add_fact":
      return isMemoOnly(action) ? "メモに残しました" : "パーソナルとメモに残しました";
    case "add_ng_note":
      return "注意事項に残しました";
    case "update_customer":
      return "カルテを更新しました";
    case "add_anniversary":
      return "記念日を追加しました";
    case "invalidate_fact":
      return "記録を無効にしました";
    case "resolve_approach":
      return action.status === "done" ? "対応済みにしました" : "スキップしました";
    default:
      return "適用しました";
  }
}
