import React from "react";
import { fmt } from "@/lib/productionUtils";
import type { StageCode } from "@/types";

interface WorkCenterSummaryItem {
  label: string;
  stage_code: StageCode;
  availMtr: number;
  availPcs: number;
  availMt: number;
  count: number;
  [key: string]: unknown;
}

interface WipSummaryCardsProps {
  workCenterSummary: WorkCenterSummaryItem[];
  stage: StageCode;
  setStage: (stage: StageCode) => void;
  showWipSummary?: boolean;
  setShowWipSummary?: (show: boolean) => void;
}

const STAGE_DISPLAY_NAMES: Record<StageCode, string> = {
  ROLLING: "ROLLING MILL",
  HOLLOW_HEAT_TREATMENT: "HOLLOW HT",
  DRAW: "DRAW BENCH",
  HEAT_TREATMENT: "HEAT TREATMENT",
  FINISHING: "FINISHING",
};

export function WipSummaryCards({
  workCenterSummary,
  stage,
  setStage,
}: WipSummaryCardsProps) {
  // Ensure all 5 stages appear in the correct sequential order
  const orderedStages: StageCode[] = [
    "ROLLING",
    "HOLLOW_HEAT_TREATMENT",
    "DRAW",
    "HEAT_TREATMENT",
    "FINISHING",
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
      <div className="mb-4">
        <h2 className="text-sm font-bold text-slate-800 tracking-tight">
          Work Center WIP Summary
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {orderedStages.map((stgCode) => {
          const wc = workCenterSummary.find((x) => x.stage_code === stgCode) || {
            label: STAGE_DISPLAY_NAMES[stgCode] || stgCode,
            stage_code: stgCode,
            availMtr: 0,
            availPcs: 0,
            availMt: 0,
            count: 0,
          };

          const isSelected = wc.stage_code === stage;
          const displayName = STAGE_DISPLAY_NAMES[wc.stage_code] || wc.label;

          return (
            <div
              key={wc.stage_code}
              onClick={() => setStage(wc.stage_code)}
              className={`cursor-pointer rounded-lg border p-4 transition-all ${
                isSelected
                  ? "border-2 border-sky-600 bg-white shadow-xs ring-1 ring-sky-600/20"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60"
              }`}
            >
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {displayName}
              </div>

              <div className="mt-2.5 flex items-baseline gap-1.5">
                <span className="text-xl font-extrabold font-mono text-slate-900 tracking-tight">
                  {fmt(wc.availPcs)}
                </span>
                <span className="text-xs font-bold text-slate-800">PCS</span>
              </div>

              <div className="mt-1 text-[11px] font-mono text-slate-400">
                {fmt(wc.availMt, " MT")} / {fmt(wc.availMtr, " MTR")}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default WipSummaryCards;
