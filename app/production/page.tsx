import { redirect } from "next/navigation";
import ProductionEntryGrid from "@/components/production/ProductionEntryGrid";

export default async function ProductionPage({
  searchParams,
}: {
  searchParams?: Promise<{ stage?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  const rawStage = (resolvedParams?.stage || '').trim().toUpperCase();

  // Band Saw and VDI have dedicated forms; redirect any direct hits to their modules
  if (rawStage === 'BAND_SAW' || rawStage === 'BANDSAW' || rawStage === 'SAW') {
    redirect('/band-saw');
  }
  if (rawStage === 'VDI' || rawStage === 'QC') {
    redirect('/vdi');
  }

  return (
    <div className="w-full">
      <ProductionEntryGrid initialStage={resolvedParams?.stage} />
    </div>
  );
}

