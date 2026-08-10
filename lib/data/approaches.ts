import type {
  ApproachStatus,
  ApproachTask,
  CompanyNews,
  IsoDate,
  TriggerType,
  Uuid,
} from "@/lib/types";
import { getDb, mutateDb } from "@/lib/store/mock-db";
import { ANNIVERSARY_LABEL } from "@/lib/constants/labels";
import { getSettings } from "@/lib/data/settings";
import { ITEM_TYPE_MAP } from "@/lib/constants/measurement-fields";
import { listCustomers, type CustomerListItem } from "@/lib/data/customers";
import {
  addDays,
  daysSince,
  daysUntilNextAnniversary,
  formatDateDot,
  toIsoDate,
} from "@/lib/utils/date";

/**
 * アプローチの評価。
 *
 * 要件4.4の日次バッチにあたる処理を、その場で回している。
 * 事前に固定レコードを作らないのは、
 *   - 閾値を変えたら即座に結果へ反映されるべき
 *   - 連絡すれば最終接触日が動き、納品後フォローは自然に消えるべき
 * ため。人が被せた判断（スヌーズ・対象外）と対応履歴だけを保存する。
 */

/** 1 トリガー分の発火 */
export type TriggerHit = {
  type: TriggerType;
  /** なぜ今この顧客なのか。スタッフが納得して連絡できることが要件 */
  reason: string;
  /** 並べ替えの重み */
  weight: number;
  /**
   * これ単独で「連絡すべき理由」になるか。
   * 季節は未保有カテゴリがあれば誰にでも当たってしまい、単独では絞り込みにならない。
   * リストを埋め尽くさないよう、加点と文脈の提供にとどめる。
   */
  standalone: boolean;
};

export type ApproachItem = {
  /** 顧客ごとに 1 件へ統合する（要件4.4: 同一顧客への重複通知を防ぐ） */
  id: Uuid;
  customer: CustomerListItem;
  hits: TriggerHit[];
  triggerTypes: TriggerType[];
  dueDate: IsoDate;
  score: number;
  news?: CompanyNews;
  status: Exclude<ApproachStatus, "done">;
  snoozedUntil?: IsoDate;
};

/** 導出したアプローチの ID。顧客ごとに 1 件なので顧客 ID から決まる */
export function approachIdFor(customerId: Uuid): Uuid {
  return `apr-${customerId}`;
}

export function customerIdFromApproachId(approachId: Uuid): Uuid {
  return approachId.replace(/^apr-/, "");
}

// ── 各トリガーの評価 ────────────────────────────────

/**
 * 納品後フォロー（着心地確認）。
 *
 * 納品日は動かないため、期限を過ぎたら永久に発火し続けてしまう。
 * 期限より後に連絡していれば済んだものとみなして出さない
 * （連絡すれば lastContactedAt が動き、このトリガーは自然に消える）。
 * 長く離れている顧客は季節トリガーが拾うので、ここでは面倒を見ない。
 */
function evaluatePostDelivery(customer: CustomerListItem): TriggerHit | null {
  const threshold = getSettings().deliveryFollowUpDays;
  const days = customer.daysSinceDelivery;
  if (days === null || !customer.lastDeliveredAt || days < threshold) return null;

  const dueDate = toIsoDate(
    addDays(new Date(`${customer.lastDeliveredAt}T00:00:00`), threshold),
  );
  if (customer.lastContactedAt && customer.lastContactedAt >= dueDate) return null;

  return {
    type: "post_delivery",
    reason: `${formatDateDot(customer.lastDeliveredAt)}の納品から${days}日が経過しています。着心地を伺う頃合いです。`,
    // 経過日数トリガーと逆で、着心地確認は納品直後ほど価値が高い。
    // 時間が経つほど「今さら聞かれた」になるため、古いものは後ろへ下げる
    weight: 20 - Math.min(10, Math.floor((days - threshold) / 30)),
    standalone: true,
  };
}

