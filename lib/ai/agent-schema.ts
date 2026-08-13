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
    ["customerId", "labels", "body"],
  ),
  fn(
    "propose_add_ng_note",
    "注意事項への追記を提案する。カルテの一番上に無条件で出る枠。" +
      "**否定・禁止・忌避はすべてこちら**（「光沢のある生地は苦手」「ピークドラペルは断られた」" +
      "「夜は電話しない」）。取りこぼすと次の接客で外すことになるので、迷ったらこちらへ倒す。",
    { customerId, body: { type: "string" }, quote },
    ["customerId", "body"],
  ),
  fn(
    "propose_update_customer",
    "顧客の項目の書き換えを提案する（連絡先・勤務先・居住地など）。氏名と担当は変えられない。",
    {
      customerId,
      changes: {
        type: "array",
        description: "変える項目。",
        items: {
          type: "object",
          properties: {
            field: {
              type: "string",
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
    ["customerId", "changes"],
  ),
  fn(
    "propose_add_anniversary",
    "記念日の追加を提案する。誕生日・初回購入・結婚記念日など。",
    {
      customerId,
      type: { type: "string", enum: ["birthday", "first_purchase", "wedding", "other"] },
      date: { type: "string", description: "YYYY-MM-DD。年が分からなければ当年で構わない。" },
      label: { type: "string", description: "other のときの呼び名。" },
      quote,
    },
    ["customerId", "type", "date"],
  ),
  fn(
    "propose_invalidate_fact",
    "「その情報はもう違う」と言われたときに、記録の無効化を提案する。" +
      "先に get_customer で対象の id を確かめること。",
    {
      customerId,
      factIds: {
        type: "array",
        items: { type: "string" },
        description: "get_customer が返した facts の id。",
      },
      quote,
    },
    ["customerId", "factIds"],
  ),
  fn(
    "propose_resolve_approach",
    "「連絡した」「今回は見送る」と言われたときに、本日のアプローチを畳む提案をする。",
    {
      customerId,
      status: { type: "string", enum: ["done", "skipped"] },
      quote,
    },
    ["customerId", "status"],
  ),
  fn(
    "propose_ask_customer",
    "同じ名字が複数いて誰の話か決められないときに、候補を出して人に選ばせる。",
    {
      candidateIds: { type: "array", items: { type: "string" } },
      labels: { type: "array", items: { type: "string" }, description: "決まったら足す語。" },
      body: { type: "string" },
    },
    ["candidateIds", "body"],
  ),
];
