import { ComingSoon } from "@/components/common/coming-soon";

export const metadata = { title: "アプローチ | 顧客カルテ" };

export default function ApproachesPage() {
  return (
    <ComingSoon
      eyebrow="Approaches"
      title="アプローチリスト"
      description="経過日数・記念日・季節・企業ニュースの4トリガーで抽出した「本日連絡すべき顧客」を、根拠テキスト付きで一覧にする画面です。個々の顧客のアプローチ履歴は、顧客カルテの「アプローチ」タブで確認できます。"
    />
  );
}
