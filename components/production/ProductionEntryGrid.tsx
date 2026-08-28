"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CheckCircle2,
  AlertTriangle,
  Flame,
  Layers,
  ArrowRight,
  Sparkles,
  Search,
  Filter,
  RefreshCw,
  Edit2,
  Trash2,
  CornerDownRight,
} from "lucide-react";

type StageCode = "ROLLING" | "HOLLOW_HEAT_TREATMENT" | "DRAW" | "HEAT_TREATMENT" | "FINISHING";

type Row = {
  work_order_id: string;
  work_order_no: string;
  customer_name: string | null;
  specification: string | null;
  od: number | null;
  wl: number | null;
  l1: number | null;
  l2: number | null;
  avg_length: number | null;
  route_id: string;
  route_code: string;
  route_name: string;
  stage_code: StageCode;
  balance_to_make_mtr: number | null;
  balance_to_make_pcs: number | null;
  balance_to_make_mt: number | null;
  multiple: number | null;
  pcs: string;
  mtr: string;
  rejection_mtr: string;
  htc_ok_mtr: string;
  heat_lot_no: string;
  remarks: string;
};

type ProductionEntry = {
  id: string;
  work_order_no: string;
  customer_name: string | null;
  route_code: string;
  stage_code: StageCode;
  process_date: string;
  od: number | null;
  wl: number | null;
  l1: number | null;
  l2: number | null;
  avg_length: number | null;
  input_mtr: number;
  input_pcs: number;
  input_mt: number;
  output_mtr: number;
  output_pcs: number;
  output_mt: number;
  rejection_mtr: number;
  rejection_pcs: number;
  rejection_mt: number;
  htc_ok_mtr: number;
  heat_lot_no: string | null;
  remarks: string | null;
  created_at: string;
  can_modify: boolean;
};

const STAGES: { code: StageCode; label: string; desc: string; icon: string }[] = [
  { code: "ROLLING", label: "Rolling", desc: "Hot mother tube rolling", icon: "1" },
  { code: "HOLLOW_HEAT_TREATMENT", label: "Hollow Heat Treatment", desc: "Pre-annealing & normalizing", icon: "2" },
  { code: "DRAW", label: "Draw", desc: "Cold drawing to finished dimensions", icon: "3" },
  { code: "HEAT_TREATMENT", label: "Heat Treatment", desc: "Final heat treatment & stress relief", icon: "4" },
  { code: "FINISHING", label: "Finishing", desc: "Straightening, NDT, cutting & inspection", icon: "5" },
];

