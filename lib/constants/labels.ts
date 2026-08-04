import type {
  AnniversaryType,
  ApproachStatus,
  ColorFamily,
  FabricPattern,
  FabricSeason,
  MeasurementInputMethod,
  MessageChannel,
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
  delivered: "納品済",
  cancelled: "キャンセル",
};

export const ORDER_PURPOSE_LABEL: Record<OrderPurpose, string> = {
  business: "ビジネス",
  formal: "礼服",
  wedding: "結婚式",
  casual: "カジュアル",
};

export const COLOR_FAMILY_LABEL: Record<ColorFamily, string> = {
  navy: "ネイビー",
  charcoal: "チャコール",
  gray: "グレー",
  brown: "ブラウン",
  black: "ブラック",
  blue: "ブルー",
  other: "その他",
};

export const FABRIC_PATTERN_LABEL: Record<FabricPattern, string> = {
  solid: "無地",
  stripe: "ストライプ",
  check: "チェック",
  herringbone: "ヘリンボーン",
  birdseye: "バーズアイ",
  other: "その他",
};

export const FABRIC_SEASON_LABEL: Record<FabricSeason, string> = {
  spring_summer: "春夏",
  autumn_winter: "秋冬",
  all_season: "オールシーズン",
};

export const MESSAGE_CHANNEL_LABEL: Record<MessageChannel, string> = {
  line: "LINE",
  phone: "電話",
  visit: "来店",
  email: "メール",
};

export const TRIGGER_LABEL: Record<TriggerType, string> = {
  elapsed_days: "経過日数",
  anniversary: "記念日",
  season: "季節",
  company_news: "企業ニュース",
};

export const APPROACH_STATUS_LABEL: Record<ApproachStatus, string> = {
  open: "未対応",
  done: "対応済",
  snoozed: "スヌーズ",
  dismissed: "対象外",
};

export const INPUT_METHOD_LABEL: Record<MeasurementInputMethod, string> = {
  tablet: "タブレット入力",
  pc: "PC入力",
  ocr: "OCR取り込み",
};

/**
 * トリガーの既定値。設定画面から変更できるようにする想定なので、
 * 判定ロジックの中に数値を書かずここに集約する。
 */

/** 経過日数トリガー: 最終接触から何日で発火するか */
export const ELAPSED_DAYS_THRESHOLD = 90;

/** 記念日トリガー: 何日前から通知するか */
export const ANNIVERSARY_LEAD_DAYS = 21;

/**
 * 季節トリガー: 生地の入荷期。
 * 要件は「春夏(3月)・秋冬(9月)」だが、実際の入荷と案内は前後にまたがるため幅を持たせる。
 */
export const SEASON_WINDOWS = [
  { months: [2, 3, 4], season: "spring_summer" as const, label: "春夏" },
  { months: [8, 9, 10], season: "autumn_winter" as const, label: "秋冬" },
];
