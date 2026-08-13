import type { CustomerFieldKey } from "@/lib/types";

/**
 * 会話から書き換えてよい顧客の項目と、その見出し。
 *
 * 見出しはカードの差分表示（「電話 090-… → 080-…」）に使う。
 * **氏名と担当は入っていない。**前者は名寄せの軸で、聞き違いで書き換わると
 * 別人のカルテになる。後者は RLS の境界そのもの。どちらも画面から直す。
 */
export const CUSTOMER_FIELD_LABELS: Record<CustomerFieldKey, string> = {
  nameKana: "フリガナ",
  birthDate: "生年月日",
  gender: "性別",
  phone: "電話",
  email: "メール",
  address: "住所",
  residencePrefecture: "居住地",
  embroideryName: "ネーム刺繍",
  companyName: "会社名",
  department: "部署",
  jobTitle: "役職",
  industry: "業種",
  familyInfo: "ご家族",
};
