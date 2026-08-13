import type { Customer, CustomerAnniversary, IsoDate, Staff, Uuid } from "@/lib/types";
import { supabase } from "@/lib/supabase/client";
import { bump } from "@/lib/store/revision";
import { getCurrentStaffId, getViewingStaffId } from "@/lib/auth/current-staff";
import { INDUSTRIES } from "@/lib/constants/industries";
import { PREFECTURES } from "@/lib/constants/prefectures";

/**
 * 顧客のデータアクセス。
 *
 * 担当による絞り込みはここに書かない。RLS が「自分の担当 or 管理者なら閲覧、
 * 編集は自担当のみ」を持っているので、うっかり書き忘れても他人の顧客は
 * 出てこない（モックの updateCustomer には実際にその書き忘れがあった）。
 *
 * ここで staffId を見るのは 1 箇所だけ — 管理者が画面左上で「表示中のスタッフ」を
 * 切り替えたときの絞り込み。これは閲覧フィルタであって権限ではない。
 * 一般スタッフが立てても RLS が天井なので安全側に倒れる。
 */

export type CustomerListItem = Customer & {
  /**
   * 最終お渡し日。お渡し日が空の注文は納品日で代用する（v_customers）。
   * 注文が1件も無ければ undefined。
   */
  lastDeliveredAt?: IsoDate;
  /** その注文 ID。お渡し後フォローがどのお渡しに対する通知かを識別するのに使う */
  lastDeliveredOrderId?: Uuid;
  /**
   * お渡しからの経過日数。注文が1件も無ければ null。
   * 「最終接触から」ではない。着心地を伺うのに意味があるのはお渡しからの日数のため。
   */
  daysSinceDelivery: number | null;
  /** キャンセルを除く注文件数。同姓同名の見分けに使う */
  orderCount: number;
};

export type CustomerFilter = {
  keyword?: string;
  /** 居住地の都道府県。災害時にその地域の顧客だけを出すために使う */
  residencePrefecture?: string;
  /** 勤務先の業種。業界単位で連絡する理由ができたときに絞る */
  industry?: string;
};

/**
 * 列の別名は select の中で付ける。
 * 変換関数を別に持つと、列を足したときに片方だけ直す事故が起きる。
 */
const CUSTOMER_COLUMNS = `
  id, name, nameKana:name_kana, birthDate:birth_date, gender, phone, email, address,
  residencePrefecture:residence_prefecture,
  embroideryName:embroidery_name,
  companyName:company_name, department, jobTitle:job_title, industry,
  familyInfo:family_info,
  staffId:staff_id, createdAt:created_at
`;

const LIST_COLUMNS = `
  ${CUSTOMER_COLUMNS},
  lastDeliveredAt:last_delivered_at,
  lastDeliveredOrderId:last_delivered_order_id,
  daysSinceDelivery:days_since_delivery,
  orderCount:order_count
`;

/** null を undefined に均す。型は省略可能項目を undefined で表している */
function clean<T extends Record<string, unknown>>(row: T): T {
  const out = {} as T;
  for (const [k, v] of Object.entries(row)) {
    (out as Record<string, unknown>)[k] = v === null && k !== "daysSinceDelivery" ? undefined : v;
  }
  return out;
}

export async function listCustomers(filter: CustomerFilter = {}): Promise<CustomerListItem[]> {
  let q = supabase()
    .from("v_customers")
    .select(LIST_COLUMNS)
    .is("archived_at", null);

  // 既定は自分の担当。管理者は RLS 上は全顧客を見られるが、それは
  // 「切り替えたときに見える」ためのものであって、既定で全員が並ぶと
  // 自分の顧客を探せなくなる。
  q = q.eq("staff_id", await viewingStaffId());

  if (filter.residencePrefecture) q = q.eq("residence_prefecture", filter.residencePrefecture);
  if (filter.industry) q = q.eq("industry", filter.industry);

  const keyword = filter.keyword?.trim();
  if (keyword) {
    // 生成列 search_key は氏名・カナ・会社名を app.normalize_ja() で正規化して
    // 連結したもの。UI とエージェントで別の正規化をすると
    // 「画面には出るのに AI が見つけられない」が起きるので、入口を 1 つにしてある。
    //
    // 3,000 行の seq scan で 1〜3ms。インデックスは張らない
    // （2ms のために pg_trgm を入れて移植性を捨てる価値がない）。
    q = q.ilike("search_key", `%${normalizeForSearch(keyword)}%`);
  }

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((r) => clean(r as unknown as CustomerListItem)).sort(byStaleness);
}

