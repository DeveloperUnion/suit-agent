import type {
  ApproachTask,
  Customer,
  CustomerAnniversary,
  CustomerFact,
  CustomerNgNote,
  FactSource,
  MeasurementSheet,
  DemoDataset,
  Order,
  OrderItem,
  RevenueTarget,
  Staff,
} from "@/lib/types";
import type { OrderItemFabric } from "@/lib/data/orders";
import { addDays, daysAgo, toIsoDate, toIsoMonth } from "@/lib/utils/date";
import { COMPANIES, GIVEN_NAMES, SURNAMES } from "@/lib/mock/names";

/**
 * 開発用のデモデータ。
 *
 * アプリはこれを読まない。scripts/generate-dev-seed.ts（ローカル）と
 * scripts/generate-demo-seed.ts（本番の検証用）が SQL を吐くための素。
 * mulberry32 で決定的なので、生成し直しても同じデータが出る。
 *
 * **細川（staff-1）の担当 10 名は PINNED_STAFF1 に書き下してある。**
 * eval の「件数の正」がそこに乗っているので、店全体を何名に増やしても動かない。
 * 規模を変えるときは shape.perStaff（＝他のスタッフの人数）を触ること。
 */

/** 構造を変えたら上げる */
export const SEED_VERSION = 20;

/**
 * 決定的な擬似乱数。リセットのたびに同じデータが再現されるようにする
 * （壁打ち中に「さっき見た顧客」が消えると議論にならない）
 */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── スタッフ ────────────────────────────────────────────

const STAFF: Staff[] = [
  { id: "staff-1", name: "細川 憲佑", email: "hosokawa@example.com", role: "admin", isActive: true },
  { id: "staff-2", name: "白髭 崇", email: "shirahige@example.com", role: "member", isActive: true },
  { id: "staff-3", name: "野﨑 匠", email: "nozaki@example.com", role: "member", isActive: true },
];

// ── 生地 ────────────────────────────────────────────────

/**
 * 生地マスタは持たない。発注書に書かれた原反NO・色番・色名・組成を
 * 注文明細にそのまま埋めるので、ここにあるのは埋める値の見本にすぎない。
 */
const FABRICS: OrderItemFabric[] = [
  { fabricProductNumber: "CN-2841", fabricColorNumber: "1120", fabricColorName: "ネイビー無地", fabricComposition: "Wool 100% / Super110's" },
  { fabricProductNumber: "CN-3305", fabricColorNumber: "1145", fabricColorName: "ミッドナイトネイビー ストライプ", fabricComposition: "Wool 100% / Super130's" },
  { fabricProductNumber: "DR-7120", fabricColorNumber: "2210", fabricColorName: "チャコールグレー無地", fabricComposition: "Wool 100% / Super120's" },
  { fabricProductNumber: "DR-7455", fabricColorNumber: "2264", fabricColorName: "チャコール ヘリンボーン", fabricComposition: "Wool 100% / Super100's" },
  { fabricProductNumber: "LP-1180", fabricColorNumber: "3018", fabricColorName: "ネイビー バーズアイ", fabricComposition: "Wool 100% / Super150's" },
  { fabricProductNumber: "LP-2260", fabricColorNumber: "3072", fabricColorName: "ライトグレー無地", fabricComposition: "Wool 96% Silk 4% / Super130's" },
  { fabricProductNumber: "ZG-4410", fabricColorNumber: "4401", fabricColorName: "ブラック無地", fabricComposition: "Wool 100% / Super120's" },
  { fabricProductNumber: "ZG-5502", fabricColorNumber: "4530", fabricColorName: "ブラウン チェック", fabricComposition: "Wool 90% Cashmere 10% / Super130's" },
  { fabricProductNumber: "DM-8801", fabricColorNumber: "5211", fabricColorName: "ミディアムグレー ストライプ", fabricComposition: "Wool 100% / Super140's" },
  { fabricProductNumber: "DM-9034", fabricColorNumber: "5288", fabricColorName: "ネイビー チェック", fabricComposition: "Wool 100% / Super110's" },
  { fabricProductNumber: "RD-3312", fabricColorNumber: "6140", fabricColorName: "サックスブルー無地", fabricComposition: "Wool 100% / Super110's" },
  { fabricProductNumber: "RD-4028", fabricColorNumber: "6207", fabricColorName: "グレー バーズアイ", fabricComposition: "Wool 100% / Super120's" },
  { fabricProductNumber: "MY-1105", fabricColorNumber: "7310", fabricColorName: "ネイビー無地", fabricComposition: "Wool 100% / Super100's" },
  { fabricProductNumber: "MY-2208", fabricColorNumber: "7355", fabricColorName: "ブラック無地", fabricComposition: "Wool 100%" },
  { fabricProductNumber: "HR-6650", fabricColorNumber: "8140", fabricColorName: "ダークブラウン ヘリンボーン", fabricComposition: "Wool 100% / Super120's" },
  // 実物の発注書に書かれていた原反
  { fabricProductNumber: "AC5601", fabricColorNumber: "3330", fabricColorName: "カーキ無地", fabricComposition: "N(ナイロン) 92% / U(ポリウレタン) 8%" },
];

// ── 顧客生成用のプール ───────────────────────────────────


const JOB_TITLES = ["代表取締役", "取締役", "執行役員", "本部長", "部長", "次長", "課長", "マネージャー", "主任", ""];
const DEPARTMENTS = ["営業本部", "経営企画部", "財務部", "人事部", "法務部", "開発本部", "管理部", ""];

/**
 * 居住地の分布。首都圏を厚くしつつ、地方も1県あたり数名まとまるようにしている。
 * 災害時の絞り込みは「その県に何名いるか」で判断するため、1名ずつ散らばると検証にならない。
 * 顧客に順番に配って、県ごとの人数がリセットのたびに再現するようにする。
 */
