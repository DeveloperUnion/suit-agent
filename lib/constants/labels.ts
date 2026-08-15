import type {
  AnniversaryType,
  ApproachStatus,
  MeasurementInputMethod,
  OrderPurpose,
  OrderStatus,
  StaffRole,
  TriggerType,
} from "@/lib/types";

/** 日本語ラベルはここに集約する。コード中に文字列を散らさない */

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  admin: "管理者",
  member: "一般",
};

export const ANNIVERSARY_LABEL: Record<AnniversaryType, string> = {
  birthday: "誕生日",
  first_purchase: "初回購入記念日",
  wedding: "結婚記念日",
  other: "その他",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  ordered: "受注",
  in_production: "製作中",
  fitting: "仮縫い",
  delivered: "お渡し済",
  cancelled: "キャンセル",
};

export const ORDER_PURPOSE_LABEL: Record<OrderPurpose, string> = {
  business: "ビジネス",
  formal: "礼服",
  wedding: "結婚式",
  casual: "カジュアル",
};

/**
 * 売上金額の内訳。入力欄の並びも表示の並びもこれが決める。
 *
 * **採寸の ITEM_TYPE_MAP とは別の軸。**あちらは「何を採寸するか」
 * （ジャケット / パンツ / ベスト / シャツ / コート）で、こちらは
 * 「何がいくら売れたか」。スーツは上下一式なので採寸側に対応する id が無い。
 *
 * **「その他」は作らない。**区分に当てはまらない売上は内訳に現れず、
 * 4つの和は合計（totalAmount）に届かないのが既定。合わないこと自体は
 * 異常ではない — 合計欄のほうが正だから。DB に CHECK は張らない。
 *
 * ただし**打ち間違い（桁落ち・二重計上）も、区分に無い売上も、画面では
 * まったく同じ「差がある」という形で現れる。**注記に留めていたときは前者だけが
 * 黙って保存されていたので、保存の手前で1度だけ確認を挟むようにした
 * （hasAmountGap）。直させるのではなく、見たことを確かめるための関門。
 */
export const AMOUNT_CATEGORIES = [
  { key: "amountSuit", label: "スーツ" },
  { key: "amountCoat", label: "コート" },
  { key: "amountAccessory", label: "小物" },
  { key: "amountShirt", label: "シャツ" },
] as const;

/** 内訳の1区分のキー。Order の対応するフィールド名でもある */
export type AmountCategoryKey = (typeof AMOUNT_CATEGORIES)[number]["key"];

/** 内訳だけを抜き出した形。フォームと更新入力で使い回す */
export type OrderAmountBreakdown = Partial<Record<AmountCategoryKey, number>>;

/** 1区分でも入っていれば true。入力欄を開いた状態で出すかの判定に使う */
export function hasAmountBreakdown(breakdown: OrderAmountBreakdown): boolean {
  return AMOUNT_CATEGORIES.some(({ key }) => breakdown[key] !== undefined);
}

/** 入っている区分だけの合計。未入力（undefined）は 0 として扱わず飛ばす */
export function sumAmountBreakdown(breakdown: OrderAmountBreakdown): number {
  return AMOUNT_CATEGORIES.reduce((sum, { key }) => sum + (breakdown[key] ?? 0), 0);
}

/**
 * 合計と内訳の和が食い違っているか。保存の手前で確認を出すかの判定に使う。
 *
 * 内訳を1つも入れていない注文は対象外。「その他」区分を作らない以上、
 * 内訳を付けない注文で差額を問うても意味がない。
 *
 * 金額を作る3経路（新規登録・発注書の取り込み・編集）が同じ判定を持たないよう、
 * ここ1箇所に寄せる。
 */
export function hasAmountGap(total: number, breakdown: OrderAmountBreakdown): boolean {
  return hasAmountBreakdown(breakdown) && sumAmountBreakdown(breakdown) !== total;
}

/*
 * 内部値の post_delivery は変えない。approach_resolutions.trigger_key に埋まっていて、
 * 変えると対応済みの通知が全件立ち直す。表に出る呼び名だけを「お渡し」に寄せている。
 */
export const TRIGGER_LABEL: Record<TriggerType, string> = {
  post_delivery: "お渡し後フォロー",
  anniversary: "記念日",
};

export const APPROACH_STATUS_LABEL: Record<ApproachStatus, string> = {
  done: "連絡した",
  skipped: "スキップ",
};

export const INPUT_METHOD_LABEL: Record<MeasurementInputMethod, string> = {
  tablet: "タブレット入力",
  pc: "PC入力",
  ocr: "OCR取り込み",
};

/*
 * アプローチのルール（記念日の予告日数・お渡し後フォローの節目）はここに置かない。
 * lib/constants/approach.ts にまとめてある。どちらも店舗が変えられるので、
 * 実際に効く値は lib/data/settings.ts の getAppSettings() から読む。
 */
