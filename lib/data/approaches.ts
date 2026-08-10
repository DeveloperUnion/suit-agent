import type { ApproachStatus, ApproachTask, IsoDate, TriggerType, Uuid } from "@/lib/types";
import { getDb, mutateDb } from "@/lib/store/mock-db";
import { ANNIVERSARY_LABEL } from "@/lib/constants/labels";
import { POST_DELIVERY_MILESTONES } from "@/lib/constants/approach";
import { getSettings } from "@/lib/data/settings";
import { listCustomers, type CustomerListItem } from "@/lib/data/customers";
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
 * このシステムはメッセージを送らない。送るのは店主が個人 LINE から手で行い、
 * ここで出すのはその「気づき」まで。春夏・秋冬の新作案内は公式 LINE から
 * 一斉に送るもので、配信は Lstep が担うため、ここでは扱わない。
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
 * 納品後フォロー。
 *
 * 納品の半年後と 1 年後に声をかける。起点は最新の納品で、注文ごとには立てない
 * （新しく納品があれば、古い納品のフォローはもう意味を持たないため）。
 *
 * 半年を逃したまま 1 年が来たら、出すのは 1 年のほうだけ。そのとき言うべきことは
 * 「1 年経ちました」であって「半年経ちました」ではないから。
 */
function evaluatePostDelivery(customer: CustomerListItem, now: Date): TriggerHit | null {
  const { lastDeliveredAt, lastDeliveredOrderId } = customer;
  if (!lastDeliveredAt || !lastDeliveredOrderId) return null;

  const delivered = new Date(`${lastDeliveredAt}T00:00:00`);

  // 過ぎている節目のうち最も後のものを採る
  for (const milestone of [...POST_DELIVERY_MILESTONES].reverse()) {
    const dueDate = toIsoDate(addMonths(delivered, milestone.months));
    if (dueDate > toIsoDate(now)) continue;

    const overdue = daysSince(dueDate, now) ?? 0;
    return {
      type: "post_delivery",
      key: `post_delivery:${lastDeliveredOrderId}:${milestone.key}`,
      reason: `${formatDateDot(lastDeliveredAt)}の納品から${milestone.label}が経ちました。着心地を伺う頃合いです。`,
      // 節目を過ぎたまま放置されているものほど前に出す。
      // ただし記念日を押しのけないよう、上限を設けて頭打ちにする
      weight: 20 + Math.min(10, Math.floor(overdue / 30)),
    };
  }
  return null;
}

function evaluateAnniversary(customerId: Uuid, now: Date): TriggerHit | null {
  const anniversaries = getDb().anniversaries.filter((a) => a.customerId === customerId);
  const upcoming = anniversaries
    .map((a) => ({ ...a, until: daysUntilNextAnniversary(a.date, now) }))
    .filter((a) => a.until <= getSettings().anniversaryLeadDays)
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
 * 1 日に出す件数の上限は設けていない。トリガーが記念日と納品後の 2 つだけなら
 * リストが溢れることはなく、上限で隠すと「見えていない分がある」という
 * 不安のほうが残るため。
 */
export async function listApproaches(filter: ApproachFilter = {}): Promise<ApproachItem[]> {
  const now = new Date();
  const today = toIsoDate(now);
  const customers = await listCustomers();
  const resolved = new Set(getDb().approachTasks.map((t) => t.triggerKey));

  const items: ApproachItem[] = [];

  for (const customer of customers) {
    const hits = [
      evaluatePostDelivery(customer, now),
      evaluateAnniversary(customer.id, now),
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

  const resolvedAt = new Date().toISOString();
  const today = toIsoDate(new Date());
  const records: ApproachTask[] = item.hits.map((hit) => ({
    id: `apt-${hit.key}`,
    customerId,
    triggerKey: hit.key,
    triggerType: hit.type,
    reason: hit.reason,
    status,
    resolvedAt,
  }));

  mutateDb((db) => ({
    ...db,
    approachTasks: [...db.approachTasks, ...records],
    customers:
      status === "done"
        ? db.customers.map((c) => (c.id === customerId ? { ...c, lastContactedAt: today } : c))
        : db.customers,
  }));
}

/** 対応履歴。カルテのアプローチタブに出す */
export async function listApproachHistory(customerId: Uuid): Promise<ApproachTask[]> {
  return getDb()
    .approachTasks.filter((t) => t.customerId === customerId)
    .sort((a, b) => b.resolvedAt.localeCompare(a.resolvedAt));
}
