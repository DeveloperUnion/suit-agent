import type { AgentAction, Uuid } from "@/lib/types";
import { simulateLatency, type ExtractionMeta } from "@/lib/ai/extraction";
import {
  customerRef,
  findCustomersByName,
  planFactAdd,
  searchByLabel,
} from "@/lib/ai/agent-tools";

/**
 * 話しかけた内容の解釈。
 *
 * ここでは LLM を呼ばず、決まった言い回しをパターンで拾う。
 * 実装時は本関数の中身だけを差し替えられるよう、入出力は実 API を想定した形に
 * してある（lib/ai/draft-messages.ts と同じ方針）。
 *
 * いま扱えるのは 2 つだけ:
 *   「時枝さんゴルフが趣味らしい」  → 趣味の追記を提案する
 *   「ゴルフが趣味な人だれだっけ」  → 趣味で顧客を引く
 * 拾えなかった言い回しは、できるふりをせずそう言って返す。
 */

export type AgentTurn = ExtractionMeta & {
  reply: string;
  /** 人が「適用」を押すまで書き込まない提案。検索結果もここに入る */
  action?: AgentAction;
};

export type AgentInterpretContext = {
  /** いま開いている顧客。文中に名前が無いときの既定の相手になる */
  customerId?: Uuid;
};

/** 「〜な人だれだっけ」側の合図。これがあれば書き込みではなく検索とみなす */
const SEARCH_MARKERS =
  /(誰|だれ|どなた|どの人|探して|さがして|検索|教えて|いたっけ|だっけ|一覧|リスト|いる\?|いる？)/;

/** 「〜が趣味らしい」側の合図 */
const HOBBY_MARKERS = /(趣味|ハマ|はま|好き|マイブーム)/;

/**
 * 趣味そのものを取り出す。
 * 「ゴルフとワインが趣味」のように複数を並べられることがあるので、
 * 助詞と読点で割ってから返す。
 */
function extractHobbies(text: string): string[] {
  const patterns = [
    /(?:趣味|マイブーム)\s*(?:は|が)\s*([^。、\n]+)/,
    /([^。、\n]+?)\s*(?:が|は)\s*趣味/,
    /([^。、\n]+?)\s*に\s*(?:ハマ|はま)/,
    /([^。、\n]+?)\s*(?:が|を)\s*好き/,
  ];
  for (const pattern of patterns) {
    const hit = text.match(pattern);
    if (!hit?.[1]) continue;
    const values = hit[1]
      .split(/[と、,，・&＆]|および|あと/)
      .map((v) => stripLeadingName(v).trim())
      .filter(Boolean);
    if (values.length > 0) return values;
  }
  return [];
}

/**
 * 「時枝さんゴルフ」のように、名前と趣味が続けて書かれることがある。
 * 敬称までを落として趣味だけ残す。
 */
function stripLeadingName(value: string): string {
  return value.replace(/^.*?(?:さん|様|くん|君|ちゃん)\s*/, "");
}

/** 「時枝さん」「時枝正様」から氏名を取り出す。敬称が無ければ諦める（誤爆するため） */
function extractName(text: string): string | undefined {
  const hit = text.match(/([一-龥々ぁ-んァ-ヶー]{2,12}?)\s*(?:さん|様|くん|君|ちゃん)/);
  return hit?.[1];
}

/** 検索語。「ゴルフが趣味な人」の「ゴルフ」を取る */
function extractSearchKeyword(text: string): string | undefined {
  const hobbies = extractHobbies(text);
  if (hobbies.length > 0) return hobbies[0];
  // 「ゴルフの人だれだっけ」のように趣味という語を挟まない言い方
  const hit = text.match(/([^。、\n]+?)\s*(?:の|な)\s*(?:人|顧客|お客)/);
  return hit?.[1]?.trim() || undefined;
}

function nameOf(customerName: string): string {
  return `${customerName} 様`;
}

