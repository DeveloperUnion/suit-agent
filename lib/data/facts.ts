import type { CustomerFact, FactCategory, FactLabel, FactSource, Uuid } from "@/lib/types";
import { supabase } from "@/lib/supabase/client";
import { bump } from "@/lib/store/revision";

/**
 * 人となりと記録。
 *
 * 1 つのテーブルに 2 つの見え方がある。
 *   ラベルあり … カルテ上部のチップ。「ゴルフが趣味な人」を全員引くための語彙
 *   ラベルなし … 下の記録リスト。走り書き。語彙にならない話の置き場
 *
 * **分けて持たないのが要点。**分けるとスタッフに「これはどっちの箱か」を毎回
 * 選ばせることになり、速いほう（自由記述）へ情報が逃げて確定検索から漏れる。
 * 1 つにすれば入力は「1 行書く」だけになり、ラベルは後から付く。
 *
 * 物理削除はできない（DELETE ポリシーが無い）。消したように見える操作は
 * すべて invalidated_at を立てる無効化で、行そのものは残る。
 */

const FACT_COLUMNS = `
  id, customerId:customer_id, body, source, createdAt:created_at,
  label:fact_labels ( id, name, categoryKey:category_key )
`;

type FactRow = {
  id: string;
  customerId: string;
  body: string;
  source: FactSource;
  createdAt: string;
  label: { id: string; name: string; categoryKey: string } | null;
};

const toFact = (r: FactRow): CustomerFact => ({
  id: r.id,
  customerId: r.customerId,
  body: r.body,
  source: r.source,
  createdAt: r.createdAt,
  label: r.label ?? undefined,
});

/** カルテ 1 枚ぶん。古い順に並べる（下に足されていくほうが記録として読みやすい） */
export async function listFacts(customerId: Uuid): Promise<CustomerFact[]> {
  const { data, error } = await supabase()
    .from("customer_facts")
    .select(FACT_COLUMNS)
    .eq("customer_id", customerId)
    .is("invalidated_at", null)
    // 同じ日にまとめて入った行（移行分）でも並びが揺れないよう id で分ける
    .order("created_at")
    .order("id");
  if (error) throw error;
  return (data ?? []).map((r) => toFact(r as unknown as FactRow));
}

/**
 * 記録を 1 行足す。
 *
 * labelId を渡せばチップになり、渡さなければ走り書きになる。
 * source は既定で manual — 会話から来たものだけが agent を名乗る。
 */
export async function addFact(input: {
  customerId: Uuid;
  body: string;
  labelId?: Uuid;
  source?: FactSource;
}): Promise<void> {
  const { error } = await supabase().from("customer_facts").insert({
    customer_id: input.customerId,
    label_id: input.labelId ?? null,
    body: input.body,
    source: input.source ?? "manual",
  });
  if (error) throw error;
  bump();
}

/**
 * 無効化する。
 *
 * 行は消えない。操作者は DB のトリガーが本人で埋めるので、ここからは渡さない
 * （画面から渡させると嘘を書ける）。
 */
