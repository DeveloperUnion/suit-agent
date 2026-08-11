import type {
  ApproachTask,
  Customer,
  CustomerAnniversary,
  MeasurementSheet,
  DemoDataset,
  Order,
  OrderItem,
  RevenueTarget,
  Staff,
} from "@/lib/types";
import type { OrderItemFabric } from "@/lib/data/orders";
import { addDays, daysAgo, toIsoDate, toIsoMonth } from "@/lib/utils/date";

/**
 * 開発用のデモデータ。
 *
 * アプリはこれを読まない。scripts/generate-dev-seed.ts が
 * supabase/dev-seed.sql を吐くための素として使うだけ。
 * mulberry32 で決定的なので、生成し直しても同じデータが出る。
 */

/** 構造を変えたら上げる */
export const SEED_VERSION = 18;

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

const SURNAMES = [
  ["時枝", "ときえだ"], ["黒田", "くろだ"], ["篠原", "しのはら"], ["宮下", "みやした"],
  ["古賀", "こが"], ["近藤", "こんどう"], ["蓮見", "はすみ"], ["天野", "あまの"],
  ["白石", "しらいし"], ["越智", "おち"], ["風間", "かざま"], ["三雲", "みくも"],
  ["瀬川", "せがわ"], ["名取", "なとり"], ["樋口", "ひぐち"], ["望月", "もちづき"],
  ["日下部", "くさかべ"], ["朝倉", "あさくら"], ["八木", "やぎ"], ["笠井", "かさい"],
  ["峰岸", "みねぎし"], ["磯部", "いそべ"], ["神谷", "かみや"], ["都築", "つづき"],
  ["柏木", "かしわぎ"], ["水無瀬", "みなせ"], ["緒方", "おがた"], ["志村", "しむら"],
  ["鮫島", "さめじま"], ["東海林", "しょうじ"], ["九条", "くじょう"], ["真鍋", "まなべ"],
];

const GIVEN_NAMES = [
  ["正", "ただし"], ["彰久", "あきひさ"], ["涼太", "りょうた"], ["健一郎", "けんいちろう"],
  ["昂", "たかし"], ["悠人", "ゆうと"], ["和馬", "かずま"], ["宗一", "そういち"],
  ["理", "おさむ"], ["伸吾", "しんご"], ["拓真", "たくま"], ["聡", "さとし"],
  ["隆之介", "りゅうのすけ"], ["直樹", "なおき"], ["京平", "きょうへい"], ["奏", "かなで"],
];

const COMPANIES: [string, string][] = [
  ["三菱商事株式会社", "総合商社"],
  ["株式会社電通", "広告・マーケティング"],
  ["日本生命保険相互会社", "保険"],
  ["野村證券株式会社", "証券"],
  ["株式会社リクルート", "人材"],
  ["アンダーソン・毛利・友常法律事務所", "法律"],
  ["株式会社ジェイ・エス・アーキ", "建築設計"],
  ["医療法人社団 青葉会", "医療"],
  ["株式会社サイバーエージェント", "IT・ソフトウェア"],
  ["三井不動産株式会社", "不動産"],
  ["株式会社みずほ銀行", "銀行"],
  ["株式会社小田原製作所", "製造"],
  ["有限会社ハヤカワ工務店", "建設"],
  ["株式会社ロジコム物流", "運輸・物流"],
  ["税理士法人 谷口会計", "会計・税務"],
];

const JOB_TITLES = ["代表取締役", "取締役", "執行役員", "本部長", "部長", "次長", "課長", "マネージャー", "主任", ""];
const DEPARTMENTS = ["営業本部", "経営企画部", "財務部", "人事部", "法務部", "開発本部", "管理部", ""];
const CHANNELS = ["紹介", "Instagram", "路面店", "既存客再来", "Web検索", "イベント"];

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

// ── 顧客の生成 ──────────────────────────────────────────

type Built = {
  customers: Customer[];
  anniversaries: CustomerAnniversary[];
  sheets: MeasurementSheet[];
  orders: Order[];
  orderItems: OrderItem[];
  approachTasks: ApproachTask[];
};

/** 採寸票の実物（private/採寸データ.jpg）をそのまま投入する */
function tokiedaSheets(customerId: string): MeasurementSheet[] {
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
    make("sheet-tokieda-1", "2024-09-14", "staff-1", {
      bust: 96, ef: 52, waist: 80.5, hip: 102, thigh: 62, knee: 40, vestBust: 94.5, vestEf: 47.5,
    }, false),
    make("sheet-tokieda-2", "2025-11-22", "staff-1", {
      bust: 98.5, ef: 53.5, waist: 83, hip: 104, thigh: 63.5, knee: 41, vestBust: 97, vestEf: 49,
    }, false),
    make("sheet-tokieda-3", "2026-07-06", "staff-1", {
      bust: 101, ef: 55, waist: 85.5, hip: 106, thigh: 65, knee: 42, vestBust: 99.5, vestEf: 50.5,
    }, true),
  ];
}

