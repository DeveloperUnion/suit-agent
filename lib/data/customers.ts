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
  staffName: string;
  /** 最終接触からの経過日数。未接触なら null */
  elapsedDays: number | null;
  /** 閾値を超えて放置されているか */
  isOverdue: boolean;
};

export type CustomerFilter = {
  keyword?: string;
};

function decorate(customer: Customer, staff: Staff[]): CustomerListItem {
  const elapsedDays = daysSince(customer.lastContactedAt);
  return {
    ...customer,
    staffName: staff.find((s) => s.id === customer.staffId)?.name ?? "—",
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
    .map((c) => decorate(c, db.staff))
    .sort((a, b) => (b.elapsedDays ?? -1) - (a.elapsedDays ?? -1));
}

export async function getCustomer(id: Uuid): Promise<CustomerListItem | null> {
  const db = getDb();
  const customer = db.customers.find((c) => c.id === id);
  return customer ? decorate(customer, db.staff) : null;
}

export async function listAnniversaries(customerId: Uuid): Promise<CustomerAnniversary[]> {
  return getDb().anniversaries.filter((a) => a.customerId === customerId);
}

export async function listStaff(): Promise<Staff[]> {
  return getDb().staff;
}

export async function updateCustomer(id: Uuid, patch: Partial<Customer>): Promise<void> {
  mutateDb((db) => ({
    ...db,
    customers: db.customers.map((c) => (c.id === id ? { ...c, ...patch, id: c.id } : c)),
  }));
}

export async function createCustomer(
  input: Pick<Customer, "name" | "nameKana" | "staffId"> & Partial<Customer>,
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
