import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 左下のインジケータがサイドバー下端のリセットボタンと重なるため右下へ寄せる
  devIndicators: {
    position: "bottom-right",
  },
};

export default nextConfig;