function evaluateAnniversary(customerId: Uuid, now: Date): TriggerHit | null {
  const anniversaries = getDb().anniversaries.filter((a) => a.customerId === customerId);
  const upcoming = anniversaries
    .map((a) => ({ ...a, until: daysUntilNextAnniversary(a.date, now) }))
    .filter((a) => a.until <= getSettings().anniversaryLeadDays)
    .sort((a, b) => a.until - b.until)[0];
  if (!upcoming) return null;

  const label = upcoming.label || ANNIVERSARY_LABEL[upcoming.type];
  return {
    type: "anniversary",
    reason:
      upcoming.until === 0
        ? `本日は${label}です。`
        : `${label}まであと${upcoming.until}日です。`,
    // 記念日は日が過ぎると意味がなくなるため、近いほど強く前に出す
    weight: 34 - Math.min(20, upcoming.until),
    standalone: true,
  };
}

function evaluateSeason(customerId: Uuid, now: Date): TriggerHit | null {
  const month = now.getMonth() + 1;
  const window = getSettings().seasonWindows.find((w) => w.months.includes(month));
  if (!window) return null;

  const db = getDb();
  const orderIds = new Set(
    db.orders.filter((o) => o.customerId === customerId).map((o) => o.id),
  );
  if (orderIds.size === 0) return null;

  const items = db.orderItems.filter((i) => orderIds.has(i.orderId));
  const ownedTypes = new Set(items.map((i) => i.itemTypeId));
  const missing = (["coat", "vest", "shirt"] as const).find((t) => !ownedTypes.has(t));

  // 該当季節の生地で作ったものがあるか
  const hasSeasonFabric = items.some((item) => {
    const fabric = db.fabrics.find((f) => f.id === item.fabricId);
    return fabric?.season === window.season;
  });

  if (!missing && hasSeasonFabric) return null;

  return {
    type: "season",
    reason: missing
      ? `${window.label}の生地入荷期です。${ITEM_TYPE_MAP[missing].name}をまだお持ちでないため、ご案内の機会です。`
      : `${window.label}の生地入荷期です。${window.label}向けの生地でお作りいただいたものがありません。`,
    weight: 12,
    standalone: false,
  };
}

function evaluateCompanyNews(
  customer: CustomerListItem,
  now: Date,
): { hit: TriggerHit; news: CompanyNews } | null {
  // 巡回対象は重要顧客のみ（要件4.5 E-2）
  if (!customer.isKeyAccount) return null;

  const news = getDb()
    .companyNews.filter((n) => n.customerId === customer.id)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
  if (!news) return null;

  // すでに連絡済みのニュースは出さない
  if (customer.lastContactedAt && customer.lastContactedAt >= news.publishedAt) return null;

  const age = daysSince(news.publishedAt, now) ?? 0;
  if (age > 30) return null;

  return {
    hit: {
      type: "company_news",
      reason: `勤務先のニュースが出ています。「${news.title}」（${news.aiSummary}）`,
      weight: 18 + Math.floor(news.usabilityScore / 20),
      standalone: true,
    },
    news,
  };
}

// ── 一覧 ────────────────────────────────────────

export type ApproachFilter = {
  triggerType?: TriggerType;
  /** スヌーズ中・対象外も含めるか */
  includeParked?: boolean;
  /** 上限を外して全件返すか */
  showAll?: boolean;
};

export type ApproachListResult = {
  items: ApproachItem[];
  /** 条件に合致した総数。上限で切る前の値 */
  total: number;
  /** 上限で切り落とした件数 */
  hidden: number;
};



