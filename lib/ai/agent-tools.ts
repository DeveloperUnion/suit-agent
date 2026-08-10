import type { AgentCustomerRef, Customer, Uuid } from "@/lib/types";
import { getCustomer, listCustomers, updateCustomer } from "@/lib/data/customers";

/**
 * アシスタントが実際にデータへ触る口。
 *
 * ここでは lib/data/* しか呼ばない。顧客はスタッフごとに分割されており、
 * その絞り込みは listCustomers / getCustomer が担っている。
 * 会話から来た指示だからといって境界を越えさせない。
 */

/** 趣味は「ゴルフ・ワイン」のように「・」で連結した 1 本の文字列で持っている */
const HOBBY_SEPARATOR = "・";

export function splitHobbies(value?: string): string[] {
  return (value ?? "")
    .split(HOBBY_SEPARATOR)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function joinHobbies(values: string[]): string {
  return values.join(HOBBY_SEPARATOR);
}

export function toCustomerRef(customer: Customer): AgentCustomerRef {
  return {
    id: customer.id,
    name: customer.name,
    nameKana: customer.nameKana,
    hobbies: customer.hobbies,
  };
}

export type HobbyMerge = {
  before?: string;
  after: string;
  /** 実際に増える分。すべて既出なら空になる */
  added: string[];
};

/** 既にある趣味と突き合わせて、増える分だけを出す。書き込みはしない */
export function planHobbyMerge(current: string | undefined, incoming: string[]): HobbyMerge {
  const existing = splitHobbies(current);
  const added: string[] = [];
  for (const hobby of incoming) {
    const trimmed = hobby.trim();
    if (!trimmed) continue;
    if (existing.includes(trimmed) || added.includes(trimmed)) continue;
    added.push(trimmed);
  }
  return {
    before: current,
    after: joinHobbies([...existing, ...added]),
    added,
  };
}

/** 趣味を追記する。既にあるものは足さない */
export async function addHobbies(customerId: Uuid, incoming: string[]): Promise<HobbyMerge | null> {
  const customer = await getCustomer(customerId);
  if (!customer) return null;
  const merge = planHobbyMerge(customer.hobbies, incoming);
  if (merge.added.length === 0) return merge;
  await updateCustomer(customerId, { hobbies: merge.after });
  return merge;
}

/**
 * 趣味から顧客を引く。
 * listCustomers の keyword は趣味・タグ・メモまで見るので、
 * まずそれで絞ってから趣味に当たったものだけを残す
 * （会社名にたまたま同じ語が入っている顧客を混ぜないため）。
 */
export async function searchByHobby(keyword: string): Promise<AgentCustomerRef[]> {
  const trimmed = keyword.trim();
  if (!trimmed) return [];
  const customers = await listCustomers({ keyword: trimmed });
  return customers
    .filter((c) => splitHobbies(c.hobbies).some((h) => h.includes(trimmed)))
    .map(toCustomerRef);
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
  return customers
    .filter((c) => {
      const cName = c.name.replace(/[\s　]/g, "");
      const cKana = c.nameKana.replace(/[\s　]/g, "");
      return cName.includes(needle) || cKana.includes(needle);
    })
    .slice(0, 5)
    .map(toCustomerRef);
}
