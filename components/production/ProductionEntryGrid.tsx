"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  Edit2,
  Trash2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useQueue } from "@/hooks/useQueue";
import { useHistory } from "@/hooks/useHistory";
import { validateProductionEntry } from "@/lib/productionValidation";
import { calc, fmt, n, mtrFromPcs, pcsFromMtr } from "@/lib/productionUtils";
import { StageCode, STAGES, Row, ProductionEntry } from "@/types";

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

  // Edit modal state
  const [editing, setEditing] = useState<ProductionEntry | null>(null);
  const [editMtr, setEditMtr] = useState("");
  const [editPcs, setEditPcs] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editRejection, setEditRejection] = useState("");
  const [editHtc, setEditHtc] = useState("");
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

  const routes = useMemo(
    () => Array.from(new Set(entries.map((e) => e.route_code))).sort(),
    [entries]
  );

  // --- Row update helper ---
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
        
        // Rule 5: Rolling Mtr and MT will be calculated based on MH OD, MH WT and MH Length
        const effectiveAvg =
          stage === "ROLLING" && r.mh_avg_length && r.mh_avg_length > 0
            ? Number(r.mh_avg_length)
            : n(r.avg_length);

        if (field === "pcs") {
          const mtr = value === "" ? "" : String(mtrFromPcs(n(value), effectiveAvg));
          return { ...r, pcs: value, mtr };
        }
        if (field === "mtr") {
          const pcs = value === "" ? "" : String(pcsFromMtr(n(value), effectiveAvg));
          return { ...r, mtr: value, pcs };
        }
        if (field === "rejection_pcs") {
          const rejection_mtr = value === "" ? "" : String(mtrFromPcs(n(value), effectiveAvg));
          return { ...r, rejection_pcs: value, rejection_mtr };
        }
        if (field === "rejection_mtr") {
          const rejection_pcs = value === "" ? "" : String(pcsFromMtr(n(value), effectiveAvg));
          return { ...r, rejection_mtr: value, rejection_pcs };
        }
        if (field === "htc_ok_pcs") {
          const htc_ok_mtr = value === "" ? "" : String(mtrFromPcs(n(value), effectiveAvg));
          return { ...r, htc_ok_pcs: value, htc_ok_mtr };
        }
        if (field === "htc_ok_mtr") {
          const htc_ok_pcs = value === "" ? "" : String(pcsFromMtr(n(value), effectiveAvg));
          return { ...r, htc_ok_mtr: value, htc_ok_pcs };
        }
        return { ...r, [field]: value };
      })
    );
  };

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
      await Promise.all([reloadQueue(), reloadHistory()]);
    } catch (e: unknown) {
       console.error("🔥 Full error:", e);
      setError(e instanceof Error ? e.message : "Failed to save production.");
    } finally {
      setSaving(false);
    }
  }

  // --- Edit handlers ---
  function openEdit(entry: ProductionEntry) {
    setEditing(entry);
    setEditDate(entry.process_date.slice(0, 10));
    setEditMtr(String(entry.output_mtr || 0));
    setEditPcs(String(entry.output_pcs || 0));
    setEditRejection(String(entry.rejection_mtr || 0));
    setEditHtc(String(entry.htc_ok_mtr || 0));
    setEditHeatLot(entry.heat_lot_no || "");
    setEditRemarks(entry.remarks || "");
  }

  function changeEditPcs(value: string) {
    setEditPcs(value);
    if (editing && n(editing.avg_length) > 0) {
      setEditMtr(String(mtrFromPcs(n(value), n(editing.avg_length))));
    }
  }

  function changeEditMtr(value: string) {
    setEditMtr(value);
    if (editing && n(editing.avg_length) > 0) {
      setEditPcs(String(pcsFromMtr(n(value), n(editing.avg_length))));
    }
  }

  async function updateEntry() {
    if (!editing) return;
    setEditSaving(true);
    setError("");
    setMessage("");

    const mtr = n(editMtr);
    const rejection = n(editRejection);
    const htc = n(editHtc);

    if (!editDate) {
      setError("Production date is required.");
      setEditSaving(false);
      return;
    }
    if (mtr <= 0) {
      setError("Production MTR must be positive.");
      setEditSaving(false);
      return;
    }
    if (rejection < 0 || rejection > mtr) {
      setError("Rejection MTR cannot exceed production MTR.");
      setEditSaving(false);
      return;
    }
    if (
      (editing.stage_code === "HEAT_TREATMENT" || editing.stage_code === "HOLLOW_HEAT_TREATMENT") &&
      !editHeatLot.trim()
    ) {
      setError("Heat Lot No. is required for Heat Treatment.");
      setEditSaving(false);
      return;
    }
    if (editing.stage_code === "ROLLING" && htc > mtr - rejection) {
      setError("HTC OK cannot exceed Net Rolling production.");
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
      return "Rolling HTC OK";
    }
    if (stage === "DRAW") {
      if (route === "ALLOY_CDS") {
        return "Hollow HT Net Output";
      }
      return "Rolling HTC OK";
    }
    if (stage === "HEAT_TREATMENT") {
      return "Draw Bench Net Output";
    }
    if (stage === "FINISHING") {
      if (route === "HFS") {
        return "min(Rolling HTC OK × Multiple, Balance)";
      }
      if (route === "ALLOY_HFS") {
        return "min(Hollow HT Net × Multiple, Balance)";
      }
      return "min(Heat Treatment × Multiple, Balance)";
    }
    return "Previous Stage Output";
  }

  // --- RENDER ---
  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Production Entry</h1>
          <p className="text-sm text-muted-foreground">
            Route-wise production entry, correction and history.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as StageCode)}
            className="rounded-lg border px-3 py-2"
          >
            {STAGES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => Promise.all([reloadQueue(), reloadHistory()])}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 hover:bg-muted"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {/* MESSAGES */}
      {message && (
        <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 size={18} />
          {message}
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* DATE PICKER */}
      <div className="rounded-xl border bg-background p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Production Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>
        </div>
      </div>

      {/* QUEUE TABLE */}
      <div className="overflow-hidden rounded-xl border bg-background">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="font-semibold">
              {STAGES.find((x) => x.code === stage)?.label || stage} Queue
            </h2>
            <p className="text-xs text-muted-foreground">
              Maximum allowed is calculated by backend.
            </p>
          </div>
        </div>

        {queueLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Loading production queue...
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No production WIP available.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1500px] w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-3 text-left">WO</th>
                  <th className="px-3 py-3 text-left">Customer</th>
                  <th className="px-3 py-3 text-left">Grade</th>
                  <th className="px-3 py-3 text-left">Route</th>
                  <th className="px-3 py-3 text-right">Balance MTR</th>
                  <th className="px-3 py-3 text-right">Multiple</th>
                  <th className="px-3 py-3 text-left">Maximum</th>
                  <th className="px-3 py-3 text-right">PCS</th>
                  <th className="px-3 py-3 text-right">MTR</th>
                  <th className="px-3 py-3 text-right">Rejection</th>
                  {stage === "ROLLING" && (
                    <th className="px-3 py-3 text-right">HTC OK</th>
                  )}
                  {(stage === "HEAT_TREATMENT" || stage === "HOLLOW_HEAT_TREATMENT") && (
                    <th className="px-3 py-3 text-left">Heat Lot No.</th>
                  )}
                  <th className="px-3 py-3 text-left">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const key = `${r.work_order_id}|${r.route_id}`;
                  const d = calc(r);
                  const maxAllowed =
                    n(r.max_allowed_mtr) > 0
                      ? n(r.max_allowed_mtr)
                      : n(r.balance_to_make_mtr);

                  return (
                    <tr key={key} className="border-t">
                      <td className="px-3 py-3 font-medium">{r.work_order_no}</td>
                      <td className="px-3 py-3">{r.customer_name || "—"}</td>
                      <td className="px-3 py-3">{r.specification || "—"}</td>
                      <td className="px-3 py-3">
                        <span className="rounded-md bg-muted px-2 py-1">{r.route_code}</span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        {fmt(r.balance_to_make_mtr, " MTR")}
                      </td>
                      <td className="px-3 py-3 text-right">× {fmt(r.multiple || 1)}</td>
                      <td className="px-3 py-3">
                        <div className="font-medium">{fmt(maxAllowed, " MTR")}</div>
                        <div className="text-xs text-muted-foreground">
                          {getMaximumFormula(r)}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={r.pcs}
                          onChange={(e) => updateRow(key, "pcs", e.target.value)}
                          className="w-28 rounded-md border px-2 py-1.5 text-right"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={r.mtr}
                          onChange={(e) => updateRow(key, "mtr", e.target.value)}
                          className="w-32 rounded-md border px-2 py-1.5 text-right"
                        />
                        <div className="mt-1 text-xs text-muted-foreground">
                          {fmt(d.mt, " MT")}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={r.rejection_mtr}
                          onChange={(e) => updateRow(key, "rejection_mtr", e.target.value)}
                          className="w-28 rounded-md border px-2 py-1.5 text-right"
                        />
                      </td>
                      {stage === "ROLLING" && (
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={r.htc_ok_mtr}
                            onChange={(e) => updateRow(key, "htc_ok_mtr", e.target.value)}
                            className="w-28 rounded-md border px-2 py-1.5 text-right"
                          />
                        </td>
                      )}
                      {(stage === "HEAT_TREATMENT" || stage === "HOLLOW_HEAT_TREATMENT") && (
                        <td className="px-3 py-3">
                          <input
                            type="text"
                            value={r.heat_lot_no}
                            onChange={(e) => updateRow(key, "heat_lot_no", e.target.value)}
                            className="w-36 rounded-md border px-2 py-1.5"
                          />
                        </td>
                      )}
                      <td className="px-3 py-3">
                        <input
                          type="text"
                          value={r.remarks}
                          onChange={(e) => updateRow(key, "remarks", e.target.value)}
                          className="w-44 rounded-md border px-2 py-1.5"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end border-t p-4">
          <button
            type="button"
            disabled={saving || queueLoading}
            onClick={save}
            className="rounded-lg bg-black px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Production"}
          </button>
        </div>
      </div>

      {/* PRODUCTION HISTORY */}
      <div className="overflow-hidden rounded-xl border bg-background">
        <div className="border-b p-4">
          <div className="mb-4 flex items-center gap-2">
            <Search size={18} />
            <h2 className="font-semibold">Production History</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search WO / customer / grade"
              className="rounded-lg border px-3 py-2"
            />
            <select
              value={entryStage}
              onChange={(e) => setEntryStage(e.target.value)}
              className="rounded-lg border px-3 py-2"
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
              className="rounded-lg border px-3 py-2"
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
              className="rounded-lg border px-3 py-2"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border px-3 py-2"
            />
          </div>
        </div>

        {historyLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Loading production history...
          </div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No production entries found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1450px] w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-3 text-left">Date</th>
                  <th className="px-3 py-3 text-left">WO</th>
                  <th className="px-3 py-3 text-left">Customer</th>
                  <th className="px-3 py-3 text-left">Route</th>
                  <th className="px-3 py-3 text-left">Stage</th>
                  <th className="px-3 py-3 text-right">Production MTR</th>
                  <th className="px-3 py-3 text-right">Production PCS</th>
                  <th className="px-3 py-3 text-right">Rejection</th>
                  <th className="px-3 py-3 text-right">HTC OK</th>
                  <th className="px-3 py-3 text-left">Heat Lot</th>
                  <th className="px-3 py-3 text-left">Remarks</th>
                  <th className="px-3 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-t">
                    <td className="px-3 py-3">{entry.process_date}</td>
                    <td className="px-3 py-3 font-medium">{entry.work_order_no}</td>
                    <td className="px-3 py-3">{entry.customer_name || "—"}</td>
                    <td className="px-3 py-3">
                      <span className="rounded-md bg-muted px-2 py-1">{entry.route_code}</span>
                    </td>
                    <td className="px-3 py-3">
                      {STAGES.find((s) => s.code === entry.stage_code)?.label || entry.stage_code}
                    </td>
                    <td className="px-3 py-3 text-right">{fmt(entry.output_mtr, " MTR")}</td>
                    <td className="px-3 py-3 text-right">{fmt(entry.output_pcs)}</td>
                    <td className="px-3 py-3 text-right">{fmt(entry.rejection_mtr, " MTR")}</td>
                    <td className="px-3 py-3 text-right">{fmt(entry.htc_ok_mtr, " MTR")}</td>
                    <td className="px-3 py-3">{entry.heat_lot_no || "—"}</td>
                    <td className="max-w-[250px] truncate px-3 py-3">{entry.remarks || "—"}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          disabled={!entry.can_modify}
                          onClick={() => openEdit(entry)}
                          title={
                            entry.can_modify
                              ? "Edit"
                              : "Cannot edit: later production exists"
                          }
                          className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Edit2 size={15} />
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={!entry.can_modify}
                          onClick={() => setDeleteId(entry.id)}
                          title={
                            entry.can_modify
                              ? "Delete"
                              : "Cannot delete: later production exists"
                          }
                          className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2.5 py-1.5 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Trash2 size={15} />
                          Delete
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

      {/* EDIT MODAL */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b p-5">
              <div>
                <h2 className="text-lg font-semibold">Edit Production Entry</h2>
                <p className="text-sm text-muted-foreground">
                  WO {editing.work_order_no} · {editing.route_code} ·{" "}
                  {STAGES.find((s) => s.code === editing.stage_code)?.label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg p-2 hover:bg-muted"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Production Date</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Production PCS</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={editPcs}
                  onChange={(e) => changeEditPcs(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Production MTR</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={editMtr}
                  onChange={(e) => changeEditMtr(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Rejection MTR</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={editRejection}
                  onChange={(e) => setEditRejection(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>
              {editing.stage_code === "ROLLING" && (
                <div>
                  <label className="mb-1 block text-sm font-medium">HTC OK MTR</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={editHtc}
                    onChange={(e) => setEditHtc(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2"
                  />
                </div>
              )}
              {(editing.stage_code === "HEAT_TREATMENT" || editing.stage_code === "HOLLOW_HEAT_TREATMENT") && (
                <div>
                  <label className="mb-1 block text-sm font-medium">Heat Lot No.</label>
                  <input
                    type="text"
                    value={editHeatLot}
                    onChange={(e) => setEditHeatLot(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2"
                  />
                </div>
              )}
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium">Remarks</label>
                <textarea
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border px-3 py-2"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t p-5">
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={editSaving}
                className="rounded-lg border px-4 py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={updateEntry}
                disabled={editSaving}
                className="rounded-lg bg-black px-5 py-2 text-white disabled:opacity-50"
              >
                {editSaving ? "Updating..." : "Update Production"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION */}
      {deleteId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-background p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-full bg-red-100 p-2 text-red-600">
                <Trash2 size={20} />
              </div>
              <h2 className="text-lg font-semibold">Delete Production Entry?</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              This production entry will be permanently deleted. The WIP will then be recalculated automatically.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setDeleteId(null)}
                className="rounded-lg border px-4 py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={deleteEntry}
                className="rounded-lg bg-red-600 px-5 py-2 text-white disabled:opacity-50"
              >
                {deleteBusy ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
