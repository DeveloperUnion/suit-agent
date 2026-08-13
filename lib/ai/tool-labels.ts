/**
 * いま何をしているか。
 *
 * 道具を呼んだ時点で画面に出す。**流す価値があるのは返答の文字より先に、
 * 「何をしているか」のほう。**スマホで無音の 4 秒は「固まった」に見えるが、
 * 「カルテを読んでいます」が出ていれば待てる。
 *
 * ここは表示だけの都合なので、道具の定義（lib/ai/agent-schema.ts）とは
 * 別のファイルに置く。あちらは openai の型を引いており、画面から読むと
 * SDK ごとブラウザのバンドルに入る。
 */
export const TOOL_LABELS: Record<string, string> = {
  search_customers: "顧客を探しています",
  find_customer: "お名前を照合しています",
  get_customer: "カルテを読んでいます",
  propose_add_fact: "パーソナルの追記をまとめています",
  propose_add_ng_note: "注意事項をまとめています",
  propose_update_customer: "現在の値と見比べています",
  propose_add_anniversary: "記念日をまとめています",
  propose_invalidate_fact: "対象の記録を確かめています",
  propose_resolve_approach: "アプローチを確かめています",
  propose_ask_customer: "候補を並べています",
};

/** 道具の名前が増えても画面が黙らないように、既定を持つ */
export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? "調べています";
}
