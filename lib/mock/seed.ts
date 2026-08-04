import type {
  ApproachTask,
  Customer,
  CustomerAnniversary,
  Fabric,
  MeasurementSheet,
  Message,
  MockDatabase,
  Order,
  OrderItem,
  Staff,
} from "@/lib/types";
import { daysAgo, toIsoDate, addDays } from "@/lib/utils/date";

/** 構造を変えたら上げる。localStorage 側が古ければ自動でシードに戻る */
export const SEED_VERSION = 3;

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
  { id: "staff-1", name: "藤原 健司", email: "fujiwara@example.com", role: "admin", isActive: true },
  { id: "staff-2", name: "岡部 涼", email: "okabe@example.com", role: "member", isActive: true },
  { id: "staff-3", name: "三宅 沙耶", email: "miyake@example.com", role: "member", isActive: true },
];

// ── 生地マスタ ──────────────────────────────────────────

const FABRICS: Fabric[] = [
  { id: "fab-01", brand: "CANONICO", productNumber: "CN-2841", color: "ネイビー", colorFamily: "navy", pattern: "solid", composition: "Wool 100%", yarnCount: "Super110's", season: "all_season" },
  { id: "fab-02", brand: "CANONICO", productNumber: "CN-3305", color: "ミッドナイトネイビー", colorFamily: "navy", pattern: "stripe", composition: "Wool 100%", yarnCount: "Super130's", season: "autumn_winter" },
  { id: "fab-03", brand: "DRAPERS", productNumber: "DR-7120", color: "チャコールグレー", colorFamily: "charcoal", pattern: "solid", composition: "Wool 100%", yarnCount: "Super120's", season: "all_season" },
  { id: "fab-04", brand: "DRAPERS", productNumber: "DR-7455", color: "チャコール", colorFamily: "charcoal", pattern: "herringbone", composition: "Wool 100%", yarnCount: "Super100's", season: "autumn_winter" },
  { id: "fab-05", brand: "LORO PIANA", productNumber: "LP-1180", color: "ネイビー", colorFamily: "navy", pattern: "birdseye", composition: "Wool 100%", yarnCount: "Super150's", season: "all_season" },
  { id: "fab-06", brand: "LORO PIANA", productNumber: "LP-2260", color: "ライトグレー", colorFamily: "gray", pattern: "solid", composition: "Wool 96% Silk 4%", yarnCount: "Super130's", season: "spring_summer" },
  { id: "fab-07", brand: "ZEGNA", productNumber: "ZG-4410", color: "ブラック", colorFamily: "black", pattern: "solid", composition: "Wool 100%", yarnCount: "Super120's", season: "all_season" },
  { id: "fab-08", brand: "ZEGNA", productNumber: "ZG-5502", color: "ブラウン", colorFamily: "brown", pattern: "check", composition: "Wool 90% Cashmere 10%", yarnCount: "Super130's", season: "autumn_winter" },
  { id: "fab-09", brand: "DORMEUIL", productNumber: "DM-8801", color: "ミディアムグレー", colorFamily: "gray", pattern: "stripe", composition: "Wool 100%", yarnCount: "Super140's", season: "all_season" },
  { id: "fab-10", brand: "DORMEUIL", productNumber: "DM-9034", color: "ネイビー", colorFamily: "navy", pattern: "check", composition: "Wool 100%", yarnCount: "Super110's", season: "autumn_winter" },
  { id: "fab-11", brand: "REDA", productNumber: "RD-3312", color: "サックスブルー", colorFamily: "blue", pattern: "solid", composition: "Wool 100%", yarnCount: "Super110's", season: "spring_summer" },
  { id: "fab-12", brand: "REDA", productNumber: "RD-4028", color: "グレー", colorFamily: "gray", pattern: "birdseye", composition: "Wool 100%", yarnCount: "Super120's", season: "all_season" },
  { id: "fab-13", brand: "御幸毛織", productNumber: "MY-1105", color: "ネイビー", colorFamily: "navy", pattern: "solid", composition: "Wool 100%", yarnCount: "Super100's", season: "all_season" },
  { id: "fab-14", brand: "御幸毛織", productNumber: "MY-2208", color: "ブラック", colorFamily: "black", pattern: "solid", composition: "Wool 100%", season: "all_season" },
  { id: "fab-15", brand: "HARRISONS", productNumber: "HR-6650", color: "ダークブラウン", colorFamily: "brown", pattern: "herringbone", composition: "Wool 100%", yarnCount: "Super120's", season: "autumn_winter" },
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

const COMPANIES: [string, string, string][] = [
  ["三菱商事株式会社", "総合商社", "1010001008771"],
  ["株式会社電通", "広告", "5010401058550"],
  ["日本生命保険相互会社", "保険", "3120005018794"],
  ["野村證券株式会社", "証券", "7010001045214"],
  ["株式会社リクルート", "人材", "3010401128737"],
  ["アンダーソン・毛利・友常法律事務所", "法律", ""],
  ["株式会社ジェイ・エス・アーキ", "建築設計", ""],
  ["医療法人社団 青葉会", "医療", ""],
  ["株式会社サイバーエージェント", "IT", "6010401045521"],
  ["三井不動産株式会社", "不動産", "8010001066468"],
  ["株式会社みずほ銀行", "銀行", "6010001008845"],
  ["株式会社小田原製作所", "製造", ""],
  ["有限会社ハヤカワ工務店", "建設", ""],
  ["株式会社ロジコム物流", "物流", ""],
  ["税理士法人 谷口会計", "会計", ""],
];

const JOB_TITLES = ["代表取締役", "取締役", "執行役員", "本部長", "部長", "次長", "課長", "マネージャー", "主任", ""];
const DEPARTMENTS = ["営業本部", "経営企画部", "財務部", "人事部", "法務部", "開発本部", "管理部", ""];
const CHANNELS = ["紹介", "Instagram", "路面店", "既存客再来", "Web検索", "イベント"];

// 同じ顧客のタイムラインに同じ文面が並ばないよう、インデックスで順に回す
const INBOUND_BODIES = [
  "ありがとうございます。来週でしたら水曜の夕方が空いています。",
  "先日のジャケット、袖丈がちょうど良かったです。助かりました。",
  "承知しました。生地を見てから決めます。",
  "すみません、しばらく出張が続いていて。落ち着いたら伺います。",
  "妻からも好評でした。次は少し明るめのものも見てみたいです。",
  "受け取りました。今週末に着ていきます。",
];

const OUTBOUND_BODIES = [
  "ご無沙汰しております。朝晩が涼しくなってきましたが、その後お変わりありませんか。",
  "秋冬の生地が入荷しました。前回お作りいただいたものと系統の違うものも入っています。",
  "先日はご来店ありがとうございました。仕上がりは今月末を予定しております。",
  "お直しの件、承りました。お預かりから10日ほどで仕上がります。",
  "仕上がりました。ご都合のよいときにお立ち寄りください。",
  "そろそろ衣替えの時期ですね。お持ちのものでお直しが必要なものがあればお預かりします。",
  "ご結婚記念日が近いと伺っておりました。何かお手伝いできることがあればお申し付けください。",
];
const HOBBIES = ["ゴルフ", "クラシック音楽鑑賞", "登山", "ワイン", "サーフィン", "写真", "読書", "サウナ", "釣り", "ロードバイク"];
const SCENES = ["商談", "式典", "会食", "日常業務", "登壇", "冠婚葬祭"];

// ── 顧客の生成 ──────────────────────────────────────────

type Built = {
  customers: Customer[];
  anniversaries: CustomerAnniversary[];
  sheets: MeasurementSheet[];
  orders: Order[];
  orderItems: OrderItem[];
  messages: Message[];
  approachTasks: ApproachTask[];
};

/** 採寸票の実物（docs/採寸データ.jpg）をそのまま投入する */
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
    staffId,
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
  const messages: Message[] = [];
  const approachTasks: ApproachTask[] = [];

  const TOTAL = 50;
  // 先頭 8 名は「厚い顧客」— 採寸・注文・やり取りが揃っている
  const THICK = 8;

  for (let i = 0; i < TOTAL; i++) {
    const id = `cust-${String(i + 1).padStart(3, "0")}`;
    const isTokieda = i === 0;
    const thick = i < THICK;
    // 薄い顧客は要件どおり「氏名＋連絡手段だけ」の状態も混ぜる
    const minimal = !thick && i % 5 === 4;

    const [sn, snKana] = isTokieda ? SURNAMES[0] : pick(SURNAMES.slice(1));
    const [gn, gnKana] = isTokieda ? GIVEN_NAMES[0] : pick(GIVEN_NAMES);
    const [companyName, industry, corporateNumber] = pick(COMPANIES);

    // 最終接触日は意図的に散らす（30日以内 / 90日超 / 180日超）
    const bucket = i % 3;
    let lastContactDays = bucket === 0 ? int(2, 30) : bucket === 1 ? int(95, 150) : int(185, 320);

    // 経過日数バケットと同じ剰余を使うと担当が偏るため、こちらは乱数で振る
    const staffId = pick(STAFF).id;
    const isKeyAccount = thick ? i < 3 : rand() < 0.12;

    const customer: Customer = {
      id,
      name: `${sn} ${gn}`,
      nameKana: `${snKana} ${gnKana}`,
      birthDate: minimal ? undefined : `19${int(62, 92)}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`,
      gender: "male",
      phone: `090-${int(1000, 9999)}-${int(1000, 9999)}`,
      email: minimal ? undefined : `${snKana}@example.com`,
      address: minimal ? undefined : `東京都${pick(["港区", "渋谷区", "中央区", "世田谷区", "目黒区", "文京区"])}${int(1, 5)}-${int(1, 30)}-${int(1, 20)}`,
      lineUserId: minimal || rand() < 0.25 ? undefined : `U${Math.floor(rand() * 1e15).toString(16)}`,
      lineDisplayName: minimal ? undefined : gn,
      companyName: minimal ? undefined : companyName,
      corporateNumber: minimal ? undefined : corporateNumber || undefined,
      department: minimal ? undefined : pick(DEPARTMENTS) || undefined,
      jobTitle: minimal ? undefined : pick(JOB_TITLES) || undefined,
      industry: minimal ? undefined : industry,
      listingStatus: minimal ? undefined : corporateNumber ? "listed" : "unlisted",
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
      isKeyAccount,
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
      customer.corporateNumber = "1010001008771";
      customer.department = "エネルギーソリューション本部";
      customer.jobTitle = "部長";
      customer.industry = "総合商社";
      customer.listingStatus = "listed";
      customer.isKeyAccount = true;
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
      // 経過日数トリガーの判定にも使うため、上書きした値に揃える
      lastContactDays = 118;
      customer.lastContactedAt = daysAgo(lastContactDays);
      customer.staffId = "staff-1";
      customer.tags = ["紹介元", "出張多い"];
      customer.memo = "紹介経由の来店。ご子息の成人式スーツの相談を受けている（2027年予定）。";
      customer.lineUserId = "Ua3f91c02be77";
      customer.lineDisplayName = "Tadashi";
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
          staffId,
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
    const orderCount = isTokieda ? 4 : thick ? int(2, 4) : minimal ? 0 : int(0, 2);
    for (let o = 0; o < orderCount; o++) {
      const orderId = `ord-${id}-${o + 1}`;
      const orderedAt = daysAgo(int(40, 1500));
      const orderedDate = new Date(`${orderedAt}T00:00:00`);
      const purpose = pick<Order["purpose"]>(["business", "business", "business", "formal", "wedding", "casual"]);
      const itemCount = purpose === "business" ? int(2, 3) : int(1, 2);
      const fabric = isTokieda ? FABRICS[[0, 12, 1, 2][o]] : pick(FABRICS);

      const itemTypes: OrderItem["itemTypeId"][] = ["jacket", "pants", "vest"].slice(0, itemCount) as OrderItem["itemTypeId"][];
      const priceOf = (t: OrderItem["itemTypeId"]) =>
        t === "jacket" ? 95000 : t === "pants" ? 45000 : 30000;

      orders.push({
        id: orderId,
        customerId: id,
        orderNumber: `J1-${String(int(100, 999))}-${String(int(100, 999))}`,
        orderedAt,
        dueDate: toIsoDate(addDays(orderedDate, 43)),
        deliveredAt: toIsoDate(addDays(orderedDate, int(40, 52))),
        status: "delivered",
        purpose,
        // 注文合計はアイテム金額の合計と必ず一致させる
        totalAmount: itemTypes.reduce((sum, t) => sum + priceOf(t), 0),
        staffId,
      });

      itemTypes.forEach((itemTypeId, k) => {
        orderItems.push({
          id: `${orderId}-item-${k + 1}`,
          orderId,
          itemTypeId,
          fabricId: fabric.id,
          amount: priceOf(itemTypeId),
          specs:
            itemTypeId === "jacket"
              ? {
                  front_button: "01",
                  lapel: "01",
                  chest_pocket: "01",
                  hip_pocket: "01",
                  vent: "04",
                  inner_pocket: "03",
                  sleeve_button: "14",
                  lining: "A1",
                  stitch_type: "05",
                  stitch_place: "02",
                  pad_right: "9",
                  pad_left: "9",
                }
              : itemTypeId === "pants"
                ? {
                    front_tuck: "02",
                    belt: "02",
                    loop: "47",
                    side_pocket: "01",
                    back_pocket: "15",
                    hem_finish: "01",
                    fly: "01",
                  }
                : { front_button: "01", chest_pocket: "03", hip_pocket: "01", back_lining: "01" },
        });
      });
    }

    // やり取り
    const messageCount = isTokieda ? 8 : thick ? int(5, 10) : minimal ? 0 : int(0, 3);
    for (let m = 0; m < messageCount; m++) {
      const inbound = m % 3 === 1;
      const sentDays = lastContactDays + (messageCount - m) * int(6, 40);
      messages.push({
        id: `msg-${id}-${m + 1}`,
        customerId: id,
        staffId: inbound ? undefined : staffId,
        sentAt: `${daysAgo(sentDays)}T${String(int(9, 20)).padStart(2, "0")}:${String(int(0, 59)).padStart(2, "0")}:00`,
        channel: pick<Message["channel"]>(["line", "line", "line", "phone", "visit"]),
        direction: inbound ? "inbound" : "outbound",
        body: inbound
          ? INBOUND_BODIES[(i + m) % INBOUND_BODIES.length]
          : OUTBOUND_BODIES[(i + m) % OUTBOUND_BODIES.length],
        isAiGenerated: !inbound && rand() < 0.4,
      });
    }

    // アプローチ
    if (lastContactDays > 90 && !minimal) {
      approachTasks.push({
        id: `apr-${id}-1`,
        customerId: id,
        dueDate: daysAgo(int(0, 5)),
        triggerTypes: lastContactDays > 180 ? ["elapsed_days", "season"] : ["elapsed_days"],
        reason:
          lastContactDays > 180
            ? `最終接触から${lastContactDays}日が経過しています。秋冬の生地入荷期であり、保有アイテムに秋冬向けのコートがありません。`
            : `最終接触から${lastContactDays}日が経過しています。設定閾値（90日）を超えました。`,
        status: "open",
      });
    }
  }

  // 時枝様には記念日トリガーも重ねて、統合表示を確認できるようにする
  approachTasks.push({
    id: "apr-cust-001-2",
    customerId: "cust-001",
    dueDate: daysAgo(0),
    triggerTypes: ["anniversary", "company_news"],
    reason: "初回購入から5年の節目が近づいています。加えて、勤務先の海外事業再編が報じられました。",
    status: "done",
    resolvedAt: `${daysAgo(3)}T11:20:00`,
  });

  return { customers, anniversaries, sheets, orders, orderItems, messages, approachTasks };
}

export function createSeedDatabase(): MockDatabase {
  const built = buildAll();
  return {
    version: SEED_VERSION,
    staff: STAFF,
    customers: built.customers,
    anniversaries: built.anniversaries,
    measurementSheets: built.sheets,
    fabrics: FABRICS,
    orders: built.orders,
    orderItems: built.orderItems,
    alterations: [],
    messages: built.messages,
    approachTasks: built.approachTasks,
    companyNews: [
      {
        id: "news-1",
        customerId: "cust-001",
        corporateNumber: "1010001008771",
        title: "三菱商事、欧州エネルギー事業の再編を発表",
        sourceUrl: "https://example.com/news/1",
        publishedAt: daysAgo(9),
        aiSummary: "欧州のエネルギー関連子会社を統合し、新会社を設立すると発表。担当部門の体制変更が見込まれる。",
        usabilityScore: 72,
      },
    ],
  };
}
