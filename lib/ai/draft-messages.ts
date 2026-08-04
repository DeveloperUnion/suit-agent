import type { TriggerType, Uuid } from "@/lib/types";
import { getCustomer } from "@/lib/data/customers";
import { listAnniversaries } from "@/lib/data/customers";
import { getOwnedItemSummary, listOrders } from "@/lib/data/orders";
import { getApproachForCustomer } from "@/lib/data/approaches";
import { daysUntilNextAnniversary } from "@/lib/utils/date";

/**
 * 1to1 メッセージの下書き。
 *
 * ここでは AI を呼ばず、顧客データから組み立てた固定文を 3 案返す。
 * 実装時は本関数の中身だけを差し替えられるよう、入出力は実 API を想定した形にしてある。
 *
 * 文面は要件4.5の生成ルールに合わせている:
 *   - 売り込み色を出さない。近況を気にかける文面を基本とする
 *   - 100〜200字程度
 *   - 顧客データにない情報を創作しない
 */

export type MessageDraft = {
  id: string;
  /** どの角度から書いた案か。スタッフが選ぶ手がかりにする */
  angle: string;
  body: string;
};

const SEASON_GREETING: Record<number, string> = {
  1: "寒さが厳しい時期が続いておりますが",
  2: "まだ冷え込む日が続きますが",
  3: "少しずつ春めいてまいりましたが",
  4: "過ごしやすい季節になりましたが",
  5: "汗ばむ日も出てまいりましたが",
  6: "梅雨に入り蒸し暑い日が続きますが",
  7: "暑さが厳しくなってまいりましたが",
  8: "厳しい暑さが続いておりますが",
  9: "朝晩は涼しくなってまいりましたが",
  10: "秋らしい気候になってまいりましたが",
  11: "肌寒さを感じる日が増えてまいりましたが",
  12: "今年も残りわずかとなりましたが",
};

function seasonalFabricPhrase(month: number): string {
  if (month >= 3 && month <= 5) return "春夏の生地が入荷しております";
  if (month >= 9 && month <= 11) return "秋冬の生地が入荷しております";
  return "新しい生地がいくつか入荷しております";
}

export async function generateDrafts(
  customerId: Uuid,
  options: { approachTaskId?: Uuid } = {},
): Promise<MessageDraft[]> {
  const customer = await getCustomer(customerId);
  if (!customer) return [];

  const [orders, summary, anniversaries, approach] = await Promise.all([
    listOrders(customerId),
    getOwnedItemSummary(customerId),
    listAnniversaries(customerId),
    options.approachTaskId ? getApproachForCustomer(customerId) : Promise.resolve(null),
  ]);

  const month = new Date().getMonth() + 1;
  const surname = customer.name.split(" ")[0];
  const greeting = SEASON_GREETING[month];
  const triggers = (approach?.triggerTypes ?? []) as TriggerType[];

  // ① 近況伺い — 売り込みを含まない基本形
  const drafts: MessageDraft[] = [
    {
      id: "draft-1",
      angle: "近況を伺う",
      body: `${surname}様\n\nご無沙汰しております。${greeting}、その後お変わりございませんでしょうか。\n\n何かお困りのことがございましたら、お気軽にお声がけください。`,
    },
  ];

  // ② 手持ちを踏まえた案内 — 未保有カテゴリがあればそれに触れる
  const missing = summary.missingItemTypes[0]?.name;
  const lastFabric = orders[0]?.items[0]?.fabric;
  drafts.push({
    id: "draft-2",
    angle: "生地の入荷を伝える",
    body: missing
      ? `${surname}様\n\nご無沙汰しております。${seasonalFabricPhrase(month)}。\n\n${surname}様はまだ${missing}をお作りいただいたことがないかと思いますので、お立ち寄りの際にでもご覧いただければ幸いです。`
      : lastFabric
        ? `${surname}様\n\nご無沙汰しております。${seasonalFabricPhrase(month)}。\n\n前回は${lastFabric.brand}の${lastFabric.color}をお選びいただきましたので、少し雰囲気の違うものもご用意しております。お近くにお越しの際はお声がけください。`
        : `${surname}様\n\nご無沙汰しております。${seasonalFabricPhrase(month)}。\n\nお近くにお越しの際は、ぜひご覧になってください。`,
  });

  // ③ 個人的な文脈 — 記念日が近ければそれ、なければ趣味や家族の話題に寄せる
  const upcoming = anniversaries
    .map((a) => ({ ...a, until: daysUntilNextAnniversary(a.date) }))
    .filter((a) => a.until <= 45)
    .sort((a, b) => a.until - b.until)[0];

  drafts.push({
    id: "draft-3",
    angle: upcoming ? "記念日にふれる" : customer.hobbies ? "趣味にふれる" : "来店のお礼",
    body: upcoming
      ? `${surname}様\n\nご無沙汰しております。まもなく${upcoming.label}ですね。\n\n${greeting}、お変わりなくお過ごしでしょうか。ささやかですが、お祝いの気持ちをお伝えできればと思いご連絡いたしました。`
      : customer.hobbies
        ? `${surname}様\n\nご無沙汰しております。${greeting}、いかがお過ごしでしょうか。\n\n以前${customer.hobbies.split("・")[0]}のお話を伺ったのを思い出しておりました。またお会いできる日を楽しみにしております。`
        : `${surname}様\n\nご無沙汰しております。${greeting}、お変わりございませんでしょうか。\n\nまたお立ち寄りいただける日を楽しみにしております。`,
  });

  // 企業ニュースが根拠に含まれる場合だけ、触れる案に差し替える
  if (triggers.includes("company_news") && approach?.news) {
    drafts[1] = {
      id: "draft-2",
      angle: "会社の動きにふれる",
      body: `${surname}様\n\nご無沙汰しております。先日、${customer.companyName ?? "御社"}のニュースを拝見しました。\n\nお忙しくされているのではとお察しいたします。${greeting}、ご無理などされていませんでしょうか。`,
    };
  }

  return drafts;
}
