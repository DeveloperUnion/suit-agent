/**
 * パーソナルの見出し。
 *
 * **検索の絞り込みには絶対に使わない。**カルテで事実を束ねて表示するときの
 * 見出しと、その並び順にしか使わない。
 *
 * `where category = 'hobby'` で絞ると、「ゴルフ場の設計をやってる」を work に
 * 分類された顧客が「ゴルフが趣味な人」で永久に引けなくなる。接客の場では
 * 趣味だろうが仕事だろうが「ゴルフの話ができる人」なので、むしろ全部出たほうが
 * 役に立つ。引くのは label だけ（docs/database-design.md）。
 *
 * カテゴリは事実ではなく**ラベルの属性**として持つ（fact_labels.category_key）。
 * 「ゴルフ」は誰にとってもゴルフなので、発話のたびに分類させると揺れるだけ。
 * 初出時に 1 回決めれば、2 回目以降は判断が発生しない。
 *
 * ここが正で、DB はミラー。直したら `npm run db:masters` を実行する。
 * 種類を増やすほど「これはどっちだ」の判断が増えるので、迷ったら other に倒す。
 */
export type FactCategory = {
  key: string;
  label: string;
};

export const FACT_CATEGORIES: FactCategory[] = [
  { key: "hobby", label: "趣味" },
  { key: "preference", label: "好み" },
  // 着用シーンを好みと分けるのは、提案のときに見る場面が違うため
  // （「紺が好き」は生地を選ぶとき、「式典が多い」は型を選ぶとき）。
  { key: "scene", label: "着用シーン" },
  { key: "work", label: "仕事" },
  { key: "lifestyle", label: "暮らし" },
  { key: "other", label: "その他" },
];