function n(v: unknown): number {
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmt(v: unknown, suffix = ""): string {
  const val = n(v);
  if (val === 0 && suffix === "") return "0";
  if (val === 0) return `0${suffix}`;
  return `${Number(val.toFixed(3)).toLocaleString()}${suffix}`;
}

function mtrFromPcs(pcs: number, avgLength: number): number {
  if (pcs <= 0 || avgLength <= 0) return 0;
  return Number((pcs * avgLength).toFixed(3));
}

function mtFromMtr(mtr: number, od: number, wt: number): number {
  if (mtr <= 0 || od <= 0 || wt <= 0 || od <= wt) return 0;
  const weightPerMtr = (od - wt) * wt * 0.0246615;
  return Number(((mtr * weightPerMtr) / 1000).toFixed(3));
}

export default function ProductionEntryGrid() {
  const supabase = useMemo(() => createClient(), []);
  const [stage, setStage] = useState<StageCode>("ROLLING");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");

  const [entries, setEntries] = useState<ProductionEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");
  const [entryStage, setEntryStage] = useState<string>("");
  const [entryRoute, setEntryRoute] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const [editing, setEditing] = useState<ProductionEntry | null>(null);
  const [editPcs, setEditPcs] = useState<string>("");
  const [editMtr, setEditMtr] = useState<string>("");
  const [editDate, setEditDate] = useState<string>("");
  const [editRejection, setEditRejection] = useState<string>("0");
  const [editHtc, setEditHtc] = useState<string>("0");
  const [editHeatLot, setEditHeatLot] = useState<string>("");
  const [editRemarks, setEditRemarks] = useState<string>("");
  const [editSaving, setEditSaving] = useState<boolean>(false);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("get_production_entry_queue", {
      p_stage_code: stage,
    });
    if (rpcError) {
      setError(rpcError.message);
      setRows([]);
    } else {
      const formatted: Row[] = (data ?? []).map((r: any) => ({
        ...r,
        pcs: "",
        mtr: "",
        rejection_mtr: "0",
        htc_ok_mtr: "0",
        heat_lot_no: "",
        remarks: "",
      }));
      setRows(formatted);
    }
    setLoading(false);
  }, [stage, supabase]);

  const loadEntries = useCallback(async () => {
    setEntriesLoading(true);
    const { data, error: rpcError } = await supabase.rpc("get_production_entries", {
      p_search: search.trim() || null,
      p_stage_code: entryStage || null,
      p_route_code: entryRoute || null,
      p_from_date: fromDate || null,
      p_to_date: toDate || null,
      p_limit: 2000,
      p_offset: 0,
    });
    if (rpcError) {
      setError(rpcError.message);
      setEntries([]);
    } else {
      setEntries((data ?? []) as ProductionEntry[]);
    }
    setEntriesLoading(false);
  }, [search, entryStage, entryRoute, fromDate, toDate, supabase]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const routes = useMemo(
    () => Array.from(new Set(entries.map((e) => e.route_code))).sort(),
    [entries]
  );

  const updateRow = (
    key: string,
    field: keyof Pick<Row, "pcs" | "mtr" | "rejection_mtr" | "htc_ok_mtr" | "heat_lot_no" | "remarks">,
    value: string
  ) => {
    setRows((current) =>
      current.map((r) => {
        if (`${r.work_order_id}|${r.route_id}` !== key) return r;
        if (field === "pcs") {
          return { ...r, pcs: value, mtr: value === "" ? "" : String(mtrFromPcs(n(value), n(r.avg_length))) };
        }
        return { ...r, [field]: value };
      })
    );
  };

  const calc = (r: Row) => {
    const avg = n(r.avg_length);
    const pcs = n(r.pcs);
    const calculatedMtr = mtrFromPcs(pcs, avg);
    const mtr = r.mtr.trim() === "" ? calculatedMtr : n(r.mtr);
    const mt = mtFromMtr(mtr, n(r.od), n(r.wl));
    return { avg, pcs, calculatedMtr, mtr, mt };
  };

  // Keyboard shortcut: Press Enter to save production when valid
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void save();
    }
  };

  async function save() {
    setMessage("");
    setError("");
    const selected = rows.filter((r) => n(r.mtr) > 0 || n(r.pcs) > 0);
    if (!selected.length) {
      setError("Enter Production PCS or MTR for at least one row.");
      return;
    }

    for (const r of selected) {
      const d = calc(r);
      const balance = n(r.balance_to_make_mtr);
      const allowed = stage === "ROLLING" ? balance * 1.1 : balance;
      const rejection = n(r.rejection_mtr);
      const htc = n(r.htc_ok_mtr);

      if (d.avg <= 0) return setError(`${r.work_order_no}: L1/L2 is missing, so MTR cannot be calculated.`);
      if (d.mtr <= 0) return setError(`${r.work_order_no}: enter valid Production PCS/MTR.`);
      if (balance <= 0) return setError(`${r.work_order_no}: Balance to Make MTR is unavailable.`);
      if (d.mtr > allowed + 0.000001)
        return setError(`${r.work_order_no}: ${fmt(d.mtr, " MTR")} exceeds allowed ${fmt(allowed, " MTR")}.`);
      if (rejection < 0 || rejection > d.mtr)
        return setError(`${r.work_order_no}: rejection MTR is invalid.`);
      if (stage !== "ROLLING" && htc !== 0)
        return setError("HTC OK can only be entered at Rolling.");
      if (stage === "ROLLING" && htc > d.mtr - rejection)
        return setError(`${r.work_order_no}: HTC OK cannot exceed net production MTR.`);
    }

    setSaving(true);
    try {
      for (const r of selected) {
        const d = calc(r);
        const { error: rpcError } = await supabase.rpc("record_production", {
          p_work_order_id: r.work_order_id,
          p_route_id: r.route_id,
          p_stage_code: r.stage_code,
          p_process_date: date,
          p_input_qty: d.mtr,
          p_output_qty: d.mtr,
          p_rejection_qty: n(r.rejection_mtr),
          p_htc_ok: stage === "ROLLING" ? n(r.htc_ok_mtr) : 0,
          p_heat_lot_no: r.heat_lot_no.trim() || null,
          p_remarks: r.remarks.trim() || null,
        });
        if (rpcError) throw new Error(rpcError.message);
      }
      setMessage(`${selected.length} production row(s) saved successfully.`);
      await Promise.all([loadQueue(), loadEntries()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Production entry failed.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(entry: ProductionEntry) {
    setError("");
    setMessage("");
    setEditing(entry);
    setEditPcs(String(entry.input_pcs ?? ""));
    setEditMtr(String(entry.input_mtr ?? ""));
    setEditDate(entry.process_date);
    setEditRejection(String(entry.rejection_mtr ?? 0));
    setEditHtc(String(entry.htc_ok_mtr ?? 0));
    setEditHeatLot(entry.heat_lot_no ?? "");
    setEditRemarks(entry.remarks ?? "");
  }

  async function saveEdit() {
    if (!editing) return;
    const avg = n(editing.avg_length);
    const pcs = n(editPcs);
    const calculatedMtr = mtrFromPcs(pcs, avg);
    const mtr = n(editMtr);
    const rejection = n(editRejection);
    const htc = n(editHtc);

    if (avg <= 0 || pcs <= 0) {
      setError("Corrected PCS must be positive and L1/L2 must be available.");
      return;
    }
    if (mtr <= 0) {
      setError("Corrected Production MTR must be positive.");
      return;
    }
    if (calculatedMtr <= 0) {
      setError("Production MTR could not be calculated from PCS.");
      return;
    }
    if (rejection < 0 || rejection > mtr) {
      setError("Rejection MTR must be between 0 and corrected production MTR.");
      return;
    }
    if (editing.stage_code !== "ROLLING" && htc !== 0) {
      setError("HTC OK can only be entered at Rolling.");
      return;
    }
    if (editing.stage_code === "ROLLING" && htc > mtr - rejection) {
      setError("HTC OK cannot exceed net production MTR.");
      return;
    }

    setEditSaving(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc("update_production_entry", {
        p_production_id: editing.id,
        p_process_date: editDate,
        p_output_qty: mtr,
        p_rejection_qty: rejection,
        p_htc_ok: htc,
        p_heat_lot_no: editHeatLot.trim() || null,
        p_remarks: editRemarks.trim() || null,
      });
      if (rpcError) throw new Error(rpcError.message);
      setEditing(null);
      setMessage("Production entry updated successfully.");
      await Promise.all([loadQueue(), loadEntries()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setEditSaving(false);
    }
  }

  async function removeEntry(entry: ProductionEntry) {
    const ok = window.confirm(
      `Delete production entry?\n\nWO: ${entry.work_order_no}\nRoute: ${entry.route_code}\nStage: ${entry.stage_code}\nDate: ${entry.process_date}\nQty: ${fmt(entry.input_mtr, " MTR")}`
    );
    if (!ok) return;

    setError("");
    setMessage("");
    const { error: rpcError } = await supabase.rpc("delete_production_entry", {
      p_production_id: entry.id,
    });
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setMessage("Production entry deleted successfully.");
    await Promise.all([loadQueue(), loadEntries()]);
  }

  const currentStageInfo = STAGES.find((s) => s.code === stage);

  return (
    <div className="space-y-6" onKeyDown={handleKeyDown}>
      {/* 1. Visual Stage Routing & Progress Stepper */}
      <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Shop-Floor Stage Selection</span>
            <h2 className="text-lg font-bold text-slate-900">Current Work Center Routing</h2>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600">Production Date:</label>
            <input
              type="date"
              className="h-8.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium shadow-xs focus:border-slate-800"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        {/* Interactive Stage Stepper */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {STAGES.map((s, idx) => {
            const isSelected = s.code === stage;
            return (
              <button
                key={s.code}
                type="button"
                onClick={() => setStage(s.code)}
                className={`flex flex-col text-left p-3 rounded-xl border transition-all ${
                  isSelected
                    ? "border-slate-900 bg-slate-900 text-white shadow-md ring-2 ring-slate-900/10"
                    : "border-slate-200/80 bg-slate-50/60 hover:bg-slate-100 hover:border-slate-300 text-slate-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${
                      isSelected ? "bg-white text-slate-900" : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {idx + 1}
                  </span>
                  {isSelected && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                      ● Active
                    </span>
                  )}
                </div>
                <div className="mt-2 font-bold text-sm truncate">{s.label}</div>
                <div className={`text-[11px] truncate mt-0.5 ${isSelected ? "text-slate-300" : "text-slate-500"}`}>
                  {s.desc}
                </div>
              </button>
            );
          })}
        </div>

        {stage === "ROLLING" && (
          <div className="mt-3 flex items-center justify-end">
            <span className="font-semibold text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
              Rolling Tolerance: up to 110% of Planned MTR
            </span>
          </div>
        )}
      </section>

      {/* Messages */}
      {(message || error) && (
        <div
          className={`flex items-center gap-2 rounded-xl border p-3.5 text-sm ${
            error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {error ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
          <div className="flex-1 font-medium">{error || message}</div>
        </div>
      )}

      {/* 2. Production Entry Grid with Shortcut Hint */}
      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 bg-slate-50/50">
          <div>
            <h2 className="font-bold text-slate-900 text-base">Production Entry Queue — {currentStageInfo?.label}</h2>
            <p className="text-xs text-slate-500">
              Orders awaiting processing at {currentStageInfo?.label}. Press <kbd className="bg-white border px-1.5 py-0.5 rounded font-mono text-[11px]">Ctrl+Enter</kbd> to save.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadQueue()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh Queue
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1900px] w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                {[
                  "S.No.",
                  "Work Order",
                  "Customer",
                  "Specification",
                  "OD (mm)",
                  "WT (mm)",
                  "L1 (m)",
                  "L2 (m)",
                  "Avg L (m)",
                  "Route",
                  "Balance MTR",
                  "Balance PCS",
                  "Balance MT",
                  "Prod PCS",
                  "Prod MTR",
                  "Prod MT",
                  "Rejection MTR",
                  ...(stage === "ROLLING" ? ["HTC OK MTR"] : []),
                  "Heat / Lot No.",
                  "Remarks",
                ].map((h) => (
                  <th key={h} className="py-2.5 px-3 text-left font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={20} className="p-8 text-center text-slate-400">
                    Loading stage queue…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={20} className="p-8 text-center text-slate-500">
                    No pending orders for {currentStageInfo?.label}. Check preceding stages or create a new rolling plan.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => {
                  const key = `${r.work_order_id}|${r.route_id}`;
                  const d = calc(r);
                  const allowed = stage === "ROLLING" ? n(r.balance_to_make_mtr) * 1.1 : n(r.balance_to_make_mtr);
                  const isFilled = n(r.pcs) > 0 || n(r.mtr) > 0;
                  const rejectionRate = d.mtr > 0 ? (n(r.rejection_mtr) / d.mtr) * 100 : 0;

                  return (
                    <tr
                      key={key}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isFilled ? "bg-blue-50/30" : ""
                      }`}
                    >
                      <td className="py-2 px-3 font-medium text-slate-500">{i + 1}</td>
                      <td className="py-2 px-3 font-bold text-slate-900">{r.work_order_no}</td>
                      <td className="py-2 px-3 text-slate-700 max-w-[140px] truncate">{r.customer_name || "—"}</td>
                      <td className="py-2 px-3 text-slate-600 max-w-[150px] truncate">{r.specification || "—"}</td>
                      <td className="py-2 px-3 font-mono">{fmt(r.od)}</td>
                      <td className="py-2 px-3 font-mono">{fmt(r.wl)}</td>
                      <td className="py-2 px-3 font-mono">{fmt(r.l1)}</td>
                      <td className="py-2 px-3 font-mono">{fmt(r.l2)}</td>
                      <td className="py-2 px-3 font-mono text-slate-600">{fmt(r.avg_length, " m")}</td>
                      <td className="py-2 px-3">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                          {r.route_code}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-slate-900">
                        {fmt(r.balance_to_make_mtr, " MTR")}
                        <div className="text-[10px] text-slate-400 font-normal">Max: {fmt(allowed)}</div>
                      </td>
                      <td className="py-2 px-3 text-right text-slate-600 font-mono">{fmt(r.balance_to_make_pcs)}</td>
                      <td className="py-2 px-3 text-right text-slate-600 font-mono">{fmt(r.balance_to_make_mt, " MT")}</td>
                      
                      {/* Inputs */}
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          className="h-8 w-28 rounded border border-slate-300 px-2 text-right font-medium focus:border-slate-800 focus:ring-1 focus:ring-slate-800"
                          placeholder="0"
                          value={r.pcs}
                          onChange={(e) => updateRow(key, "pcs", e.target.value)}
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          className="h-8 w-28 rounded border border-slate-300 px-2 text-right font-medium focus:border-slate-800 focus:ring-1 focus:ring-slate-800"
                          placeholder="Calc / MTR"
                          value={r.mtr}
                          onChange={(e) => updateRow(key, "mtr", e.target.value)}
                        />
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-slate-900 font-mono">
                        {d.mt > 0 ? fmt(d.mt, " MT") : "—"}
                      </td>
                      <td className="py-1.5 px-2">
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            className={`h-8 w-24 rounded border px-2 text-right font-medium focus:border-slate-800 ${
                              rejectionRate > 5 ? "border-amber-400 bg-amber-50 text-amber-900" : "border-slate-300"
                            }`}
                            value={r.rejection_mtr}
                            onChange={(e) => updateRow(key, "rejection_mtr", e.target.value)}
                          />
                          {rejectionRate > 5 && (
                            <span className="absolute -top-2 right-1 rounded bg-amber-500 px-1 text-[9px] font-bold text-white">
                              {rejectionRate.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </td>
                      {stage === "ROLLING" && (
                        <td className="py-1.5 px-2">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            className="h-8 w-24 rounded border border-slate-300 px-2 text-right font-medium focus:border-slate-800"
                            value={r.htc_ok_mtr}
                            onChange={(e) => updateRow(key, "htc_ok_mtr", e.target.value)}
                          />
                        </td>
                      )}
                      <td className="py-1.5 px-2">
                        <input
                          className="h-8 w-36 rounded border border-slate-300 px-2 text-xs"
                          placeholder="Heat / Lot #"
                          value={r.heat_lot_no}
                          onChange={(e) => updateRow(key, "heat_lot_no", e.target.value)}
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          className="h-8 w-44 rounded border border-slate-300 px-2 text-xs"
                          placeholder="Remarks"
                          value={r.remarks}
                          onChange={(e) => updateRow(key, "remarks", e.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-100 p-4 bg-slate-50/50">
          <div className="text-xs text-slate-500">
            {rows.filter((r) => n(r.mtr) > 0 || n(r.pcs) > 0).length} row(s) ready to submit
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || loading || rows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving Production…" : "Save Production Entries"}
          </button>
        </div>
      </section>

      {/* 3. All Logged Entries History with Search and Modification Actions */}
      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900 text-base">Historical Production Logs</h2>
              <p className="text-xs text-slate-500">
                Audited records of completed production. Edit and delete operations are permitted for the latest active entry.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadEntries()}
              disabled={entriesLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${entriesLoading ? "animate-spin" : ""}`} /> Refresh History
            </button>
          </div>

          <div className="mt-3.5 grid gap-2.5 md:grid-cols-2 lg:grid-cols-5">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                className="h-9 w-full rounded-lg border border-slate-300 pl-8 pr-3 text-xs focus:border-slate-800"
                placeholder="Search WO / customer / heat #"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs focus:border-slate-800"
              value={entryStage}
              onChange={(e) => setEntryStage(e.target.value)}
            >
              <option value="">All Work Centers</option>
              {STAGES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs focus:border-slate-800"
              value={entryRoute}
              onChange={(e) => setEntryRoute(e.target.value)}
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
              className="h-9 rounded-lg border border-slate-300 px-3 text-xs focus:border-slate-800"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              title="From date"
            />
            <input
              type="date"
              className="h-9 rounded-lg border border-slate-300 px-3 text-xs focus:border-slate-800"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              title="To date"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1800px] w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                {[
                  "Date",
                  "Work Order",
                  "Customer",
                  "Route",
                  "Work Center",
                  "Input PCS",
                  "Input MTR",
                  "Input MT",
                  "Output PCS",
                  "Output MTR",
                  "Output MT",
                  "Rejection MTR",
                  "Rejection MT",
                  "HTC OK MTR",
                  "Heat / Lot No.",
                  "Remarks",
                  "Actions",
                ].map((h) => (
                  <th key={h} className="py-2.5 px-3 text-left font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entriesLoading ? (
                <tr>
                  <td colSpan={17} className="p-8 text-center text-slate-400">
                    Loading entries…
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={17} className="p-8 text-center text-slate-500">
                    No production entries found.
                  </td>
                </tr>
              ) : (
                entries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/50">
                    <td className="py-2 px-3 text-slate-600 font-mono">{e.process_date}</td>
                    <td className="py-2 px-3 font-bold text-slate-900">{e.work_order_no}</td>
                    <td className="py-2 px-3 text-slate-600 max-w-[140px] truncate">{e.customer_name || "—"}</td>
                    <td className="py-2 px-3 font-semibold text-slate-700">{e.route_code}</td>
                    <td className="py-2 px-3">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-800">
                        {e.stage_code}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono">{fmt(e.input_pcs)}</td>
                    <td className="py-2 px-3 text-right font-mono font-medium">{fmt(e.input_mtr)}</td>
                    <td className="py-2 px-3 text-right font-mono">{fmt(e.input_mt)}</td>
                    <td className="py-2 px-3 text-right font-mono">{fmt(e.output_pcs)}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">{fmt(e.output_mtr)}</td>
                    <td className="py-2 px-3 text-right font-mono font-semibold">{fmt(e.output_mt)}</td>
                    <td className="py-2 px-3 text-right font-mono text-rose-600 font-medium">{fmt(e.rejection_mtr)}</td>
                    <td className="py-2 px-3 text-right font-mono text-rose-600">{fmt(e.rejection_mt)}</td>
                    <td className="py-2 px-3 text-right font-mono text-slate-600">{fmt(e.htc_ok_mtr)}</td>
                    <td className="py-2 px-3 text-slate-700">{e.heat_lot_no || "—"}</td>
                    <td className="py-2 px-3 text-slate-500 max-w-[150px] truncate">{e.remarks || "—"}</td>
                    <td className="py-1.5 px-2">
                      {e.can_modify ? (
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => startEdit(e)}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Edit2 className="h-3 w-3" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeEntry(e)}
                            className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-100"
                          >
                            <Trash2 className="h-3 w-3" /> Delete
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">Locked (Downstream WIP exists)</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Edit Production Entry</h3>
                <p className="text-xs text-slate-500">
                  {editing.work_order_no} · Route {editing.route_code} · {editing.stage_code}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3.5 sm:grid-cols-2 text-xs">
              <label className="font-semibold text-slate-700">
                Production Date
                <input
                  type="date"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-xs font-normal focus:border-slate-800"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </label>
              <label className="font-semibold text-slate-700">
                Production PCS
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Enter PCS"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-xs font-normal focus:border-slate-800"
                  value={editPcs}
                  onChange={(e) => {
                    const value = e.target.value;
                    setEditPcs(value);
                    setEditMtr(value === "" ? "" : String(mtrFromPcs(n(value), n(editing.avg_length))));
                  }}
                />
              </label>
              <label className="font-semibold text-slate-700">
                Production MTR
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Auto-calculated (editable)"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-xs font-normal focus:border-slate-800"
                  value={editMtr}
                  onChange={(e) => setEditMtr(e.target.value)}
                />
              </label>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <div className="text-slate-500">Recalculated MT Weight</div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">
                  {fmt(mtFromMtr(n(editMtr), n(editing.od), n(editing.wl)), " MT")}
                </div>
              </div>
              <label className="font-semibold text-slate-700">
                Rejection Scrap (MTR)
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-xs font-normal focus:border-slate-800"
                  value={editRejection}
                  onChange={(e) => setEditRejection(e.target.value)}
                />
              </label>
              {editing.stage_code === "ROLLING" && (
                <label className="font-semibold text-slate-700">
                  HTC OK (MTR)
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-xs font-normal focus:border-slate-800"
                    value={editHtc}
                    onChange={(e) => setEditHtc(e.target.value)}
                  />
                </label>
              )}
              <label className="font-semibold text-slate-700">
                Heat / Lot No.
                <input
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-xs font-normal focus:border-slate-800"
                  value={editHeatLot}
                  onChange={(e) => setEditHeatLot(e.target.value)}
                />
              </label>
              <label className="font-semibold text-slate-700">
                Remarks
                <input
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-xs font-normal focus:border-slate-800"
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveEdit()}
                disabled={editSaving}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {editSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
