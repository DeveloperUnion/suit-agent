import type { Staff, Uuid } from "@/lib/types";
import { getDb } from "@/lib/store/mock-db";

/**
 * ログイン中のスタッフ。
 *
 * 認証はモックの対象外のため、いまは固定値を返す。実装時はここをセッションから
 * 引く形に差し替える。画面はこの関数だけを見るようにしておく。
 *
 * 顧客に「担当スタッフ」は持たせない（一人一アカウントにしたうえで、顧客を
 * 特定のスタッフに紐づけない方針）。ここで返すのはあくまで操作者であり、
 * 採寸票・注文・メッセージに「誰がやったか」として記録される。
 */
const CURRENT_STAFF_ID: Uuid = "staff-1";

export function getCurrentStaffId(): Uuid {
  return CURRENT_STAFF_ID;
}

export function getCurrentStaff(): Staff | undefined {
  return getDb().staff.find((s) => s.id === CURRENT_STAFF_ID);
}
