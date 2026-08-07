import type { ItemTypeId, SpecGroup } from "@/lib/types";

/**
 * 仕様（指示項目）マスタ
 *
 * private/採寸データ.jpg 中央の「指示項目」欄をそのまま写したもの。
 *
 * 注意: 画像からの転記のため、以下は判読が不確かで確認が必要。
 *   - 腰ポケットの選択肢名（フタツキ / ハッキング / チェンジ の並び）
 *   - パンツのベルト・腰裏・前立の選択肢名
 * コードはいずれも紙に印刷されている番号をそのまま採用している。
 */

const group = (
  itemTypeId: ItemTypeId,
  key: string,
  label: string,
  options: [string, string][],
): SpecGroup => ({
  key,
  label,
  itemTypeId,
  options: options.map(([code, optLabel]) => ({ code, label: optLabel })),
});

const STITCH_OPTIONS: [string, string][] = [
  ["02", "ミシン0.7"],
  ["04", "ミシンコバ"],
  ["05", "ミシン0.5"],
  ["14", "ピックコバ"],
  ["15", "ピック0.5"],
];

export const SPEC_GROUPS: SpecGroup[] = [
  // ── JACKET ──
  group("jacket", "front_button", "前釦", [
    ["01", "S2B×1"],
    ["03", "S3B×1"],
    ["04", "S3B×2"],
    ["06", "D6B×2"],
    ["07", "D4B×1"],
    ["15", "D6B×1"],
    ["16", "S4B×3"],
    ["17", "S3B×2ハーフ"],
  ]),
  group("jacket", "lapel", "衿型", [
    ["01", "ノッチ"],
    ["03", "ピーク"],
    ["11", "ノッチ(ロー)"],
    ["13", "ピーク(ロー)"],
    ["21", "ノッチ(ハイ)"],
    ["23", "ピーク(ハイ)"],
  ]),
  group("jacket", "chest_pocket", "胸ポケット", [
    ["01", "ハコ"],
    ["04", "アウト"],
  ]),
  group("jacket", "hip_pocket", "腰ポケット", [
    ["01", "フタツキ"],
    ["02", "ハッキング"],
    ["04", "アウト"],
    ["05", "フタナシ"],
    ["17", "チェンジ"],
  ]),
  group("jacket", "vent", "ベント", [
    ["01", "センター"],
    ["02", "ナシ"],
    ["04", "サイド"],
  ]),
  group("jacket", "inner_pocket", "内ポケット", [
    ["02", "タバコ"],
    ["03", "ペン"],
    ["04", "メイシ"],
  ]),
  group("jacket", "sleeve_button", "袖", [
    ["02", "2釦"],
    ["03", "3釦"],
    ["04", "4釦"],
    ["14", "4個裏重釦"],
  ]),
  group("jacket", "lining", "裏仕様", [
    ["A1", "背抜き"],
    ["A2", "総裏"],
  ]),
  group("jacket", "stitch_type", "ステッチ内容", STITCH_OPTIONS),
  group("jacket", "stitch_place", "ステッチ箇所", [
    ["01", "ナシ"],
    ["02", "フロント"],
    ["03", "バック"],
    ["04", "フロント&バック"],
  ]),
  group("jacket", "special", "特殊仕様", [
    ["03", "パイピング"],
    ["06", "ダブル釦止"],
    ["07", "クモフタ小"],
    ["08", "クモフタ大"],
  ]),
  group("jacket", "pad_right", "パット（右）", [
    ["1", "標準"],
    ["2", "+0.5"],
    ["3", "+1.0"],
    ["4", "-0.5"],
    ["5", "-1.0"],
    ["9", "ナシ"],
  ]),
  group("jacket", "pad_left", "パット（左）", [
    ["1", "標準"],
    ["2", "+0.5"],
    ["3", "+1.0"],
    ["4", "-0.5"],
    ["5", "-1.0"],
    ["9", "ナシ"],
  ]),
  group("jacket", "sleeve_silhouette", "袖シルエット", [
    ["01", "標準"],
    ["03", "スリム"],
  ]),
  group("jacket", "cuff_shape", "袖口形状", [
    ["01", "標準"],
    ["09", "本切羽"],
  ]),

  // ── PANTS ──
  group("pants", "front_tuck", "前タック", [
    ["01", "イン2タック"],
    ["02", "アウト2タック"],
    ["03", "ノータック"],
    ["04", "アウト1タック"],
    ["05", "イン1タック"],
  ]),
  group("pants", "belt", "ベルト", [
    ["01", "標準(オビツキ)"],
    ["02", "ベルトレス"],
    ["08", "アジャスター付"],
  ]),
  group("pants", "loop", "ループ", [
    ["43", "L10×45+B 下り1.0"],
    ["47", "L10×45+B トップ"],
  ]),
  group("pants", "side_pocket", "脇ポケット", [
    ["01", "ナナメ"],
    ["02", "タテ"],
    ["05", "ウエスタン型"],
  ]),
  group("pants", "back_pocket", "ビスポケット", [
    ["05", "標準(右)"],
    ["15", "左フタツキ"],
    ["16", "左右フタツキ"],
    ["20", "両釦"],
  ]),
  group("pants", "waist_lining", "腰裏", [
    ["01", "シマ"],
    ["02", "ベルト共地"],
    ["03", "礼服仕様"],
  ]),
  group("pants", "hem_finish", "裾口", [
    ["01", "シングル"],
    ["02", "モーニング"],
    ["03", "ハーフ"],
    ["04", "ダブル"],
  ]),
  group("pants", "fly", "前立", [
    ["01", "ファスナー"],
    ["02", "釦"],
    ["03", "ナイロンファスナー"],
  ]),
  group("pants", "watch_pocket", "時計ポケット", [
    ["02", "ナナメ"],
    ["03", "タテ"],
    ["05", "ヨコギリ"],
    ["07", "ベースフタ付き"],
  ]),

  // ── VEST ──
  group("vest", "front_button", "前釦", [
    ["01", "S5B×5"],
    ["03", "S6B×5"],
    ["04", "D6B×3"],
    ["06", "S6B×6"],
    ["07", "D4B×2"],
  ]),
  group("vest", "stitch_type", "ステッチ内容", STITCH_OPTIONS),
  group("vest", "chest_pocket", "胸ポケット", [
    ["01", "ハコ1ケ"],
    ["02", "ハコ2ケ"],
    ["03", "ナシ"],
    ["05", "両玉左右"],
  ]),
  group("vest", "hip_pocket", "腰ポケット", [
    ["01", "ハコ"],
    ["02", "両玉"],
  ]),
  group("vest", "back_lining", "背裏", [
    ["01", "尾錠ナシ"],
    ["02", "尾錠付"],
    ["03", "表地"],
  ]),
];

export function specGroupsFor(itemTypeId: ItemTypeId): SpecGroup[] {
  return SPEC_GROUPS.filter((g) => g.itemTypeId === itemTypeId);
}

/** 仕様の選択コードを人が読めるラベルに直す */
export function specLabel(itemTypeId: ItemTypeId, groupKey: string, code: string): string | undefined {
  const g = SPEC_GROUPS.find((sg) => sg.itemTypeId === itemTypeId && sg.key === groupKey);
  return g?.options.find((o) => o.code === code)?.label;
}
