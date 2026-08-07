/**
 * データモデル
 *
 * docs/要件定義書.md の ER 図をベースにしつつ、採寸まわりは docs/採寸データ.jpg
 * （実際の紙の採寸票）の構造に合わせている。要件定義書は身体寸法と仕上がり寸法を
 * 別テーブルに分離していたが、実物は「実寸 / 上がり寸」が同一行に並記されており、
 * その変換こそが職人の判断そのもののため、ペアで保持する。
 */

export type Uuid = string;
/** ISO 8601 の日付文字列（YYYY-MM-DD）。localStorage の JSON と素直に噛み合う */
export type IsoDate = string;
/** ISO 8601 の日時文字列 */
export type IsoDateTime = string;

// ── スタッフ ──────────────────────────────────────────────

export type StaffRole = "admin" | "member";

export type Staff = {
  id: Uuid;
  name: string;
  email: string;
  role: StaffRole;
  isActive: boolean;
};

// ── 顧客 ────────────────────────────────────────────────

export type AnniversaryType = "birthday" | "first_purchase" | "wedding" | "other";

export type CustomerAnniversary = {
  id: Uuid;
  customerId: Uuid;
  type: AnniversaryType;
  /** 誕生日等、年をまたいで毎年発火するもの。年は初回の年を入れる */
  date: IsoDate;
  label: string;
};

export type CustomerPreferences = {
  /** 好みの色・柄 */
  colors?: string[];
  patterns?: string[];
  /** 好みのシルエット */
  silhouette?: string;
  /** 主な着用シーン */
  scenes?: string[];
};

export type Customer = {
  id: Uuid;
  name: string;
  nameKana: string;
  birthDate?: IsoDate;
  gender?: "male" | "female" | "other";
  phone?: string;
  email?: string;
  address?: string;

  /** LINE 公式アカウント連携 */
  lineUserId?: string;
  lineDisplayName?: string;

  companyName?: string;
  /** 法人番号。会社名の表記ゆれを避けるニュース名寄せキー */
  corporateNumber?: string;
  department?: string;
  jobTitle?: string;
  industry?: string;
  /** 上場区分 */
  listingStatus?: "listed" | "unlisted";
  companyUrl?: string;

  preferences?: CustomerPreferences;
  hobbies?: string;
  familyInfo?: string;
  /** NG 事項。事故防止情報のため画面上でも視覚的に分離する */
  ngNotes?: string;

  /**
   * 担当スタッフ。顧客はスタッフごとに分割して持ち、ログインした人には
   * 自分の顧客だけが見える。画面に「担当 ○○」とは出さない — 誰の顧客かは
   * 見えている時点で自明なので、表示する情報量がないため。
   *
   * 各レコードの staffId（採寸者・受注者・送信者）とは別物。あちらは
   * 「誰が操作したか」の記録。
   */
  staffId: Uuid;

  /**
   * 重要顧客フラグ。企業ニュース巡回の対象になる。
   *
   * 顧客ランク（A/B/C）は意図的に持たない。手で付ける序列は形骸化するうえ、
   * 接客中に見せる画面に顧客の格付けを出すことになるため。
   */
  isKeyAccount: boolean;
  firstVisitDate?: IsoDate;
  acquisitionChannel?: string;
  referrerId?: Uuid;
  /** 最終接触日。経過日数トリガーを軽量に評価するため非正規化して保持 */
  lastContactedAt?: IsoDate;

  tags?: string[];
  memo?: string;
  createdAt: IsoDate;
};

// ── 採寸 ────────────────────────────────────────────────

export type ItemTypeId = "jacket" | "pants" | "vest" | "shirt" | "coat";

export type ItemType = {
  id: ItemTypeId;
  name: string;
  /** 採寸票上の英字表記（JACKET / PANTS / VEST） */
  sheetLabel: string;
  bodyPart: BodyPart;
  requiresMeasurement: boolean;
};

/** 全画面採寸ビューの左右振り分けと、補正の個数制約に使う */
export type BodyPart = "upper" | "lower";

