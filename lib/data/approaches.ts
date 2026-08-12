import type {
  AnniversaryType,
  ApproachStatus,
  ApproachTask,
  IsoDate,
  TriggerType,
  Uuid,
} from "@/lib/types";
import { supabase } from "@/lib/supabase/client";
import { bump } from "@/lib/store/revision";
import { getCurrentStaffId, getViewingStaffId } from "@/lib/auth/current-staff";
import { ANNIVERSARY_LABEL } from "@/lib/constants/labels";
import { postDeliveryMilestones, type PostDeliveryMilestone } from "@/lib/constants/approach";
import { type CustomerListItem } from "@/lib/data/customers";
import { getAppSettings } from "@/lib/data/settings";
import {
  addMonths,
  daysSince,
  daysUntilNextAnniversary,
  formatDateDot,
  toIsoDate,
} from "@/lib/utils/date";

/**
 * アプローチの評価。
 *
 * 「今日連絡すべき人」を、事前にレコードを作らずその場で毎回導出する。
 * 閾値を変えたら即座に結果へ反映されるべきだから。
 * 保存するのは、その結果に人が下した判断（連絡した／スキップした）だけ。
 *
 * このシステムはメッセージを送らない。連絡は担当者が普段の連絡手段で手で行い、
 * ここで出すのはその「気づき」まで。
 */

/** 1 トリガー分の発火 */
export type TriggerHit = {
  type: TriggerType;
  /**
   * どのトリガー実体か。人が下した判断はこの単位で保存する。
   * 半年をスキップしても 1 年後は出したいし、今年の誕生日を見送っても来年は出したいため。
   */
  key: string;
  /** なぜ今この顧客なのか。スタッフが納得して連絡できることが要件 */
  reason: string;
  /** 並べ替えの重み */
  weight: number;
};

export type ApproachItem = {
  /** 顧客ごとに 1 件へ統合する（同じ人に二度気づかせても仕方がないため） */
  id: Uuid;
  customer: CustomerListItem;
  hits: TriggerHit[];
  triggerTypes: TriggerType[];
  dueDate: IsoDate;
  score: number;
};

/** 導出したアプローチの ID。顧客ごとに 1 件なので顧客 ID から決まる */
function approachIdFor(customerId: Uuid): Uuid {
  return `apr-${customerId}`;
}

// ── 各トリガーの評価 ────────────────────────────────

/**
 * お渡し後フォロー。
 *
 * 既定ではお渡しの半年後と 1 年後に声をかける（節目は app_settings で変えられる）。
 * 起点は最新のお渡しで、注文ごとには立てない
 * （新しくお渡しがあれば、古いお渡しのフォローはもう意味を持たないため）。
 *
 * お渡し日が空の注文は納品日で代用する（v_customers）。お渡し日は顧客の都合で
 * 決まるので発注書には無く、空を理由に一生フォローが立たないほうが害が大きい。
 *
 * 半年を逃したまま 1 年が来たら、出すのは 1 年のほうだけ。そのとき言うべきことは
 * 「1 年経ちました」であって「半年経ちました」ではないから。
 */
function evaluatePostDelivery(
  customer: CustomerListItem,
  now: Date,
  milestones: PostDeliveryMilestone[],
): TriggerHit | null {
  const { lastDeliveredAt, lastDeliveredOrderId } = customer;
  if (!lastDeliveredAt || !lastDeliveredOrderId) return null;

  const delivered = new Date(`${lastDeliveredAt}T00:00:00`);

  // 過ぎている節目のうち最も後のものを採る
  for (const milestone of [...milestones].reverse()) {
    const dueDate = toIsoDate(addMonths(delivered, milestone.months));
    if (dueDate > toIsoDate(now)) continue;

    const overdue = daysSince(dueDate, now) ?? 0;
    return {
      type: "post_delivery",
      key: `post_delivery:${lastDeliveredOrderId}:${milestone.key}`,
      reason: `${formatDateDot(lastDeliveredAt)}のお渡しから${milestone.label}が経ちました。着心地を伺う頃合いです。`,
      // 節目を過ぎたまま放置されているものほど前に出す。
      // ただし記念日を押しのけないよう、上限を設けて頭打ちにする
      weight: 20 + Math.min(10, Math.floor(overdue / 30)),
    };
  }
  return null;
}

function evaluateAnniversary(
  anniversaries: AnniversaryInput[],
  now: Date,
  leadDays: number,
): TriggerHit | null {
  const upcoming = anniversaries
    .map((a) => ({ ...a, until: daysUntilNextAnniversary(a.date, now) }))
    .filter((a) => a.until <= leadDays)
    .sort((a, b) => a.until - b.until)[0];
  if (!upcoming) return null;

  const label = upcoming.label || ANNIVERSARY_LABEL[upcoming.type];
  // 記念日そのものが来る年。年末に翌年の記念日を予告している場合は翌年になる
  const yearOfNext = new Date(now.getFullYear(), now.getMonth(), now.getDate() + upcoming.until)
    .getFullYear();

  return {
    type: "anniversary",
    key: `anniversary:${upcoming.id}:${yearOfNext}`,
    reason:
      upcoming.until === 0
        ? `本日は${label}です。`
        : `${label}まであと${upcoming.until}日です。`,
    // 記念日は日が過ぎると意味がなくなるため、近いほど強く前に出す
    weight: 34 - Math.min(20, upcoming.until),
  };
}

// ── 一覧 ────────────────────────────────────────

export type ApproachFilter = {
  triggerType?: TriggerType;
};

