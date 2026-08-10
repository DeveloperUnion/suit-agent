import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 左下はサイドバー下端のリセットボタン、右下は AI アシスタントの FAB、
  // 上は全画面パネルのヘッダーが使っており、逃がせる四隅が残っていない。
  // インジケータの z-index は極端に高く、こちらの重ね順では避けられないため消す。
  // コンパイルエラーとランタイムエラーの表示は false にしても残る
  devIndicators: false,
};

export default nextConfig;
