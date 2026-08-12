import type { Staff, Uuid } from "@/lib/types";
import { supabase } from "@/lib/supabase/client";
import { bump } from "@/lib/store/revision";

/**
 * ログイン中のスタッフ。
 *
 * モックではこの値が 2 つの意味を持っていた:
 *   - 誰の顧客を表示するか
 *   - 採寸票・注文に「誰がやったか」として記録される操作者
 *
 * DB では両方とも app.current_staff_id() が引き受ける。RLS が前者を、
 * 各テーブルの default が後者を担うので、データ層はもう主体を知らなくてよい。
 * ここに残るのは画面へ名前を出すためだけ。
 *
 * 管理者の「スタッフ切り替え」は下の viewingStaffId で、これとは別物。
 * 切り替えても app.current_staff_id() は本人のまま動かない。
 */

type StaffRow = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  is_active: boolean;
};

const toStaff = (r: StaffRow): Staff => ({
  id: r.id,
  name: r.name,
  email: r.email,
  role: r.role,
  isActive: r.is_active,
});

let cached: Staff | null | undefined;

export async function getCurrentStaff(): Promise<Staff | null> {
  if (cached !== undefined) return cached;

  const { data: auth } = await supabase().auth.getUser();
  if (!auth.user) {
    cached = null;
    return null;
  }

  // RLS で自分の行しか見えないわけではない（staff の閲覧は全員に開けている）ので、
  // auth_user_id で明示的に引く。
  const { data } = await supabase()
    .from("staff")
    .select("id, name, email, role, is_active")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();

  cached = data ? toStaff(data as StaffRow) : null;
  return cached;
}

export async function getCurrentStaffId(): Promise<Uuid | null> {
  return (await getCurrentStaff())?.id ?? null;
}

/** 管理者かどうか。切り替え UI を出すかの判定に使う */
export async function isAdmin(): Promise<boolean> {
  return (await getCurrentStaff())?.role === "admin";
}

// ── 表示中のスタッフ ────────────────────────────────────
//
// 管理者だけが画面左上で切り替えられる。これは「閲覧フィルタ」であって
// なりきりではない。
//
// モックの switchStaff() はセッションのスタッフ自体を差し替えていたので、
// 切り替えた状態で操作すると「白髭さんがやったこと」になり、監査ログも嘘に
// なる。本番では app.current_staff_id() は常に本人で、ここで持つのは
// 「どのスタッフの顧客を表示するか」という UI の状態にすぎない。
//
// 一般スタッフがこれを立てても実害は無い（RLS が天井なので、他人の顧客は
// そもそも 0 行になる）。安全側に倒れる。

const VIEWING_KEY = "suit-agent:viewing-staff";

let viewingStaffId: Uuid | null = null;
let viewingLoaded = false;

function loadViewing() {
  if (viewingLoaded || typeof window === "undefined") return;
  viewingLoaded = true;
  viewingStaffId = window.localStorage.getItem(VIEWING_KEY);
}

/** null なら自分の担当を見ている */
export function getViewingStaffId(): Uuid | null {
  loadViewing();
  return viewingStaffId;
}

export function setViewingStaffId(staffId: Uuid | null): void {
  loadViewing();
  viewingStaffId = staffId;
  if (typeof window !== "undefined") {
    if (staffId) window.localStorage.setItem(VIEWING_KEY, staffId);
    else window.localStorage.removeItem(VIEWING_KEY);
  }
  bump();
}

/**
 * 表示中のスタッフ。切り替えていなければ自分。
 * 画面のヘッダーはこれを出す（「今どの人のページを見ているか」が要る情報なので）。
 */
export async function getViewingStaff(): Promise<Staff | null> {
  const viewingId = getViewingStaffId();
  const me = await getCurrentStaff();
  if (!viewingId || viewingId === me?.id) return me;

  const { data } = await supabase()
    .from("staff")
    .select("id, name, email, role, is_active")
    .eq("id", viewingId)
    .maybeSingle();
  return data ? toStaff(data as StaffRow) : me;
}

/** 切り替えに出す一覧。管理者にしか表示しないが、閲覧自体は全員に開いている */
export async function listStaffForSwitcher(): Promise<Staff[]> {
  const { data } = await supabase()
    .from("staff")
    .select("id, name, email, role, is_active")
    .eq("is_active", true)
    .order("name");
  return (data ?? []).map((r) => toStaff(r as StaffRow));
}

// ── ログイン ────────────────────────────────────────────

/**
 * 唯一の入り口。メールのリンクを踏んでもらう。
 *
 * パスワードは持たない。持てば「忘れた」「使い回した」「退職者がまだ知っている」が
 * 全部こちらの問題になるが、リンク方式なら**受信箱に届く人だけが入れる**という
 * 1 つの条件に畳める。端末は個人持ちなのでセッションは実質切れず、
 * 操作が要るのは初回だけ。
 *
 * ローカルでも同じ経路を通る。届いたメールは Inbucket（http://127.0.0.1:54324）で読む。
 */
export async function signInWithMagicLink(email: string): Promise<void> {
  const { error } = await supabase().auth.signInWithOtp({
    email,
    options: {
      // 初回は認証ユーザーがまだ無いので作らせる。誰でも作れるわけではなく、
      // staff に行が無いメールは DB のトリガーが弾く
      // （app.guard_auth_user_is_staff）。管理者が設定画面で登録した人だけが、
      // ここでリンクを受け取れる。
      shouldCreateUser: true,
      emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
    },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase().auth.signOut();
  cached = undefined;
  setViewingStaffId(null);
  bump();
}

/** ログイン状態が変わったらキャッシュを捨てて画面を引き直す */
export function watchAuth(): () => void {
  const { data } = supabase().auth.onAuthStateChange(() => {
    cached = undefined;
    bump();
  });
  return () => data.subscription.unsubscribe();
}
