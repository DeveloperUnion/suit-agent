import type { AppSettings, IsoMonth, Staff, Uuid } from "@/lib/types";
import { supabase } from "@/lib/supabase/client";
import { bump } from "@/lib/store/revision";
import { getCurrentStaffId } from "@/lib/auth/current-staff";
import {
  DEFAULT_ANNIVERSARY_LEAD_DAYS,
  DEFAULT_POST_DELIVERY_MONTHS,
} from "@/lib/constants/approach";

/**
 * 店舗共通の設定・スタッフ・売上目標。
 *
 * 店舗が変えられる業務ルールは app_settings の 1 行だけ
 * （お渡し後フォローの節目と、記念日を何日前から出すか）。
 *
 * 設定もスタッフも、編集できるのは管理者だけ。RLS が app.is_admin() を見ているので、
 * ここに権限の分岐は書かない。
 */

// ── 店舗共通の設定 ──────────────────────────────────────

export const DEFAULT_APP_SETTINGS: AppSettings = {
  postDeliveryMonths: DEFAULT_POST_DELIVERY_MONTHS,
  anniversaryLeadDays: DEFAULT_ANNIVERSARY_LEAD_DAYS,
};

/**
 * アプローチの評価は画面を開くたびに走るので、そのたびに設定を引くと
 * 1 画面で何度も同じ 1 行を取りに行く。プロセス内にキャッシュする。
 * 書き込み後は updateAppSettings が捨て、bump() が画面を引き直させる。
 */
let cachedSettings: AppSettings | undefined;

export async function getAppSettings(): Promise<AppSettings> {
  if (cachedSettings) return cachedSettings;

  const { data, error } = await supabase()
    .from("app_settings")
    .select("postDeliveryMonths:post_delivery_months, anniversaryLeadDays:anniversary_lead_days")
    .maybeSingle();
  if (error) throw error;

  // 未ログインなど、行が引けないときは既定値。設定が読めないことを理由に
  // 画面が真っ白になるより、既定の半年・1年で動いているほうが害が小さい。
  cachedSettings = (data as AppSettings | null) ?? DEFAULT_APP_SETTINGS;
  return cachedSettings;
}

export async function updateAppSettings(patch: Partial<AppSettings>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.postDeliveryMonths) row.post_delivery_months = patch.postDeliveryMonths;
  if (patch.anniversaryLeadDays !== undefined) {
    row.anniversary_lead_days = patch.anniversaryLeadDays;
  }

  // 管理者でなければ RLS が 0 行にする。エラーにならないので、
  // 「保存しました」と嘘のトーストを出さないよう返り行数で確かめる。
  const { data, error } = await supabase()
    .from("app_settings")
    .update(row)
    .eq("id", true)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("設定を変更できるのは管理者だけです");

  cachedSettings = undefined;
  bump();
}

// ── スタッフ ────────────────────────────────────────────

const STAFF_COLUMNS = "id, name, email, role, isActive:is_active";

export type StaffWithLoad = Staff & {
  /** 担当している顧客数。無効化するときの引き継ぎ判断に使う */
  customerCount: number;
  /** ログイン中の本人か */
  isCurrent: boolean;
};

export async function listAllStaff(): Promise<StaffWithLoad[]> {
  const [{ data: staff, error }, currentId] = await Promise.all([
    supabase().from("staff").select(STAFF_COLUMNS).order("name"),
    getCurrentStaffId(),
  ]);
  if (error) throw error;

  // 担当件数は管理者しか正しく数えられない（RLS が他人の顧客を隠すため）。
  // 一般スタッフには 0 が並ぶが、スタッフ管理画面自体を管理者にしか出さない。
  const { data: customers } = await supabase()
    .from("customers")
    .select("staff_id")
    .is("archived_at", null);

  const counts = new Map<string, number>();
  for (const c of customers ?? []) {
    const id = (c as { staff_id: string }).staff_id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return (staff ?? []).map((s) => {
    const row = s as unknown as Staff;
    return { ...row, customerCount: counts.get(row.id) ?? 0, isCurrent: row.id === currentId };
  });
}

/**
 * スタッフの追加・更新は管理者だけ（RLS）。
 *
 * 権限が無いと RLS は行を 0 にするだけでエラーにしない。返り行数を見ないと
 * 「追加しました」という嘘のトーストが出るので、updateAppSettings と同じく
 * ここで確かめる。画面側でもボタンを出し分けているが、それは見た目の話でしかない。
 */
const NOT_ADMIN = "スタッフを変更できるのは管理者だけです";

export async function createStaff(input: Omit<Staff, "id" | "isActive">): Promise<Uuid> {
  const { data, error } = await supabase()
    .from("staff")
    .insert({ name: input.name, email: input.email, role: input.role })
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error(NOT_ADMIN);
  bump();
  return (data[0] as { id: string }).id;
}

export async function updateStaff(id: Uuid, patch: Partial<Omit<Staff, "id">>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.role !== undefined) row.role = patch.role;
  if (patch.isActive !== undefined) row.is_active = patch.isActive;

  const { data, error } = await supabase().from("staff").update(row).eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error(NOT_ADMIN);
  bump();
}

