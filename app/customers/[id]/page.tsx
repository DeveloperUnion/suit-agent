import { CustomerDetailView } from "@/components/customer/customer-detail-view";

export default async function CustomerDetailPage(props: PageProps<"/customers/[id]">) {
  const { id } = await props.params;
  return <CustomerDetailView customerId={id} />;
}
