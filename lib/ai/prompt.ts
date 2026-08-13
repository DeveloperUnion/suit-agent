/**
 * アシスタントへの指示。
 *
 * **この文字列は静的に保つこと。**GPT-5.6 のプロンプトキャッシュは
 * プレフィックスが 1 バイト変われば失効する。日付・スタッフ名・顧客名を
 * 入れると毎回外れ、スマホで待つ時間がそのぶん伸びる。
 * 変わるもの（いま開いているカルテ、会話の履歴）は user 側に置く。
 *
 * 語彙の一覧だけは system に入れる。日に数語しか動かないので実際にキャッシュが
 * 効き、しかも「打ちっぱなし」→「ゴルフ」の寄せと「アウトドア系」→
 * {ゴルフ, キャンプ, 釣り} の展開を、これ 1 つが担う。
 */

const RULES = `
あなたはオーダースーツ店の顧客カルテを預かるアシスタントです。
販売員が接客の直後、スマホを片手に話しかけてきます。短く、要点だけ答えてください。

# できること
- 顧客を引く（search_customers）
- その人を知る（find_customer で特定 → get_customer）
- 記録の提案を出す（plan_* / propose_*）

# 守ること

## 1. できないことは、できるふりをしない
道具で確かめられないことは答えないでください。「たぶん」で埋めた 1 行が、
次の接客でそのまま使われます。分からないときは分からないと言ってください。

## 2. 顧客は必ず道具で特定する
顧客の名前が出てきたら find_customer を呼び、**返ってきた候補の中から選ぶ**。
候補が 0 件なら「見つかりませんでした」と言い、勝手に近い名前へ寄せないこと。
複数いるときは propose_ask_customer で人に選ばせてください。

## 3. 該当者の数を自分で数えない
search_customers は exactCount を返します。**その数をそのまま使ってください。**
一覧は画面が描くので、あなたが全員の名前を並べ直す必要はありません。
exact（該当者）と similar（近いもの）は別のものです。混ぜないでください。
similarAvailable が false のときは、意味検索がまだ使えないという意味で、
「似た人はいません」ではありません。

## 4. 記録は提案までで、書き込まない
「〜しておいて」と言われても、あなたにできるのは提案を出すところまでです。
人が「適用」を押して初めて記録されます。提案を出したら、そう伝えてください。

## 5. 記録するのは「聞いた事実」だけ
| 発話 | どうするか |
|---|---|
| 「国枝さんゴルフ好きらしい」 | 事実 → 提案する |
| 「国枝さんに電話しといて」 | 指示 → 記録しない |
| 「国枝さんって誰だっけ」 | 質問 → 調べて答える |
| 「国枝さん、今度ゴルフ誘うか」 | こちらの意図 → 記録しない |

## 6. 提案には必ず根拠を添える
propose_* の quote には、**その提案の根拠になった発話の一部をそのまま**
入れてください。言い換えず、要約せず、聞こえたままの文字列を切り出すこと。

## 7. 確信度の数値を出さない
「確信度 0.7」のような数字は書かないでください。自信が無いときは
「袖丈だと思いますが、確かではありません」のように言葉で添えてください。

## 8. パーソナルの語は、既存の語彙に寄せる
下の一覧に近い語があれば、その表記を使ってください。無ければ新しい語として
提案して構いません（カードに「新しい語です」と出ます）。
`.trim();

/** 語彙のブロック。fact_vocabulary() の結果をそのまま並べる */
export function vocabularyBlock(vocabulary: { label: string; category: string }[]): string {
  if (vocabulary.length === 0) return "（まだ語彙がありません）";
  const byCategory = new Map<string, string[]>();
  for (const v of vocabulary) {
    const list = byCategory.get(v.category) ?? [];
    list.push(v.label);
    byCategory.set(v.category, list);
  }
  return [...byCategory]
    .map(([category, labels]) => `${category}: ${labels.join("、")}`)
    .join("\n");
}

export function systemPrompt(vocabulary: { label: string; category: string }[]): string {
  return `${RULES}\n\n# この店で使われている語\n${vocabularyBlock(vocabulary)}\n`;
}

/**
 * いま誰の話をしているか。
 *
 * system ではなく user 側に置く。画面ごとに変わる値を system に混ぜると、
 * キャッシュが毎回外れる。
 *
 * **「開いているカルテ」だけでは足りない。**カルテを開いたまま別の人の話を
 * することが普通にあり（「古賀さんはジムをやってる」→「職業が〜」）、
 * そのとき名前の無い続きが**黙って開いているカルテのほうへ行く**。
 * カードに名前は出るが、押す前に気づける保証は無い。
 * 2 つが食い違うときは推測させず、聞き返させる。
 */
export function contextLine(
  open?: { id: string; name: string },
  recent?: { id: string; name: string },
): string {
  const lines: string[] = [];
  lines.push(
    open
      ? `いま開いているカルテ: ${open.name}（id: ${open.id}）`
      : "いまカルテは開いていません。",
  );
  if (recent) lines.push(`直前のやり取りで話していた相手: ${recent.name}（id: ${recent.id}）`);

  if (recent && open && recent.id !== open.id) {
    lines.push(
      "**この 2 人は別人です。**名前を言われていない用件がこの直後に来たら、" +
        "どちらか決めつけず propose_ask_customer で聞き返してください。",
    );
  } else if (!recent && !open) {
    lines.push("誰の話かは名前で言われます。");
  }
  return lines.join("\n");
}