const RESIDENCES = [
  "東京都", "東京都", "東京都", "東京都", "東京都", "東京都",
  "神奈川県", "神奈川県", "神奈川県", "神奈川県",
  "埼玉県", "埼玉県", "埼玉県",
  "千葉県", "千葉県", "千葉県",
  "大阪府", "大阪府",
  "愛知県", "愛知県",
  "北海道", "北海道",
  "宮城県", "宮城県",
  "福岡県", "福岡県",
  "広島県",
  "熊本県",
  "静岡県",
  "石川県",
];

/** 住所の市区町村。居住地と食い違う住所が並ぶと壁打ちの邪魔になるので対応づけておく */
const CITIES: Record<string, string[]> = {
  北海道: ["札幌市中央区", "札幌市北区"],
  宮城県: ["仙台市青葉区", "仙台市泉区"],
  埼玉県: ["さいたま市大宮区", "川口市"],
  千葉県: ["千葉市中央区", "船橋市"],
  東京都: ["港区", "渋谷区", "中央区", "世田谷区", "目黒区", "文京区"],
  神奈川県: ["横浜市西区", "川崎市中原区", "横浜市青葉区"],
  石川県: ["金沢市"],
  静岡県: ["静岡市葵区", "浜松市中央区"],
  愛知県: ["名古屋市中区", "名古屋市千種区"],
  大阪府: ["大阪市北区", "大阪市中央区"],
  広島県: ["広島市中区"],
  福岡県: ["福岡市中央区", "福岡市博多区"],
  熊本県: ["熊本市中央区"],
};

const HOBBIES = ["ゴルフ", "クラシック音楽鑑賞", "登山", "ワイン", "サーフィン", "写真", "読書", "サウナ", "釣り", "ロードバイク"];
const SCENES = ["商談", "式典", "会食", "日常業務", "登壇", "冠婚葬祭"];

/**
 * 注意事項の文例。**「外すと事故になること」だけを並べる。**
 * 好み（「ネイビーが好き」）はパーソナル側の担当なので、ここには入れない。
 */
const NG_NOTES = [
  "光沢の強い生地は好まない。",
  "前回ピークドラペルを提案して断られている。",
  "ダブルは着ないとのこと。",
  "平日昼間の連絡は避ける（会議が多い）。",
  "ウール100%以外は肌に合わないとのこと。",
  "裏地の派手な色は好まれない。",
  "前回、袖丈が長いとのお申し出あり。次回は要確認。",
  "ご家族の話題には触れないこと。",
  "喫煙者。喫煙可の席をご案内する。",
  "急ぎの納期は受けない方針とのこと。",
];

// ── 顧客の生成 ──────────────────────────────────────────

export type Built = {
  customers: Customer[];
  anniversaries: CustomerAnniversary[];
  facts: CustomerFact[];
  ngNotes: CustomerNgNote[];
  sheets: MeasurementSheet[];
  orders: Order[];
  orderItems: OrderItem[];
  approachTasks: ApproachTask[];
};

/** 採寸票の実物（private/採寸データ.jpg）をそのまま投入する */
function tokiedaSheets(customerId: string, staffId: string): MeasurementSheet[] {
  // 体型変化が読めるよう、同一顧客で 3 回分の測定を持たせる
  const make = (
    id: string,
    measuredAt: string,
    staffId: string,
    v: {
      bust: number;
      ef: number;
      waist: number;
      hip: number;
      thigh: number;
      knee: number;
      vestBust: number;
      vestEf: number;
    },
    finished: boolean,
  ): MeasurementSheet => ({
    id,
    customerId,
    measuredAt,
    recordedByStaffId: staffId,
    inputMethod: "tablet",
    sections: [
      {
        itemTypeId: "jacket",
        silhouette: "NB",
        colorNumber: "11",
        values: {
          total_length: { actual: 75, finished: finished ? 74.5 : undefined },
          bust: { actual: v.bust },
          jacket_length: { actual: 17.5, finished: finished ? 68 : undefined },
          shoulder_width: { actual: 46 },
          ef_half_chest: { actual: v.ef, finished: finished ? v.ef - 3.5 : undefined },
          sleeve_right: { actual: 59 },
          sleeve_left: { actual: 59 },
          collar_width: { finished: 8 },
        },
      },
      {
        itemTypeId: "pants",
        silhouette: "AG",
        colorNumber: "13",
        values: {
          waist: { actual: v.waist, finished: finished ? v.waist + 1.5 : undefined },
          hip: { actual: v.hip },
          thigh_width: { actual: v.thigh, finished: finished ? v.thigh / 2 + 3 : undefined },
          knee_width: { actual: v.knee, finished: finished ? v.knee / 2 + 2.5 : undefined },
          hem_width: { finished: 18 },
          rise: { actual: 26 },
          inseam: { actual: 63.5 },
        },
      },
      {
        itemTypeId: "vest",
        silhouette: "DA",
        colorNumber: "11",
        values: {
          bust: { actual: v.vestBust },
          vest_length: { actual: 55 },
          ef_half_chest: { actual: v.vestEf },
        },
      },
    ],
    adjustments: [
      { code: 15, value: 0.5 },
      { code: 17, value: 0.5 },
      { code: 26, value: 1.0 },
      { code: 5, value: 1.0 },
    ],
    note: id.endsWith("-3") ? "前回より胸囲・ウエストとも増。次回は上衣丈も再確認。" : undefined,
  });

  return [
    make("sheet-tokieda-1", "2024-09-14", staffId, {
      bust: 96, ef: 52, waist: 80.5, hip: 102, thigh: 62, knee: 40, vestBust: 94.5, vestEf: 47.5,
    }, false),
    make("sheet-tokieda-2", "2025-11-22", staffId, {
      bust: 98.5, ef: 53.5, waist: 83, hip: 104, thigh: 63.5, knee: 41, vestBust: 97, vestEf: 49,
    }, false),
    make("sheet-tokieda-3", "2026-07-06", staffId, {
      bust: 101, ef: 55, waist: 85.5, hip: 106, thigh: 65, knee: 42, vestBust: 99.5, vestEf: 50.5,
    }, true),
  ];
}

