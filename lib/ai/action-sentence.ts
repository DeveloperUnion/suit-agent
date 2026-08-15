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
 * 実際に「語」として立つもの。**行き先を決める式はこれ 1 本にする。**
 *
 * カードの見出し・返答文・適用後のトーストが、それぞれ別に判定していた時期があり、
 * **メモに入ったのにトーストだけ「パーソナルに残しました」と言っていた**
 * （パーソナルはラベルの付いた行しか出さないので、探しても無い）。
 * 適用ハンドラ（lib/data/agent-apply.ts）の絞り込みと同じ式をここに置き、
 * 表示する側は全部これを見る。
 *
 * カード上でトグルを入れると promotedWords が増えるので、同じ関数が
 * 提案時（まだ何も押していない）と適用時の両方で使える。
 */
export function factLabelNames(action: Extract<AgentAction, { kind: "add_fact" }>): string[] {
  const promoted = new Set(action.promotedWords ?? []);
  return action.labelNames.filter(
    (n) => !action.newLabelNames.includes(n) || promoted.has(n),
  );
}

/**
 * その提案が、チップ（パーソナル）ではなくメモとして入るか。
 *
 * **新しい語は既定で語彙にしない**ので、語として立つものが 1 つも無ければ
 * 行き先はカルテの「メモ」になる（「パーソナル」には出ない）。
 */
export function isMemoOnly(action: AgentAction): boolean {
  return action.kind === "add_fact" && factLabelNames(action).length === 0;
}

/** 「何を数えたか」。数と必ずセットで出す */
function searchScope(action: Extract<AgentAction, { kind: "search_result" }>): string {
  const words = action.keyword ? action.keyword.split("・").filter(Boolean) : [];
  const parts: string[] = [];
  if (words.length > 1) {
    parts.push(`${words.join("・")}の${action.match === "all" ? "全部" : "いずれか"}`);
  } else if (words.length === 1) {
    parts.push(words[0]);
  }
  if (action.excluded?.length) parts.push(`${action.excluded.join("・")}を除く`);
  return parts.length > 0 ? `${parts.join("・")}で、` : "";
}

export function actionSentence(action: AgentAction): string | null {
  switch (action.kind) {
    case "add_fact": {
      const known = factLabelNames(action);
      const who = subject(action.customer.name, action.subjectFrom);
      if (known.length === 0) {
        return `${who}のメモに残す提案です。`;
      }
      // 語が付いた行はチップとメモの両方に出る。カードの見出しと同じ言い方にする
      return `${who}のパーソナルとメモに「${known.join("・")}」を残す提案です。`;
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

    case "search_result": {
      // 件数だけ言い切る。一覧は画面が描くので、モデルにも並べ直させない。
      // **その数が何の数かを必ず添える。**「両方」と聞かれて和集合の数を答えて
      // しまったとき、文言が同じなら人は気づけない。
      const what = searchScope(action);
      return action.exactCount === 0
        ? `${what}該当する方はいませんでした。`
        : `${what}該当は ${action.exactCount} 名です。`;
    }

    case "ask":
      // 質問文はモデルが書いてよい（構造の言い換えではなく、会話そのものなので）
      return action.question;

    default:
      // 知らない種類（古い会話に残っている提案など）は、モデルの文に任せる
      return null;
  }
}
