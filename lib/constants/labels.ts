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
  delivered: "納品済",
  cancelled: "キャンセル",
};

export const ORDER_PURPOSE_LABEL: Record<OrderPurpose, string> = {
  business: "ビジネス",
  formal: "礼服",
  wedding: "結婚式",
  casual: "カジュアル",
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
 * アプローチのルール（記念日の予告日数・納品後フォローの節目）はここに置かない。
 * lib/constants/approach.ts にまとめてある。節目だけは店舗が変えられるので、
 * 実際に効く値は lib/data/settings.ts の getAppSettings() から読む。
 */
