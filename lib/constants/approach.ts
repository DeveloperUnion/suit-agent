/**
 * 納品後フォローの節目。
 *
 * 既定は半年と 1 年。ここにあるのは**既定値だけ**で、実際に効く値は
 * app_settings（管理者だけが変えられる）から来る。声をかける間隔は
 * やってみないと適切な長さが分からないので、ここだけは店舗に開けている。
 *
 * 節目は「日数」ではなく「月」で数える。半年は 180 日ではなく納品日の半年後であり、
 * 顧客にとっても暦の上での区切りだから。
 */
export const DEFAULT_POST_DELIVERY_MONTHS = [6, 12];

export type PostDeliveryMilestone = {
  /**
   * trigger_key に埋まる識別子。**月数から決める。**
   *
   * 節目を 6 → 9 に変えると鍵が 6m から 9m に変わり、半年で連絡済みの顧客にも
   * 9 ヶ月の通知が新しく立つ。節目を変えたら出し直す、が正しい挙動なので
   * これでよい。逆に固定の連番（1つめ・2つめ）にすると、月数を変えたのに
   * 「対応済み」と判定されて無音で出なくなる。
   */
  key: string;
  months: number;
  label: string;
};

/** 節目の呼び名。店舗が口にする言い方に寄せる（6 は「6ヶ月」ではなく「半年」） */
export function postDeliveryLabel(months: number): string {
  if (months === 6) return "半年";
  if (months % 12 === 0) return `${months / 12}年`;
  if (months > 12 && months % 12 === 6) return `${(months - 6) / 12}年半`;
  return `${months}ヶ月`;
}

export function postDeliveryMilestones(months: number[]): PostDeliveryMilestone[] {
  return months.map((m) => ({ key: `${m}m`, months: m, label: postDeliveryLabel(m) }));
}

/**
 * 記念日の何日前から出すか。
 *
 * こちらは設定画面に出さない。1 週間前から数え始める、というのは店舗として
 * 確定した決めごとであり、試しに動かして様子を見る数字ではない。
 * 画面ではカウントダウン（「あと3日」）で見せる。
 */
export const ANNIVERSARY_LEAD_DAYS = 7;
