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
  /** その数が何の数か。取り違えを画面まで運ばないために、数と一緒に持ち回る */
  match: "any" | "all";
  labels: string[];
  excluded: string[];
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
  input: { labels?: string[]; freeText?: string; match?: "any" | "all"; exclude?: string[] },
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
    p_match: input.match === "all" ? "all" : "any",
    p_exclude: input.exclude ?? [],
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

/**
 * その人の記録を丸ごと。「どんな人だっけ」に検索は要らない。
 *
 * 採寸は既定で最新 1 枚。**履歴まで既定にしない** — 人の記録がベクトルの海に埋もれる。
 * 「最近痩せた？」のように体型の変化を聞かれたときだけ深さを上げる。
 */
export async function getCustomer(
  ctx: ToolContext,
  customerId: string,
  measurementDetail = 1,
): Promise<unknown> {
  return rpc<unknown>(ctx, "customer_dossier", {
    p_customer_id: customerId,
    p_measurement_detail: measurementDetail,
  });
}

export type OrderSearchResult = {
  /** 何を数えたか。**数と必ずセットで持ち回る** */
  countMeans: string;
  scopeLabel: string;
  orderCount: number;
  customerCount: number;
  totalAmount: number;
  /**
   * 紙に生地名が入っていない注文の数。
   *
   * 色系統（navy / gray）はテーブルに無いので、生地は色名の**部分一致**でしか引けない。
   * 引けなかった分を名乗らないと、落ちた注文に誰も気づけない。
   */
  fabricUnknownCount: number;
  orders: {
    orderId: string;
    customerId: string;
    customerName: string;
    customerNameKana: string;
    companyName: string | null;
    orderNumber: string;
    orderedAt: string;
    deliveryDate: string | null;
    /** お渡し日がまだ空で、納品日から出した予定の日付か */
    deliveryIsPlanned: boolean;
    status: string;
    purpose: string;
    fabricColorName: string | null;
    fabricProductNumber: string | null;
    totalAmount: number;
  }[];
  /** 条件が 1 つも来なかったとき。全件は返さない */
  error?: string;
};

/**
 * 注文を軸に引く。**顧客ではなく注文を返す。**
 *
 * scope は持たない（SQL 側で自担当固定）。他人の顧客の注文を返す口を作ると、
 * モデルが宛先にできる customerId の供給源が 1 つ増える。
 */
export async function searchOrders(
  ctx: ToolContext,
  input: {
    orderedMonth?: string;
    orderedFrom?: string;
    orderedTo?: string;
    deliveryMonth?: string;
    deliveryFrom?: string;
    deliveryTo?: string;
    fabric?: string;
    purpose?: string;
    minAmount?: number;
    maxAmount?: number;
    undelivered?: boolean;
  },
): Promise<OrderSearchResult> {
  return rpc<OrderSearchResult>(ctx, "search_orders", {
    p_viewing_staff_id: ctx.viewingStaffId,
    p_ordered_month: input.orderedMonth ?? null,
    p_ordered_from: input.orderedFrom ?? null,
    p_ordered_to: input.orderedTo ?? null,
    p_delivery_month: input.deliveryMonth ?? null,
    p_delivery_from: input.deliveryFrom ?? null,
    p_delivery_to: input.deliveryTo ?? null,
    p_fabric: input.fabric ?? null,
    p_purpose: input.purpose ?? null,
    p_min_amount: input.minAmount ?? null,
    p_max_amount: input.maxAmount ?? null,
    p_undelivered: input.undelivered ?? false,
  });
}

export type RevenueSummary = {
  scope: "mine" | "store";
  scopeRequested: "mine" | "store";
  /** 店全体を頼まれたが管理者ではなかった。**黙って自担当に落とさないための旗** */
  scopeDenied: boolean;
  scopeLabel: string;
  today: string;
  countsBy: string;
  /** 店全体では目標を扱わない（人が画面で検算できない数字になるため） */
  targetAvailable: boolean;
  months: {
    month: string;
    revenue: number;
    orderCount: number;
    target: number | null;
    rate: number | null;
    remaining: number | null;
    monthProgress: number;
    isCurrent: boolean;
  }[];
  byStaffMeans: string | null;
  byStaff: { staffName: string; revenue: number; orderCount: number }[] | null;
};

/**
 * 月次の実績と目標。
 *
 * **「今月」を TS 側で作らない。**サーバは UTC で走るので、月初の 9 時間だけ
 * 画面（ブラウザ = JST）と別の月を指す。境界は SQL の中で JST から決めている。
 */
export async function revenueSummary(
  ctx: ToolContext,
  input: { storeWide?: boolean; month?: string; months?: number },
): Promise<RevenueSummary> {
  return rpc<RevenueSummary>(ctx, "revenue_summary", {
    p_viewing_staff_id: ctx.viewingStaffId,
    p_store_wide: input.storeWide ?? false,
    p_month: input.month ?? null,
    p_months: input.months ?? 3,
  });
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
