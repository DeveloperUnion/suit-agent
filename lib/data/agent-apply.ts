import type { AgentAction, Customer, Uuid } from "@/lib/types";
import {
  addFact,
  addNgNote,
  createLabel,
  findLabel,
  invalidateFact,
  listLabels,
} from "@/lib/data/facts";
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
      // 語は既存の表記へ寄せてある（DB が決めた値）。無い語だけここで作る。
      const labels = await listLabels();
      // 分類はここでも正す。会話は残るので、**この直しより前に出た提案**が
      // カルテに残っており、それを今日押されることがある。提案に載っている値を
      // そのまま信じると、そのとき外部キー違反で落ちる。
      const categoryKey = factCategoryKey(action.categoryKey);
      for (const name of action.labelNames) {
        const label = findLabel(labels, name) ?? (await createLabel({ name, categoryKey }));
        await addFact({
          customerId: action.customer.id,
          labelId: label.id,
          body: action.body,
          source: "agent",
        });
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

    // 検索結果と候補の問い合わせは、押して書き込むものではない
    case "search_result":
    case "ask_customer":
      return;
  }
}

/** トーストの副題に出す相手。検索結果と候補の問い合わせには相手がいない */
export function actionCustomerName(action: AgentAction): string | undefined {
  return "customer" in action ? action.customer.name : undefined;
}

/** 適用したときに出す一言。何が起きたかを言い切る */
export function appliedMessage(action: AgentAction): string {
  switch (action.kind) {
    case "add_fact":
      return "パーソナルに残しました";
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
