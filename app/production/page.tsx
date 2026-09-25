import ProductionEntryGrid from "@/components/production/ProductionEntryGrid";

export default async function ProductionPage({
  searchParams,
}: {
  searchParams?: Promise<{ stage?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  return (
    <div className="w-full">
      <ProductionEntryGrid initialStage={resolvedParams?.stage} />
    </div>
  );
}

