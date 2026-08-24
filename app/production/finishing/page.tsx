import ProductionEntryGrid from "@/components/production/ProductionEntryGrid";

export default function Page() {
  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Finishing Production Entry</h1>
        <p className="text-sm text-muted-foreground">
          Enter actual finishing production against available Balance to Make.
        </p>
      </div>

      <ProductionEntryGrid stageCode="FINISHING" />
    </main>
  );
}