/**
 * いま「誰のページ」を見ているか。
 *
 * 管理者が切り替えていればその人、そうでなければ自分。
 * これは表示の絞り込みであって権限ではない — 一般スタッフが他人を指しても
 * RLS が天井なので 0 行になり、安全側に倒れる。
 */
async function viewingStaffId(): Promise<string> {
  return getViewingStaffId() ?? (await getCurrentStaffId()) ?? "";
}

/**
 * app.normalize_ja() のクライアント側。DB と挙動を揃える。
 * ひらがなをカタカナへ寄せるので「たなか」で「タナカ」を引ける。
 */
function normalizeForSearch(value: string): string {
  return value
    .replace(/[\s　]/g, "")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/ｰ/g, "ー")
    .toLowerCase();
}

/**
 * 注文が 1 件も無い顧客は起点が無いので末尾に置く。
 * 0 日目として扱うと「今日お渡しした人」と同じ位置に紛れてしまう。
 */
function byStaleness(a: CustomerListItem, b: CustomerListItem): number {
  if (a.daysSinceDelivery === null && b.daysSinceDelivery === null) {
    return a.nameKana.localeCompare(b.nameKana, "ja");
  }
  if (a.daysSinceDelivery === null) return 1;
  if (b.daysSinceDelivery === null) return -1;
  return b.daysSinceDelivery - a.daysSinceDelivery;
}

/**
 * 絞り込みに出す居住地の一覧。担当顧客に実在する都道府県だけを返す。
 * 47件を並べても大半が0件になり、選べる県を探すほうが手間になるため。
 */
export async function listResidencePrefectures(): Promise<
  { prefecture: string; count: number }[]
> {
  const counts = await countBy("residence_prefecture");
  return PREFECTURES.filter((p) => counts.has(p)).map((p) => ({
    prefecture: p,
    count: counts.get(p) as number,
  }));
}

/**
 * 絞り込みに出す業種の一覧。居住地と同じく、担当顧客に実在する業種だけを返す。
 *
 * 業種は自由記述も許しているため、定数に無い値も入ってくる。
 * 定数の順に並べたあと、自由記述のものを五十音で後ろに足す。
 * 定数だけを見て組むと、自分で入れた業種が絞り込みに出てこない。
 */
export async function listIndustries(): Promise<{ industry: string; count: number }[]> {
  const counts = await countBy("industry");
  const known = INDUSTRIES.filter((i) => counts.has(i)) as readonly string[];
  const free = [...counts.keys()]
    .filter((i) => !known.includes(i))
    .sort((a, b) => a.localeCompare(b, "ja"));
  return [...known, ...free].map((i) => ({ industry: i, count: counts.get(i) as number }));
}

/**
 * 絞り込みの選択肢を数える。
 * 3,000 行なので集計は素直に全件引いて数える。SQL 側に関数を増やすほどの
 * 頻度でも件数でもない。
 */
