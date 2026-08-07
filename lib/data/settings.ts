import type { AppSettings, Fabric, ItemTypeId, Staff, Uuid } from "@/lib/types";
import { getDb, mutateDb, newId } from "@/lib/store/mock-db";
import { getCurrentStaffId } from "@/lib/auth/current-staff";
import { DEFAULT_SETTINGS } from "@/lib/constants/settings-defaults";

export { DEFAULT_SETTINGS };

/**
 * 設定・スタッフ・生地マスタ。
 *
 * トリガーの閾値はここが唯一の出どころになる。判定ロジックの中に数値を書かない。
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
