"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  Edit2,
  Trash2,
  X,
  Layers,
  ChevronDown,
  ChevronRight,
  Factory,
  ArrowRight,
  Info,
  SlidersHorizontal,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useQueue } from "@/hooks/useQueue";
import { useHistory } from "@/hooks/useHistory";
import { validateProductionEntry } from "@/lib/productionValidation";
import { calc, fmt, n, mtrFromPcs, pcsFromMtr, mtFromMtr } from "@/lib/productionUtils";
import { StageCode, STAGES, Row, ProductionEntry, WorkCenterWipInfo } from "@/types";

export default function ProductionEntryGrid() {
  const supabase = useMemo(() => createClient(), []);

  // --- State ---
  const [stage, setStage] = useState<StageCode>("ROLLING");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [search, setSearch] = useState("");
  const [entryStage, setEntryStage] = useState("");
  const [entryRoute, setEntryRoute] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Expandable work center WIP breakdown per row
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [showWipSummary, setShowWipSummary] = useState(true);

  // Edit modal state
  const [editing, setEditing] = useState<ProductionEntry | null>(null);
  const [editMtr, setEditMtr] = useState("");
  const [editPcs, setEditPcs] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editRejectionMtr, setEditRejectionMtr] = useState("");
  const [editRejectionPcs, setEditRejectionPcs] = useState("");
  const [editHtcMtr, setEditHtcMtr] = useState("");
  const [editHtcPcs, setEditHtcPcs] = useState("");
  const [editHeatLot, setEditHeatLot] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Delete modal state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // --- Data fetching ---
  const { rows, setRows, loading: queueLoading, reload: reloadQueue } = useQueue(stage);
  const { entries, loading: historyLoading, reload: reloadHistory } = useHistory(
    search,
    entryStage,
    entryRoute,
    fromDate,
    toDate
  );

  const [factoryWip, setFactoryWip] = useState<any[]>([]);

  const loadFactoryWip = useCallback(async () => {
    try {
      const { data } = await supabase.from("vw_route_stage_wip").select("*");
      if (data) setFactoryWip(data);
    } catch {
      // ignore
    }
  }, [supabase]);

  useEffect(() => {
    loadFactoryWip();
  }, [loadFactoryWip, rows]);

  const routes = useMemo(
    () => Array.from(new Set(entries.map((e) => e.route_code))).sort(),
    [entries]
  );

  // Toggle single row expansion
  const toggleRowExpansion = (key: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Toggle all rows expansion
  const toggleAllRows = () => {
    const allExpanded = rows.every((r) => expandedRows[`${r.work_order_id}|${r.route_id}`]);
    const newState: Record<string, boolean> = {};
    rows.forEach((r) => {
      newState[`${r.work_order_id}|${r.route_id}`] = !allExpanded;
    });
    setExpandedRows(newState);
  };

  // --- Row update helper with bidirectional PCS <-> MTR conversion ---
  const updateRow = (
    key: string,
    field: keyof Pick<
      Row,
      "pcs" | "mtr" | "rejection_pcs" | "rejection_mtr" | "htc_ok_pcs" | "htc_ok_mtr" | "heat_lot_no" | "remarks"
    >,
    value: string
  ) => {
    setRows((current) =>
      current.map((r) => {
        if (`${r.work_order_id}|${r.route_id}` !== key) return r;

        // Rule 5: Rolling Mtr and MT calculated based on MH dimensions if applicable
        const effectiveAvg =
          stage === "ROLLING" && r.mh_avg_length && r.mh_avg_length > 0
            ? Number(r.mh_avg_length)
            : n(r.avg_length);

        if (field === "pcs") {
          const mtr = value === "" ? "" : String(mtrFromPcs(n(value), effectiveAvg).toFixed(3).replace(/\.?0+$/, ""));
          return { ...r, pcs: value, mtr };
        }
        if (field === "mtr") {
          const pcs = value === "" ? "" : String(pcsFromMtr(n(value), effectiveAvg).toFixed(3).replace(/\.?0+$/, ""));
          return { ...r, mtr: value, pcs };
        }
        if (field === "rejection_pcs") {
          const rejection_mtr = value === "" ? "" : String(mtrFromPcs(n(value), effectiveAvg).toFixed(3).replace(/\.?0+$/, ""));
          return { ...r, rejection_pcs: value, rejection_mtr };
        }
        if (field === "rejection_mtr") {
          const rejection_pcs = value === "" ? "" : String(pcsFromMtr(n(value), effectiveAvg).toFixed(3).replace(/\.?0+$/, ""));
          return { ...r, rejection_mtr: value, rejection_pcs };
        }
        if (field === "htc_ok_pcs") {
          const htc_ok_mtr = value === "" ? "" : String(mtrFromPcs(n(value), effectiveAvg).toFixed(3).replace(/\.?0+$/, ""));
          return { ...r, htc_ok_pcs: value, htc_ok_mtr };
        }
        if (field === "htc_ok_mtr") {
          const htc_ok_pcs = value === "" ? "" : String(pcsFromMtr(n(value), effectiveAvg).toFixed(3).replace(/\.?0+$/, ""));
          return { ...r, htc_ok_mtr: value, htc_ok_pcs };
        }
        return { ...r, [field]: value };
      })
    );
  };

  // --- Aggregate WIP across all work orders in current queue & factory-wide ---
  const workCenterSummary = useMemo(() => {
    const summary: Record<string, { label: string; stage_code: StageCode; availMtr: number; availPcs: number; availMt: number; count: number }> = {
      ROLLING: { label: "Rolling Mill", stage_code: "ROLLING", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      HOLLOW_HEAT_TREATMENT: { label: "Hollow Heat Treatment", stage_code: "HOLLOW_HEAT_TREATMENT", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      DRAW: { label: "Draw Bench", stage_code: "DRAW", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      HEAT_TREATMENT: { label: "Heat Treatment", stage_code: "HEAT_TREATMENT", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      FINISHING: { label: "Finishing Line", stage_code: "FINISHING", availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
    };

    const resolveStageCode = (w: any): StageCode | null => {
      if (!w) return null;
      const raw = String(w.stage_code || w.stage_name || w.stage_id || "").toUpperCase().trim();
      if (raw === "HOLLOW_HEAT_TREATMENT" || raw.includes("HOLLOW")) return "HOLLOW_HEAT_TREATMENT";
      if (raw === "ROLLING" || raw.includes("ROLL")) return "ROLLING";
      if (raw === "DRAW" || raw.includes("DRAW")) return "DRAW";
      if (raw === "HEAT_TREATMENT" || raw.includes("HEAT")) return "HEAT_TREATMENT";
      if (raw === "FINISHING" || raw.includes("FINISH")) return "FINISHING";
      return null;
    };

    // 1. Process factoryWip if available
    let hasFactoryData = false;
    if (factoryWip && factoryWip.length > 0) {
      factoryWip.forEach((w) => {
        const sc = resolveStageCode(w);
        if (sc && summary[sc]) {
          const mtr = Number(w.current_wip ?? w.available_mtr ?? 0);
          let pcs = Number(w.current_wip_pcs ?? w.available_pcs ?? 0);
          const avgLen = Number(w.avg_length || 6.0);
          if (pcs === 0 && mtr > 0 && avgLen > 0) {
            pcs = Number((mtr / avgLen).toFixed(2));
          }
          const isRoll = sc === "ROLLING";
          const od = isRoll && w.mh_od ? Number(w.mh_od) : Number(w.od || w.size_od || 0);
          const wt = isRoll && w.mh_wt ? Number(w.mh_wt) : Number(w.wl || w.wt || w.size_wt || 0);
          const mt = Number(w.available_mt ?? w.current_wip_mt ?? mtFromMtr(mtr, od, wt));

          if (mtr > 0 || pcs > 0) {
            summary[sc].availMtr += mtr;
            summary[sc].availPcs += pcs;
            summary[sc].availMt += mt;
            summary[sc].count += 1;
            hasFactoryData = true;
          }
        }
      });
    }

    // 2. Also ensure rows in active queue contribute if factoryWip was empty or incomplete
    if (rows && rows.length > 0) {
      rows.forEach((r) => {
        if (r.work_centers_wip && r.work_centers_wip.length > 0) {
          r.work_centers_wip.forEach((w) => {
            const sc = resolveStageCode(w);
            if (sc && summary[sc]) {
              const mtr = Number(w.available_mtr || 0);
              const pcs = Number(w.available_pcs || 0);
              const isRoll = sc === "ROLLING";
              const od = isRoll && r.mh_od ? Number(r.mh_od) : Number(r.od || 0);
              const wt = isRoll && r.mh_wt ? Number(r.mh_wt) : Number(r.wl || 0);
              const mt = Number(w.available_mt ?? mtFromMtr(mtr, od, wt));
              if (!hasFactoryData) {
                summary[sc].availMtr += mtr;
                summary[sc].availPcs += pcs;
                summary[sc].availMt += mt;
                if (mtr > 0 || pcs > 0) summary[sc].count += 1;
              }
            }
          });
        } else {
          const sc = resolveStageCode({ stage_code: r.stage_code || stage });
          if (sc && summary[sc] && !hasFactoryData) {
            const mtr = Number(r.max_allowed_mtr || r.balance_to_make_mtr || 0);
            const pcs = Number(r.max_allowed_pcs || r.balance_to_make_pcs || 0);
            const isRoll = sc === "ROLLING";
            const od = isRoll && r.mh_od ? Number(r.mh_od) : Number(r.od || 0);
            const wt = isRoll && r.mh_wt ? Number(r.mh_wt) : Number(r.wl || 0);
            const mt = mtFromMtr(mtr, od, wt);
            summary[sc].availMtr += mtr;
            summary[sc].availPcs += pcs;
            summary[sc].availMt += mt;
            if (mtr > 0 || pcs > 0) summary[sc].count += 1;
          }
        }
      });

      // Guarantee the active selected stage card at least shows what is displayed in the active queue table
      const activeSc = resolveStageCode({ stage_code: stage });
      if (activeSc && summary[activeSc]) {
        const queueTotalMtr = rows.reduce((sum, r) => sum + Number(r.max_allowed_mtr || r.balance_to_make_mtr || 0), 0);
        const queueTotalPcs = rows.reduce((sum, r) => sum + Number(r.max_allowed_pcs || r.balance_to_make_pcs || 0), 0);
        const queueTotalMt = rows.reduce((sum, r) => {
          const isRoll = activeSc === "ROLLING";
          const od = isRoll && r.mh_od ? Number(r.mh_od) : Number(r.od || 0);
          const wt = isRoll && r.mh_wt ? Number(r.mh_wt) : Number(r.wl || 0);
          const mtrVal = Number(r.max_allowed_mtr || r.balance_to_make_mtr || 0);
          return sum + mtFromMtr(mtrVal, od, wt);
        }, 0);

        if (queueTotalMtr > summary[activeSc].availMtr || queueTotalPcs > summary[activeSc].availPcs) {
          summary[activeSc].availMtr = Math.max(summary[activeSc].availMtr, queueTotalMtr);
          summary[activeSc].availPcs = Math.max(summary[activeSc].availPcs, queueTotalPcs);
          summary[activeSc].availMt = Math.max(summary[activeSc].availMt, queueTotalMt);
          summary[activeSc].count = Math.max(summary[activeSc].count, rows.length);
        }
      }
    }

    return Object.values(summary);
  }, [factoryWip, rows, stage]);

  // --- Batch save (atomic) ---
  async function save() {
    setMessage("");
    setError("");

    const selected = rows.filter((r) => n(r.mtr) > 0 || n(r.pcs) > 0);
    if (!selected.length) {
      setError("Enter Production PCS/MTR for at least one row.");
      return;
    }

    // Validate all rows
    const allErrors = selected.flatMap((r) => validateProductionEntry(r, stage));
    if (allErrors.length) {
      setError(allErrors.map((e) => `${e.workOrder}: ${e.message}`).join(" | "));
      return;
    }

    setSaving(true);
    try {
      const payload = selected.map((r) => {
        const d = calc(r);
        return {
          work_order_id: r.work_order_id,
          route_id: r.route_id,
          stage_code: r.stage_code,
          input_qty: d.mtr,
          output_qty: d.mtr,
          rejection_qty: d.rejection,
          htc_ok: stage === "ROLLING" ? d.htc : 0,
          heat_lot_no: r.heat_lot_no || null,
          remarks: r.remarks || null,
        };
      });

      const { error: rpcError } = await supabase.rpc("record_production_batch", {
        entries: payload,
        p_process_date: date,
      });

      if (rpcError) throw rpcError;

      setMessage("All production entries saved successfully.");
      await Promise.all([reloadQueue(), reloadHistory(), loadFactoryWip()]);
    } catch (e: unknown) {
      console.error("Full error:", e);
      setError(e instanceof Error ? e.message : "Failed to save production.");
    } finally {
      setSaving(false);
    }
  }

  // --- Edit handlers with bidirectional PCS <-> MTR ---
  function openEdit(entry: ProductionEntry) {
    setEditing(entry);
    const avg = n(entry.avg_length) > 0 ? n(entry.avg_length) : 6.0;
    setEditDate(entry.process_date.slice(0, 10));
    setEditMtr(String(entry.output_mtr || ""));
    setEditPcs(String(entry.output_pcs || (entry.output_mtr ? (entry.output_mtr / avg).toFixed(2) : "")));
    setEditRejectionMtr(String(entry.rejection_mtr || ""));
    setEditRejectionPcs(String(entry.rejection_pcs || (entry.rejection_mtr ? (entry.rejection_mtr / avg).toFixed(2) : "")));
    setEditHtcMtr(String(entry.htc_ok_mtr || ""));
    setEditHtcPcs(String(entry.htc_ok_pcs || (entry.htc_ok_mtr ? (entry.htc_ok_mtr / avg).toFixed(2) : "")));
    setEditHeatLot(entry.heat_lot_no || "");
    setEditRemarks(entry.remarks || "");
  }

  function changeEditPcs(value: string) {
    setEditPcs(value);
    const avg = editing && n(editing.avg_length) > 0 ? n(editing.avg_length) : 6.0;
    if (value === "") {
      setEditMtr("");
    } else {
      setEditMtr(String(mtrFromPcs(n(value), avg).toFixed(3).replace(/\.?0+$/, "")));
    }
  }

  function changeEditMtr(value: string) {
    setEditMtr(value);
    const avg = editing && n(editing.avg_length) > 0 ? n(editing.avg_length) : 6.0;
    if (value === "") {
      setEditPcs("");
    } else {
      setEditPcs(String(pcsFromMtr(n(value), avg).toFixed(3).replace(/\.?0+$/, "")));
    }
  }

  function changeEditRejectionPcs(value: string) {
    setEditRejectionPcs(value);
    const avg = editing && n(editing.avg_length) > 0 ? n(editing.avg_length) : 6.0;
    if (value === "") {
      setEditRejectionMtr("");
    } else {
      setEditRejectionMtr(String(mtrFromPcs(n(value), avg).toFixed(3).replace(/\.?0+$/, "")));
    }
  }

  function changeEditRejectionMtr(value: string) {
    setEditRejectionMtr(value);
    const avg = editing && n(editing.avg_length) > 0 ? n(editing.avg_length) : 6.0;
    if (value === "") {
      setEditRejectionPcs("");
    } else {
      setEditRejectionPcs(String(pcsFromMtr(n(value), avg).toFixed(3).replace(/\.?0+$/, "")));
    }
  }

  function changeEditHtcPcs(value: string) {
    setEditHtcPcs(value);
    const avg = editing && n(editing.avg_length) > 0 ? n(editing.avg_length) : 6.0;
    if (value === "") {
      setEditHtcMtr("");
    } else {
      setEditHtcMtr(String(mtrFromPcs(n(value), avg).toFixed(3).replace(/\.?0+$/, "")));
    }
  }

  function changeEditHtcMtr(value: string) {
    setEditHtcMtr(value);
    const avg = editing && n(editing.avg_length) > 0 ? n(editing.avg_length) : 6.0;
    if (value === "") {
      setEditHtcPcs("");
    } else {
      setEditHtcPcs(String(pcsFromMtr(n(value), avg).toFixed(3).replace(/\.?0+$/, "")));
    }
  }

  async function updateEntry() {
    if (!editing) return;
    setEditSaving(true);
    setError("");
    setMessage("");

    const mtr = n(editMtr);
    const rejection = n(editRejectionMtr);
    const htc = n(editHtcMtr);

    if (!editDate) {
      setError("Production date is required.");
      setEditSaving(false);
      return;
    }
    if (mtr <= 0) {
      setError("Production quantity (PCS / MTR) must be greater than zero.");
      setEditSaving(false);
      return;
    }
    if (rejection < 0 || rejection > mtr) {
      setError("Rejection cannot exceed production quantity.");
      setEditSaving(false);
      return;
    }
    // Heat Lot No is optional / can be null
    if (editing.stage_code === "ROLLING" && htc > mtr - rejection) {
      setError("HTC OK cannot exceed Net Rolling output (Production - Rejection).");
      setEditSaving(false);
      return;
    }
    if (editing.stage_code !== "ROLLING" && htc !== 0) {
      setError("HTC OK can only be entered at Rolling.");
      setEditSaving(false);
      return;
    }

    try {
      const { error: rpcError } = await supabase.rpc("update_production_entry", {
        p_production_id: editing.id,
        p_process_date: editDate,
        p_output_qty: mtr,
        p_rejection_qty: rejection,
        p_htc_ok: editing.stage_code === "ROLLING" ? htc : 0,
        p_heat_lot_no: editHeatLot.trim() || null,
        p_remarks: editRemarks.trim() || null,
      });
      if (rpcError) throw rpcError;

      setMessage("Production entry updated successfully.");
      setEditing(null);
      await Promise.all([reloadQueue(), reloadHistory()]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update.");
    } finally {
      setEditSaving(false);
    }
  }

  // --- Delete handler ---
  async function deleteEntry() {
    if (!deleteId) return;
    setDeleteBusy(true);
    setError("");
    setMessage("");

    try {
      const { error: rpcError } = await supabase.rpc("delete_production_entry", {
        p_production_id: deleteId,
      });
      if (rpcError) throw rpcError;

      setDeleteId(null);
      setMessage("Production entry deleted successfully.");
      await Promise.all([reloadQueue(), reloadHistory()]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete.");
    } finally {
      setDeleteBusy(false);
    }
  }

  // --- Helper to get formula text ---
  function getMaximumFormula(row: Row) {
    const route = row.route_code || "HFS";
    if (stage === "ROLLING") {
      return "Plan × 110% (Nos / MTR)";
    }
    if (stage === "HOLLOW_HEAT_TREATMENT") {
      return "Rolling HTC OK Nos";
    }
    if (stage === "DRAW") {
      if (route === "ALLOY_CDS") {
        return "Hollow Heat Treatment Nos";
      }
      return "Rolling HTC OK Nos";
    }
    if (stage === "HEAT_TREATMENT") {
      return "Draw Bench Nos";
    }
    if (stage === "FINISHING") {
      if (route === "HFS") {
        return "min(HTC OK Nos × Mult, Balance to make)";
      }
      if (route === "ALLOY_HFS") {
        return "min(Hollow HT Nos × Mult, Balance to make)";
      }
      return "min(Heat Treatment Nos × Mult, Balance to make)";
    }
    return "Previous Stage Output";
  }

  return (
    <div className="space-y-5">
      {/* Top Header & Stage Selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Production Entry & WIP Tracking</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-slate-300 bg-white p-0.5 shadow-xs">
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as StageCode)}
              className="rounded-md border-0 bg-transparent px-3 py-1.5 text-xs font-bold text-slate-900 focus:ring-0 cursor-pointer"
            >
              {STAGES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => Promise.all([reloadQueue(), reloadHistory()])}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50"
          >
            <RefreshCw size={13} className={queueLoading || historyLoading ? "animate-spin text-blue-600" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800 shadow-sm">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          {message}
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800 shadow-sm">
          <AlertTriangle size={16} className="mt-0.5 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Work Centers WIP Overview Banner */}
      <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3">
          <div className="flex items-center gap-2">
            <Factory className="h-4 w-4 text-blue-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Work Center WIP Availability Summary
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowWipSummary(!showWipSummary)}
            className="text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            {showWipSummary ? "Hide Overview" : "Show Overview"}
          </button>
        </div>

        {showWipSummary && (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5 bg-slate-50/30">
            {workCenterSummary.map((wc) => {
              const isSelected = wc.stage_code === stage;
              return (
                <div
                  key={wc.stage_code}
                  onClick={() => setStage(wc.stage_code)}
                  className={`cursor-pointer rounded-lg border p-3 transition-all ${
                    isSelected
                      ? "border-blue-500 bg-blue-50/50 shadow-sm ring-1 ring-blue-500"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-700 truncate">{wc.label}</span>
                    {isSelected && (
                      <span className="rounded-full bg-blue-600 px-1.5 py-0.2 text-[9px] font-bold text-white">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-base font-bold font-mono text-slate-900">
                      {fmt(wc.availPcs)}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500">PCS</span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                    {fmt(wc.availMtr, " MTR")} · <span className="text-blue-700 font-semibold">{fmt(wc.availMt, " MT")}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Production Date & Entry Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              Shift Process Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-800 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="border-l border-slate-200 pl-3">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              Queue Work Orders
            </span>
            <span className="mt-1 inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-800">
              {rows.length} Orders with WIP
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleAllRows}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            <Layers size={13} className="text-slate-500" />
            {rows.every((r) => expandedRows[`${r.work_order_id}|${r.route_id}`])
              ? "Collapse All WIP Flows"
              : "Expand All WIP Flows"}
          </button>
        </div>
      </div>

      {/* Queue Entry Grid Table */}
      <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-900">
            {STAGES.find((x) => x.code === stage)?.label || stage} Queue
          </h2>
        </div>

        {queueLoading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading work order production queue...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No WIP available in queue for {STAGES.find((x) => x.code === stage)?.label}. Record production in preceding stages first.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="border-b border-slate-200 bg-slate-100/70 text-slate-700">
                <tr>
                  <th className="py-2.5 px-3 text-left font-semibold">Work Order & Specs</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Route</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Available WIP & Capping</th>
                  <th className="py-2.5 px-3 text-center font-semibold bg-blue-50/50">Production *</th>
                  <th className="py-2.5 px-3 text-center font-semibold bg-rose-50/40">Rejection</th>
                  {stage === "ROLLING" && (
                    <th className="py-2.5 px-3 text-center font-semibold bg-emerald-50/40">HTC OK</th>
                  )}
                  {(stage === "HEAT_TREATMENT" || stage === "HOLLOW_HEAT_TREATMENT") && (
                    <th className="py-2.5 px-3 text-left font-semibold">Heat Lot No.</th>
                  )}
                  <th className="py-2.5 px-3 text-left font-semibold">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const key = `${r.work_order_id}|${r.route_id}`;
                  const isExpanded = !!expandedRows[key];
                  const d = calc(r);
                  const maxAllowed =
                    n(r.max_allowed_mtr) > 0 ? n(r.max_allowed_mtr) : n(r.balance_to_make_mtr);
                  const maxAllowedPcs =
                    n(r.max_allowed_pcs) > 0
                      ? n(r.max_allowed_pcs)
                      : d.avg > 0
                      ? maxAllowed / d.avg
                      : 0;

                  return (
                    <tr key={key} className="hover:bg-slate-50/50 transition-colors group">
                      {/* Work Order Info */}
                      <td className="py-3 px-3 align-top">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{r.work_order_no}</span>
                          <button
                            type="button"
                            onClick={() => toggleRowExpansion(key)}
                            title="Toggle Work Center WIP Pipeline"
                            className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold border transition-colors ${
                              isExpanded
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
                            }`}
                          >
                            <Layers size={10} />
                            WIP Flow
                            {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                          </button>
                        </div>
                        <div className="text-[11px] text-slate-600 mt-0.5 truncate max-w-[170px]">
                          {r.customer_name || "—"}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          {r.od ? `${r.od} × ${r.wl ?? "—"} mm` : "—"} · Avg: {fmt(d.avg, "m")}
                        </div>
                        {stage === "ROLLING" && r.mh_od && (
                          <div className="text-[10px] text-indigo-700 font-mono bg-indigo-50/80 rounded px-1 py-0.2 mt-0.5 inline-block">
                            MH: {r.mh_od} × {r.mh_wt} mm ({fmt(r.mh_avg_length, "m")})
                          </div>
                        )}
                      </td>

                      {/* Route */}
                      <td className="py-3 px-3 align-top">
                        <span className="inline-flex rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-800">
                          {r.route_code}
                        </span>
                        <div className="text-[10px] text-slate-500 mt-1">
                          Mult: ×{fmt(r.multiple || 1)}
                        </div>
                      </td>

                      {/* Available WIP & Capping */}
                      <td className="py-3 px-3 align-top">
                        <div className="flex items-baseline gap-1 flex-wrap">
                          <span className="font-bold text-slate-900 font-mono text-xs">
                            {fmt(maxAllowedPcs)}
                          </span>
                          <span className="text-[10px] font-bold text-slate-500">PCS</span>
                          <span className="text-slate-400">/</span>
                          <span className="font-semibold text-slate-700 font-mono text-xs">
                            {fmt(maxAllowed, " MTR")}
                          </span>
                          <span className="text-slate-400">/</span>
                          <span className="font-semibold text-blue-700 font-mono text-[11px]">
                            {fmt(
                              mtFromMtr(
                                maxAllowed,
                                stage === "ROLLING" && r.mh_od ? r.mh_od : (r.od || 0),
                                stage === "ROLLING" && r.mh_wt ? r.mh_wt : (r.wl || 0)
                              ),
                              " MT"
                            )}
                          </span>
                        </div>
                      </td>

                      {/* Production Inputs (PCS & MTR) */}
                      <td className="py-3 px-3 align-top bg-blue-50/20">
                        <div className="flex items-center gap-1.5 justify-center">
                          <div className="flex flex-col">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="PCS"
                              value={r.pcs}
                              onChange={(e) => updateRow(key, "pcs", e.target.value)}
                              className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-right font-mono text-xs font-bold text-slate-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            />
                            <span className="text-[9px] text-center font-semibold text-slate-400 mt-0.5">PCS</span>
                          </div>
                          <span className="text-slate-400 font-bold mb-3">=</span>
                          <div className="flex flex-col">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="MTR"
                              value={r.mtr}
                              onChange={(e) => updateRow(key, "mtr", e.target.value)}
                              className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-right font-mono text-xs font-bold text-slate-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            />
                            <span className="text-[9px] text-center font-semibold text-slate-400 mt-0.5">
                              {d.mt > 0 ? fmt(d.mt, " MT") : "MTR"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Rejection Inputs (PCS & MTR) */}
                      <td className="py-3 px-3 align-top bg-rose-50/20">
                        <div className="flex items-center gap-1.5 justify-center">
                          <div className="flex flex-col">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="PCS"
                              value={r.rejection_pcs}
                              onChange={(e) => updateRow(key, "rejection_pcs", e.target.value)}
                              className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-right font-mono text-xs text-rose-700 shadow-sm focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                            />
                            <span className="text-[9px] text-center font-semibold text-slate-400 mt-0.5">PCS</span>
                          </div>
                          <span className="text-slate-400 font-bold mb-3">=</span>
                          <div className="flex flex-col">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="MTR"
                              value={r.rejection_mtr}
                              onChange={(e) => updateRow(key, "rejection_mtr", e.target.value)}
                              className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-right font-mono text-xs text-rose-700 shadow-sm focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                            />
                            <span className="text-[9px] text-center font-semibold text-slate-400 mt-0.5">
                              {d.rejectionMt > 0 ? fmt(d.rejectionMt, " MT") : "MTR"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* HTC OK Inputs (Rolling Stage only) */}
                      {stage === "ROLLING" && (
                        <td className="py-3 px-3 align-top bg-emerald-50/20">
                          <div className="flex items-center gap-1.5 justify-center">
                            <div className="flex flex-col">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                placeholder="PCS"
                                value={r.htc_ok_pcs}
                                onChange={(e) => updateRow(key, "htc_ok_pcs", e.target.value)}
                                className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-right font-mono text-xs font-bold text-emerald-700 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                              />
                              <span className="text-[9px] text-center font-semibold text-slate-400 mt-0.5">PCS</span>
                            </div>
                            <span className="text-slate-400 font-bold mb-3">=</span>
                            <div className="flex flex-col">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                placeholder="MTR"
                                value={r.htc_ok_mtr}
                                onChange={(e) => updateRow(key, "htc_ok_mtr", e.target.value)}
                                className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-right font-mono text-xs font-bold text-emerald-700 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                              />
                              <span className="text-[9px] text-center font-semibold text-slate-400 mt-0.5">
                                {d.htcMt > 0 ? fmt(d.htcMt, " MT") : "MTR"}
                              </span>
                            </div>
                          </div>
                        </td>
                      )}

                      {/* Heat Lot No. (Heat Treatment only) */}
                      {(stage === "HEAT_TREATMENT" || stage === "HOLLOW_HEAT_TREATMENT") && (
                        <td className="py-3 px-3 align-top">
                          <input
                            type="text"
                            placeholder="e.g. HT-8842"
                            value={r.heat_lot_no}
                            onChange={(e) => updateRow(key, "heat_lot_no", e.target.value)}
                            className="w-28 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                      )}

                      {/* Remarks */}
                      <td className="py-3 px-3 align-top">
                        <input
                          type="text"
                          placeholder="Shift notes..."
                          value={r.remarks}
                          onChange={(e) => updateRow(key, "remarks", e.target.value)}
                          className="w-36 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Expandable Work Center WIP Breakdown Pipeline for expanded rows */}
        {rows.some((r) => expandedRows[`${r.work_order_id}|${r.route_id}`]) && (
          <div className="border-t border-slate-200 bg-slate-50/50 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-blue-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Work Center WIP Breakdown Across Full Process Route
              </h3>
            </div>

            {rows
              .filter((r) => expandedRows[`${r.work_order_id}|${r.route_id}`])
              .map((r) => {
                const key = `${r.work_order_id}|${r.route_id}`;
                return (
                  <div key={key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{r.work_order_no}</span>
                        <span className="text-xs text-slate-500 font-mono">({r.customer_name || "Direct"})</span>
                        <span className="rounded bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                          Route: {r.route_code}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleRowExpansion(key)}
                        className="text-xs font-semibold text-slate-500 hover:text-slate-900"
                      >
                        Close Breakdown
                      </button>
                    </div>

                    {/* Flow steps */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      {r.work_centers_wip?.map((w, idx) => {
                        const isCurrent = w.stage_code === stage;
                        const isRoll = w.stage_code === "ROLLING";
                        const stageOd = isRoll && r.mh_od ? Number(r.mh_od) : Number(r.od || 0);
                        const stageWt = isRoll && r.mh_wt ? Number(r.mh_wt) : Number(r.wl || 0);

                        const availMt = w.available_mt ?? mtFromMtr(w.available_mtr, stageOd, stageWt);
                        const grossMt = w.gross_output_mt ?? mtFromMtr(w.gross_output_mtr, stageOd, stageWt);
                        const rejMt = w.rejection_mt ?? mtFromMtr(w.rejection_mtr, stageOd, stageWt);
                        const netMt = w.net_output_mt ?? mtFromMtr(w.net_output_mtr, stageOd, stageWt);
                        const htcMt = w.htc_ok_mt ?? mtFromMtr(w.htc_ok_mtr || 0, stageOd, stageWt);

                        return (
                          <div
                            key={w.stage_code}
                            className={`rounded-lg border p-3 space-y-2 relative transition-all ${
                              isCurrent
                                ? "border-blue-500 bg-blue-50/40 ring-1 ring-blue-500 shadow-sm"
                                : "border-slate-200 bg-slate-50/30"
                            }`}
                          >
                            <div className="flex items-center justify-between border-b border-slate-200/60 pb-1.5">
                              <span className="text-[11px] font-bold text-slate-800">
                                {idx + 1}. {w.stage_name}
                              </span>
                              {isCurrent && (
                                <span className="rounded-full bg-blue-600 px-1.5 py-0.2 text-[9px] font-bold text-white">
                                  Current
                                </span>
                              )}
                            </div>

                            <div className="space-y-1 text-xs">
                              <div className="flex justify-between items-baseline">
                                <span className="text-slate-500 text-[11px]">Available WIP:</span>
                                <span className="font-bold font-mono text-slate-900 text-[11px]">
                                  {fmt(w.available_pcs)} PCS ({fmt(w.available_mtr, "m")} · <span className="text-blue-700">{fmt(availMt, " MT")}</span>)
                                </span>
                              </div>
                              <div className="flex justify-between items-baseline">
                                <span className="text-slate-500 text-[11px]">Gross Output:</span>
                                <span className="font-semibold font-mono text-slate-800 text-[11px]">
                                  {fmt(w.gross_output_pcs)} PCS ({fmt(w.gross_output_mtr, "m")} · <span className="text-slate-600">{fmt(grossMt, " MT")}</span>)
                                </span>
                              </div>
                              <div className="flex justify-between items-baseline">
                                <span className="text-slate-500 text-[11px]">Rejection:</span>
                                <span className="font-semibold font-mono text-rose-600 text-[11px]">
                                  {fmt(w.rejection_pcs)} PCS ({fmt(w.rejection_mtr, "m")} · <span className="text-rose-600">{fmt(rejMt, " MT")}</span>)
                                </span>
                              </div>
                              <div className="flex justify-between items-baseline border-t border-slate-100 pt-1">
                                <span className="text-slate-700 font-semibold text-[11px]">Net Output:</span>
                                <span className="font-bold font-mono text-emerald-700 text-[11px]">
                                  {fmt(w.net_output_pcs)} PCS ({fmt(w.net_output_mtr, "m")} · <span className="text-emerald-700">{fmt(netMt, " MT")}</span>)
                                </span>
                              </div>
                              {w.stage_code === "ROLLING" && (
                                <div className="flex justify-between items-baseline border-t border-slate-100 pt-1">
                                  <span className="text-indigo-700 font-semibold text-[11px]">HTC OK:</span>
                                  <span className="font-bold font-mono text-indigo-700 text-[11px]">
                                    {fmt(w.htc_ok_pcs)} PCS ({fmt(w.htc_ok_mtr, "m")} · <span className="text-indigo-700">{fmt(htcMt, " MT")}</span>)
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {/* Batch Save Action Footer */}
        <div className="flex items-center justify-end border-t border-slate-200 bg-slate-50/80 p-3 sm:p-4">
          <button
            type="button"
            disabled={saving || queueLoading}
            onClick={save}
            className="rounded-lg bg-slate-900 px-6 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Production History Table */}
      <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 p-4 bg-slate-50/70">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search size={15} className="text-slate-500" />
              <h2 className="text-sm font-bold text-slate-900">Production History</h2>
            </div>
            <span className="text-xs font-semibold text-slate-500 font-mono">
              {entries.length} Logged Record{entries.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-5 text-xs">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search WO, customer, grade..."
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <select
              value={entryStage}
              onChange={(e) => setEntryStage(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Stages</option>
              {STAGES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              value={entryRoute}
              onChange={(e) => setEntryRoute(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Routes</option>
              {routes.map((route) => (
                <option key={route} value={route}>
                  {route}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {historyLoading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading production history...</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">No production entries match the criteria.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="border-b border-slate-200 bg-slate-100/70 text-slate-700">
                <tr>
                  <th className="py-2.5 px-3 text-left font-semibold">Date</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Work Order</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Route & Stage</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Production (PCS & MTR)</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Rejection (PCS & MTR)</th>
                  <th className="py-2.5 px-3 text-right font-semibold">HTC OK</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Heat Lot</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Remarks</th>
                  <th className="py-2.5 px-3 text-center font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-slate-700">{entry.process_date}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      {entry.work_order_no}
                      <div className="text-[10px] font-normal text-slate-500 truncate max-w-[130px]">
                        {entry.customer_name || "—"}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-800">
                        {entry.route_code}
                      </span>
                      <div className="text-[11px] text-slate-600 font-medium mt-0.5">
                        {STAGES.find((s) => s.code === entry.stage_code)?.label || entry.stage_code}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      <div className="font-bold text-slate-900">{fmt(entry.output_pcs)} PCS</div>
                      <div className="text-[10px] text-slate-500">{fmt(entry.output_mtr, " MTR")}</div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      <div className="font-bold text-rose-600">{fmt(entry.rejection_pcs)} PCS</div>
                      <div className="text-[10px] text-slate-500">{fmt(entry.rejection_mtr, " MTR")}</div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                      {entry.htc_ok_mtr > 0 ? (
                        <>
                          <div className="font-bold">{fmt(entry.htc_ok_pcs)} PCS</div>
                          <div className="text-[10px] text-slate-500">{fmt(entry.htc_ok_mtr, " MTR")}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-800">{entry.heat_lot_no || "—"}</td>
                    <td className="py-2.5 px-3 text-slate-600 max-w-[180px] truncate">{entry.remarks || "—"}</td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          disabled={!entry.can_modify}
                          onClick={() => openEdit(entry)}
                          title={
                            entry.can_modify
                              ? "Edit Entry"
                              : "Locked: subsequent production logs exist for this order"
                          }
                          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Edit2 size={12} /> Edit
                        </button>
                        <button
                          type="button"
                          disabled={!entry.can_modify}
                          onClick={() => setDeleteId(entry.id)}
                          title={
                            entry.can_modify
                              ? "Delete Entry"
                              : "Locked: subsequent production logs exist for this order"
                          }
                          className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Entry Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Edit Production Record</h2>
                <p className="text-xs text-slate-500">
                  {editing.work_order_no} · {editing.route_code} ·{" "}
                  {STAGES.find((s) => s.code === editing.stage_code)?.label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 p-6 sm:grid-cols-2 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Process Date *</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Production (PCS & MTR) *</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="PCS"
                    value={editPcs}
                    onChange={(e) => changeEditPcs(e.target.value)}
                    className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs font-bold"
                  />
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="MTR"
                    value={editMtr}
                    onChange={(e) => changeEditMtr(e.target.value)}
                    className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Rejection (PCS & MTR)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="PCS"
                    value={editRejectionPcs}
                    onChange={(e) => changeEditRejectionPcs(e.target.value)}
                    className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-rose-700"
                  />
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="MTR"
                    value={editRejectionMtr}
                    onChange={(e) => changeEditRejectionMtr(e.target.value)}
                    className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-rose-700"
                  />
                </div>
              </div>

              {editing.stage_code === "ROLLING" && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">HTC OK (PCS & MTR)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="PCS"
                      value={editHtcPcs}
                      onChange={(e) => changeEditHtcPcs(e.target.value)}
                      className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-emerald-700 font-bold"
                    />
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="MTR"
                      value={editHtcMtr}
                      onChange={(e) => changeEditHtcMtr(e.target.value)}
                      className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-emerald-700 font-bold"
                    />
                  </div>
                </div>
              )}

              {(editing.stage_code === "HEAT_TREATMENT" || editing.stage_code === "HOLLOW_HEAT_TREATMENT") && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Heat Lot No.</label>
                  <input
                    type="text"
                    placeholder="Optional (e.g. HT-8842)"
                    value={editHeatLot}
                    onChange={(e) => setEditHeatLot(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium"
                  />
                </div>
              )}

              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Remarks</label>
                <input
                  type="text"
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={editSaving}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={updateEntry}
                disabled={editSaving}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow hover:bg-slate-800 disabled:opacity-50"
              >
                {editSaving ? "Saving..." : "Update Production Entry"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-rose-100 p-2.5 text-rose-600">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Production Entry</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Are you sure you want to delete this entry? WIP balances will be recalculated immediately.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setDeleteId(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={deleteEntry}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-rose-700 disabled:opacity-50"
              >
                {deleteBusy ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
