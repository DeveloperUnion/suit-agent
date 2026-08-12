import type { AgentCustomerRef, Customer, Uuid } from "@/lib/types";
import { getCustomer, listCustomers } from "@/lib/data/customers";
import {
  addFact,
  createLabel,
  findLabel,
  listLabelNamesFor,
  listLabels,
  searchFactsByKeyword,
} from "@/lib/data/facts";

/**
 * アシスタントが実際にデータへ触る口。
 *
 * ここでは lib/data/* しか呼ばない。顧客はスタッフごとに分割されており、
 * その絞り込みは listCustomers / getCustomer / RLS が担っている。
 * 会話から来た指示だからといって境界を越えさせない。
 *
 * 書き込みは「提案 → 人が適用を押す」を通るので、この層が呼ばれるのは
 * 適用ボタンが押された後だけ。
 */

export function toCustomerRef(customer: Customer, labels: string[] = []): AgentCustomerRef {
  return {
    id: customer.id,
    name: customer.name,
    nameKana: customer.nameKana,
    labels,
  };
}

export type FactPlan = {
  /** 足すラベル名。既存語に当たったものは、そちらの表記に寄せてある */
  labelNames: string[];
  /** そのうち fact_labels にまだ無いもの。適用時に作られる */
  newLabelNames: string[];
};

/**
 * 何を足すことになるかを先に出す。ここでは書き込まない。
 *
 * 既にその顧客に付いているラベルは落とす。DB 側にも
 * (customer_id, label_id, body) の一意制約があるが、
 * 「すでに入っています」と言えるほうが会話として自然なので手前でも見る。
 */
export async function planFactAdd(customerId: Uuid, incoming: string[]): Promise<FactPlan> {
  const [labels, owned] = await Promise.all([
    listLabels(),
    listLabelNamesFor([customerId]),
  ]);
  const already = owned.get(customerId) ?? [];

  const labelNames: string[] = [];
  const newLabelNames: string[] = [];
  for (const raw of incoming) {
    const value = raw.trim();
    if (!value) continue;
    // 表記が揺れると同じ趣味の人がひとまとまりで引けなくなるので、既存語へ寄せる
    const existing = findLabel(labels, value);
    const name = existing?.name ?? value;
    if (already.includes(name) || labelNames.includes(name)) continue;
    labelNames.push(name);
    if (!existing) newLabelNames.push(name);
  }
  return { labelNames, newLabelNames };
}

/**
 * 提案を適用する。無い語はここで作る。
 *
 * body には聞き取った言い回しをそのまま入れる。ラベルだけだと
 * 「打ちっぱなしによく行くらしい」という文脈が落ちる。
 */
export async function applyFactAdd(
  customerId: Uuid,
  labelNames: string[],
  categoryKey: string,
  body: string,
): Promise<void> {
  const labels = await listLabels();
  for (const name of labelNames) {
    const label = findLabel(labels, name) ?? (await createLabel({ name, categoryKey }));
    await addFact({ customerId, labelId: label.id, body, source: "agent" });
  }
}

/**
 * 語で顧客を引く。
 *
 * ラベルと本文の両方を見て、**上限を付けずに全件返す**。
 * 「ゴルフが趣味の方は 12 名です」と言い切れることがこの検索の存在理由で、
 * top-k で 5 名だけ返すと、落ちた 7 名は誰にも見えない。
 */
export async function searchByLabel(keyword: string): Promise<AgentCustomerRef[]> {
  const facts = await searchFactsByKeyword(keyword);
  if (facts.length === 0) return [];

  const customerIds = [...new Set(facts.map((f) => f.customerId))];
  const [customers, labelNames] = await Promise.all([
    listCustomers(),
    listLabelNamesFor(customerIds),
  ]);

  return customerIds
    .map((id) => customers.find((c) => c.id === id))
    .filter((c) => c !== undefined)
    .map((c) => toCustomerRef(c, labelNames.get(c.id) ?? []));
}

/**
 * 名前で顧客を探す。
 * 空白と表記の揺れを落として部分一致を見るのは findSimilarCustomers と同じ考え方だが、
 * こちらは担当の境界を越えない（会話から他人の顧客を書き換えられては困る）。
 */
export async function findCustomersByName(name: string): Promise<AgentCustomerRef[]> {
  const needle = name.replace(/[\s　]/g, "");
  if (needle.length < 2) return [];
  const customers = await listCustomers();
  const hits = customers
    .filter((c) => {
      const cName = c.name.replace(/[\s　]/g, "");
      const cKana = c.nameKana.replace(/[\s　]/g, "");
      return cName.includes(needle) || cKana.includes(needle);
    })
    .slice(0, 5);

  const labelNames = await listLabelNamesFor(hits.map((c) => c.id));
  return hits.map((c) => toCustomerRef(c, labelNames.get(c.id) ?? []));
}

/** 顧客 1 人ぶんのラベル名。提案カードを作り直すときに使う */
export async function customerRef(customerId: Uuid): Promise<AgentCustomerRef | null> {
  const customer = await getCustomer(customerId);
  if (!customer) return null;
  const labelNames = await listLabelNamesFor([customerId]);
  return toCustomerRef(customer, labelNames.get(customerId) ?? []);
}
