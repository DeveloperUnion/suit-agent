import { ComingSoon } from "@/components/common/coming-soon";

export const metadata = { title: "ダッシュボード | 顧客カルテ" };

export default function DashboardPage() {
  return (
    <ComingSoon
      eyebrow="Dashboard"
      title="ダッシュボード"
      description="本日のアプローチ対象、未対応件数、最終接触からの経過日数分布、当月の受注・売上を並べる画面です。今回のモックでは顧客カルテを先に固めているため、この画面は次回以降の壁打ちで作ります。"
    />
  );
}
