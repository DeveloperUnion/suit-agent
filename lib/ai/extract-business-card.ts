import {
  field,
  fixtureIndex,
  simulateLatency,
  type ExtractedField,
  type ExtractionMeta,
} from "@/lib/ai/extraction";

/**
 * 名刺の読み取り。
 *
 * 名刺には氏名・会社名・部署・役職・連絡先が揃っているのに、
 * いまは接客のたびに同じ内容を打ち直している。ここを埋めるのが目的。
 *
 * 中身は固定のフィクスチャを返すスタブ。実 API に差し替えるときは
 * この関数の本体だけを置き換えればよいよう、シグネチャを実装後の形にしてある。
 */

export type BusinessCardFieldKey =
  | "name"
  | "nameKana"
  | "companyName"
  | "department"
  | "jobTitle"
  | "phone"
  | "email"
  | "address"
  | "companyUrl";

/** 顧客登録フォームに直接流し込む3項目。ここだけは既存の入力欄と共有する */
export const PRIMARY_CARD_FIELDS: BusinessCardFieldKey[] = ["name", "nameKana", "phone"];

/** カルテ側にだけ入る項目。打つ人がいないので、読めた分はそのまま得になる */
export const EXTRA_CARD_FIELDS: BusinessCardFieldKey[] = [
  "companyName",
  "department",
  "jobTitle",
  "email",
  "address",
  "companyUrl",
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
  companyUrl: "会社URL",
};

export type BusinessCardExtraction = ExtractionMeta & {
  /** 読めなかった項目はキーごと存在しない。空文字（読めたが空）と区別する */
  fields: Partial<Record<BusinessCardFieldKey, ExtractedField>>;
};

/**
 * フィクスチャ。それぞれ別の経路を通す:
 *   0 全項目が高確信 — きれいな1枚。既存顧客と同姓のため重複チェックも動く
 *   1 カナとメールが読めず、住所の確信度が低い
 *   2 役職の確信度が低く、部署が無い
 *   3 発注書側と同じ人物。2つの読み取りを続けて見せるとき用
 */
const FIXTURES: BusinessCardExtraction["fields"][] = [
  {
    name: field("時枝 正"),
    nameKana: field("トキエダ タダシ", 0.92),
    companyName: field("三菱商事株式会社"),
    department: field("エネルギーソリューション本部", 0.9),
    jobTitle: field("部長"),
    phone: field("03-3210-2121"),
    email: field("t.tokieda@example.co.jp", 0.93),
    address: field("東京都千代田区丸の内2-3-1", 0.88),
    companyUrl: field("https://www.example.co.jp"),
  },
  {
    name: field("大久保 慎一"),
    companyName: field("日本電装工業株式会社", 0.91),
    department: field("経営企画部", 0.86),
    jobTitle: field("課長"),
    phone: field("06-6220-4411"),
    // 住所は行が詰まっていると崩れやすい。要確認の見え方を確かめるための値
    address: field("大阪府大阪市中央区本町3-5-7 本町ビル8F", 0.58),
  },
  {
    name: field("藤井 隆之"),
    nameKana: field("フジイ タカユキ", 0.89),
    companyName: field("株式会社ケイエスホールディングス"),
    jobTitle: field("執行役員", 0.62),
    phone: field("045-620-3300", 0.87),
    email: field("fujii@example.com"),
    companyUrl: field("https://ks-hd.example.com", 0.79),
  },
  {
    name: field("城 知広"),
    nameKana: field("ジョウ チヒロ", 0.94),
    companyName: field("城建設株式会社"),
    jobTitle: field("代表取締役"),
    phone: field("052-971-8080"),
    email: field("jo@example.jp", 0.9),
    address: field("愛知県名古屋市中区栄3-15-33", 0.85),
  },
];

/** デモでファイル名を狙って当てるためのキーワード。並びは FIXTURES と対応する */
const FIXTURE_KEYWORDS = ["tokieda", "okubo", "fujii", "jo"];

export async function extractBusinessCard(file: File): Promise<BusinessCardExtraction> {
  const startedAt = performance.now();
  await simulateLatency();
  return {
    source: "stub",
    elapsedMs: Math.round(performance.now() - startedAt),
    fields: FIXTURES[fixtureIndex(file, FIXTURES.length, FIXTURE_KEYWORDS)],
  };
}
