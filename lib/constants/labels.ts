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

/** 経過日数トリガーの既定閾値（設定で変更可能にする想定） */
export const ELAPSED_DAYS_THRESHOLD = 90;
