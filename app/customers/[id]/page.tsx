import { CustomerDetailView } from "@/components/customer/customer-detail-view";

export default async function CustomerDetailPage(props: PageProps<"/customers/[id]">) {
  const [{ id }, search] = await Promise.all([props.params, props.searchParams]);
  const tab = typeof search.tab === "string" ? search.tab : undefined;
  // 会話から「注文の登録へ」を押したとき。**URL に載せるのはこの旗だけ**で、
  // 拾った値は OrderDraftProvider が持つ（会話由来の文字列を履歴に残さないため）。
  const openOrder = search.order === "new";

  return <CustomerDetailView customerId={id} initialTab={tab} openOrder={openOrder} />;
}
