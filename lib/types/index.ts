/**
 * データモデル
 *
 * private/要件定義書.md の ER 図をベースにしつつ、採寸まわりは private/採寸データ.jpg
 * （実際の紙の採寸票）の構造に合わせている。要件定義書は身体寸法と仕上がり寸法を
 * 別テーブルに分離していたが、実物は「実寸 / 上がり寸」が同一行に並記されており、
 * その変換こそが職人の判断そのもののため、ペアで保持する。
 */

export type Uuid = string;
/** ISO 8601 の日付文字列（YYYY-MM-DD）。localStorage の JSON と素直に噛み合う */
export type IsoDate = string;
/** ISO 8601 の日時文字列 */
export type IsoDateTime = string;
/** ISO 8601 の年月（YYYY-MM）。月次集計のキー */
export type IsoMonth = string;

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
  /**
   * 居住地の都道府県。住所とは別に持つ。
   * 自由記述の address からは絞り込めないため、災害時にその地域の顧客を
   * まとめて拾えるようキーだけ切り出している。
   */
  residencePrefecture?: string;

  /**
   * LINE の連携情報。
   *
   * 公式アカウントの配信そのものは Lstep が担うため、このシステムは LINE へ送らない。
   * それでも ID を持つのは、将来 Lstep 側の友だちと突き合わせるときの鍵になるため。
   * 表示名は、個人 LINE のトーク一覧でどれがこの顧客かを見分けるのに使う。
   */
  lineUserId?: string;
  lineDisplayName?: string;

  /**
   * ネーム刺繍。工場発注書の「ネーム」欄に入る文字。
   * 注文ごとに変わるものではなく毎回同じものを入れるため、票や注文ではなく人に持たせる。
   */
  embroideryName?: string;

  /*
   * 法人番号・上場区分・会社 URL は勤務先ニュースの巡回のために置いていたもので、
   * 巡回をやめた以上、打つ手間だけが残るため削除した。
   * 業種はニュースではなく顧客一覧の絞り込みに使うため残す。
   */
  companyName?: string;
  department?: string;
  jobTitle?: string;
  industry?: string;

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

  /*
   * 顧客ランク（A/B/C）も重要顧客フラグも持たない。
   * 手で付ける序列は形骸化するうえ、接客中に見せる画面に顧客の格付けを
   * 出すことになるため。
   */
  firstVisitDate?: IsoDate;
  acquisitionChannel?: string;
  referrerId?: Uuid;
  /**
   * 最終接触日。「連絡した」を押したときに更新する。
   * 納品からの経過日数（daysSinceDelivery）とは別物で、
   * 前回いつ声をかけたかを思い出すためだけに使う（トリガーの判定には使わない）。
   */
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
  /** 誰が測ったか。顧客の担当とは別物で、アクセス制御には使わない */
  recordedByStaffId: Uuid;
  inputMethod: MeasurementInputMethod;
  /**
   * アイテム非依存なので section に入らないが、「3kg痩せた」は
   * アシスタントが最初に言われること。
   */
  heightCm?: number;
  weightKg?: number;
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

// ── 注文 ────────────────────────────────────────────────

export type OrderStatus = "ordered" | "in_production" | "fitting" | "delivered" | "cancelled";

export type OrderPurpose = "business" | "formal" | "wedding" | "casual";

/**
 * 注文。
 *
 * 金額は工場発注書の右上と同じ4欄で持つ。紙を見ながら転記する人が
 * 目移りしないよう、並びも呼び名も紙に合わせてある。
 */
export type Order = {
  id: Uuid;
  customerId: Uuid;
  orderNumber: string;
  orderedAt: IsoDate;
  dueDate?: IsoDate;
  deliveredAt?: IsoDate;
  status: OrderStatus;
  purpose: OrderPurpose;

  /*
   * 生地は注文単位。紙が原反NO を 1 つしか持たないため、明細ごとには持たない。
   * マスタも引かない — 原反NO・色番・色名・組成はすべて発注書の上にあり、
   * マスタを別に育てる手間に見合う使い道がなかった。
   */
  /** 原反NO。例: AC5601 */
  fabricProductNumber?: string;
  /** 色番。例: 3330 */
  fabricColorNumber?: string;
  /** 色名。例: カーキ無地 */
  fabricColorName?: string;
  /** 品質表示の組成。例: N(ナイロン) 92% / U(ポリウレタン) 8% */
  fabricComposition?: string;

  /** 売上金額 */
  subtotalAmount: number;
  /** 割増金額 */
  surchargeAmount: number;
  /** 消費税 */
  taxAmount: number;
  /** 合計金額。3つの和が既定だが、紙の合計欄が正なので手で上書きできる */
  totalAmount: number;

  /**
   * 受注した人。顧客の担当（Customer.staffId）とは別物で、こちらは
   * 「誰が操作したか」の記録。アクセス制御には使わない —
   * 同僚が代理で受けた注文をそれに使うと、担当者から自分の顧客の注文が消える。
   */
  takenByStaffId: Uuid;
};

/**
 * 注文明細。
 *
 * 胸ポケット・ベント・袖釦といった仕様（紙の「指示項目」）は持たない。
 * あれは工場に伝えるためのもので、店側が後から見返す場面がなく、
 * 入力の手間だけが残るため。
 *
 * 生地も金額も注文単位（Order 側）で持つ。紙が原反NO を 1 つしか持たず、
 * 明細ごとの金額欄も無いため、ここに置くと同じ値が明細の数だけ重複する。
 *
 * 着装写真も持たない。画像を一切保存しない判断のため
 * （削除請求への対応を DB だけで完結させ、保持する個人情報を減らす）。
 */