function buildAll(): Built {
  const rand = mulberry32(20260804);
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
  const sheets: MeasurementSheet[] = [];
  const orders: Order[] = [];
  const orderItems: OrderItem[] = [];
  const approachTasks: ApproachTask[] = [];

  const TOTAL = 50;
  // 先頭 8 名は「厚い顧客」— 採寸・注文・やり取りが揃っている
  const THICK = 8;

  // 居住地は順に配る。薄い顧客を飛ばすので、県ごとの人数が欠けないよう別に数える
  let residenceCursor = 0;

  for (let i = 0; i < TOTAL; i++) {
    const id = `cust-${String(i + 1).padStart(3, "0")}`;
    const isTokieda = i === 0;
    const thick = i < THICK;
    // 薄い顧客は要件どおり「氏名＋連絡手段だけ」の状態も混ぜる
    const minimal = !thick && i % 5 === 4;

    const [sn, snKana] = isTokieda ? SURNAMES[0] : pick(SURNAMES.slice(1));
    const [gn, gnKana] = isTokieda ? GIVEN_NAMES[0] : pick(GIVEN_NAMES);
    const [companyName, industry] = pick(COMPANIES);

    // 薄い顧客は居住地も未設定。一覧で「—」が出る状態を残しておく
    const residencePrefecture = minimal
      ? undefined
      : RESIDENCES[residenceCursor++ % RESIDENCES.length];

    // 最終接触日は意図的に散らす。カルテの「最終連絡」がいろいろな状態で見えるように
    const bucket = i % 4;
    let lastContactDays =
      bucket === 0
        ? int(2, 30)
        : bucket === 1
          ? int(31, 90)
          : bucket === 2
            ? int(95, 175)
            : int(185, 320);

    // 顧客の担当。同じ顧客の採寸・受注・送信もこの人が行った想定にする
    const staffId = pick(STAFF).id;

    const customer: Customer = {
      id,
      name: `${sn} ${gn}`,
      nameKana: `${snKana} ${gnKana}`,
      birthDate: minimal ? undefined : `19${int(62, 92)}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`,
      gender: "male",
      phone: `090-${int(1000, 9999)}-${int(1000, 9999)}`,
      email: minimal ? undefined : `${snKana}@example.com`,
      address: residencePrefecture
        ? `${residencePrefecture}${pick(CITIES[residencePrefecture])}${int(1, 5)}-${int(1, 30)}-${int(1, 20)}`
        : undefined,
      residencePrefecture,
      companyName: minimal ? undefined : companyName,
      department: minimal ? undefined : pick(DEPARTMENTS) || undefined,
      jobTitle: minimal ? undefined : pick(JOB_TITLES) || undefined,
      industry: minimal ? undefined : industry,
      preferences: minimal
        ? undefined
        : {
            colors: pickSome(["ネイビー", "チャコール", "グレー", "ブラウン"], int(1, 2)),
            patterns: pickSome(["無地", "ストライプ", "チェック"], 1),
            silhouette: pick(["クラシック", "ブリティッシュ", "スリム", "ソフト"]),
            scenes: pickSome(SCENES, int(1, 3)),
          },
      hobbies: minimal ? undefined : pickSome(HOBBIES, int(1, 2)).join("・"),
      familyInfo: minimal ? undefined : pick(["妻・長男（中学生）", "妻・長女（小学生）・次女", "独身", "妻のみ", "妻・長男・次男"]),
      ngNotes: undefined,
      staffId,
      firstVisitDate: minimal ? daysAgo(int(5, 60)) : daysAgo(int(200, 1600)),
      acquisitionChannel: pick(CHANNELS),
      lastContactedAt: daysAgo(lastContactDays),
      tags: minimal ? undefined : pickSome(["紹介元", "式典多め", "出張多い", "写真OK", "夜間連絡可"], int(0, 2)),
      memo: minimal ? undefined : undefined,
      createdAt: daysAgo(int(30, 1700)),
    };

    if (isTokieda) {
      customer.name = "時枝 正";
      customer.nameKana = "ときえだ ただし";
      customer.birthDate = "1978-03-19";
      customer.companyName = "三菱商事株式会社";
      customer.department = "エネルギーソリューション本部";
      customer.jobTitle = "部長";
      customer.industry = "総合商社";
      customer.embroideryName = "T.TOKIEDA";
      customer.hobbies = "ゴルフ・ワイン";
      customer.familyInfo = "妻・長男（高校生）・長女（中学生）";
      customer.ngNotes = "光沢の強い生地は好まない。前回ピークドラペルを提案して断られている。";
      customer.preferences = {
        colors: ["ネイビー", "チャコール"],
        patterns: ["無地", "ストライプ"],
        silhouette: "ブリティッシュ",
        scenes: ["商談", "会食", "式典"],
      };
      customer.acquisitionChannel = "紹介";
      customer.firstVisitDate = "2021-04-17";
      customer.staffId = "staff-1";
      // トリガーの判定にも使うため、上書きした値に揃える
      lastContactDays = 118;
      customer.lastContactedAt = daysAgo(lastContactDays);
      customer.tags = ["紹介元", "出張多い"];
      customer.memo = "紹介経由の来店。ご子息の成人式スーツの相談を受けている（2027年予定）。";
    }

    customers.push(customer);

    // 記念日
    if (customer.birthDate) {
      anniversaries.push({
        id: `anv-${id}-b`,
        customerId: id,
        type: "birthday",
        date: customer.birthDate,
        label: "誕生日",
      });
    }
    if (customer.firstVisitDate && !minimal) {
      anniversaries.push({
        id: `anv-${id}-f`,
        customerId: id,
        type: "first_purchase",
        date: customer.firstVisitDate,
        label: "初回購入記念日",
      });
    }
    if (isTokieda) {
      anniversaries.push({
        id: `anv-${id}-w`,
        customerId: id,
        type: "wedding",
        date: "2006-10-08",
        label: "結婚記念日",
      });
    }

    // 採寸票
    if (isTokieda) {
      sheets.push(...tokiedaSheets(id));
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
    const orderCount = isTokieda ? 4 : thick ? int(3, 6) : minimal ? 0 : int(1, 3);
    /** この顧客の最終納品が何日前か。納品後フォローの起点になる */
    let lastDeliveryDays: number | null = null;
    let lastDeliveredOrderId: string | null = null;

    /*
     * 納品後フォローが立つ顧客を確実に混ぜる。
     *
     * 放っておくと最新の納品が直近に寄り、半年・1年の節目を過ぎた顧客が
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
       * さらに古い側へ並べる（新しい納品が残っていると、そちらが最終納品になる）。
       */
      const recent = !followUpDue && o === 0 && rand() < 0.35;
      const orderedDays = followUpDue
        ? dueAge + int(40, 52) + o * int(60, 150)
        : recent
          ? int(1, 26)
          : int(15, 430);
      const orderedAt = daysAgo(orderedDays);
      const orderedDate = new Date(`${orderedAt}T00:00:00`);
      // 受注から納品までのリードタイム。引いて未来になるものは納品前として扱う
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

      // 紙の右上と同じ4欄。割増は仕様追加があったときだけ載る
      const subtotalAmount = itemTypes.reduce((sum, t) => sum + priceOf(t), 0);
      const surchargeAmount = rand() < 0.3 ? int(1, 6) * 5000 : 0;
      const taxAmount = Math.floor((subtotalAmount + surchargeAmount) * 0.1);

      orders.push({
        id: orderId,
        customerId: id,
        orderNumber: `J1-${String(int(100, 999))}-${String(int(100, 999))}`,
        orderedAt,
        dueDate: toIsoDate(addDays(orderedDate, 43)),
        deliveredAt: delivered ? daysAgo(deliveryDays) : undefined,
        status: delivered ? "delivered" : "in_production",
        purpose,
        subtotalAmount,
        surchargeAmount,
        taxAmount,
        totalAmount: subtotalAmount + surchargeAmount + taxAmount,
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
        reason: "納品から半年が経ちました。着心地を伺う頃合いです。",
        status: "skipped",
        resolvedAt: `${daysAgo(lastDeliveryDays - 180)}T10:15:00`,
      });
    }
  }

  return { customers, anniversaries, sheets, orders, orderItems, approachTasks };
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
function buildRevenueTargets(
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

  const targets: RevenueTarget[] = [];
  for (const staff of STAFF) {
    // 実績の月平均より少し上に置く。達成した月と届かなかった月が両方出る高さ
    const monthly = (yearlyByStaff.get(staff.id) ?? 0) / 12;
    const base = Math.max(200_000, Math.round((monthly * 1.1) / 50_000) * 50_000);

    for (let offset = -11; offset <= 6; offset++) {
      const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const month = toIsoMonth(date);
      // 3月・9月は入荷期で受注が伸びるため高めに置く
      const seasonal = [3, 9].includes(date.getMonth() + 1) ? 1.2 : 1;
      targets.push({
        id: `tgt-${staff.id}-${month}`,
        staffId: staff.id,
        month,
        amount: Math.round((base * seasonal) / 50_000) * 50_000,
      });
    }
  }
  return targets;
}

export function createSeedDatabase(): DemoDataset {
  const built = buildAll();
  return {
    version: SEED_VERSION,
    session: { staffId: STAFF[0].id },
    staff: STAFF,
    customers: built.customers,
    anniversaries: built.anniversaries,
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
