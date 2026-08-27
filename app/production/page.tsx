import ProductionEntryGrid from "@/components/production/ProductionEntryGrid";

export default function Page() {
  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Production Entry</h1>
        <p className="text-sm text-muted-foreground">
          Select the Work Center and enter production using the common production form.
        </p>
      </div>

      <ProductionEntryGrid />
    </main>
  );
}
