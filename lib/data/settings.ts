import type { AppSettings, Fabric, IsoMonth, ItemTypeId, Staff, Uuid } from "@/lib/types";
import { getDb, mutateDb, newId } from "@/lib/store/mock-db";
import { getCurrentStaffId } from "@/lib/auth/current-staff";
import { DEFAULT_SETTINGS } from "@/lib/constants/settings-defaults";

export { DEFAULT_SETTINGS };

/**
 * 設定・スタッフ・生地マスタ。
 *
 * 店舗が変えられる業務ルールはここが唯一の出どころになる。判定ロジックの中に数値を書かない。
 * 例外は納品後フォローの節目（半年・1年）で、確定した決めごとのため
 * lib/constants/approach.ts に固定値で置いている。
 */

/** 同期で読む。データ層からはこれを直接呼ぶ */
export function getSettings(): AppSettings {
  return getDb().settings ?? DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<void> {
  mutateDb((db) => ({ ...db, settings: { ...db.settings, ...patch } }));
}

// ── スタッフ ────────────────────────────────────────────

export type StaffWithLoad = Staff & {
  /** 担当している顧客数。無効化するときの引き継ぎ判断に使う */
  customerCount: number;
  /** ログイン中の本人か */
  isCurrent: boolean;
};

export async function listAllStaff(): Promise<StaffWithLoad[]> {
  const db = getDb();
  const currentId = getCurrentStaffId();
  return db.staff.map((staff) => ({
    ...staff,
    customerCount: db.customers.filter((c) => c.staffId === staff.id).length,
    isCurrent: staff.id === currentId,
  }));
}

export async function createStaff(input: Omit<Staff, "id" | "isActive">): Promise<Uuid> {
  const id = newId("staff");
  mutateDb((db) => ({ ...db, staff: [...db.staff, { ...input, id, isActive: true }] }));
  return id;
}

export async function updateStaff(id: Uuid, patch: Partial<Omit<Staff, "id">>): Promise<void> {
  mutateDb((db) => ({
    ...db,
    staff: db.staff.map((s) => (s.id === id ? { ...s, ...patch, id: s.id } : s)),
  }));
}

/**
 * スタッフを無効化し、その人の顧客を引き継ぐ。
 *
 * 顧客はスタッフごとに分割されているため、引き継がずに無効化すると
 * その顧客が誰からも見えなくなる。要件1.2-3「退職時に関係資産が消失する」を
 * 自分で再現してしまうので、無効化と付け替えを同じミューテーションで行う。
 */
export async function deactivateStaff(id: Uuid, reassignToId: Uuid): Promise<void> {
  if (id === getCurrentStaffId()) return;
  mutateDb((db) => ({
    ...db,
    staff: db.staff.map((s) => (s.id === id ? { ...s, isActive: false } : s)),
    customers: db.customers.map((c) => (c.staffId === id ? { ...c, staffId: reassignToId } : c)),
  }));
}

export async function activateStaff(id: Uuid): Promise<void> {
  mutateDb((db) => ({
    ...db,
    staff: db.staff.map((s) => (s.id === id ? { ...s, isActive: true } : s)),
  }));
}

// ── 生地マスタ ──────────────────────────────────────────

export type FabricWithUsage = Fabric & { usageCount: number };

export async function listFabricsWithUsage(): Promise<FabricWithUsage[]> {
  const db = getDb();
  return db.fabrics.map((fabric) => ({
    ...fabric,
    usageCount: db.orderItems.filter((i) => i.fabricId === fabric.id).length,
  }));
}

export async function createFabric(input: Omit<Fabric, "id">): Promise<Uuid> {
  const id = newId("fab");
  mutateDb((db) => ({ ...db, fabrics: [...db.fabrics, { ...input, id }] }));
  return id;
}

export async function updateFabric(id: Uuid, patch: Partial<Omit<Fabric, "id">>): Promise<void> {
  mutateDb((db) => ({
    ...db,
    fabrics: db.fabrics.map((f) => (f.id === id ? { ...f, ...patch, id: f.id } : f)),
  }));
}

/**
 * 使用中の生地は消さない。過去の注文から生地が消えると履歴が壊れ、
 * 「何を持っているか」の集計（要件3.1）も狂うため。
 */
export async function deleteFabric(id: Uuid): Promise<{ ok: boolean; usageCount: number }> {
  const usageCount = getDb().orderItems.filter((i) => i.fabricId === id).length;
  if (usageCount > 0) return { ok: false, usageCount };
  mutateDb((db) => ({ ...db, fabrics: db.fabrics.filter((f) => f.id !== id) }));
  return { ok: true, usageCount: 0 };
}

/** 注文登録の初期金額に使う */
export function getItemPrice(itemTypeId: ItemTypeId): number {
  return getSettings().itemPrices[itemTypeId] ?? 0;
}

// ── 売上目標 ────────────────────────────────────────────

export type RevenueTargetRow = { month: IsoMonth; amount: number };

/** 目標の ID は staffId と月から決まる。upsert を素直に書けるようにするため */
function targetId(staffId: Uuid, month: IsoMonth): Uuid {
  return `tgt-${staffId}-${month}`;
}

export async function listRevenueTargets(
  staffId: Uuid,
  year: number,
): Promise<RevenueTargetRow[]> {
  const prefix = `${year}-`;
  return getDb()
    .revenueTargets.filter((t) => t.staffId === staffId && t.month.startsWith(prefix))
    .map((t) => ({ month: t.month, amount: t.amount }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** ダッシュボードの集計から同期で引く。未設定は null（0 とは区別する） */
export function getRevenueTarget(staffId: Uuid, month: IsoMonth): number | null {
  const found = getDb().revenueTargets.find(
    (t) => t.staffId === staffId && t.month === month,
  );
  return found?.amount ?? null;
}

/**
 * その年の月別実績。目標の入力欄の隣に置き、額を決める材料にする。
 *
 * 集計の単位は「担当している顧客の注文」で、ダッシュボードと揃える。
 * 受注者（Order.staffId）で数えると、同僚が代わりに受けた注文が
 * 自分の実績から抜け落ちてしまうため。
 */
export async function listMonthlyRevenue(
  staffId: Uuid,
  year: number,
): Promise<Record<IsoMonth, number>> {
  const db = getDb();
  const customerIds = new Set(
    db.customers.filter((c) => c.staffId === staffId).map((c) => c.id),
  );
  const result: Record<IsoMonth, number> = {};
  for (const order of db.orders) {
    if (!customerIds.has(order.customerId)) continue;
    if (!order.orderedAt.startsWith(`${year}-`)) continue;
    const month = order.orderedAt.slice(0, 7);
    result[month] = (result[month] ?? 0) + order.totalAmount;
  }
  return result;
}

/**
 * 月単位の upsert。
 * 0 以下は行ごと削除して「未設定」に戻す。0 を保存すると
 * 「目標0円を達成した」というグラフになってしまうため。
 */
export async function saveRevenueTargets(
  staffId: Uuid,
  rows: RevenueTargetRow[],
): Promise<void> {
  mutateDb((db) => {
    const touched = new Set(rows.map((r) => r.month));
    return {
      ...db,
      revenueTargets: [
        ...db.revenueTargets.filter(
          (t) => t.staffId !== staffId || !touched.has(t.month),
        ),
        ...rows
          .filter((r) => r.amount > 0)
          .map((r) => ({
            id: targetId(staffId, r.month),
            staffId,
            month: r.month,
            amount: r.amount,
          })),
      ],
    };
  });
}
