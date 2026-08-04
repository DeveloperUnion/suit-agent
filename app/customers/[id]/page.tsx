import { CustomerDetailView } from "@/components/customer/customer-detail-view";

export default async function CustomerDetailPage(props: PageProps<"/customers/[id]">) {
  const [{ id }, search] = await Promise.all([props.params, props.searchParams]);
  const tab = typeof search.tab === "string" ? search.tab : undefined;
  const approach = typeof search.approach === "string" ? search.approach : undefined;

  return <CustomerDetailView customerId={id} initialTab={tab} initialApproachId={approach} />;
}