// ── 細川（staff-1）の担当 10 名 ─────────────────────────
//
// **この 10 名は乱数から外して、ここに書き下してある。**
//
// eval の「件数の正」がここに乗っているため。`lib/ai/eval/cases.json` は
// 「ゴルフが趣味な人 = 3 名」「ネイビー = 4 名」「ゴルフじゃない人 = 7 名」を
// 期待していて、担当が 1 人増減するだけで全部が書き直しになる。
//
// 以前は時枝さんだけが特別扱いで、残り 9 名は乱数の引き当てだった。そのため
// **人数や順序を変えた瞬間に氏名が総入れ替えになり**、eval を回すと
// 「7 名中 6 名が見つからない」= モデルが劣化したように見える結果が出た
// （scripts/eval-agent.ts の事前チェックは、この事故のあとに足したもの）。
//
// ここに固定した以上、店全体を何名に増やしても細川さんの担当は動かない。
// 規模の検証は staff-2 / staff-3 側の人数で行う。
//
// 意図して仕込んである引っかかり:
//   - 同姓が 2 組（柏木 正 / 柏木 和馬、樋口 京平 / 樋口 奏）→ 聞き返しが正解になる
//   - 樋口の 2 人は**勤務先まで同じ**。選択肢の手がかりに会社名が効かない
//   - 下の名前が同じ 3 人（時枝 正 / 柏木 正 / 望月 正）
//   - 「健一郎」が 2 人（九条健一郎 / 天野 健一郎）
//   - 九条健一郎だけ**氏名に空白が無い**。画面から手で登録された顧客はこの形で、
//     氏名を split(" ")[0] で姓として扱うコードはここで落ちる
//   - 古賀 悠人は氏名と電話だけ。「何も記録が無い人」に問いかけたときの答えを見る

type PinnedCustomer = {
  name: string;
  nameKana: string;
  tier: Tier;
  birthDate?: string;
  companyName?: string;
  department?: string;
  jobTitle?: string;
  industry?: string;
  residencePrefecture?: string;
  familyInfo?: string;
  embroideryName?: string;
  /** ラベルになる語。[表記, 分類] */
  labels?: [string, string][];
  /** ラベルにならない走り書き。これが「メモ」の行き先 */
  memos?: string[];
  ngNotes?: string[];
  firstPurchase?: string;
  wedding?: string;
};

