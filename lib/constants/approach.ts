/**
 * 納品後フォローの節目。
 *
 * 他の業務ルールと違って設定画面に出さない。半年と 1 年の 2 回、というのは
 * 店舗として確定した決めごとであり、試しに動かして様子を見るための数字ではないため。
 * 変えたくなったらここを直す — 画面に出しておくと「変えられる」という誤った期待を生む。
 *
 * 節目は「日数」ではなく「月」で数える。半年は 180 日ではなく納品日の半年後であり、
 * 顧客にとっても暦の上での区切りだから。
 */
export const POST_DELIVERY_MILESTONES = [
  { key: "6m", months: 6, label: "半年" },
  { key: "12m", months: 12, label: "1年" },
] as const;

export type PostDeliveryMilestone = (typeof POST_DELIVERY_MILESTONES)[number];
