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

// ── パーソナルとメモ ────────────────────────────────────
//
// 「ゴルフが趣味な人を全員」引くために正規化してある。文字列 1 本のままだと
// 表記の揺れで取りこぼし、しかも誰も気づけない。
//
// **メモと事実は、ラベルが付いているかどうかしか違わない。**分けて持つと
// スタッフに「これは趣味欄か、メモか」を毎回選ばせることになり、速いほうへ
// 情報が逃げる。1 つにして、入力は「1 行書く」だけにしてある。

/** パーソナルの見出し。表示にしか使わない — 検索の絞り込みには絶対に使わない */
export type FactCategory = {
  key: string;
  label: string;
  sortOrder: number;
};

/**
 * 語彙。「ゴルフ」は誰にとってもゴルフなので、分類は発話ごとではなく
 * ここに 1 回だけ持たせる。直せば全顧客へ一斉に反映される。
 */
export type FactLabel = {
  id: Uuid;
  name: string;
  categoryKey: string;
};

/** どこから来た記録か。migration は「機械的に割ったので誤りが混ざりうる」印 */
export type FactSource = "agent" | "manual" | "migration";

export type CustomerFact = {
  id: Uuid;
  customerId: Uuid;
  /** null なら、まだラベルの付いていない走り書き */
  label?: FactLabel;
  /** 原文。ラベルだけだと文脈が落ちるので、カルテには必ずこちらを出す */
  body: string;
  source: FactSource;
  createdAt: IsoDateTime;
};

/**
 * NG 事項。
 *
 * facts に入れない。facts は類似検索で「引っ張り出す」もので、こちらは
 * 当該顧客に触れた瞬間に無条件で全件読むもの。取りこぼしが許される情報と
 * 許されない情報を、同じ機構に載せない。
 */
