import { Factory } from "lucide-react";
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
  showWipSummary: boolean;
  setShowWipSummary: (show: boolean) => void;
}

export function WipSummaryCards({
  workCenterSummary,
  stage,
  setStage,
  showWipSummary,
  setShowWipSummary,
}: WipSummaryCardsProps) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Factory className="h-4 w-4 text-blue-600" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Work Center WIP Summary
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setShowWipSummary(!showWipSummary)}
          className="text-xs font-medium text-slate-500 hover:text-slate-800 transition cursor-pointer"
        >
          {showWipSummary ? "Hide Summary" : "Show Summary"}
        </button>
      </div>

      {showWipSummary && (
        <div className="grid grid-cols-2 gap-3 p-3.5 sm:grid-cols-3 lg:grid-cols-5 bg-slate-50/20">
          {workCenterSummary.map((wc) => {
            const isSelected = wc.stage_code === stage;
            return (
              <div
                key={wc.stage_code}
                onClick={() => setStage(wc.stage_code)}
                className={`cursor-pointer rounded-xl border p-3 transition-all ${
                  isSelected
                    ? "border-blue-500/80 bg-gradient-to-br from-blue-50/80 to-indigo-50/50 shadow-xs ring-1 ring-blue-500/30"
                    : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-slate-700 truncate">{wc.label}</span>
                  {isSelected && (
                    <span className="rounded-full bg-blue-600 px-1.5 py-0.2 text-[10px] font-bold text-white shrink-0">
                      Active
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-base font-bold font-mono text-slate-900 tracking-tight">
                    {fmt(wc.availPcs)}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400">PCS</span>
                </div>
                <div className="text-xs text-slate-500 font-mono mt-0.5">
                  {fmt(wc.availMtr, " MTR")} · <span className="text-blue-700 font-semibold">{fmt(wc.availMt, " MT")}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default WipSummaryCards;