const PINNED_STAFF1: PinnedCustomer[] = [
  {
    name: "時枝 正", nameKana: "ときえだ ただし", tier: "thick",
    birthDate: "1978-03-19",
    companyName: "三菱商事株式会社", department: "エネルギーソリューション本部",
    jobTitle: "部長", industry: "総合商社", residencePrefecture: "東京都",
    familyInfo: "妻・長男（高校生）・長女（中学生）", embroideryName: "T.TOKIEDA",
    labels: [
      ["ゴルフ", "hobby"], ["ワイン", "hobby"],
      ["ネイビー", "preference"], ["チャコール", "preference"],
      ["無地", "preference"], ["ストライプ", "preference"], ["ブリティッシュ", "preference"],
      ["商談", "scene"], ["会食", "scene"], ["式典", "scene"],
      ["出張多い", "lifestyle"],
    ],
    memos: ["高橋様のご紹介で来店。", "ご子息の成人式スーツの相談を受けている（2027年予定）。"],
    ngNotes: ["光沢の強い生地は好まない。", "前回ピークドラペルを提案して断られている。"],
    firstPurchase: "2021-04-17", wedding: "2006-10-08",
  },
  {
    name: "柏木 正", nameKana: "かしわぎ ただし", tier: "thick",
    birthDate: "1985-04-17",
    companyName: "三井不動産株式会社", department: "開発本部",
    jobTitle: "課長", industry: "不動産", residencePrefecture: "東京都",
    familyInfo: "妻・長男（中学生）",
    labels: [
      ["サーフィン", "hobby"],
      ["ネイビー", "preference"], ["チャコール", "preference"], ["チェック", "preference"],
      ["ソフト", "preference"],
      ["冠婚葬祭", "scene"],
    ],
    firstPurchase: "2023-05-11",
  },
  {
    name: "望月 正", nameKana: "もちづき ただし", tier: "standard",
    birthDate: "1971-06-22",
    companyName: "日本生命保険相互会社", department: "財務部",
    jobTitle: "部長", industry: "保険", residencePrefecture: "神奈川県",
    familyInfo: "妻・長男・次男",
    labels: [
      ["サウナ", "hobby"],
      ["チャコール", "preference"], ["ブラウン", "preference"], ["無地", "preference"],
      ["スリム", "preference"],
      ["商談", "scene"],
    ],
    firstPurchase: "2024-02-28",
  },
  {
    // 氏名と電話だけ。要件どおり「登録しただけ」の状態を 1 人だけ担当に混ぜる
    name: "古賀 悠人", nameKana: "こが ゆうと", tier: "minimal",
  },
  {
    name: "樋口 京平", nameKana: "ひぐち きょうへい", tier: "standard",
    birthDate: "1962-08-06",
    companyName: "日本生命保険相互会社", department: "経営企画部",
    jobTitle: "マネージャー", industry: "保険", residencePrefecture: "埼玉県",
    familyInfo: "妻・長男（中学生）",
    labels: [
      ["登山", "hobby"], ["釣り", "hobby"],
      ["ネイビー", "preference"], ["無地", "preference"], ["ソフト", "preference"],
      ["冠婚葬祭", "scene"], ["登壇", "scene"], ["会食", "scene"],
    ],
    firstPurchase: "2023-02-13",
  },
  {
    // 空白の無い氏名。画面から手で登録された顧客はこうなる
    name: "九条健一郎", nameKana: "くじょうけんいちろう", tier: "standard",
    birthDate: "1984-05-06",
    companyName: "野村證券株式会社", department: "開発本部",
    jobTitle: "本部長", industry: "証券", residencePrefecture: "宮城県",
    familyInfo: "妻のみ",
    labels: [
      ["ゴルフ", "hobby"],
      ["グレー", "preference"], ["ブラウン", "preference"], ["チェック", "preference"],
      ["ソフト", "preference"],
      ["冠婚葬祭", "scene"],
      ["出張多い", "lifestyle"],
    ],
    firstPurchase: "2024-08-09",
  },
  {
    name: "柏木 和馬", nameKana: "かしわぎ かずま", tier: "standard",
    birthDate: "1988-07-08",
    companyName: "株式会社小田原製作所", department: "人事部",
    jobTitle: "部長", industry: "製造", residencePrefecture: "福岡県",
    familyInfo: "妻のみ",
    labels: [
      ["サウナ", "hobby"], ["読書", "hobby"],
      ["グレー", "preference"], ["ブラウン", "preference"], ["無地", "preference"],
      ["ブリティッシュ", "preference"],
      ["商談", "scene"], ["登壇", "scene"], ["式典多め", "scene"],
      ["出張多い", "lifestyle"],
    ],
    firstPurchase: "2024-07-28",
  },
  {
    name: "樋口 奏", nameKana: "ひぐち かなで", tier: "standard",
    birthDate: "1992-02-21",
    companyName: "日本生命保険相互会社", department: "人事部",
    industry: "保険", residencePrefecture: "東京都",
    familyInfo: "妻・長女（小学生）・次女",
    labels: [
      ["写真", "hobby"],
      ["ブラウン", "preference"], ["チェック", "preference"], ["ソフト", "preference"],
      ["日常業務", "scene"], ["商談", "scene"], ["式典多め", "scene"],
    ],
    firstPurchase: "2022-04-10",
  },
  {
    name: "三雲 隆之介", nameKana: "みくも りゅうのすけ", tier: "standard",
    birthDate: "1979-10-06",
    companyName: "株式会社小田原製作所", department: "経営企画部",
    jobTitle: "取締役", industry: "製造", residencePrefecture: "東京都",
    familyInfo: "妻のみ",
    labels: [
      ["ワイン", "hobby"], ["読書", "hobby"],
      ["ネイビー", "preference"], ["チャコール", "preference"], ["無地", "preference"],
      ["ソフト", "preference"],
      ["冠婚葬祭", "scene"], ["日常業務", "scene"], ["登壇", "scene"], ["式典多め", "scene"],
      ["出張多い", "lifestyle"],
    ],
    firstPurchase: "2022-06-27",
  },
  {
    name: "天野 健一郎", nameKana: "あまの けんいちろう", tier: "standard",
    birthDate: "1962-05-05",
    companyName: "株式会社ロジコム物流", department: "営業本部",
    jobTitle: "マネージャー", industry: "運輸・物流", residencePrefecture: "東京都",
    familyInfo: "妻のみ",
    labels: [
      ["読書", "hobby"], ["ゴルフ", "hobby"],
      ["グレー", "preference"], ["無地", "preference"], ["ブリティッシュ", "preference"],
      ["商談", "scene"], ["式典多め", "scene"],
      ["出張多い", "lifestyle"],
    ],
    firstPurchase: "2023-11-21",
  },
];


// ── どれだけ作るか ──────────────────────────────────────

/**
 * 顧客の厚み。実店舗の名簿は均一ではないので、3 層に分ける。
 *
 * thick    … 採寸 2〜3 枚・注文 3〜6 件・注意事項・記念日。カルテが埋まっている人
 * standard … 語 5〜7・注文 1〜3 件・初回購入日。ふつうの常連
 * minimal  … 氏名とカナと電話だけ。**要件どおり「登録しただけ」の状態**
 *
 * minimal を混ぜるのは、一覧に「—」が並ぶ状態と、
 * 「その人については何も記録がありません」と答える経路を残しておくため。
 */
export type Tier = "thick" | "standard" | "minimal";

export type SeedShape = {
  /**
   * スタッフごとに何名**生成する**か。
   * PINNED_STAFF1 の 10 名はここに含まれない（pinnedStaffId の担当に別途足される）。
   */
  perStaff: { staffId: string; count: number }[];
  /**
   * 固定の 10 名を誰の担当にするか。null なら作らない。
   *
   * 本番には staff-1 が存在しないので、実在のスタッフ id を渡す。
   * 時枝さんの採寸票は紙の実物（private/採寸データ.jpg）をそのまま起こしたもので、
   * デモとして一番見せたい記録なので、**本番でも作る側に倒してある**。
   */
  pinnedStaffId: string | null;
  /** thick と standard の割合。残りが minimal */
  tiers: { thick: number; standard: number };
  seed: number;
};

/**
 * ローカル（`npm run db:reset`）の既定。
 *
 * 細川さんは固定の 10 名だけ。増やしたぶんは白髭さん・野﨑さんへ寄せる。
 * **600 名の中から担当 10 名を正確に引けるか**を確かめたいので、
 * 店全体の規模は本番と揃えてある（店全体で同姓が増えるほど名寄せは厳しくなる）。
 */
