import type { Tool } from "openai/resources/responses/responses";

import { FACT_CATEGORIES } from "@/lib/constants/facts";

/**
 * 分類の選択肢は**定数から作る。手で並べない。**
 *
 * 手で書いていたときは `hobby / preference / work / life` と説明文に並べていて、
 * `life` は存在せず（正しくは `lifestyle`）、`scene` と `other` が抜けていた。
 * モデルは素直に `life` を返し、**適用を押した瞬間に外部キー違反で落ちた**
 * （提案を作るところまでは通るので、押すまで分からない）。
 *
 * 発注書の読み取りが `FIELD_KEYS` を定数から閉じているのと同じ理由で、
 * ここも正（lib/constants/facts.ts）から生やす。
 */
const FACT_CATEGORY_KEYS = FACT_CATEGORIES.map((c) => c.key);

/**
 * モデルに渡す道具の一覧。
 *
 * 数を絞ってある。10〜15 本を超えると選択の精度が測れるほど落ちるという
 * 報告があるので、機能を足すときは「道具を 1 本増やす」より
 * 「既にある道具の引数を増やす」を先に検討すること。
 *
 * **id を書かせる引数は、必ず別の道具が返した id だけ**という形にしてある。
 * 顧客の取り違えは、聞き違いより静かで、あとから追えない。
 */

const customerId = {
  type: "string",
  description: "find_customer か search_customers が返した顧客の id。自分で作らないこと。",
} as const;

/**
 * その相手をどうやって決めたか。**サーバが検算する。**
 *
 * 道具の選択は間違えないが、対象の取り違えは実測で 24〜26% 起きる。しかも
 * プロンプトの注意書きでは直らないことが分かっている。申告させて、申告と
 * 発話・画面の状態が食い違ったら**提案を作らせない**（差し戻す）形にしてある。
 */
const subjectFrom = {
  type: "string",
  enum: ["spoken_name", "open_karte", "recent_topic"],
  description:
    "この相手をどう決めたか。spoken_name=いまの発話に名前が出ていた（サーバが発話と照合する） / " +
    "open_karte=いま開いているカルテだから / recent_topic=直前のやり取りで話していたから。" +
    "**推測で埋めないこと。**開いているカルテと直前の相手が別人で、いまの発話に名前が無いなら、" +
    "どちらも選ばずに propose_ask で聞き返す。",
} as const;

const quote = {
  type: "string",
  description:
    "この提案の根拠になった発話の一部。言い換えず、聞こえたままの文字列をそのまま切り出す。",
} as const;

function fn(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
): Tool {
  return {
    type: "function",
    name,
    description,
    strict: false,
    parameters: { type: "object", properties, required, additionalProperties: false },
  };
}