async function evaluateAll(filter: ApproachFilter = {}): Promise<ApproachItem[]> {
  const now = new Date();
  const today = toIsoDate(now);
  const customers = await listCustomers();
  const db = getDb();

  const items: ApproachItem[] = [];

  for (const customer of customers) {
    const hits: TriggerHit[] = [];
    let news: CompanyNews | undefined;

    const postDelivery = evaluatePostDelivery(customer);
    if (postDelivery) hits.push(postDelivery);

    const anniversary = evaluateAnniversary(customer.id, now);
    if (anniversary) hits.push(anniversary);

    const season = evaluateSeason(customer.id, now);
    if (season) hits.push(season);

    const newsHit = evaluateCompanyNews(customer, now);
    if (newsHit) {
      hits.push(newsHit.hit);
      news = newsHit.news;
    }

    // 季節だけでは「連絡すべき理由」にならない。単独で成立するヒットが1つも
    // なければリストに出さず、他のトリガーが立ったときの文脈として使う
    if (!hits.some((h) => h.standalone)) continue;

    // 人が被せた判断を適用する
    const record = db.approachTasks.find(
      (t) => t.customerId === customer.id && t.status !== "done",
    );
    let status: ApproachItem["status"] = "open";
    if (record?.status === "dismissed") status = "dismissed";
    else if (record?.status === "snoozed") {
      const until = record.snoozedUntil;
      if (until && until > today) status = "snoozed";
    }

    if (status !== "open" && !filter.includeParked) continue;
    if (filter.triggerType && !hits.some((h) => h.type === filter.triggerType)) continue;

    hits.sort((a, b) => b.weight - a.weight);

    items.push({
      id: approachIdFor(customer.id),
      customer,
      hits,
      triggerTypes: hits.map((h) => h.type),
      dueDate: today,
      score: hits.reduce((sum, h) => sum + h.weight, 0),
      news,
      status,
      snoozedUntil: record?.snoozedUntil,
    });
  }

  return items.sort(
    (a, b) =>
      b.score - a.score ||
      (b.customer.daysSinceDelivery ?? 0) - (a.customer.daysSinceDelivery ?? 0),
  );
}

export async function listApproaches(filter: ApproachFilter = {}): Promise<ApproachListResult> {
  const all = await evaluateAll(filter);
  const items = filter.showAll ? all : all.slice(0, getSettings().dailyApproachLimit);
  return { items, total: all.length, hidden: all.length - items.length };
}

/** 顧客カルテ用。その顧客に今アプローチが立っていれば返す */
export async function getApproachForCustomer(customerId: Uuid): Promise<ApproachItem | null> {
  const items = await evaluateAll({ includeParked: true });
  return items.find((i) => i.customer.id === customerId) ?? null;
}

export async function countOpenApproaches(): Promise<number> {
  return (await evaluateAll()).length;
}

// ── 状態の保存 ──────────────────────────────────

function upsertRecord(customerId: Uuid, patch: Partial<ApproachTask>) {
  mutateDb((db) => {
    const existing = db.approachTasks.find(
      (t) => t.customerId === customerId && t.status !== "done",
    );
    if (existing) {
      return {
        ...db,
        approachTasks: db.approachTasks.map((t) =>
          t.id === existing.id ? { ...t, ...patch } : t,
        ),
      };
    }
    return {
      ...db,
      approachTasks: [
        ...db.approachTasks,
        {
          id: approachIdFor(customerId),
          customerId,
          dueDate: toIsoDate(new Date()),
          triggerTypes: [],
          reason: "",
          status: "open" as ApproachStatus,
          ...patch,
        },
      ],
    };
  });
}

export async function snoozeApproach(customerId: Uuid, days: number): Promise<void> {
  upsertRecord(customerId, {
    status: "snoozed",
    snoozedUntil: toIsoDate(addDays(new Date(), days)),
  });
}

export async function dismissApproach(customerId: Uuid): Promise<void> {
  upsertRecord(customerId, { status: "dismissed", snoozedUntil: undefined });
}

/** スヌーズ・対象外を解除してリストに戻す */
export async function restoreApproach(customerId: Uuid): Promise<void> {
  upsertRecord(customerId, { status: "open", snoozedUntil: undefined });
}

/** 対応履歴。カルテのアプローチタブに出す */
export async function listApproachHistory(customerId: Uuid): Promise<ApproachTask[]> {
  return getDb()
    .approachTasks.filter((t) => t.customerId === customerId && t.status === "done")
    .sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""));
}