export async function invalidateFact(id: Uuid): Promise<void> {
  const { error } = await supabase()
    .from("customer_facts")
    .update({ invalidated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  bump();
}

/** 顧客ごとのラベル名。会話の顧客カードに並べるのに使う */
export async function listLabelNamesFor(customerIds: Uuid[]): Promise<Map<Uuid, string[]>> {
  const out = new Map<Uuid, string[]>();
  if (customerIds.length === 0) return out;

  const { data, error } = await supabase()
    .from("customer_facts")
    .select("customerId:customer_id, label:fact_labels!inner ( name )")
    .in("customer_id", customerIds)
    .is("invalidated_at", null);
  if (error) throw error;

  for (const row of (data ?? []) as unknown as { customerId: Uuid; label: { name: string } }[]) {
    const names = out.get(row.customerId) ?? [];
    if (!names.includes(row.label.name)) names.push(row.label.name);
    out.set(row.customerId, names);
  }
  return out;
}

/**
 * 語で顧客を引く。
 *
 * **ラベルと本文の両方を見る。**ラベルだけだと、走り書きに「ゴルフ」と書いた
 * 顧客が「ゴルフが趣味な人」から漏れる。速いほう（自由記述）へ情報が逃げるのは
 * 避けられないので、検索側で拾う。
 *
 * 上限を付けない。「該当は 12 名です」と言い切れることがこの検索の存在理由で、
 * top-k で 5 名だけ返すと、落ちた 7 名は誰にも見えない。
 */
export async function searchFactsByKeyword(keyword: string): Promise<CustomerFact[]> {
  const needle = keyword.trim();
  if (!needle) return [];

  const [byBody, byLabel] = await Promise.all([
    supabase()
      .from("customer_facts")
      .select(FACT_COLUMNS)
      .is("invalidated_at", null)
      .ilike("body", `%${needle}%`),
    supabase()
      .from("customer_facts")
      .select(`
        id, customerId:customer_id, body, source, createdAt:created_at,
        label:fact_labels!inner ( id, name, categoryKey:category_key )
      `)
      .is("invalidated_at", null)
      .ilike("fact_labels.name", `%${needle}%`),
  ]);
  if (byBody.error) throw byBody.error;
  if (byLabel.error) throw byLabel.error;

  const seen = new Set<string>();
  const out: CustomerFact[] = [];
  for (const row of [...(byBody.data ?? []), ...(byLabel.data ?? [])]) {
    const fact = toFact(row as unknown as FactRow);
    if (seen.has(fact.id)) continue;
    seen.add(fact.id);
    out.push(fact);
  }
  return out;
}

// ── 語彙 ────────────────────────────────────────────────

/**
 * 全ラベル。店舗で共通なので顧客では絞らない。
 *
 * 一覧をそのまま持てるのが正規化の最大の実利で、「＋追加」の候補にも、
 * 後で会話へ「既存の語に寄せてほしい」と渡すのにも、これ 1 本を使う。
 */
export async function listLabels(): Promise<FactLabel[]> {
  const { data, error } = await supabase()
    .from("fact_labels")
    .select("id, name, categoryKey:category_key")
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as FactLabel[];
}

export async function listFactCategories(): Promise<FactCategory[]> {
  const { data, error } = await supabase()
    .from("fact_categories")
    .select("key, label, sortOrder:sort_order")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as unknown as FactCategory[];
}

/**
 * 新しい語を作る。
 *
 * 表記の揺れは DB 側の一意制約（app.normalize_ja を通した生成列）が吸収するので、
 * 「ごるふ」で作ろうとすると既存の「ゴルフ」と衝突して落ちる。
 * 呼び出し側は先に findLabel() で寄せてから来ること。
 */
export async function createLabel(input: { name: string; categoryKey: string }): Promise<FactLabel> {
  const { data, error } = await supabase()
    .from("fact_labels")
    .insert({ name: input.name, category_key: input.categoryKey })
    .select("id, name, categoryKey:category_key")
    .single();
  if (error) throw error;
  bump();
  return data as unknown as FactLabel;
}

/**
 * 入力された語を既存ラベルに寄せる。
 *
 * **DB の app.normalize_ja と同じ規則でなければならない。**ここだけ違うと
 * 「画面には候補が出ないのに作ろうとすると重複で落ちる」が起きる。
 * ひらがな→カタカナ、全角→半角、空白落とし、小文字化。
 */
export function normalizeLabel(value: string): string {
  return value
    .replace(/[\s　]/g, "")
    // 全角の英数だけを半角へ。記号は SQL 側も触っていないので合わせる
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    // 半角の長音記号
    .replace(/ｰ/g, "ー")
    // ひらがな → カタカナ。「たなか」で「タナカ」を引けるように
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .toLowerCase();
}

export function findLabel(labels: FactLabel[], value: string): FactLabel | undefined {
  const needle = normalizeLabel(value);
  return labels.find((l) => normalizeLabel(l.name) === needle);
}

// ── NG 事項 ─────────────────────────────────────────────
//
// facts と同じ形をしているが、意図して別テーブルにしてある。
// facts は類似検索で「引っ張り出す」もの、NG は当該顧客に触れた瞬間に
// **無条件で全件**読むもの。取りこぼしが許される情報と許されない情報を、
// 同じ機構に載せない。

type NgRow = { id: string; customerId: string; body: string; createdAt: string };

export async function listNgNotes(customerId: Uuid) {
  const { data, error } = await supabase()
    .from("customer_ng_notes")
    .select("id, customerId:customer_id, body, createdAt:created_at")
    .eq("customer_id", customerId)
    .is("invalidated_at", null)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as unknown as NgRow[];
}

export async function addNgNote(customerId: Uuid, body: string): Promise<void> {
  const { error } = await supabase()
    .from("customer_ng_notes")
    .insert({ customer_id: customerId, body });
  if (error) throw error;
  bump();
}

export async function invalidateNgNote(id: Uuid): Promise<void> {
  const { error } = await supabase()
    .from("customer_ng_notes")
    .update({ invalidated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  bump();
}