/**
 * 発火中のアプローチを顧客ごとに 1 件へ統合して返す。
 *
 * 1 日に出す件数の上限は設けていない。トリガーが記念日とお渡し後の 2 つだけなら
 * リストが溢れることはなく、上限で隠すと「見えていない分がある」という
 * 不安のほうが残るため。
 */
export type AnniversaryInput = { id: Uuid; type: AnniversaryType; date: IsoDate; label: string };

type ApproachInputRow = {
  customerId: Uuid;
  name: string;
  nameKana: string;
  companyName: string | null;
  staffId: Uuid;
  lastDeliveredAt: IsoDate | null;
  lastDeliveredOrderId: Uuid | null;
  daysSinceDelivery: number | null;
  anniversaries: AnniversaryInput[];
};

export async function listApproaches(filter: ApproachFilter = {}): Promise<ApproachItem[]> {
  const now = new Date();
  const today = toIsoDate(now);

  // 入力は 1 クエリで束ねる。モックは顧客ごとに anniversaries を走査していて、
  // localStorage では無害だったが DB では 300 クエリになる。
  let q = supabase().from("v_approach_inputs").select(`
    customerId:customer_id, name, nameKana:name_kana, companyName:company_name,
    staffId:staff_id,
    lastDeliveredAt:last_delivered_at, lastDeliveredOrderId:last_delivered_order_id,
    daysSinceDelivery:days_since_delivery, anniversaries
  `);
  // 既定は自分の担当。管理者が切り替えていればその人の分だけ。
  q = q.eq("staff_id", getViewingStaffId() ?? (await getCurrentStaffId()) ?? "");

  const [{ data, error }, { data: done }, settings] = await Promise.all([
    q,
    supabase().from("approach_resolutions").select("trigger_key"),
    getAppSettings(),
  ]);
  if (error) throw error;

  const milestones = postDeliveryMilestones(settings.postDeliveryMonths);

  const resolved = new Set(
    (done ?? []).map((r) => (r as { trigger_key: string }).trigger_key),
  );

  const items: ApproachItem[] = [];

  for (const row of (data ?? []) as unknown as ApproachInputRow[]) {
    const customer = {
      ...row,
      id: row.customerId,
      companyName: row.companyName ?? undefined,
      lastDeliveredAt: row.lastDeliveredAt ?? undefined,
      lastDeliveredOrderId: row.lastDeliveredOrderId ?? undefined,
    } as unknown as CustomerListItem;

    const hits = [
      evaluatePostDelivery(customer, now, milestones),
      evaluateAnniversary(row.anniversaries ?? [], now, settings.anniversaryLeadDays),
    ].filter((hit): hit is TriggerHit => hit !== null && !resolved.has(hit.key));

    if (hits.length === 0) continue;
    if (filter.triggerType && !hits.some((h) => h.type === filter.triggerType)) continue;

    hits.sort((a, b) => b.weight - a.weight);

    items.push({
      id: approachIdFor(customer.id),
      customer,
      hits,
      triggerTypes: hits.map((h) => h.type),
      dueDate: today,
      score: hits.reduce((sum, h) => sum + h.weight, 0),
    });
  }

  return items.sort(
    (a, b) =>
      b.score - a.score ||
      (b.customer.daysSinceDelivery ?? 0) - (a.customer.daysSinceDelivery ?? 0),
  );
}

/** 顧客カルテ用。その顧客に今アプローチが立っていれば返す */
export async function getApproachForCustomer(customerId: Uuid): Promise<ApproachItem | null> {
  const items = await listApproaches();
  return items.find((i) => i.customer.id === customerId) ?? null;
}

// ── 判断の保存 ──────────────────────────────────

/**
 * 立っているアプローチを解決する。
 *
 * 一度の連絡で複数の理由に触れられるので、その顧客に立っているヒットをまとめて畳む。
 * 「連絡した」のときだけ最終接触日を動かす — スキップは連絡していないため。
 *
 * 通知は時間では消えない。押されるまで残す（見落としが勝手に消えないように）。
 */
export async function resolveApproach(
  customerId: Uuid,
  status: ApproachStatus,
): Promise<void> {
  const item = await getApproachForCustomer(customerId);
  if (!item) return;

  // resolved_by_staff_id は渡さない。DB の default が app.current_staff_id()。
  // trigger_key の unique が冪等性の本体なので、二度押しは何も増やさない。
  const { error } = await supabase()
    .from("approach_resolutions")
    .upsert(
      item.hits.map((hit) => ({
        trigger_key: hit.key,
        customer_id: customerId,
        trigger_type: hit.type,
        reason: hit.reason,
        status,
      })),
      { onConflict: "trigger_key", ignoreDuplicates: true },
    );
  if (error) throw error;

  // 顧客行には何も書き戻さない。最終接触日は持たないことにした
  // （実際の連絡は個人の連絡手段で行われるので、ここで拾える分は一部でしかなく、
  // それを「最終連絡」として出すと昨日連絡した相手が半年前に見える）。
  // 「対応した／見送った」の記録は上の approach_resolutions が持っている。
  bump();
}

/** 対応履歴。カルテのアプローチタブに出す */
export async function listApproachHistory(customerId: Uuid): Promise<ApproachTask[]> {
  const { data, error } = await supabase()
    .from("approach_resolutions")
    .select(
      "id, customerId:customer_id, triggerKey:trigger_key, triggerType:trigger_type, reason, status, resolvedAt:resolved_at",
    )
    .eq("customer_id", customerId)
    .order("resolved_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ApproachTask[];
}
