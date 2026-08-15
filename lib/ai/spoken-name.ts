/**
 * 「いまの発話に、この人の名前が出ているか」。
 *
 * 宛先の検算（app/api/agent/route.ts の checkSubject）で使う。モデルが
 * 「名前で決めました」と申告したときに、**発話を見て裏を取る**ための判定。
 *
 * 最初は `name.split(" ")[0]` で姓を取っていた。dev-seed の氏名には空白が
 * 入っているので手元では通ったが、**画面から手で登録した顧客には空白が無い**。
 * 「横川尚隆」で登録された人に「横川くん」と話しかけると、姓＝「横川尚隆」に
 * なって照合が外れ、名前を言っているのに聞き返された（実際に起きた）。
 *
 * 形態素解析は入れない。ここで要るのは「名前がまったく出ていない発話に、
 * モデルが勝手に相手を当てはめていないか」の一点で、姓を正確に切ることではない。
 * 同姓の見分けは find_customer と聞き返しの仕事。
 */

/** 呼びかけの語。1 文字の姓は、これが後ろに付いたときだけ名前と見なす */
const HONORIFICS = ["さん", "サン", "くん", "君", "ちゃん", "様", "さま", "氏", "先生"];

const compact = (value: string) => value.replace(/[\s　]+/g, "");

/**
 * 照合の候補。氏名そのもの、空白で切った各パート、
 * 空白が無い場合の前後 1〜3 文字。
 */
function candidates(name: string): string[] {
  const full = compact(name);
  const found = new Set<string>();
  if (full) found.add(full);
  for (const part of name.split(/[\s　]+/)) if (part) found.add(part);
  // 「横川尚隆」→ 横/横川/横川尚 ＋ 隆/尚隆/川尚隆。
  // 姓と名のどちらで呼ばれても拾えるように、両端から取る
  for (const n of [1, 2, 3]) {
    if (full.length > n) {
      found.add(full.slice(0, n));
      found.add(full.slice(full.length - n));
    }
  }
  return [...found];
}

export function mentionsName(text: string, name: string): boolean {
  const haystack = compact(text);
  if (!haystack) return false;
  for (const candidate of candidates(name)) {
    // 2 文字以上ならそのまま。1 文字は「原さん」のように呼びかけが付いたときだけ
    // （「大」「原」「林」は普通の文にも出るので、素の一致では拾わない）
    if (candidate.length >= 2) {
      if (haystack.includes(candidate)) return true;
    } else if (HONORIFICS.some((h) => haystack.includes(candidate + h))) {
      return true;
    }
  }
  return false;
}
