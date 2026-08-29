import ProductionEntryGrid from "@/components/production/ProductionEntryGrid";

export default function ProductionPage() {
  return (
    <main className="p-6">
      <div className="mx-auto max-w-[1800px]">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">
            Production Entry
          </h1>
          <p className="text-sm text-muted-foreground">
          </p>
        </div>

        <ProductionEntryGrid />
      </div>
    </main>
  );
}
