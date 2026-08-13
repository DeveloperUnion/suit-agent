import type { SupabaseClient } from "@supabase/supabase-js";

import { embedTexts, toVectorLiteral } from "@/lib/ai/embed";

/**
 * アシスタントがデータに触る口。
 *
 * **ここからテーブルを直接読まない。**`supabase().rpc()` だけを呼ぶ
 * （ESLint が `supabase().from(` を禁じている）。網羅性の担保は
 * `app.search_customers()` の中にあり、外から top-k で引ける経路を作ると
 * 「該当 12 名のうち 5 名しか返らない」が静かに生まれる。
 *
 * **ツールは全部読み取り専用。**書き込みは `plan_*` が「何が起きるか」を
 * 返すだけで、実際に書くのは人が「適用」を押したあとの適用ハンドラ。
 * 適用ハンドラが実装していない種類の書き込みは原理的に起こせない。
 *
 * もう 1 つの決め事: **モデルに UUID もラベルの表記も書かせない。**
 * どちらも DB が計算する値で、`normalizeLabel()` は `app.normalize_ja` と
 * 一致していなければならない。モデルに「ごるふ」と書かれた瞬間に壊れる。
 * モデルが決めるのは「どのツールを、どの引数で呼ぶか」だけ。
 */

export type ToolContext = {
  supabase: SupabaseClient;
  /** 管理者がスタッフを切り替えているときの表示対象。画面と答えを一致させる */
  viewingStaffId: string | null;
};

async function rpc<T>(ctx: ToolContext, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await ctx.supabase.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

// ── 読む ────────────────────────────────────────────────

type SearchResult = {
  exact: {
    id: string;
    name: string;
    nameKana: string;
    companyName: string | null;
    matched: { factId: string; label: string | null; body: string }[];
  }[];
  exactCount: number;
  similar: { id: string; name: string; nameKana: string; content: string; distance: number }[];
  similarAvailable: boolean;
};

/**
 * 語で顧客を引く。
 *
 * 確定検索は**上限なしで全件**、意味検索は「近いもの」として別枠。
 * ツールを 2 本に分けて使い分けさせない — 選択を間違えようがなくする。
 *
 * freeText があるときだけ埋め込みを引く。ラベルだけの問い
 * （「ゴルフの人」）に意味検索は要らないので、無駄な往復を作らない。
 */
export async function searchCustomers(
  ctx: ToolContext,
  input: { labels?: string[]; freeText?: string },
): Promise<SearchResult> {
  const freeText = input.freeText?.trim() || null;
  let embedding: string | null = null;
  if (freeText) {
    const [vector] = await embedTexts([freeText], "query");
    embedding = toVectorLiteral(vector);
  }
  return rpc<SearchResult>(ctx, "search_customers", {
    p_labels: input.labels ?? [],
    p_free_text: freeText,
    p_query_embedding: embedding,
    p_viewing_staff_id: ctx.viewingStaffId,
  });
}

export type NamedCustomer = {
  id: string;
  name: string;
  nameKana: string;
  companyName: string | null;
  labels: string[];
};

/** 名前で候補を出す。**モデルはここが返した id の外を選べない** */
export async function findCustomer(ctx: ToolContext, name: string): Promise<NamedCustomer[]> {
  return rpc<NamedCustomer[]>(ctx, "find_customers_by_name", {
    p_query: name,
    p_viewing_staff_id: ctx.viewingStaffId,
  });
}

/** その人の記録を丸ごと。「どんな人だっけ」に検索は要らない */
export async function getCustomer(ctx: ToolContext, customerId: string): Promise<unknown> {
  return rpc<unknown>(ctx, "customer_dossier", { p_customer_id: customerId });
}

// ── 提案を組み立てる（書き込まない） ────────────────────

export type FactPlan = {
  /** 足すラベル名。既存語に当たったものは、そちらの表記へ寄せてある */
  labelNames: string[];
  /** そのうち fact_labels にまだ無いもの。適用時に作られる */
  newLabelNames: string[];
  /** すでにその顧客に付いていたので落としたもの */
  alreadyHas: string[];
} | null;

/**
 * パーソナルに何を足すことになるかを先に出す。**ここでは書き込まない。**
 *
 * 既存語への寄せは DB の正規化（app.normalize_ja）を通す。表記が揺れると
 * 同じ趣味の人がひとまとまりで引けなくなる。
 * 触れない相手（他スタッフの顧客）なら null が返る。
 */
export async function planFactAdd(
  ctx: ToolContext,
  input: { customerId: string; labels: string[] },
): Promise<FactPlan> {
  return rpc<FactPlan>(ctx, "plan_fact_add", {
    p_customer_id: input.customerId,
    p_labels: input.labels,
  });
}

/** 語彙の一覧。プロンプトに載せる */
export async function factVocabulary(
  ctx: ToolContext,
): Promise<{ label: string; category: string }[]> {
  return rpc<{ label: string; category: string }[]>(ctx, "fact_vocabulary", {});
}
