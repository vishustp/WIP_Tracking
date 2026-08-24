import ProductionEntryGrid from "@/components/production/ProductionEntryGrid";

export default function Page() {
  return (
    <main className="p-6">
      <ProductionEntryGrid stageCode="HEAT_TREATMENT" />
    </main>
  );
}