async function countBy(column: "residence_prefecture" | "industry"): Promise<Map<string, number>> {
  const { data, error } = await supabase()
    .from("customers")
    .select(column)
    .is("archived_at", null)
    .not(column, "is", null)
    .eq("staff_id", await viewingStaffId());
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const value = (row as Record<string, string>)[column];
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/**
 * 担当外の顧客は null を返す。URL を直接叩かれても開けない。
 *
 * モックはここで staffId を突き合わせていたが、その分岐は消えた。
 * RLS が 0 行を返すので maybeSingle() が自然に null になる。
 */
export async function getCustomer(id: Uuid): Promise<CustomerListItem | null> {
  const { data, error } = await supabase()
    .from("v_customers")
    .select(LIST_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? clean(data as unknown as CustomerListItem) : null;
}

export async function listAnniversaries(customerId: Uuid): Promise<CustomerAnniversary[]> {
  const { data, error } = await supabase()
    .from("customer_anniversaries")
    .select("id, customerId:customer_id, type, date, label")
    .eq("customer_id", customerId)
    .order("date");
  if (error) throw error;
  return (data ?? []) as unknown as CustomerAnniversary[];
}

/**
 * 記念日の保存。
 *
 * モックは全削除＋全挿入だったが、DB では行単位にする。
 * 理由が 2 つある:
 *   1. change_log が毎回「全削除＋全挿入」で埋まり、変更履歴が読めなくなる
 *   2. 全置換すると id が振り直され、approach_resolutions.trigger_key
 *      （anniversary:{id}:{年}）が別の記念日を指すようになる。
 *      スキップした誕生日の判断が、消したあとに結婚記念日へ移る、といった
 *      無音の誤りが起きる
 *
 * 画面からは「今この顧客に何があるか」の全体が渡ってくるので、
 * 消えたものだけを DELETE し、残りを upsert する。
 *
 * 誕生日の行は app.sync_birthday_anniversary() が生年月日から作る。ここで
 * 消すこともできるが、生年月日を次に編集したときに作り直される。
 */
export async function saveAnniversaries(
  customerId: Uuid,
  entries: (Omit<CustomerAnniversary, "id" | "customerId"> & { id?: Uuid })[],
): Promise<void> {
  const keep = entries.map((e) => e.id).filter((id): id is Uuid => Boolean(id));

  let del = supabase().from("customer_anniversaries").delete().eq("customer_id", customerId);
  if (keep.length > 0) del = del.not("id", "in", `(${keep.join(",")})`);
  const { error: delError } = await del;
  if (delError) throw delError;

  const rows = entries.map((e) => ({
    ...(e.id ? { id: e.id } : {}),
    customer_id: customerId,
    type: e.type,
    date: e.date,
    label: e.label ?? "",
  }));
  if (rows.length > 0) {
    const { error } = await supabase().from("customer_anniversaries").upsert(rows);
    if (error) throw error;
  }
  bump();
}

export async function listStaff(): Promise<Staff[]> {
  const { data, error } = await supabase()
    .from("staff")
    .select("id, name, email, role, isActive:is_active")
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as Staff[];
}

export type SimilarCustomer = CustomerListItem & {
  /** 他のスタッフが担当している顧客か。詳細は開けないが、二重登録は防ぐ */
  isOtherStaff: boolean;
  /** 担当しているスタッフの名前。他人の担当だったとき、誰に確認すればよいか分かるように */
  staffName: string;
};

/**
 * 似た顧客を探す。
 *
 * ここだけは担当の境界を越える。他のスタッフが担当している人を二重に登録して
 * しまうと、データが分裂して後から直せないため。
 *
 * 越境は app.find_similar_customers()（SECURITY DEFINER）に閉じてあり、
 * 他人の顧客は氏名・カナ・担当者名しか返らない。名簿の抜き出しには使えない。
 *
 * 呼ぶのは public のラッパのほう。PostgREST が公開しているのは public だけで、
 * app スキーマの関数は rpc() から見えない。
 */
export async function findSimilarCustomers(input: {
  name?: string;
  nameKana?: string;
  phone?: string;
}): Promise<SimilarCustomer[]> {
  const { data, error } = await supabase().rpc("find_similar_customers", {
    p_name: input.name ?? null,
    p_name_kana: input.nameKana ?? null,
    p_phone: input.phone ?? null,
  });
  if (error) throw error;

  type Row = {
    id: string;
    name: string;
    name_kana: string;
    staff_name: string;
    is_other_staff: boolean;
  };
  const rows = (data ?? []) as Row[];

  // 自分の担当のぶんは通常の経路で詳細を足す。他人のぶんは氏名と担当者名のまま。
  const mine = rows.filter((r) => !r.is_other_staff).map((r) => r.id);
  const detail = new Map<string, CustomerListItem>();
  if (mine.length > 0) {
    const { data: full } = await supabase()
      .from("v_customers")
      .select(LIST_COLUMNS)
      .in("id", mine);
    for (const c of full ?? []) {
      const item = clean(c as unknown as CustomerListItem);
      detail.set(item.id, item);
    }
  }

  return rows.map((r) => {
    const full = detail.get(r.id);
    if (full) return { ...full, isOtherStaff: false, staffName: r.staff_name };
    return {
      id: r.id,
      name: r.name,
      nameKana: r.name_kana,
      staffId: "",
      createdAt: "",
      daysSinceDelivery: null,
      orderCount: 0,
      isOtherStaff: true,
      staffName: r.staff_name,
    } as SimilarCustomer;
  });
}

/**
 * 顧客の更新。
 *
 * モックではここに staffId のチェックが無く、id さえ分かれば他人の顧客を
 * 書き換えられた。RLS にしたので、この関数を 1 行も変えずにその穴が塞がる。
 * 担当外を指定しても 0 行になるだけで、エラーにもならない。
 */
export async function updateCustomer(id: Uuid, patch: Partial<Customer>): Promise<void> {
  const { error } = await supabase().from("customers").update(toRow(patch)).eq("id", id);
  if (error) throw error;
  bump();
}

/**
 * 顧客の物理削除。
 *
 * public.delete_customer()（SECURITY DEFINER）が全部やる。テーブルへの
 * delete 権限は付いていないので、消す口はこの 1 本だけ。
 *
 * 着装写真があった頃はこの手前で Storage を消していた（SQL から Storage に
 * 手が届かないため）。写真をやめたので、削除は再び RPC 1 本で完結する。
 */
export async function deleteCustomer(id: Uuid): Promise<void> {
  const { error } = await supabase().rpc("delete_customer", { p_customer_id: id });
  if (error) throw error;
  bump();
}

/**
 * 顧客の登録。
 *
 * staffId を渡さない。customers.staff_id の default が
 * app.current_staff_id() なので「登録した人が担当になる」が DB 側で決まり、
 * WITH CHECK と合わせて他人名義での登録が構造的に不可能になっている。
 */
export async function createCustomer(
  input: Pick<Customer, "name" | "nameKana"> & Partial<Customer>,
): Promise<Uuid> {
  const { data, error } = await supabase()
    .from("customers")
    .insert(toRow(input))
    .select("id")
    .single();
  if (error) throw error;
  bump();
  return (data as { id: string }).id;
}

/** camelCase の patch を列名へ写す。undefined の項目は触らない */
function toRow(patch: Partial<Customer>): Record<string, unknown> {
  const map: Record<keyof Customer & string, string> = {
    id: "id",
    name: "name",
    nameKana: "name_kana",
    birthDate: "birth_date",
    gender: "gender",
    phone: "phone",
    email: "email",
    address: "address",
    residencePrefecture: "residence_prefecture",
    embroideryName: "embroidery_name",
    companyName: "company_name",
    department: "department",
    jobTitle: "job_title",
    industry: "industry",
    familyInfo: "family_info",
    staffId: "staff_id",
    createdAt: "created_at",
  };

  const row: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(map)) {
    const value = (patch as Record<string, unknown>)[key];
    if (value === undefined) continue;
    // id と staffId はここでは動かさない。担当の付け替えは
    // app.deactivate_staff()（引き継ぎ）だけの仕事にしてある。
    if (key === "id" || key === "staffId") continue;
    row[column] = value === "" ? null : value;
  }
  return row;
}
