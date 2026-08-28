"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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

const STAGES: { code: StageCode; label: string }[] = [
  { code: "ROLLING", label: "Rolling" },
  { code: "HOLLOW_HEAT_TREATMENT", label: "Hollow Heat Treatment" },
  { code: "DRAW", label: "Draw" },
  { code: "HEAT_TREATMENT", label: "Heat Treatment" },
  { code: "FINISHING", label: "Finishing" },
];

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

const fmt = (v: unknown, suffix = "") =>
  Number.isFinite(Number(v))
    ? `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 3 })}${suffix}`
    : "—";

const pcsFromMtr = (mtr: number, avg: number) => (avg > 0 ? mtr / avg : 0);
const mtrFromPcs = (pcs: number, avg: number) => (avg > 0 ? pcs * avg : 0);
const mtFromMtr = (mtr: number, od: number, wt: number) =>
  Math.max(od - wt, 0) * Math.max(wt, 0) * 0.0246615 * 0.001 * Math.max(mtr, 0);

export default function ProductionEntryGrid() {
  const supabase = useMemo(() => createClient(), []);
  const [stage, setStage] = useState<StageCode>("ROLLING");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [entries, setEntries] = useState<ProductionEntry[]>([]);
  const [search, setSearch] = useState("");
  const [entryStage, setEntryStage] = useState<string>("");
  const [entryRoute, setEntryRoute] = useState<string>("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<ProductionEntry | null>(null);
  const [editPcs, setEditPcs] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editRejection, setEditRejection] = useState("");
  const [editHtc, setEditHtc] = useState("");
  const [editHeatLot, setEditHeatLot] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("get_production_entry_queue", {
      p_stage_code: stage,
    });
    if (rpcError) {
      setRows([]);
      setError(rpcError.message);
    } else {
      setRows(
        ((data ?? []) as Omit<Row, "pcs" | "rejection_mtr" | "htc_ok_mtr" | "heat_lot_no" | "remarks">[]).map(
          (r) => ({ ...r, pcs: "", rejection_mtr: "", htc_ok_mtr: "", heat_lot_no: "", remarks: "" })
        )
      );
    }
    setLoading(false);
  }, [stage, supabase]);

  const loadEntries = useCallback(async () => {
    setEntriesLoading(true);
    setError("");
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
      setEntries([]);
      setError(rpcError.message);
    } else {
      setEntries((data ?? []) as ProductionEntry[]);
    }
    setEntriesLoading(false);
  }, [entryRoute, entryStage, fromDate, search, supabase, toDate]);

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

  const updateRow = (key: string, field: keyof Pick<Row, "pcs" | "rejection_mtr" | "htc_ok_mtr" | "heat_lot_no" | "remarks">, value: string) => {
    setRows((current) =>
      current.map((r) => (`${r.work_order_id}|${r.route_id}` === key ? { ...r, [field]: value } : r))
    );
  };

  const calc = (r: Row) => {
    const avg = n(r.avg_length);
    const pcs = n(r.pcs);
    const mtr = mtrFromPcs(pcs, avg);
    const mt = mtFromMtr(mtr, n(r.od), n(r.wl));
    return { avg, pcs, mtr, mt };
  };

  async function save() {
    setMessage("");
    setError("");
    const selected = rows.filter((r) => n(r.pcs) > 0);
    if (!selected.length) {
      setError("Enter Production PCS for at least one row.");
      return;
    }

    for (const r of selected) {
      const d = calc(r);
      const balance = n(r.balance_to_make_mtr);
      const allowed = stage === "ROLLING" ? balance * 1.1 : balance;
      const rejection = n(r.rejection_mtr);
      const htc = n(r.htc_ok_mtr);

      if (d.avg <= 0) return setError(`${r.work_order_no}: L1/L2 is missing, so MTR cannot be calculated.`);
      if (d.mtr <= 0) return setError(`${r.work_order_no}: enter valid Production PCS.`);
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
    const mtr = mtrFromPcs(pcs, avg);
    const rejection = n(editRejection);
    const htc = n(editHtc);

    if (avg <= 0 || pcs <= 0 || mtr <= 0) {
      setError("Corrected PCS must be positive and L1/L2 must be available.");
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

  const label = STAGES.find((s) => s.code === stage)?.label ?? stage;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-background p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm font-medium">
            Work Center
            <select
              className="mt-1 block h-10 min-w-64 rounded-md border bg-background px-3"
              value={stage}
              onChange={(e) => setStage(e.target.value as StageCode)}
            >
              {STAGES.map((s) => (
                <option key={s.code} value={s.code}>{s.label}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Production Date
            <input
              type="date"
              className="mt-1 block h-10 rounded-md border bg-background px-3"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <div className="rounded-md border px-3 py-2 text-sm">
            Production entry: <b>PCS</b>; <b>MTR and MT are automatically calculated</b>.
            {stage === "ROLLING" && <><br /><b>Rolling production allowance: up to 110% of planned MTR.</b></>}
          </div>
        </div>
      </section>

      {(message || error) && (
        <div className={`rounded-md border p-3 text-sm ${error ? "border-red-300 text-red-700" : "border-green-300 text-green-700"}`}>
          {error || message}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold">Production Entry — {label}</h2>
          <p className="text-xs text-muted-foreground">
            Enter Production PCS only. MTR = PCS × Average(L1,L2). MT = (OD−WT) × WT × 0.0246615 × 0.001 × MTR.
          </p>
        </div>
        <div className="overflow-auto">
          <table className="min-w-[1800px] w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="border-b">
                {["S.No.","Work Order","Customer","Specification","OD","WT","L1","L2","Avg L1/L2","Route","Balance MTR","Balance PCS","Balance MT","Production PCS","Production MTR (Auto)","Production MT (Auto)","Rejection MTR",...(stage === "ROLLING" ? ["HTC OK MTR"] : []),"Heat/Lot No. (Optional)","Remarks"].map((h) => <th key={h} className="p-3 text-left font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={20} className="p-8 text-center">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={20} className="p-8 text-center text-muted-foreground">No eligible orders for this Work Center.</td></tr>
              ) : rows.map((r, i) => {
                const key = `${r.work_order_id}|${r.route_id}`;
                const d = calc(r);
                const allowed = stage === "ROLLING" ? n(r.balance_to_make_mtr) * 1.1 : n(r.balance_to_make_mtr);
                return (
                  <tr key={key} className="border-b">
                    <td className="p-3">{i + 1}</td>
                    <td className="p-3 font-medium">{r.work_order_no}</td>
                    <td className="p-3">{r.customer_name || "—"}</td>
                    <td className="p-3">{r.specification || "—"}</td>
                    <td className="p-3">{fmt(r.od)}</td><td className="p-3">{fmt(r.wl)}</td><td className="p-3">{fmt(r.l1)}</td><td className="p-3">{fmt(r.l2)}</td>
                    <td className="p-3">{fmt(r.avg_length, " m")}</td><td className="p-3 font-medium">{r.route_code}</td>
                    <td className="p-3 text-right">{fmt(r.balance_to_make_mtr, " MTR")}<div className="text-[11px] text-muted-foreground">Allowed: {fmt(allowed, " MTR")}</div></td>
                    <td className="p-3 text-right">{fmt(r.balance_to_make_pcs, " PCS")}</td><td className="p-3 text-right">{fmt(r.balance_to_make_mt, " MT")}</td>
                    <td className="p-2"><input type="number" min="0" step="any" className="h-9 w-32 rounded-md border px-2 text-right" value={r.pcs} onChange={(e) => updateRow(key, "pcs", e.target.value)} /></td>
                    <td className="p-3 text-right font-semibold">{d.mtr > 0 ? fmt(d.mtr, " MTR") : "—"}</td>
                    <td className="p-3 text-right font-semibold">{d.mt > 0 ? fmt(d.mt, " MT") : "—"}</td>
                    <td className="p-2"><input type="number" min="0" step="any" className="h-9 w-28 rounded-md border px-2 text-right" value={r.rejection_mtr} onChange={(e) => updateRow(key, "rejection_mtr", e.target.value)} /></td>
                    {stage === "ROLLING" && <td className="p-2"><input type="number" min="0" step="any" className="h-9 w-28 rounded-md border px-2 text-right" value={r.htc_ok_mtr} onChange={(e) => updateRow(key, "htc_ok_mtr", e.target.value)} /></td>}
                    <td className="p-2"><input className="h-9 w-44 rounded-md border px-2" placeholder="Optional" value={r.heat_lot_no} onChange={(e) => updateRow(key, "heat_lot_no", e.target.value)} /></td>
                    <td className="p-2"><input className="h-9 w-48 rounded-md border px-2" value={r.remarks} onChange={(e) => updateRow(key, "remarks", e.target.value)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t p-4">
          <button type="button" onClick={() => void save()} disabled={saving || loading || rows.length === 0} className="rounded-md border px-5 py-2 font-medium disabled:opacity-50">
            {saving ? "Saving…" : "Save Production"}
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border">
        <div className="border-b px-4 py-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-semibold">All Production Entries</h2>
              <p className="text-xs text-muted-foreground">Search and filter saved production entries. Edit/Delete is available for the latest entry of a Work Order + Route.</p>
            </div>
            <button type="button" onClick={() => void loadEntries()} disabled={entriesLoading} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">
              {entriesLoading ? "Loading…" : "Refresh"}
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <input className="h-10 rounded-md border px-3" placeholder="Search WO / customer / grade / route" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="h-10 rounded-md border bg-background px-3" value={entryStage} onChange={(e) => setEntryStage(e.target.value)}>
              <option value="">All Work Centers</option>
              {STAGES.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
            <select className="h-10 rounded-md border bg-background px-3" value={entryRoute} onChange={(e) => setEntryRoute(e.target.value)}>
              <option value="">All Routes</option>
              {routes.map((route) => <option key={route} value={route}>{route}</option>)}
            </select>
            <input type="date" className="h-10 rounded-md border px-3" value={fromDate} onChange={(e) => setFromDate(e.target.value)} title="From date" />
            <input type="date" className="h-10 rounded-md border px-3" value={toDate} onChange={(e) => setToDate(e.target.value)} title="To date" />
          </div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[1900px] w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="border-b">
                {["Date","Work Order","Customer","Route","Work Center","Input PCS","Input MTR","Input MT","Output PCS","Output MTR","Output MT","Rejection PCS","Rejection MTR","Rejection MT","HTC OK MTR","Heat/Lot","Remarks","Actions"].map((h) => <th key={h} className="p-3 text-left font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {entriesLoading ? (
                <tr><td colSpan={18} className="p-8 text-center">Loading entries…</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={18} className="p-8 text-center text-muted-foreground">No production entries found.</td></tr>
              ) : entries.map((e) => (
                <tr key={e.id} className="border-b">
                  <td className="p-3">{e.process_date}</td>
                  <td className="p-3 font-medium">{e.work_order_no}</td>
                  <td className="p-3">{e.customer_name || "—"}</td>
                  <td className="p-3 font-medium">{e.route_code}</td>
                  <td className="p-3">{e.stage_code}</td>
                  <td className="p-3 text-right">{fmt(e.input_pcs)}</td><td className="p-3 text-right">{fmt(e.input_mtr)}</td><td className="p-3 text-right">{fmt(e.input_mt)}</td>
                  <td className="p-3 text-right">{fmt(e.output_pcs)}</td><td className="p-3 text-right">{fmt(e.output_mtr)}</td><td className="p-3 text-right">{fmt(e.output_mt)}</td>
                  <td className="p-3 text-right">{fmt(e.rejection_pcs)}</td><td className="p-3 text-right">{fmt(e.rejection_mtr)}</td><td className="p-3 text-right">{fmt(e.rejection_mt)}</td>
                  <td className="p-3 text-right">{fmt(e.htc_ok_mtr)}</td>
                  <td className="p-3">{e.heat_lot_no || "—"}</td>
                  <td className="p-3">{e.remarks || "—"}</td>
                  <td className="p-2">
                    {e.can_modify ? (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => startEdit(e)} className="rounded-md border px-3 py-1.5 text-xs font-medium">Edit</button>
                        <button type="button" onClick={() => void removeEntry(e)} className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700">Delete</button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Locked — later entry exists</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t px-4 py-3 text-xs text-muted-foreground">Showing up to 2,000 matching entries.</div>
      </section>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl border bg-background p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Edit Production Entry</h3>
                <p className="text-sm text-muted-foreground">{editing.work_order_no} · {editing.route_code} · {editing.stage_code}</p>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="rounded-md border px-3 py-1.5 text-sm">Close</button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium">Production Date
                <input type="date" className="mt-1 h-10 w-full rounded-md border px-3" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              </label>
              <label className="text-sm font-medium">Production PCS
                <input type="number" min="0" step="any" className="mt-1 h-10 w-full rounded-md border px-3" value={editPcs} onChange={(e) => setEditPcs(e.target.value)} />
              </label>
              <div className="rounded-md border p-3 text-sm">
                <div className="text-muted-foreground">Calculated MTR</div>
                <b>{fmt(mtrFromPcs(n(editPcs), n(editing.avg_length)), " MTR")}</b>
              </div>
              <div className="rounded-md border p-3 text-sm">
                <div className="text-muted-foreground">Calculated MT</div>
                <b>{fmt(mtFromMtr(mtrFromPcs(n(editPcs), n(editing.avg_length)), n(editing.od), n(editing.wl)), " MT")}</b>
              </div>
              <label className="text-sm font-medium">Rejection MTR
                <input type="number" min="0" step="any" className="mt-1 h-10 w-full rounded-md border px-3" value={editRejection} onChange={(e) => setEditRejection(e.target.value)} />
              </label>
              <label className="text-sm font-medium">HTC OK MTR
                <input type="number" min="0" step="any" disabled={editing.stage_code !== "ROLLING"} className="mt-1 h-10 w-full rounded-md border px-3 disabled:opacity-50" value={editHtc} onChange={(e) => setEditHtc(e.target.value)} />
              </label>
              <label className="text-sm font-medium">Heat/Lot No.
                <input className="mt-1 h-10 w-full rounded-md border px-3" value={editHeatLot} onChange={(e) => setEditHeatLot(e.target.value)} />
              </label>
              <label className="text-sm font-medium">Remarks
                <input className="mt-1 h-10 w-full rounded-md border px-3" value={editRemarks} onChange={(e) => setEditRemarks(e.target.value)} />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="rounded-md border px-4 py-2">Cancel</button>
              <button type="button" onClick={() => void saveEdit()} disabled={editSaving} className="rounded-md border px-4 py-2 font-medium disabled:opacity-50">
                {editSaving ? "Updating…" : "Update Entry"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
