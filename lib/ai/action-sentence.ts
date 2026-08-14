import type { AgentAction, SubjectOrigin } from "@/lib/types";

/**
 * 提案があるターンの返答文。**モデルではなくコードが書く。**
 *
 * 以前はモデルの散文とカードが、同じ提案を別々に説明していた。プロンプトが
 * 「提案を出したら、そう伝えてください」と**二重に説明させていた**ので、
 * 「職業として記録します」と言いながらカードは「パーソナルに追加」になる、
 * というずれが普通に起きた。**モデルの精度の問題ではなく、出所が 2 つあったのが原因。**
 *
 * 他所も同じ結論に立っている。Vercel AI SDK は「モデルは会話文、構造的な文言は
 * コンポーネント」と分担を明記し、Cline は見出しを `{toolName, input, result}` から
 * コードで生成する（`fallbackLabel`）。ここはその系列で、`lib/ai/tool-labels.ts` の兄弟。
 *
 * 提案が無いターン（質問への回答など）はモデルの文をそのまま使う。あちらは
 * 会話文であって、構造の言い換えではないため。
 */

const ORIGIN_NOTE: Record<SubjectOrigin, string> = {
  spoken_name: "",
  open_karte: "（開いているカルテの方です）",
  recent_topic: "（さきほどの話の方です）",
};

function subject(name: string, from: SubjectOrigin): string {
  return `${name} さん${ORIGIN_NOTE[from]}`;
}

/**
 * その提案が、チップ（パーソナル）ではなくメモとして入るか。
 *
 * **新しい語は既定で語彙にしない**ので、既存語が 1 つも無ければ行き先はメモになる。
 * カードの見出しと返答文の両方がこれを見る — 片方だけ直すと、また出所が 2 つになる。
 */
export function isMemoOnly(action: AgentAction): boolean {
  return (
    action.kind === "add_fact" &&
    action.labelNames.every((n) => action.newLabelNames.includes(n))
  );
}

export function actionSentence(action: AgentAction): string | null {
  switch (action.kind) {
    case "add_fact": {
      const known = action.labelNames.filter((n) => !action.newLabelNames.includes(n));
      const who = subject(action.customer.name, action.subjectFrom);
      if (known.length === 0) {
        return `${who}のメモに残す提案です。`;
      }
      return `${who}のパーソナルに「${known.join("・")}」を足す提案です。`;
    }
    case "add_ng_note":
      return `${subject(action.customer.name, action.subjectFrom)}の注意事項に足す提案です。`;
    case "update_customer": {
      const fields = action.changes.map((c) => c.label).join("・");
      return `${subject(action.customer.name, action.subjectFrom)}の${fields}を変える提案です。`;
    }
    case "add_anniversary":
      return `${subject(action.customer.name, action.subjectFrom)}に記念日を足す提案です。`;
    case "invalidate_fact":
      return `${subject(action.customer.name, action.subjectFrom)}の記録 ${action.facts.length} 件を無効にする提案です。`;
    case "resolve_approach":
      return `${subject(action.customer.name, action.subjectFrom)}のアプローチを「${
        action.status === "done" ? "連絡した" : "スキップ"
      }」にする提案です。`;

    case "search_result":
      // 件数だけ言い切る。一覧は画面が描くので、モデルにも並べ直させない
      return action.exactCount === 0
        ? "該当する方はいませんでした。"
        : `該当は ${action.exactCount} 名です。`;

    case "ask":
      // 質問文はモデルが書いてよい（構造の言い換えではなく、会話そのものなので）
      return action.question;

    default:
      // 知らない種類（古い会話に残っている提案など）は、モデルの文に任せる
      return null;
  }
}