/** 採寸票の左列 1 行分の定義 */
export type MeasurementField = {
  key: string;
  itemTypeId: ItemTypeId;
  /** 総丈 / バスト / EF(半胸) など、紙の表記をそのまま使う */
  label: string;
  unit: "cm";
  bodyPart: BodyPart;
  /** 実寸欄を出すか */
  hasActual: boolean;
  /** 上がり寸欄を出すか */
  hasFinished: boolean;
  displayOrder: number;
  /** シルエット上の対応位置（0–100 の相対座標） */
  silhouettePoint?: { x: number; y: number };
};

export type MeasurementValue = {
  /** 実寸 — 身体を測った値 */
  actual?: number;
  /** 上がり寸 — 実際に仕上げる服の寸法 */
  finished?: number;
};

export type MeasurementSection = {
  itemTypeId: ItemTypeId;
  /** シルエット記号（NB / AG / DA） */
  silhouette?: string;
  /** C#（型番） */
  colorNumber?: string;
  /** key は MeasurementField.key */
  values: Record<string, MeasurementValue>;
};

export type AppliedAdjustment = {
  /** AdjustmentMaster.code */
  code: number;
  value: number;
};

export type MeasurementInputMethod = "tablet" | "pc" | "ocr";

/** 採寸票 1 枚 = 実際の紙 1 枚に対応する */
export type MeasurementSheet = {
  id: Uuid;
  customerId: Uuid;
  /** 採寸だけ先行するケースがあるため任意 */
  orderId?: Uuid;
  measuredAt: IsoDate;
  staffId: Uuid;
  inputMethod: MeasurementInputMethod;
  sections: MeasurementSection[];
  adjustments: AppliedAdjustment[];
  note?: string;
};

/** 補正コードマスタ。紙の右列に印刷されている番号付きリスト */
export type AdjustmentMaster = {
  code: number;
  name: string;
  strength?: "弱" | "強";
  defaultValue: number;
  bodyPart: BodyPart;
  /** シルエット上のどこを強調するか */
  silhouetteHint?: SilhouetteRegion;
};

export type SilhouetteRegion =
  | "shoulder"
  | "back"
  | "chest"
  | "neck"
  | "abdomen"
  | "hip"
  | "arm"
  | "leg";

/** シルエット上に描く補正マーク 1 件 */
export type SilhouetteCorrection = {
  region: SilhouetteRegion;
  /** 紙の採寸票と同じ番号。丸のそばに添えて、何の丸なのかを示す */
  code: number;
};

// ── 仕様（指示項目） ─────────────────────────────────────

export type SpecOption = {
  /** 採寸票の選択肢番号（01 / 04 / 14 など） */
  code: string;
  label: string;
};

export type SpecGroup = {
  key: string;
  label: string;
  itemTypeId: ItemTypeId;
  options: SpecOption[];
};

/** key は SpecGroup.key、値は SpecOption.code */
export type SpecSelection = Record<string, string>;

// ── 生地・注文 ──────────────────────────────────────────

export type FabricSeason = "spring_summer" | "autumn_winter" | "all_season";

export type Fabric = {
  id: Uuid;
  brand: string;
  productNumber: string;
  /** 提案時の重複判定に使うため、表示名と正規化キーを分けて持つ */
  color: string;
  colorFamily: ColorFamily;
  pattern: FabricPattern;
  composition: string;
  yarnCount?: string;
  season: FabricSeason;
};

export type ColorFamily = "navy" | "charcoal" | "gray" | "brown" | "black" | "blue" | "other";

export type FabricPattern = "solid" | "stripe" | "check" | "herringbone" | "birdseye" | "other";

export type OrderStatus = "ordered" | "in_production" | "fitting" | "delivered" | "cancelled";

export type OrderPurpose = "business" | "formal" | "wedding" | "casual";

export type Order = {
  id: Uuid;
  customerId: Uuid;
  orderNumber: string;
  orderedAt: IsoDate;
  dueDate?: IsoDate;
  deliveredAt?: IsoDate;
  status: OrderStatus;
  purpose: OrderPurpose;
  totalAmount: number;
  staffId: Uuid;
};

export type OrderItem = {
  id: Uuid;
  orderId: Uuid;
  itemTypeId: ItemTypeId;
  fabricId: Uuid;
  specs: SpecSelection;
  amount: number;
  photoUrls?: string[];
};

