import { ComingSoon } from "@/components/common/coming-soon";

export const metadata = { title: "設定 | TORICO" };

export default function SettingsPage() {
  return (
    <ComingSoon
      eyebrow="Settings"
      title="設定"
      description="スタッフ管理、トリガー閾値、生地マスタ、メッセージ生成ルールを扱う画面です。採寸項目・補正コード・仕様の各マスタは lib/constants/ に定義済みで、この画面から編集できるようにする想定です。"
    />
  );
}
