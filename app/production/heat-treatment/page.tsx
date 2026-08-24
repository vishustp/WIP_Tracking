import ProductionEntryGrid from "@/components/production/ProductionEntryGrid";

export default function Page() {
  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">
          Heat Treatment Production Entry
        </h1>
        <p className="text-sm text-muted-foreground">
          Enter actual heat treatment production against available Balance to Make.
        </p>
      </div>

      <ProductionEntryGrid stageCode="HEAT_TREATMENT" />
    </main>
  );
}
