import type { Customer, CustomerAnniversary, IsoDate, MockDatabase, Staff, Uuid } from "@/lib/types";
import { getDb, mutateDb, newId } from "@/lib/store/mock-db";
import { getCurrentStaffId } from "@/lib/auth/current-staff";
import { PREFECTURES } from "@/lib/constants/prefectures";
import { daysSince } from "@/lib/utils/date";

/**
 * 顧客のデータアクセス。
 * 戻り値をすべて Promise にしてあるのは、DB 実装に差し替えるときに
 * 呼び出し側を書き換えずに済ませるため。
 */

export type CustomerListItem = Customer & {
  /** 最終納品日。納品済みの注文が1件も無ければ undefined */
  lastDeliveredAt?: IsoDate;
  /** 最終納品の注文 ID。納品後フォローがどの納品に対する通知かを識別するのに使う */
  lastDeliveredOrderId?: Uuid;
  /**
   * 納品からの経過日数。納品済みの注文が1件も無ければ null。
   * 「最終接触から」ではない。着心地を伺うのに意味があるのは納品からの日数のため。
   */
  daysSinceDelivery: number | null;
};

export type CustomerFilter = {
  keyword?: string;
  /** 居住地の都道府県。災害時にその地域の顧客だけを出すために使う */
  residencePrefecture?: string;
};

type LastDelivery = { orderId: Uuid; deliveredAt: IsoDate };

/** 顧客ごとの最終納品。一覧のたびに 1 度だけ組み立て、顧客数×注文数の走査を避ける */
function lastDeliveredMap(db: MockDatabase): Map<Uuid, LastDelivery> {
  const map = new Map<Uuid, LastDelivery>();
  for (const order of db.orders) {
    if (!order.deliveredAt) continue;
    const current = map.get(order.customerId);
    if (!current || order.deliveredAt > current.deliveredAt) {
      map.set(order.customerId, { orderId: order.id, deliveredAt: order.deliveredAt });
    }
  }
  return map;
}

function decorate(customer: Customer, delivered: Map<Uuid, LastDelivery>): CustomerListItem {
  const last = delivered.get(customer.id);
  return {
    ...customer,
    lastDeliveredAt: last?.deliveredAt,
    lastDeliveredOrderId: last?.orderId,
    daysSinceDelivery: daysSince(last?.deliveredAt),
  };
}

/**
 * 顧客はスタッフごとに分割されている。ログインした人には自分の顧客しか返さない。
 * 絞り込みはこの層で必ず効かせ、画面側の実装漏れで他人の顧客が出ないようにする。
 */
export async function listCustomers(filter: CustomerFilter = {}): Promise<CustomerListItem[]> {
  const db = getDb();
  const staffId = getCurrentStaffId();
  const keyword = filter.keyword?.trim();
  const delivered = lastDeliveredMap(db);
  return db.customers
    .filter((c) => c.staffId === staffId)
    .filter((c) => !filter.residencePrefecture || c.residencePrefecture === filter.residencePrefecture)
    .filter((c) => {
      if (!keyword) return true;
      const haystack = `${c.name}${c.nameKana}${c.companyName ?? ""}`;
      return haystack.includes(keyword);
    })
    .map((c) => decorate(c, delivered))
    .sort((a, b) => {
      // 納品済みの注文が無い顧客は起点が無いので末尾に置く。
      // 0 日目として扱うと「今日納品した人」と同じ位置に紛れてしまう
      if (a.daysSinceDelivery === null && b.daysSinceDelivery === null) {
        return a.nameKana.localeCompare(b.nameKana, "ja");
      }
      if (a.daysSinceDelivery === null) return 1;
      if (b.daysSinceDelivery === null) return -1;
      return b.daysSinceDelivery - a.daysSinceDelivery;
    });
}

/**
 * 絞り込みに出す居住地の一覧。担当顧客に実在する都道府県だけを返す。
 * 47件を並べても大半が0件になり、選べる県を探すほうが手間になるため。
 */
export async function listResidencePrefectures(): Promise<
  { prefecture: string; count: number }[]
> {
  const staffId = getCurrentStaffId();
  const counts = new Map<string, number>();
  for (const c of getDb().customers) {
    if (c.staffId !== staffId || !c.residencePrefecture) continue;
    counts.set(c.residencePrefecture, (counts.get(c.residencePrefecture) ?? 0) + 1);
  }
  return PREFECTURES.filter((p) => counts.has(p)).map((p) => ({
    prefecture: p,
    count: counts.get(p) as number,
  }));
}

/** 担当外の顧客は null を返す。URL を直接叩かれても開けない */
export async function getCustomer(id: Uuid): Promise<CustomerListItem | null> {
  const db = getDb();
  const customer = db.customers.find((c) => c.id === id);
  if (!customer || customer.staffId !== getCurrentStaffId()) return null;
  return decorate(customer, lastDeliveredMap(db));
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

export type SimilarCustomer = CustomerListItem & {
  /** 他のスタッフが担当している顧客か。詳細は開けないが、二重登録は防ぐ */
  isOtherStaff: boolean;
};

/**
 * 似た顧客を探す。
 * 顧客1,000名規模だと、再来店の見落としや同姓同名による二重登録が必ず起きるため、
 * 新規登録の入力中に候補を出して気づけるようにする。
 *
 * ここだけは担当の境界を越えて全顧客を見る。他のスタッフが担当している人を
 * 二重に登録してしまうと、データが分裂して後から直せないため。
 * ただし他人の顧客は氏名以外を返さない。
 */
export async function findSimilarCustomers(input: {
  name?: string;
  nameKana?: string;
  phone?: string;
}): Promise<SimilarCustomer[]> {
  const staffId = getCurrentStaffId();
  const delivered = lastDeliveredMap(getDb());
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
    .map((c) => {
      const isOtherStaff = c.staffId !== staffId;
      // 他人の顧客は存在と氏名だけ。会社名・接触状況・納品状況は出さない
      const safe = isOtherStaff
        ? ({ ...c, companyName: undefined, phone: undefined, lastContactedAt: undefined } as Customer)
        : c;
      return {
        ...decorate(safe, isOtherStaff ? new Map() : delivered),
        isOtherStaff,
      };
    });
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
        // 登録した人が担当になる
        staffId: getCurrentStaffId(),
        createdAt: new Date().toISOString().slice(0, 10),
        ...input,
        id,
      } as Customer,
    ],
  }));
  return id;
}