export const DEFAULT_SHAPE: SeedShape = {
  pinnedStaffId: "staff-1",
  perStaff: [
    { staffId: "staff-2", count: 295 },
    { staffId: "staff-3", count: 295 },
  ],
  tiers: { thick: 0.13, standard: 0.67 },
  seed: 20260804,
};

export function buildAll(shape: SeedShape = DEFAULT_SHAPE): Built {
  const rand = mulberry32(shape.seed);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const pickSome = <T,>(arr: T[], n: number): T[] => {
    const copy = [...arr];
    const out: T[] = [];
    for (let i = 0; i < n && copy.length; i++) out.push(...copy.splice(Math.floor(rand() * copy.length), 1));
    return out;
  };
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

  const customers: Customer[] = [];
  const anniversaries: CustomerAnniversary[] = [];
  const facts: CustomerFact[] = [];
  const ngNotes: CustomerNgNote[] = [];
  const sheets: MeasurementSheet[] = [];
  const orders: Order[] = [];
  const orderItems: OrderItem[] = [];
  const approachTasks: ApproachTask[] = [];

  /**
   * 誰を、どの担当で、どの厚みで作るか。**先に全部決めてから回す。**
   *
   * 固定の 10 名を先頭に置き、そのあとに生成ぶんを並べる。順序を決め打ちに
   * するのは、乱数の消費順が変わると生成ぶんの氏名が総入れ替えになるため
   * （固定の 10 名は乱数を一切引かないので、後ろの人数を変えても影響しない）。
   */
  const pinnedStaffId = shape.pinnedStaffId;
  const specs: { staffId: string; tier: Tier; pinned?: PinnedCustomer }[] = [
    ...(pinnedStaffId
      ? PINNED_STAFF1.map((pinned) => ({ staffId: pinnedStaffId, tier: pinned.tier, pinned }))
      : []),
    ...shape.perStaff.flatMap(({ staffId, count }) =>
      Array.from({ length: count }, (_, n): { staffId: string; tier: Tier } => ({
        staffId,
        // 層は割合で切る。乱数で決めると、担当ごとの厚みの比率が振れて
        // 「この人だけ採寸票が 1 枚も無い」が起きる
        tier:
          n < Math.round(count * shape.tiers.thick)
            ? "thick"
            : n < Math.round(count * (shape.tiers.thick + shape.tiers.standard))
              ? "standard"
              : "minimal",
      })),
    ),
  ];

  const pinnedNames = new Set(PINNED_STAFF1.map((c) => c.name));

  // 居住地は順に配る。薄い顧客を飛ばすので、県ごとの人数が欠けないよう別に数える
  let residenceCursor = 0;

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const id = `cust-${String(i + 1).padStart(4, "0")}`;
    const pinned = spec.pinned;
    const thick = spec.tier === "thick";
    const minimal = spec.tier === "minimal";

    // 固定の 10 名と同じ氏名は生成ぶんに作らせない。
    // 店全体に「時枝 正」が 2 人いると、担当が違っても紛らわしいだけで
    // 得るものが無い（同姓の検証は PINNED_STAFF1 に意図して仕込んである）。
    let sn = "", snKana = "", gn = "", gnKana = "";
    do {
      [sn, snKana] = pick(SURNAMES);
      [gn, gnKana] = pick(GIVEN_NAMES);
    } while (pinnedNames.has(`${sn} ${gn}`) || pinnedNames.has(`${sn}${gn}`));
    const [pickedCompany, pickedIndustry] = pick(COMPANIES);
    const companyName = pinned?.companyName ?? pickedCompany;
    const industry = pinned?.industry ?? pickedIndustry;

    // 薄い顧客は居住地も未設定。一覧で「—」が出る状態を残しておく
    const residencePrefecture =
      pinned?.residencePrefecture ??
      (minimal ? undefined : RESIDENCES[residenceCursor++ % RESIDENCES.length]);

    // 顧客の担当。同じ顧客の採寸・受注・送信もこの人が行った想定にする
    const staffId = spec.staffId;

    // パーソナル。移行後の姿を直接作る（もとは hobbies / preferences / tags の 3 列だった）。
    // ラベルになる語だけをチップにし、ならないものは走り書きとして本文だけ持つ。
    const colors = minimal ? [] : pickSome(["ネイビー", "チャコール", "グレー", "ブラウン"], int(1, 2));
    const patterns = minimal ? [] : pickSome(["無地", "ストライプ", "チェック"], 1);
    const silhouette = minimal ? undefined : pick(["クラシック", "ブリティッシュ", "スリム", "ソフト"]);
    const scenes = minimal ? [] : pickSome(SCENES, int(1, 3));
    const hobbies = minimal ? [] : pickSome(HOBBIES, int(1, 2));

    // もとの tags は 3 種類が混ざっていた。事実はラベルへ、
    // 「紹介元」は意味を持っていなかったので捨てる。同意（写真OK・夜間連絡可）は
    // 列にしたあと一度も使われず、Phase 3 で落とした。
    const oldTags = minimal ? [] : pickSome(["式典多め", "出張多い"], int(0, 2));

    // 初回購入日は顧客の列としては持たない（表示されるだけだった）。
    // 記念日としては意味があるので customer_anniversaries に残す。
    const generatedFirstPurchase = minimal ? undefined : daysAgo(int(200, 1600));
    const firstPurchase = pinned?.firstPurchase ?? generatedFirstPurchase;

    // 生成ぶんも 1 割は姓と名のあいだに空白を入れない。
    //
    // 実際に画面から手で登録された顧客はこの形になる（「横川尚隆」）。
    // 全員が空白ありだと、氏名を `split(" ")[0]` で姓として扱うコードが
    // 手元では通ってしまう。**それで「横川くん」と名前を言っているのに
    // 誰の話か聞き返される**不具合が本番の使い方でだけ出た。
    // 固定の 10 名では九条健一郎がこの形（PINNED_STAFF1 を見よ）。
    const handTyped = rand() < 0.1;

    // 乱数は層によらず**必ず同じ回数だけ引く**。条件で引いたり引かなかったり
    // すると、薄い顧客を 1 人足しただけで以降の氏名が全部ずれる。
    const generatedBirth = `19${int(62, 92)}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`;
    const generatedPhone = `090-${int(1000, 9999)}-${int(1000, 9999)}`;
    const generatedDepartment = pick(DEPARTMENTS) || undefined;
    const generatedJobTitle = pick(JOB_TITLES) || undefined;
    const generatedFamily = pick(["妻・長男（中学生）", "妻・長女（小学生）・次女", "独身", "妻のみ", "妻・長男・次男"]);
    const generatedAddress = residencePrefecture
      ? `${residencePrefecture}${pick(CITIES[residencePrefecture])}${int(1, 5)}-${int(1, 30)}-${int(1, 20)}`
      : undefined;

    const customer: Customer = {
      id,
      name: pinned?.name ?? (handTyped ? `${sn}${gn}` : `${sn} ${gn}`),
      nameKana: pinned?.nameKana ?? (handTyped ? `${snKana}${gnKana}` : `${snKana} ${gnKana}`),
      birthDate: pinned ? pinned.birthDate : minimal ? undefined : generatedBirth,
      gender: "male",
      // 薄い顧客も連絡手段だけは持つ。**まったく連絡できない行は作らない**
      phone: generatedPhone,
      email: minimal ? undefined : `${snKana}@example.com`,
      address: minimal ? undefined : generatedAddress,
      residencePrefecture,
      companyName: minimal ? undefined : companyName,
      department: pinned ? pinned.department : minimal ? undefined : generatedDepartment,
      jobTitle: pinned ? pinned.jobTitle : minimal ? undefined : generatedJobTitle,
      industry: minimal ? undefined : industry,
      familyInfo: pinned ? pinned.familyInfo : minimal ? undefined : generatedFamily,
      embroideryName: pinned?.embroideryName,
      staffId,
      createdAt: daysAgo(int(30, 1700)),
    };

    const factsBefore = facts.length;
    const own = (
      body: string,
      label?: { name: string; categoryKey: string },
      source: FactSource = "migration",
    ) => {
      facts.push({
        id: `fact-${id}-${facts.length}`,
        customerId: id,
        body,
        source,
        createdAt: customer.createdAt,
        label: label ? { id: `label-${label.name}`, ...label } : undefined,
      });
    };

    for (const v of hobbies) own(v, { name: v, categoryKey: "hobby" });
    for (const v of colors) own(v, { name: v, categoryKey: "preference" });
    for (const v of patterns) own(v, { name: v, categoryKey: "preference" });
    if (silhouette) own(silhouette, { name: silhouette, categoryKey: "preference" });
    for (const v of scenes) own(v, { name: v, categoryKey: "scene" });
    for (const v of oldTags) {
      if (v === "式典多め") own(v, { name: v, categoryKey: "scene" });
      if (v === "出張多い") own(v, { name: v, categoryKey: "lifestyle" });
    }

    // 固定の 10 名は、自動生成ぶんを丸ごと捨てて書き下したものに置き換える。
    // **乱数は上で引き終えている**ので、ここで捨てても後続の顧客はずれない。
    if (pinned) {
      facts.length = factsBefore;
      for (const [label, categoryKey] of pinned.labels ?? []) {
        own(label, { name: label, categoryKey });
      }
      // ラベルにならない話。これが「メモ」の行き先
      for (const memo of pinned.memos ?? []) own(memo);

      pinned.ngNotes?.forEach((body, n) => {
        ngNotes.push({
          id: `ng-${id}-${n + 1}`,
          customerId: id,
          body,
          createdAt: customer.createdAt,
        });
      });
    }

    // 注意事項。**厚い顧客には必ず 1 件は入れる。**
    //
    // カルテの一番上に無条件で出る枠なので、1 件も無いデータだけで開発していると
    // 「枠ごと消える」表示を一度も見ないまま出すことになる。
    if (!pinned && thick) {
      for (const body of pickSome(NG_NOTES, int(1, 2))) {
        ngNotes.push({
          id: `ng-${id}-${ngNotes.length}`,
          customerId: id,
          body,
          createdAt: customer.createdAt,
        });
      }
    }

    customers.push(customer);

    // 記念日。
    // 誕生日はここで作らない — customers を insert した時点で
    // app.sync_birthday_anniversary() が birth_date から作る。ここでも作ると
    // 同じ顧客に誕生日が 2 行並ぶ。
    if (firstPurchase) {
      anniversaries.push({
        id: `anv-${id}-f`,
        customerId: id,
        type: "first_purchase",
        date: firstPurchase,
        label: "初回購入記念日",
      });
    }
    if (pinned?.wedding) {
      anniversaries.push({
        id: `anv-${id}-w`,
        customerId: id,
        type: "wedding",
        date: pinned.wedding,
        label: "結婚記念日",
      });
    }

    // 採寸票。時枝さんだけは実物の採寸票（private/採寸データ.jpg）をそのまま入れる
    if (pinned?.name === "時枝 正") {
      sheets.push(...tokiedaSheets(id, staffId));
    } else if (thick) {
      const count = int(2, 3);
      let bust = int(88, 104);
      let waist = int(74, 92);
      for (let s = 0; s < count; s++) {
        const measuredAt = daysAgo(int(60, 900) + (count - s) * 180);
        sheets.push({
          id: `sheet-${id}-${s + 1}`,
          customerId: id,
          measuredAt,
          recordedByStaffId: staffId,
          inputMethod: s === 0 ? "pc" : "tablet",
          sections: [
            {
              itemTypeId: "jacket",
              silhouette: pick(["NB", "AB", "BB"]),
              colorNumber: String(int(9, 15)),
              values: {
                total_length: { actual: 74 + s * 0.5, finished: 73.5 + s * 0.5 },
                bust: { actual: bust },
                jacket_length: { actual: 17.5, finished: 67 + s },
                shoulder_width: { actual: 44 + s * 0.5 },
                ef_half_chest: { actual: bust / 2 + 3, finished: bust / 2 + 0.5 },
                sleeve_right: { actual: 58 + s * 0.5 },
                sleeve_left: { actual: 58 + s * 0.5 },
                collar_width: { finished: 8 },
              },
            },
            {
              itemTypeId: "pants",
              silhouette: pick(["AG", "BG"]),
              colorNumber: String(int(9, 15)),
              values: {
                waist: { actual: waist, finished: waist + 1.5 },
                hip: { actual: waist + 18 },
                thigh_width: { actual: 60 + s, finished: 33 + s / 2 },
                knee_width: { actual: 39 + s, finished: 22.5 + s / 2 },
                hem_width: { finished: 18 },
                rise: { actual: 25.5 },
                inseam: { actual: 62 + s * 0.5 },
              },
            },
          ],
          adjustments: pickSome(
            [
              { code: 18, value: 0.7 },
              { code: 23, value: 0.5 },
              { code: 26, value: 1.0 },
              { code: 31, value: 1.2 },
              { code: 72, value: 1.0 },
            ],
            int(1, 3),
          ),
        });
        bust += int(1, 3);
        waist += int(1, 3);
      }
    }

    // 注文
    // 時枝さんだけは注文 4 件で固定（壁打ちで見ていた履歴をそのまま残す）
    const isTokieda = pinned?.name === "時枝 正";
    const orderCount = isTokieda ? 4 : thick ? int(3, 6) : minimal ? 0 : int(1, 3);
    /** この顧客の最終お渡しが何日前か。お渡し後フォローの起点になる */
    let lastDeliveryDays: number | null = null;
    let lastDeliveredOrderId: string | null = null;

    /*
     * お渡し後フォローが立つ顧客を確実に混ぜる。
     *
     * 放っておくと最新のお渡しが直近に寄り、半年・1年の節目を過ぎた顧客が
     * ほとんど生まれない。トリガーが立つかどうかが偶然になると、
     * 機能が壊れているのかデータがそうなのか見分けられなくなる。
     * 3人に1人は、注文そのものを節目の先で作る（後から日付をずらすと、
     * その顧客の受注が直近12ヶ月から丸ごと抜けて月次推移が虫食いになる）。
     */
    const followUpDue = i % 3 === 0;
    // 半分は1年の節目、半分は半年の節目
    const dueAge = i % 6 === 0 ? int(370, 430) : int(190, 250);

    for (let o = 0; o < orderCount; o++) {
      const orderId = `ord-${id}-${o + 1}`;
      /*
       * 一部は直近の受注にして、今月の実績が空にならないようにする。
       * それ以外も直近2年に収める。もっと散らすと月次推移が虫食いになり、
       * 目標線との比較というグラフの目的が果たせない。
       *
       * フォロー対象の顧客は最新の注文を節目の先に置き、それより前の注文を
       * さらに古い側へ並べる（新しいお渡しが残っていると、そちらが最終お渡しになる）。
       */
      const recent = !followUpDue && o === 0 && rand() < 0.35;
      const orderedDays = followUpDue
        ? dueAge + int(40, 52) + o * int(60, 150)
        : recent
          ? int(1, 26)
          : int(15, 430);
      const orderedAt = daysAgo(orderedDays);
      const orderedDate = new Date(`${orderedAt}T00:00:00`);
      // 受注からお渡しまでのリードタイム。引いて未来になるものはお渡し前として扱う
      const deliveryDays = orderedDays - int(40, 52);
      const delivered = deliveryDays > 0;
      if (delivered && (lastDeliveryDays === null || deliveryDays < lastDeliveryDays)) {
        lastDeliveryDays = deliveryDays;
        lastDeliveredOrderId = orderId;
      }
      const purpose = pick<Order["purpose"]>(["business", "business", "business", "formal", "wedding", "casual"]);
      const itemCount = purpose === "business" ? int(2, 3) : int(1, 2);
      const fabric = isTokieda ? FABRICS[[0, 12, 1, 2][o]] : pick(FABRICS);

      const itemTypes: OrderItem["itemTypeId"][] = ["jacket", "pants", "vest"].slice(0, itemCount) as OrderItem["itemTypeId"][];
      const priceOf = (t: OrderItem["itemTypeId"]) =>
        t === "jacket" ? 95000 : t === "pants" ? 45000 : 30000;

      // 売上は税込の1本。仕様追加が乗ることがあるので、たまに割増ぶんを足す
      const base = itemTypes.reduce((sum, t) => sum + priceOf(t), 0);
      const surcharge = rand() < 0.3 ? int(1, 6) * 5000 : 0;

      /*
       * 売上区分の内訳。**任意なので、3 割ほどは入れないままにする。**
       * 入っている注文と入っていない注文が両方見えないと、画面の出し分け
       * （内訳が無ければ何も出さない）を手元で確かめられない。
       *
       * ネクタイやチーフは採寸が要らないので order_items には出ない。
       * 内訳にだけ現れる区分があるのは、実際にそういう売り方をするため。
       *
       * **割増ぶんはどの区分にも入れない。**「その他」区分を作らない判断が
       * そのまま「内訳の和が合計に届かない」として画面に出る状態を作っておく。
       */
      const accessory = rand() < 0.25 ? int(1, 4) * 4000 : 0;
      const shirt = rand() < 0.2 ? int(1, 3) * 12000 : 0;
      const withTax = (amount: number) => Math.floor(amount * 1.1);
      const hasBreakdown = rand() < 0.7;
      const breakdown = hasBreakdown
        ? {
            amountSuit: withTax(base),
            amountAccessory: accessory > 0 ? withTax(accessory) : undefined,
            amountShirt: shirt > 0 ? withTax(shirt) : undefined,
          }
        : {};

      // 納品（工場→店）の 1 週間ほど後に顧客へお渡しする
      const arrivedAt = toIsoDate(addDays(orderedDate, 43));

      orders.push({
        id: orderId,
        customerId: id,
        orderNumber: `J1-${String(int(100, 999))}-${String(int(100, 999))}`,
        orderedAt,
        arrivedAt,
        deliveredAt: delivered ? daysAgo(deliveryDays) : undefined,
        status: delivered ? "delivered" : "in_production",
        purpose,
        totalAmount: withTax(base + surcharge + accessory + shirt),
        ...breakdown,
        // 生地は注文単位。紙が原反ＮＯ を 1 つしか持たない
        ...fabric,
        takenByStaffId: staffId,
      });

      // 明細は「何を作ったか」だけ。生地も金額も注文単位（Order 側）に持つ
      itemTypes.forEach((itemTypeId, k) => {
        orderItems.push({ id: `${orderId}-item-${k + 1}`, orderId, itemTypeId });
      });
    }

    /*
     * 人が下した判断の履歴。
     *
     * アプローチ自体は lib/data/approaches.ts で毎回評価して導出するので、
     * ここに置くのは「押した記録」だけ。
     *
     * 1年の節目に来ている顧客には、半年をスキップした記録を入れておく。
     * 半年を見送っても1年で改めて出る、という triggerKey 単位で持つ狙いが
     * リセット直後の画面でそのまま確かめられるようにするため。
     */
    if (lastDeliveredOrderId && lastDeliveryDays !== null && lastDeliveryDays > 365) {
      approachTasks.push({
        id: `apt-post_delivery:${lastDeliveredOrderId}:6m`,
        customerId: id,
        triggerKey: `post_delivery:${lastDeliveredOrderId}:6m`,
        triggerType: "post_delivery",
        reason: "お渡しから半年が経ちました。着心地を伺う頃合いです。",
        status: "skipped",
        resolvedAt: `${daysAgo(lastDeliveryDays - 180)}T10:15:00`,
      });
    }
  }

  return { customers, anniversaries, facts, ngNotes, sheets, orders, orderItems, approachTasks };
}

