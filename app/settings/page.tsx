import { SettingsView } from "@/components/settings/settings-view";

export const metadata = { title: "設定 | TORICO" };

export default async function SettingsPage(props: PageProps<"/settings">) {
  const search = await props.searchParams;
  // ダッシュボードから「目標を設定」で直接このタブを開けるようにする
  const tab = typeof search.tab === "string" ? search.tab : undefined;

  return <SettingsView initialTab={tab} />;
}
