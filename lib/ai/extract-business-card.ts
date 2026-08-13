import type { ExtractedField, ExtractionMeta } from "@/lib/ai/extraction";
import { postExtraction } from "@/lib/api/client";

/**
 * 名刺の読み取り。
 *
 * 名刺には氏名・会社名・部署・役職・連絡先が揃っているのに、
 * いまは接客のたびに同じ内容を打ち直している。ここを埋めるのが目的。
 *
 * 実際に読むのは app/api/extract/business-card（Gemini）。
 */

export type BusinessCardFieldKey =
  | "name"
  | "nameKana"
  | "companyName"
  | "department"
  | "jobTitle"
  | "phone"
  | "email"
  | "address";

/** 顧客登録フォームに直接流し込む3項目。ここだけは既存の入力欄と共有する */
export const PRIMARY_CARD_FIELDS: BusinessCardFieldKey[] = ["name", "nameKana", "phone"];

/** カルテ側にだけ入る項目。打つ人がいないので、読めた分はそのまま得になる */
export const EXTRA_CARD_FIELDS: BusinessCardFieldKey[] = [
  "companyName",
  "department",
  "jobTitle",
  "email",
  "address",
];

export const CARD_FIELD_LABEL: Record<BusinessCardFieldKey, string> = {
  name: "氏名",
  nameKana: "カナ",
  companyName: "会社名",
  department: "部署",
  jobTitle: "役職",
  phone: "電話",
  email: "メール",
  address: "住所",
};

export type BusinessCardExtraction = ExtractionMeta & {
  /** 読めなかった項目はキーごと存在しない。空文字（読めたが空）と区別する */
  fields: Partial<Record<BusinessCardFieldKey, ExtractedField>>;
};

export async function extractBusinessCard(file: File): Promise<BusinessCardExtraction> {
  return postExtraction<BusinessCardExtraction>("/api/extract/business-card", file);
}