export type Alteration = {
  id: Uuid;
  orderItemId: Uuid;
  performedAt: IsoDate;
  content: string;
  /** 変更前後の寸法 */
  valueDiff?: Record<string, { before: number; after: number }>;
};

// ── やり取り・アプローチ ─────────────────────────────────

export type MessageChannel = "line" | "phone" | "visit" | "email";
export type MessageDirection = "outbound" | "inbound";

export type Message = {
  id: Uuid;
  customerId: Uuid;
  staffId?: Uuid;
  sentAt: IsoDateTime;
  channel: MessageChannel;
  direction: MessageDirection;
  body: string;
  isAiGenerated: boolean;
  approachTaskId?: Uuid;
};

export type TriggerType = "elapsed_days" | "anniversary" | "season" | "company_news";

export type ApproachStatus = "open" | "done" | "snoozed" | "dismissed";

/**
 * アプローチの状態レコード。
 *
 * 「今日連絡すべき顧客」そのものは lib/data/approaches.ts で毎回評価して導出する
 * （閾値を変えたら即反映されるべきであり、連絡すれば経過日数トリガーは自然に消えるため）。
 * ここに保存するのは、導出結果に人が被せた判断と、対応した履歴だけ。
 */
export type ApproachTask = {
  id: Uuid;
  customerId: Uuid;
  dueDate: IsoDate;
  triggerTypes: TriggerType[];
  /** なぜ今この顧客なのかの根拠。スタッフが納得して連絡できるようにする */
  reason: string;
  status: ApproachStatus;
  companyNewsId?: Uuid;
  resolvedAt?: IsoDateTime;
  /** スヌーズの明け日。この日までリストに出さない */
  snoozedUntil?: IsoDate;
};

export type CompanyNews = {
  id: Uuid;
  customerId: Uuid;
  corporateNumber?: string;
  title: string;
  sourceUrl: string;
  publishedAt: IsoDate;
  aiSummary: string;
  /** 連絡のきっかけに使えるか（0–100） */
  usabilityScore: number;
};

// ── 設定 ────────────────────────────────────────────────

export type MessagePoliteness = "formal" | "standard" | "casual";

/**
 * 店舗が変えられる業務ルール。
 *
 * トリガーの閾値をコードの定数に埋めておくと「90日は長いか短いか」を試せない。
 * アプローチは毎回評価する作りなので、ここを変えれば即座に結果へ反映される。
 *
 * 一方、採寸項目・補正コード・仕様の各マスタはここに入れない。
 * 紙の帳票と製造側の都合で決まっており、店舗が変えるものではないため。
 */
export type AppSettings = {
  /** 経過日数トリガー: 最終接触から何日で発火するか */
  elapsedDaysThreshold: number;
  /** 記念日トリガー: 何日前から出すか */
  anniversaryLeadDays: number;
  /** 1日に出すアプローチの上限。さばける量を超えるとリスト全体が見られなくなる */
  dailyApproachLimit: number;
  /** 季節トリガーの入荷期 */
  seasonWindows: { season: FabricSeason; label: string; months: number[] }[];
  /** アイテム別の標準価格。注文登録の初期値に使う */
  itemPrices: Record<ItemTypeId, number>;
  message: {
    politeness: MessagePoliteness;
    allowEmoji: boolean;
    /** AI に渡す目安字数。入力欄の文字数カウンタの判定にも使う */
    lengthMin: number;
    lengthMax: number;
  };
};

// ── 永続化するデータベース全体 ───────────────────────────

export type MockDatabase = {
  version: number;
  settings: AppSettings;
  /**
   * ログイン中のスタッフ。本来は認証セッションが持つものだが、
   * モックでは切り替えて挙動を確認できるようここに置いている。
   */
  session: { staffId: Uuid };
  staff: Staff[];
  customers: Customer[];
  anniversaries: CustomerAnniversary[];
  measurementSheets: MeasurementSheet[];
  fabrics: Fabric[];
  orders: Order[];
  orderItems: OrderItem[];
  alterations: Alteration[];
  messages: Message[];
  approachTasks: ApproachTask[];
  companyNews: CompanyNews[];
};