export type OrderItem = {
  id: Uuid;
  orderId: Uuid;
  itemTypeId: ItemTypeId;
};

export type Alteration = {
  id: Uuid;
  orderItemId: Uuid;
  performedAt: IsoDate;
  content: string;
  /** 変更前後の寸法 */
  valueDiff?: Record<string, { before: number; after: number }>;
};

// ── アプローチ ──────────────────────────────────────────

/**
 * 連絡のきっかけ。
 *
 * 季節（春夏・秋冬の新作案内）は持たない。あれは公式 LINE から全員へ一斉に送るもので、
 * 配信は Lstep が担う。1 対 1 で誰に声をかけるかという、この仕組みの問いとは別の話。
 * 勤務先ニュースの巡回も行わない。
 */
export type TriggerType = "post_delivery" | "anniversary";

/** 人が下した判断。発火中のものは記録を持たない（レコードが無い＝未対応） */
export type ApproachStatus = "done" | "skipped";

/**
 * アプローチに人が下した判断の記録。
 *
 * 「今日連絡すべき顧客」そのものは lib/data/approaches.ts で毎回評価して導出する。
 * ここに保存するのは、その結果に人が被せた判断だけ。
 *
 * 顧客単位ではなく triggerKey 単位で持つ。納品半年後をスキップしても 1 年後は出したいし、
 * 今年の誕生日を見送っても来年は出したいため。
 */
export type ApproachTask = {
  id: Uuid;
  customerId: Uuid;
  /**
   * どのトリガー実体に対する判断か。
   *   post_delivery:{orderId}:6m ／ post_delivery:{orderId}:12m
   *   anniversary:{anniversaryId}:{発火する年}
   */
  triggerKey: string;
  triggerType: TriggerType;
  /** 判断した時点の根拠。履歴だけを見ても何の件か分かるように残す */
  reason: string;
  status: ApproachStatus;
  resolvedAt: IsoDateTime;
};

// ── AI アシスタントとの会話 ──────────────────────────────

/** 顧客カードに出す最小限。会話の記録に埋め込むので、顧客本体を丸ごとは持たない */
export type AgentCustomerRef = {
  id: Uuid;
  name: string;
  nameKana: string;
  hobbies?: string;
};

/**
 * アシスタントが「やろうとしていること」。
 *
 * 実行結果ではなく提案として記録し、人が「適用」を押してから書き込む。
 * 名刺・発注書の読み取りと同じで、AI が出したものを黙って保存はしない。
 * 会話ログの再描画に必要なので、表示に使う値はここに畳んで持たせる。
 */
export type AgentAction =
  | {
      kind: "add_hobby";
      customer: AgentCustomerRef;
      /** 追記前の趣味。空だった場合は undefined */
      before?: string;
      /** 追記後の「・」区切り文字列 */
      after: string;
      /** 実際に増える分だけ。既にあったものは含めない */
      added: string[];
    }
  | { kind: "search_result"; keyword: string; customers: AgentCustomerRef[] }
  /** 誰の話か決められなかった。候補を出して選ばせる */
  | { kind: "ask_customer"; keyword: string; candidates: AgentCustomerRef[]; pendingHobbies: string[] };

export type AgentMessage = {
  id: Uuid;
  /** 会話もスタッフごとに分ける。顧客と同じ境界を引く */
  staffId: Uuid;
  role: "user" | "assistant";
  body: string;
  sentAt: IsoDateTime;
  action?: AgentAction;
  /** 適用済みなら日時が入る。カードの適用ボタンはこれで消す */
  appliedAt?: IsoDateTime;
};

// ── 設定 ────────────────────────────────────────────────
//
// 店舗が変えられる業務ルールのテーブルは持たない。
//
// アイテム別の標準価格は、金額を紙の 4 欄そのまま転記する運用にしたので
// 初期値を用意しても人が上書きするだけだった。
// 記念日トリガーの日数も 7 日前で確定したため lib/constants/approach.ts へ移した。
// 納品後フォローの節目（半年・1年）が元からそこにあるので、
// アプローチのルールが 1 ファイルに集まる。
//
// 結果、設定ページに残るのはスタッフ管理（管理者のみ編集）と売上目標だけ。

// ── 売上目標 ────────────────────────────────────────────

/**
 * 月次の売上目標。スタッフ × 月で 1 件。
 *
 * Staff にマップとして持たせていないのは、
 *   - 目標は毎月書き換わるが Staff 自体は変わらない。目標を更新するたびに
 *     スタッフのレコードを触ると、無効化・引き継ぎ（deactivateStaff）と
 *     同じレコードを奪い合うことになる
 *   - 退職者の過去の目標も実績と並べて残す必要がある。Staff から消えると履歴が壊れる
 * ため。
 */
export type RevenueTarget = {
  id: Uuid;
  staffId: Uuid;
  month: IsoMonth;
  amount: number;
};

// ── 開発用のデモデータ ───────────────────────────────────
//
// 本番のデータはすべて Supabase にある。ここに残っているのは
// supabase/dev-seed.sql を生成するための素で、アプリからは読まない
// （scripts/generate-dev-seed.ts だけが使う）。

export type DemoDataset = {
  version: number;
  /**
   * ログイン中のスタッフ。本来は認証セッションが持つものだが、
   * モックでは切り替えて挙動を確認できるようここに置いている。
   */
  session: { staffId: Uuid };
  staff: Staff[];
  customers: Customer[];
  anniversaries: CustomerAnniversary[];
  measurementSheets: MeasurementSheet[];
  orders: Order[];
  orderItems: OrderItem[];
  alterations: Alteration[];
  approachTasks: ApproachTask[];
  revenueTargets: RevenueTarget[];
  agentMessages: AgentMessage[];
};
