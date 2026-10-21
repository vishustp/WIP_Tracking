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
  HOT_ROLLING: "HOT ROLLING",
  HTC: "HOT TEST CHECK",
  ROLLING: "ROLLING MILL",
  HOLLOW_HEAT_TREATMENT: "HOLLOW HT",
  DRAW: "DRAW BENCH",
  PILGER: "COLD PILGER",
  HEAT_TREATMENT: "HEAT TREATMENT",
  BAND_SAW: "BAND SAW",
  VDI: "VDI / QC",
  FINISHING: "FINISHING",
};

export function WipSummaryCards({
  workCenterSummary,
  stage,
  setStage,
}: WipSummaryCardsProps) {
  // Production Entry stages in sequential order (Band Saw and VDI have dedicated forms)
  const orderedStages: StageCode[] = [
    "HOT_ROLLING",
    "HTC",
    "HOLLOW_HEAT_TREATMENT",
    "DRAW",
    "PILGER",
    "HEAT_TREATMENT",
    "FINISHING",
  ];

  return (
    <div className="rounded-xl border border-[var(--border-subtle,#e2e8f0)] bg-[var(--bg-surface,#ffffff)] p-5 shadow-2xs">
      <div className="mb-4">
        <h2 className="text-sm font-bold text-[var(--text-main,#1e293b)] tracking-tight">
          Work Center WIP Summary
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
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
                  ? "border-2 border-sky-600 bg-[var(--bg-surface,#ffffff)] shadow-xs ring-1 ring-sky-600/20"
                  : "border-[var(--border-subtle,#e2e8f0)] bg-[var(--bg-surface,#ffffff)] hover:border-[var(--border-strong,#cbd5e1)] hover:bg-[var(--bg-surface-subtle,#f8fafc)]"
              }`}
            >
              <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted,#64748b)]">
                {displayName}
              </div>

              <div className="mt-2.5 flex items-baseline gap-1.5">
                <span className="text-xl font-extrabold font-mono text-[var(--text-main,#0f172a)] tracking-tight">
                  {fmt(wc.availPcs)}
                </span>
                <span className="text-xs font-bold text-[var(--text-muted,#475569)]">PCS</span>
              </div>

              <div className="mt-1 text-[11px] font-mono text-[var(--text-muted,#94a3b8)]">
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