export async function interpret(
  input: string,
  ctx: AgentInterpretContext = {},
): Promise<AgentTurn> {
  const startedAt = performance.now();
  await simulateLatency(600);
  const meta: ExtractionMeta = {
    source: "stub",
    elapsedMs: Math.round(performance.now() - startedAt),
  };
  const text = input.trim();

  // ── 検索 ──
  // 「〜が趣味な人だれだっけ」は「が趣味」も含むので、書き込みより先に判定する
  if (SEARCH_MARKERS.test(text)) {
    const keyword = extractSearchKeyword(text);
    if (!keyword) {
      return {
        ...meta,
        reply: "どんな趣味の方をお探しでしょうか。「ゴルフが趣味な人」のように教えてください。",
      };
    }
    const customers = await searchByLabel(keyword);
    if (customers.length === 0) {
      return {
        ...meta,
        reply: `「${keyword}」に当たる方は見つかりませんでした。まだカルテに残っていないかもしれません。`,
      };
    }
    return {
      ...meta,
      reply: `「${keyword}」に当たる方は${customers.length}名です。`,
      action: { kind: "search_result", keyword, customers },
    };
  }

  // ── 趣味の追記 ──
  if (HOBBY_MARKERS.test(text)) {
    const hobbies = extractHobbies(text);
    if (hobbies.length === 0) {
      return {
        ...meta,
        reply: "趣味を読み取れませんでした。「ゴルフが趣味らしい」のように教えてください。",
      };
    }

    const name = extractName(text);
    if (name) {
      const candidates = await findCustomersByName(name);
      if (candidates.length === 0) {
        return {
          ...meta,
          reply: `「${name}」さんが見つかりませんでした。担当されている顧客かどうかご確認ください。`,
        };
      }
      if (candidates.length > 1) {
        return {
          ...meta,
          reply: `「${name}」さんが${candidates.length}名いらっしゃいます。どなたでしょうか。`,
          action: {
            kind: "ask_customer",
            keyword: name,
            candidates,
            pendingLabels: hobbies,
            body: text,
          },
        };
      }
      return { ...meta, ...(await proposeFact(candidates[0].id, hobbies, text)) };
    }

    if (ctx.customerId) {
      return { ...meta, ...(await proposeFact(ctx.customerId, hobbies, text)) };
    }

    return {
      ...meta,
      reply: `どなたの趣味でしょうか。「時枝さん${hobbies[0]}が趣味」のようにお名前を添えるか、顧客のカルテを開いてからお話しください。`,
    };
  }

  return {
    ...meta,
    reply:
      "まだ次の 2 つだけ承れます。\n・「時枝さんゴルフが趣味らしい」— 趣味をカルテに残す\n・「ゴルフが趣味な人だれだっけ」— 趣味から顧客を探す",
  };
}

/**
 * 追記の提案を組み立てる。ここでは書き込まない。
 *
 * 拾えるのが「趣味らしい」という言い回しだけなので、新しい語は hobby として
 * 作る。会話を LLM に替える回で、分類もモデルに決めさせる。
 */
export async function proposeFact(
  customerId: Uuid,
  labelNames: string[],
  body: string,
): Promise<{ reply: string; action?: AgentAction }> {
  const ref = await customerRef(customerId);
  if (!ref) {
    return { reply: "その顧客のカルテを開けませんでした。担当が変わっているかもしれません。" };
  }
  const plan = await planFactAdd(customerId, labelNames);
  if (plan.labelNames.length === 0) {
    return {
      reply: `${nameOf(ref.name)}には、すでに${labelNames.join("・")}が入っています。`,
    };
  }
  return {
    reply: `${nameOf(ref.name)}のパーソナルに${plan.labelNames.join("・")}を足します。`,
    action: {
      kind: "add_fact",
      customer: ref,
      labelNames: plan.labelNames,
      newLabelNames: plan.newLabelNames,
      categoryKey: "hobby",
      body,
    },
  };
}
