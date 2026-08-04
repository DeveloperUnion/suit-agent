import type { Customer, CustomerAnniversary, Staff, Uuid } from "@/lib/types";
import { getDb, mutateDb, newId } from "@/lib/store/mock-db";
import { daysSince } from "@/lib/utils/date";
import { ELAPSED_DAYS_THRESHOLD } from "@/lib/constants/labels";

/**
 * 顧客のデータアクセス。
 * 戻り値をすべて Promise にしてあるのは、DB 実装に差し替えるときに
 * 呼び出し側を書き換えずに済ませるため。
 */

export type CustomerListItem = Customer & {
  /** 最終接触からの経過日数。未接触なら null */
  elapsedDays: number | null;
  /** 閾値を超えて放置されているか */
  isOverdue: boolean;
};

export type CustomerFilter = {
  keyword?: string;
};

function decorate(customer: Customer): CustomerListItem {
  const elapsedDays = daysSince(customer.lastContactedAt);
  return {
    ...customer,
    elapsedDays,
    isOverdue: elapsedDays !== null && elapsedDays > ELAPSED_DAYS_THRESHOLD,
  };
}

export async function listCustomers(filter: CustomerFilter = {}): Promise<CustomerListItem[]> {
  const db = getDb();
  const keyword = filter.keyword?.trim();
  return db.customers
    .filter((c) => {
      if (!keyword) return true;
      const haystack = `${c.name}${c.nameKana}${c.companyName ?? ""}`;
      return haystack.includes(keyword);
    })
    .map(decorate)
    .sort((a, b) => (b.elapsedDays ?? -1) - (a.elapsedDays ?? -1));
}

export async function getCustomer(id: Uuid): Promise<CustomerListItem | null> {
  const customer = getDb().customers.find((c) => c.id === id);
  return customer ? decorate(customer) : null;
}

export async function listAnniversaries(customerId: Uuid): Promise<CustomerAnniversary[]> {
  return getDb().anniversaries.filter((a) => a.customerId === customerId);
}

/** 記念日はまとめて置き換える。行の追加・削除が中心の項目のため */
export async function saveAnniversaries(
  customerId: Uuid,
  entries: Omit<CustomerAnniversary, "id" | "customerId">[],
): Promise<void> {
  mutateDb((db) => ({
    ...db,
    anniversaries: [
      ...db.anniversaries.filter((a) => a.customerId !== customerId),
      ...entries.map((entry, i) => ({ ...entry, id: `anv-${customerId}-${i}`, customerId })),
    ],
  }));
}

export async function listStaff(): Promise<Staff[]> {
  return getDb().staff;
}

/**
 * 似た顧客を探す。
 * 顧客1,000名規模だと、再来店の見落としや同姓同名による二重登録が必ず起きるため、
 * 新規登録の入力中に候補を出して気づけるようにする。
 */
export async function findSimilarCustomers(input: {
  name?: string;
  nameKana?: string;
  phone?: string;
}): Promise<CustomerListItem[]> {
  const name = input.name?.replace(/[\s　]/g, "") ?? "";
  const kana = input.nameKana?.replace(/[\s　]/g, "") ?? "";
  const phone = input.phone?.replace(/[^0-9]/g, "") ?? "";
  if (name.length < 2 && kana.length < 2 && phone.length < 6) return [];

  return getDb()
    .customers.filter((c) => {
      const cName = c.name.replace(/[\s　]/g, "");
      const cKana = c.nameKana.replace(/[\s　]/g, "");
      const cPhone = c.phone?.replace(/[^0-9]/g, "") ?? "";
      if (name.length >= 2 && cName.includes(name)) return true;
      if (kana.length >= 2 && cKana.includes(kana)) return true;
      if (phone.length >= 6 && cPhone.length > 0 && cPhone.includes(phone)) return true;
      return false;
    })
    .slice(0, 5)
    .map(decorate);
}

export async function updateCustomer(id: Uuid, patch: Partial<Customer>): Promise<void> {
  mutateDb((db) => ({
    ...db,
    customers: db.customers.map((c) => (c.id === id ? { ...c, ...patch, id: c.id } : c)),
  }));
}

export async function createCustomer(
  input: Pick<Customer, "name" | "nameKana"> & Partial<Customer>,
): Promise<Uuid> {
  const id = newId("cust");
  mutateDb((db) => ({
    ...db,
    customers: [
      ...db.customers,
      {
        isKeyAccount: false,
        createdAt: new Date().toISOString().slice(0, 10),
        ...input,
        id,
      } as Customer,
    ],
  }));
  return id;
}
