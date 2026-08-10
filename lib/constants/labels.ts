import type {
  AnniversaryType,
  ApproachStatus,
  ColorFamily,
  FabricPattern,
  FabricSeason,
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

export const TRIGGER_LABEL: Record<TriggerType, string> = {
  post_delivery: "納品後フォロー",
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
 * 記念日の予告日数とアイテム価格は、設定として店舗が変えられるようにしたため
 * ここには置かない。既定値は lib/constants/settings-defaults.ts、
 * 実際に効く値は lib/data/settings.ts の getSettings() から読む。
 * 納品後フォローの節目は確定しているので lib/constants/approach.ts にある。
 */