export const AGENT_TOOLS: Tool[] = [
  // ── 読む ──
  fn(
    "search_customers",
    "語で顧客を引く。確定検索（該当者を全員）と意味検索（近いもの）を両方走らせる。" +
      "「ゴルフが趣味な人」のような網羅が要る問いも、これ 1 本でよい。",
    {
      labels: {
        type: "array",
        items: { type: "string" },
        description:
          "探す語。**この店で使われている語（指示の一覧）から選ぶ**。" +
          "「アウトドア系」のような括りで言われたら、一覧の中の該当しそうな語に展開して複数渡すこと。",
      },
      freeText: {
        type: "string",
        description:
          "一覧の語に当てはめられない言い回しがあるときだけ入れる。意味検索にだけ使われる。",
      },
    },
    [],
  ),
  fn(
    "find_customer",
    "名前で顧客を探す。**顧客を指す前に必ずこれを呼ぶ。**返った候補の外は選べない。",
    { name: { type: "string", description: "聞こえた名字か氏名。敬称は含めない。" } },
    ["name"],
  ),
  fn(
    "get_customer",
    "その顧客の記録を丸ごと読む（パーソナル・注意事項・記念日・注文履歴・最新の採寸）。" +
      "「どんな人だっけ」「前回の着丈は」に答えるときはこれ。",
    { customerId },
    ["customerId"],
  ),

  // ── 提案する（書き込まない） ──
  fn(
    "propose_add_fact",
    "パーソナル（趣味・好み・人となり）への追記を提案する。既存の語に寄る形で返る。" +
      "**「苦手」「避けている」「前に断られた」は、好みに見えても propose_add_ng_note のほう。**" +
      "こちらは接客の材料として引っ張り出すもの、あちらは外すと事故になるもの。",
    {
      customerId,
      subjectFrom,
      labels: {
        type: "array",
        items: { type: "string" },
        description: "足す語。指示の一覧に近いものがあればその表記を使う。",
      },
      body: {
        type: "string",
        description: "カルテに残す文。聞いた言い回しを保つ（「打ちっぱなしによく行くらしい」）。",
      },
      categoryKey: {
        type: "string",
        enum: FACT_CATEGORY_KEYS,
        description:
          "新しい語を作るときの分類。既存の語に寄ったときは使われない。迷ったら other。" +
          FACT_CATEGORIES.map((c) => ` ${c.key}=${c.label}`).join(""),
      },
      quote,
    },
    ["customerId", "subjectFrom", "labels", "body"],
  ),
  fn(
    "propose_add_ng_note",
    "注意事項への追記を提案する。カルテの一番上に無条件で出る枠。" +
      "**否定・禁止・忌避はすべてこちら**（「光沢のある生地は苦手」「ピークドラペルは断られた」" +
      "「夜は電話しない」）。取りこぼすと次の接客で外すことになるので、迷ったらこちらへ倒す。",
    { customerId, subjectFrom, body: { type: "string" }, quote },
    ["customerId", "subjectFrom", "body"],
  ),
  fn(
    "propose_update_customer",
    "顧客の**決まった項目**の書き換えを提案する（連絡先・勤務先・居住地など）。" +
      "氏名と担当は変えられない。" +
      "**項目に無いことはここで扱わない。**「職業」「仕事の内容」「何をしている人か」は" +
      "どの項目にも当たらないので propose_add_fact（分類は work）で残すこと。",
    {
      customerId,
      subjectFrom,
      changes: {
        type: "array",
        description: "変える項目。",
        items: {
          type: "object",
          properties: {
            field: {
              type: "string",
              // 名前だけでは取り違える。役職と業種と会社名は、日本語で言われると
              // どれも「仕事のこと」に見える
              description:
                "nameKana=フリガナ / birthDate=生年月日 / gender=性別 / phone=電話 / " +
                "email=メール / address=住所 / residencePrefecture=居住地の都道府県 / " +
                "embroideryName=ネーム刺繍 / companyName=勤務先の会社名 / department=部署 / " +
                "jobTitle=役職（部長・課長など社内での肩書き。**職業ではない**） / " +
                "industry=業種（勤務先が属する業界。**その人の職業ではない**） / " +
                "familyInfo=ご家族のこと",
              enum: [
                "nameKana",
                "birthDate",
                "gender",
                "phone",
                "email",
                "address",
                "residencePrefecture",
                "embroideryName",
                "companyName",
                "department",
                "jobTitle",
                "industry",
                "familyInfo",
              ],
            },
            value: { type: "string", description: "新しい値。日付は YYYY-MM-DD。" },
          },
          required: ["field", "value"],
          additionalProperties: false,
        },
      },
      quote,
    },
    ["customerId", "subjectFrom", "changes"],
  ),
  fn(
    "propose_add_anniversary",
    "記念日の追加を提案する。誕生日・初回購入・結婚記念日など。",
    {
      customerId,
      subjectFrom,
      type: { type: "string", enum: ["birthday", "first_purchase", "wedding", "other"] },
      date: { type: "string", description: "YYYY-MM-DD。年が分からなければ当年で構わない。" },
      label: { type: "string", description: "other のときの呼び名。" },
      quote,
    },
    ["customerId", "subjectFrom", "type", "date"],
  ),
  fn(
    "propose_invalidate_fact",
    "「その情報はもう違う」と言われたときに、記録の無効化を提案する。" +
      "先に get_customer で対象の id を確かめること。",
    {
      customerId,
      subjectFrom,
      factIds: {
        type: "array",
        items: { type: "string" },
        description: "get_customer が返した facts の id。",
      },
      quote,
    },
    ["customerId", "subjectFrom", "factIds"],
  ),
  fn(
    "propose_resolve_approach",
    "「連絡した」「今回は見送る」と言われたときに、本日のアプローチを畳む提案をする。",
    {
      customerId,
      subjectFrom,
      status: { type: "string", enum: ["done", "skipped"] },
      quote,
    },
    ["customerId", "subjectFrom", "status"],
  ),
  fn(
    "propose_ask",
    "決められないときに人へ聞く。**あらゆる曖昧さの落ち先はここ。**" +
      "同姓が複数いる、誰の話か分からない、どの項目のことか分からない、いずれもこれを使う。" +
      "道具で確かめられるなら聞かずに確かめること。" +
      "**できないことを聞き返さない。**予定・売上・他スタッフの顧客のように、" +
      "そもそも扱えない話題は、相手を絞っても答えられない。聞き返さず「できません」と答える。",
    {
      question: { type: "string", description: "短く 1 つだけ聞く。" },
      options: {
        type: "array",
        minItems: 2,
        maxItems: 5,
        description:
          "選択肢。**そのまま答えになる完全な文**にする（「はい」「1」のような断片は不可）。" +
          "**顧客を選ばせるときは answer を書かず customerId だけ渡すこと。**" +
          "文言と手がかり（会社名・開いているカルテかどうか）はこちらで作ります。",
        items: {
          type: "object",
          properties: {
            customerId: {
              type: "string",
              description:
                "顧客を選ばせるとき。find_customer などが返した id。" +
                "これを渡した選択肢の文言はサーバが作るので、answer は要りません。",
            },
            answer: {
              type: "string",
              description: "顧客以外の選択肢のとき。押されたらこの文が次の発話として送られる。",
            },
            hint: { type: "string", description: "選ぶ手がかり。" },
          },
          required: [],
          additionalProperties: false,
        },
      },
    },
    ["question", "options"],
  ),
];
