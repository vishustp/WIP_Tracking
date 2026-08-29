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

  // --- Data fetching ---
  const { rows, setRows, loading: queueLoading, error: queueError, reload: reloadQueue } = useQueue(stage);
  // Note: use `stage` (singular), not `stages`

  console.log("🔍 rows from useQueue:", rows);
  console.log("🔍 queueLoading:", queueLoading);
  console.log("🔍 queueError:", queueError);
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
        if (field === "pcs") {
          const mtr = value === "" ? "" : String(mtrFromPcs(n(value), n(r.avg_length)));
          return { ...r, pcs: value, mtr };
        }
        if (field === "mtr") {
          const pcs = value === "" ? "" : String(pcsFromMtr(n(value), n(r.avg_length)));
          return { ...r, mtr: value, pcs };
        }
        if (field === "rejection_pcs") {
          const rejection_mtr = value === "" ? "" : String(mtrFromPcs(n(value), n(r.avg_length)));
          return { ...r, rejection_pcs: value, rejection_mtr };
        }
        if (field === "htc_ok_pcs") {
          const htc_ok_mtr = value === "" ? "" : String(mtrFromPcs(n(value), n(r.avg_length)));
          return { ...r, htc_ok_pcs: value, htc_ok_mtr };
        }
        return { ...r, [field]: value };
      })
    );
  };

  // --- Batch save (atomic) ---
  async function save() {
    setMessage("");
    setError("");

    const selected = rows.filter((r) => n(r.mtr) > 0);
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
    if (editing.stage_code === "ROLLING" && htc > mtr - rejection) {
      setError("HTC OK cannot exceed net Rolling production.");
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

  // --- Helper to get formula text (optional) ---
  function getMaximumFormula(row: Row) {
    if (stage === "ROLLING") return "Plan × 110%";
    if (stage === "DRAW") return "Rolling Production";
    if (stage === "HEAT_TREATMENT" || stage === "HOLLOW_HEAT_TREATMENT")
      return "Draw Bench Production";
    if (stage === "FINISHING") {
      if (row.route_code === "HFS" || row.route_code === "ALLOY_HFS")
        return "Rolling HTC OK × Multiple";
      if (row.route_code === "CDS" || row.route_code === "ALLOY_CDS")
        return "Heat Treatment × Multiple";
      return "Previous Stage × Multiple";
    }
    return "";
  }

  // --- Render (abbreviated – you can copy the full JSX from your existing file) ---
  return (
    <div className="space-y-6">
      {/* Header & controls – same as before */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Production Entry</h1>
          <p className="text-sm text-muted-foreground">Route-wise production entry, correction and history.</p>
        </div>
        <div className="flex gap-2">
          <select value={stage} onChange={(e) => setStage(e.target.value as StageCode)} className="rounded-lg border px-3 py-2">
            {STAGES.map((s) => (<option key={s.code} value={s.code}>{s.label}</option>))}
          </select>
          <button onClick={() => Promise.all([reloadQueue(), reloadHistory()])} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 hover:bg-muted">
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {/* Messages */}
      {message && <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700"><CheckCircle2 size={18} />{message}</div>}
      {error && <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><span>{error}</span></div>}

      {/* Date picker */}
      <div className="rounded-xl border bg-background p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Production Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border px-3 py-2" />
          </div>
        </div>
      </div>

      {/* Queue Table – paste your existing table rendering here, using rows, updateRow, calc, etc. */}
      <div className="overflow-hidden rounded-xl border bg-background">
        {/* ... your existing queue table JSX ... */}
        {/* Just replace the save button with the new one below */}
        <div className="flex justify-end border-t p-4">
          <button disabled={saving || queueLoading} onClick={save} className="rounded-lg bg-black px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50">
            {saving ? "Saving..." : "Save Production"}
          </button>
        </div>
      </div>

      {/* History Table – paste your existing history JSX */}
      <div className="overflow-hidden rounded-xl border bg-background">
        {/* ... your existing history table ... */}
      </div>

      {/* Edit Modal – paste your existing modal JSX, using the state above */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          {/* ... your modal content ... */}
        </div>
      )}

      {/* Delete Modal – paste your existing delete modal */}
      {deleteId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          {/* ... your delete content ... */}
        </div>
      )}
    </div>
  );
}