/**
 * スタッフを無効化し、その人の顧客を引き継ぐ。
 *
 * 引き継がずに無効化すると、その顧客が誰からも見えなくなる。
 * 要件1.2-3「退職時に関係資産が消失する」を自分で再現してしまう。
 *
 * これは RLS を貫通する唯一の書き込み経路。管理者でも他人の顧客は UPDATE
 * できないので、通常のクエリでは付け替えられない。
 * 守るべき条件（自分は無効化できない／引き継ぎ先は有効なスタッフ）は
 * SECURITY DEFINER 関数の中に置き、他の経路を残さない。
 *
 * TODO(Phase 3): app.deactivate_staff() を実装する。
 * それまでは無効化だけを行い、引き継ぎは手作業になる。
 */
export async function deactivateStaff(id: Uuid, reassignToId: Uuid): Promise<void> {
  if (id === (await getCurrentStaffId())) return;
  void reassignToId;
  const { error } = await supabase()
    .from("staff")
    .update({ is_active: false, deactivated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  bump();
}

export async function activateStaff(id: Uuid): Promise<void> {
  const { error } = await supabase()
    .from("staff")
    .update({ is_active: true, deactivated_at: null })
    .eq("id", id);
  if (error) throw error;
  bump();
}

// ── 売上目標 ────────────────────────────────────────────

export type RevenueTargetRow = { month: IsoMonth; amount: number };

export async function listRevenueTargets(
  staffId: Uuid,
  year: number,
): Promise<RevenueTargetRow[]> {
  const { data, error } = await supabase()
    .from("revenue_targets")
    .select("month, amount")
    .eq("staff_id", staffId)
    .like("month", `${year}-%`)
    .order("month");
  if (error) throw error;
  return (data ?? []) as RevenueTargetRow[];
}

/** 未設定は null（0 とは区別する。0 を保存すると「目標0円を達成した」になる） */
export async function getRevenueTarget(staffId: Uuid, month: IsoMonth): Promise<number | null> {
  const { data } = await supabase()
    .from("revenue_targets")
    .select("amount")
    .eq("staff_id", staffId)
    .eq("month", month)
    .maybeSingle();
  return (data as { amount: number } | null)?.amount ?? null;
}

/**
 * その年の月別実績。目標の入力欄の隣に置き、額を決める材料にする。
 *
 * 集計の単位は「担当している顧客の注文」で、ダッシュボードと揃える。
 * 受注者（orders.taken_by_staff_id）で数えると、同僚が代わりに受けた注文が
 * 自分の実績から抜け落ちてしまうため。
 *
 * 金額は税込（total_amount）。紙の合計欄と目で一致することを優先した店舗判断。
 */
export async function listMonthlyRevenue(
  staffId: Uuid,
  year: number,
): Promise<Record<IsoMonth, number>> {
  const { data, error } = await supabase()
    .from("orders")
    .select("ordered_at, total_amount, customers!inner ( staff_id )")
    .eq("customers.staff_id", staffId)
    .gte("ordered_at", `${year}-01-01`)
    .lte("ordered_at", `${year}-12-31`);
  if (error) throw error;

  const result: Record<IsoMonth, number> = {};
  for (const row of data ?? []) {
    const o = row as unknown as { ordered_at: string; total_amount: number };
    const month = o.ordered_at.slice(0, 7);
    result[month] = (result[month] ?? 0) + o.total_amount;
  }
  return result;
}

/**
 * 月単位の upsert。0 以下は行ごと削除して「未設定」に戻す。
 *
 * **変わった月だけを渡すこと。**画面が 12 ヶ月ぶんを毎回渡していた頃は、
 * 触っていない空欄の月まで「0 になった＝未設定に戻せ」と解釈され、
 * 1 つでも空欄があれば全部が削除に回っていた。しかも削除が先に走るので、
 * 金額を入れた月の upsert には到達しないまま例外で終わっていた
 * （= 何も保存されない）。差分を作るのは呼び出し側の仕事。
 *
 * 「未設定」は amount = 0 の行ではなく**行が無いこと**で表す。
 * ダッシュボード（lib/data/dashboard.ts）と goal-panel が
 * target === null で「未設定です」に分岐しているため。
 */
export async function saveRevenueTargets(
  staffId: Uuid,
  rows: RevenueTargetRow[],
): Promise<void> {
  const cleared = rows.filter((r) => r.amount <= 0).map((r) => r.month);
  const kept = rows.filter((r) => r.amount > 0);

  if (cleared.length > 0) {
    const { error } = await supabase()
      .from("revenue_targets")
      .delete()
      .eq("staff_id", staffId)
      .in("month", cleared);
    if (error) throw error;
  }

  if (kept.length > 0) {
    const { error } = await supabase()
      .from("revenue_targets")
      .upsert(
        kept.map((r) => ({ staff_id: staffId, month: r.month, amount: r.amount })),
        { onConflict: "staff_id,month" },
      );
    if (error) throw error;
  }
  bump();
}
