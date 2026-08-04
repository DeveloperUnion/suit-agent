import type { Staff, Uuid } from "@/lib/types";
import { getDb, mutateDb } from "@/lib/store/mock-db";

/**
 * ログイン中のスタッフ。
 *
 * 認証はモックの対象外のため、いまはストア内のセッション値を返す。
 * 実装時はここをセッション（Cookie / JWT）から引く形に差し替える。
 * 画面はこの関数だけを見るようにしておく。
 *
 * この値は 2 つの意味を持つ:
 *   - 誰の顧客を表示するか（顧客はスタッフごとに分割されている）
 *   - 採寸票・注文・メッセージに「誰がやったか」として記録される操作者
 */

export function getCurrentStaffId(): Uuid {
  return getDb().session.staffId;
}

export function getCurrentStaff(): Staff | undefined {
  const db = getDb();
  return db.staff.find((s) => s.id === db.session.staffId);
}

/** モックで挙動を確認するための切り替え。実装時は不要になる */
export function switchStaff(staffId: Uuid): void {
  mutateDb((db) => ({ ...db, session: { staffId } }));
}

export function listStaffForSwitcher(): Staff[] {
  return getDb().staff.filter((s) => s.isActive);
}
