import type { IsoDate, IsoMonth } from "@/lib/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function toIsoDate(date: Date): IsoDate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** n 日前の日付を ISO で返す */
export function daysAgo(days: number, from: Date = new Date()): IsoDate {
  return toIsoDate(addDays(from, -days));
}

/** 指定日から今日までの経過日数。未来なら負値 */
export function daysSince(date: IsoDate | undefined, now: Date = new Date()): number | null {
  if (!date) return null;
  const then = new Date(`${date}T00:00:00`);
  if (Number.isNaN(then.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today.getTime() - then.getTime()) / MS_PER_DAY);
}

/** 2026-07-06 → 2026年7月6日 */
export function formatDateLong(date: IsoDate | undefined): string {
  if (!date) return "—";
  const [y, m, d] = date.split("-");
  return `${y}年${Number(m)}月${Number(d)}日`;
}

/** 2026-07-06 → 2026.07.06 — 数値が主役の場面で桁を揃える */
export function formatDateDot(date: IsoDate | undefined): string {
  if (!date) return "—";
  return date.replaceAll("-", ".");
}

export function formatDateTime(value: string | undefined): string {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "—";
  const m = dt.getMonth() + 1;
  const d = dt.getDate();
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${m}/${d} ${hh}:${mm}`;
}

/** 誕生日など、年を無視して次に来る記念日までの日数 */
export function daysUntilNextAnniversary(date: IsoDate, now: Date = new Date()): number {
  const [, m, d] = date.split("-").map(Number);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), m - 1, d);
  if (next < today) next = new Date(now.getFullYear() + 1, m - 1, d);
  return Math.round((next.getTime() - today.getTime()) / MS_PER_DAY);
}

export function formatAmount(amount: number): string {
  return amount.toLocaleString("ja-JP");
}

/**
 * 「¥3,200,000」「3200000」のどちらでも受ける。
 * 目標額や価格は桁が大きく、カンマ付きで打つ人と打たない人がどうしても混ざるため。
 */
export function parseAmount(value: string): number {
  const n = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

// ── 月次 ────────────────────────────────────────────────

export function toIsoMonth(date: Date): IsoMonth {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** 当月を末尾に、直近 n ヶ月分を古い順で返す */
export function recentMonths(n: number, from: Date = new Date()): IsoMonth[] {
  const months: IsoMonth[] = [];
  for (let i = n - 1; i >= 0; i--) {
    months.push(toIsoMonth(new Date(from.getFullYear(), from.getMonth() - i, 1)));
  }
  return months;
}

/**
 * 2026-08 → 8月。
 * 年が変わる月だけ 26/1 と出す。12ヶ月すべてに年を付けると軸が読めなくなるため。
 */
export function formatMonthLabel(month: IsoMonth, previous?: IsoMonth): string {
  const [y, m] = month.split("-");
  const isYearStart = !previous || previous.slice(0, 4) !== y;
  return isYearStart ? `${y.slice(2)}/${Number(m)}` : `${Number(m)}月`;
}

/** 月がどこまで進んだか（0–1）。達成率と並べて初めて「順調か」が読める */
export function monthProgress(now: Date = new Date()): number {
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return now.getDate() / days;
}