export type CustomerNgNote = {
  id: Uuid;
  customerId: Uuid;
  body: string;
  createdAt: IsoDateTime;
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

  /**
   * 接客直前に一文で読むもの。分解しない — 「長男がいる人」を全員引く場面が
   * 無いうえ、年齢は時間で古びる。日付が絡むもの（入学・受験）は
   * customer_anniversaries の担当。
   */
  familyInfo?: string;

  /*
   * 趣味・好み・タグ・メモ・NG は列として持たない。
   * customer_facts（ラベルの有無でパーソナルと走り書きを兼ねる）と
   * customer_ng_notes へ移した。
   *
   * 同意（写真掲載・夜間連絡）も持たない。一度作ったが一度も使われず、
   * 注意事項の枠の下半分を占めて NG 事項の視線を奪っていたので落とした。
   * 掲載を始めるなら、媒体を区別しない boolean 1 本では足りない。
   */

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
  /*
   * 最終連絡日も持たない。書き込む経路が「注文を記録した」と
   * 「アプローチで連絡したを押した」の 2 つしかなく、実際の連絡は個人の
   * 連絡手段で行われるため 1 件も入らない。それを「最終連絡」として出すと、
   * 昨日連絡した相手が半年前に見える。**間違っている日付は無い日付より悪い。**
   * 「最近連絡していない人」はお渡しからの経過日数で見る。
   *
   * 初回来店日・流入経路・紹介者も持たない。3 つとも画面に出るだけで
   * 集計にもトリガーにも出てこなかった。紹介は記録に
   * 「高橋様のご紹介」と書けば、確定検索の全文一致で引ける。
   */
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
 * 日付は 3 つ。受注日・納品日（工場→店）・お渡し日（店→客）。
 * 顧客に約束する「納期」は持たない — 紙にその欄が無く、店が管理していたのは
 * 工場からいつ届くかのほうだった。
 */
export type Order = {
  id: Uuid;
  customerId: Uuid;
  orderNumber: string;
  orderedAt: IsoDate;
  /** 納品日。工場から店に届く日で、紙の 2 段目にある */
  arrivedAt?: IsoDate;
  /**
   * お渡し日。店からお客様へ手渡した日で、紙の上段にある。
   * お渡し後フォローの起点はこちら。お客様の都合でずれるので空のこともあり、
   * 空のままの注文を催促する仕組みは docs/todo.md に置いてある。
   */
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

  /**
   * 売上金額（税込）。
   *
   * かつては紙の右上と同じ4欄（売上・割増・消費税・合計）で持っていたが、
   * 紙のその欄は事実上いつも空欄で、店が入れるのは税込の1本だけだった。
   * 割増を分けて持つかは審議中（docs/todo.md）。DB には 4 列が残っていて、
   * 使っているのは total_amount だけ。
   */
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
 * 着装写真も明細には持たない。紙が原反NO を 1 つしか持たないのと同じ理由で、
 * 写真も「その注文で仕立てた一式」に付く。行は OrderPhoto。
 */
export type OrderItem = {
  id: Uuid;
  orderId: Uuid;
  itemTypeId: ItemTypeId;
};

/**
 * 着装写真。
 *
 * 実体は order-photos バケット（非公開）で、この行はその索引。
 * 読み出しは常に署名 URL なので、URL を持ち回っても期限で切れる。
 *
 * 「画像を一切保存しない」という当初の判断はここで反転している。代わりに
 * 削除を 2 段にした — deleteCustomer() が Storage を消してから
 * delete_customer() を呼ぶので、削除請求は DB と Storage の両方で完結する。
 */
export type OrderPhoto = {
  id: Uuid;
  orderId: Uuid;
  customerId: Uuid;
  /** {customerId}/{orderId}/{uuid}.jpg */
  storagePath: string;
  createdAt: IsoDate;
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
 * 季節の案内（新作の告知など）は持たない。全員へ同じものを一斉に届ける仕事と、
 * 1 対 1 で誰に声をかけるかという、この仕組みの問いは別の話だから。
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
 * 顧客単位ではなく triggerKey 単位で持つ。お渡し半年後をスキップしても 1 年後は出したいし、
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
  /** カードに並べるラベル名。ラベルの付いていない記録は出さない */
  labels: string[];
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
      kind: "add_fact";
      customer: AgentCustomerRef;
      /** 足すラベル。既存語に寄せた結果なので、表記は fact_labels のもの */
      labelNames: string[];
      /**
       * false のものは適用時に fact_labels へ新しく作られる。
       * カードに「新しい語です」と出すのはこの判定を見ている。
       */
      newLabelNames: string[];
      /** どのカテゴリで作るか。既存語のときは使わない */
      categoryKey: string;
      /** 聞き取った言い回し。そのまま body になる */
      body: string;
      quote?: string;
    }
  | {
      kind: "search_result";
      keyword: string;
      customers: AgentCustomerRef[];
      /**
       * 該当した人数。customers.length と同じだが、別に持つ。
       * モデルが散文にする過程で列挙を削っても、数字だけは削れない形にしておく。
       */
      exactCount: number;
      /** 「近いもの」。該当者ではないので枠を分ける（同じ配列に混ぜない） */
      similar?: { customer: AgentCustomerRef; content: string }[];
    }
  /** 誰の話か決められなかった。候補を出して選ばせる */
  | {
      kind: "ask_customer";
      keyword: string;
      candidates: AgentCustomerRef[];
      pendingLabels: string[];
      /** 聞き取った言い回し。相手が決まったら、そのまま提案の body になる */
      body: string;
    }
  /** 注意事項。カルテの一番上に無条件で出る枠なので、パーソナルとは別扱い */
  | { kind: "add_ng_note"; customer: AgentCustomerRef; body: string; quote?: string }
  | {
      kind: "update_customer";
      customer: AgentCustomerRef;
      /** 現在値を必ず添える。「何が何に変わるか」を見ずに押させない */
      changes: { field: CustomerFieldKey; label: string; before?: string; after: string }[];
      quote?: string;
    }
  | {
      kind: "add_anniversary";
      customer: AgentCustomerRef;
      anniversary: { type: AnniversaryType; date: IsoDate; label?: string };
      quote?: string;
    }
  /** 「その情報もう違う」。行は消えず、無効化して履歴が残る */
  | {
      kind: "invalidate_fact";
      customer: AgentCustomerRef;
      facts: { id: Uuid; label?: string; body: string }[];
      quote?: string;
    }
  /**
   * 「連絡した」「スキップ」。立っているアプローチをまとめて畳む。
   * 理由は持たない — 何が立っているかは resolveApproach が評価し直すので、
   * 提案時点の文言を持つと、押すまでの間に変わったときに嘘になる。
   */
  | {
      kind: "resolve_approach";
      customer: AgentCustomerRef;
      status: ApproachStatus;
      quote?: string;
    };

/**
 * 会話から書き換えてよい顧客の列。
 *
 * **氏名（name）と担当（staffId）は入れない。**前者は名寄せの軸で、
 * 聞き違いで書き換わると別人のカルテになる。後者は RLS の境界そのもの。
 * どちらも会話ではなく画面から直す。
 */
export type CustomerFieldKey =
  | "nameKana"
  | "birthDate"
  | "gender"
  | "phone"
  | "email"
  | "address"
  | "residencePrefecture"
  | "embroideryName"
  | "companyName"
  | "department"
  | "jobTitle"
  | "industry"
  | "familyInfo";

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

/**
 * 店舗共通の業務ルール。app_settings テーブルの 1 行と 1 対 1。
 *
 * ここに置くのは「店舗が変えたくなりうる数字」だけにする。
 *
 * - お渡し後フォローの節目（既定 半年・1年）… **ここ**。
 * - 記念日の予告日数（既定 7 日前）… **ここ**。
 *   どちらも声をかける間隔で、やってみないと適切な長さが分からない
 * - アイテム別の標準価格 … 持たない。金額は台帳を見ながら人が入れる運用なので、
 *   初期値を用意しても上書きされるだけだった
 *
 * 変えられるのは管理者だけ（RLS）。1 つの値が全スタッフの画面の出方を変えるため。
 */
export type AppSettings = {
  /** 最終お渡しから何ヶ月後に声をかけるか。昇順・1〜3 個（DB の CHECK と同じ制約） */
  postDeliveryMonths: number[];
  /** 記念日の何日前から出すか。0〜60（DB の CHECK と同じ制約）。0 は当日のみ */
  anniversaryLeadDays: number;
};

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
  facts: CustomerFact[];
  ngNotes: CustomerNgNote[];
  measurementSheets: MeasurementSheet[];
  orders: Order[];
  orderItems: OrderItem[];
  alterations: Alteration[];
  approachTasks: ApproachTask[];
  revenueTargets: RevenueTarget[];
  agentMessages: AgentMessage[];
};