/**
 * 売上目標。
 *
 * グラフに目標線が1本も引かれていないと、破線が何を表しているのか伝わらない。
 * 過去12ヶ月と先6ヶ月を必ず埋めておく。
 *
 * 額は決め打ちにせず、生成した受注の実績から逆算する。手で置いた数字だと
 * シードの受注量と桁がずれ、棒が床に張り付いて達成率が常に一桁になる
 * ——グラフの読み方そのものが確かめられなくなる。
 */
export function buildRevenueTargets(
  customers: Customer[],
  orders: Order[],
): RevenueTarget[] {
  const now = new Date();
  const since = daysAgo(365);
  const staffOf = new Map(customers.map((c) => [c.id, c.staffId]));

  const yearlyByStaff = new Map<string, number>();
  for (const order of orders) {
    if (order.orderedAt < since) continue;
    const staffId = staffOf.get(order.customerId);
    if (!staffId) continue;
    yearlyByStaff.set(staffId, (yearlyByStaff.get(staffId) ?? 0) + order.totalAmount);
  }

  // **STAFF 定数ではなく、実際に顧客を持っている担当から作る。**
  // 本番の uuid で生成したときに staff-1..3 の目標が混ざると、
  // どのスタッフにも紐づかない行が本番へ流れる。
  const staffIds = [...new Set(customers.map((c) => c.staffId))];

  const targets: RevenueTarget[] = [];
  for (const staffId of staffIds) {
    // 実績の月平均より少し上に置く。達成した月と届かなかった月が両方出る高さ
    const monthly = (yearlyByStaff.get(staffId) ?? 0) / 12;
    const base = Math.max(200_000, Math.round((monthly * 1.1) / 50_000) * 50_000);

    for (let offset = -11; offset <= 6; offset++) {
      const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const month = toIsoMonth(date);
      // 3月・9月は入荷期で受注が伸びるため高めに置く
      const seasonal = [3, 9].includes(date.getMonth() + 1) ? 1.2 : 1;
      targets.push({
        id: `tgt-${staffId}-${month}`,
        staffId,
        month,
        amount: Math.round((base * seasonal) / 50_000) * 50_000,
      });
    }
  }
  return targets;
}

export function createSeedDatabase(shape: SeedShape = DEFAULT_SHAPE): DemoDataset {
  const built = buildAll(shape);
  return {
    version: SEED_VERSION,
    session: { staffId: STAFF[0].id },
    staff: STAFF,
    customers: built.customers,
    anniversaries: built.anniversaries,
    facts: built.facts,
    ngNotes: built.ngNotes,
    measurementSheets: built.sheets,
    orders: built.orders,
    orderItems: built.orderItems,
    alterations: [],
    approachTasks: built.approachTasks,
    revenueTargets: buildRevenueTargets(built.customers, built.orders),
    // 会話は空から始める。作り物の履歴を最初に見せても読む意味がない
    agentMessages: [],
  };
}
