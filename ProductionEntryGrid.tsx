"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type StageCode = "ROLLING" | "HOLLOW_HEAT_TREATMENT" | "DRAW" | "HEAT_TREATMENT" | "FINISHING";
type Stage = { code: StageCode; label: string };
const STAGES: Stage[] = [
  { code: "ROLLING", label: "Rolling" },
  { code: "HOLLOW_HEAT_TREATMENT", label: "Hollow Heat Treatment" },
  { code: "DRAW", label: "Draw" },
  { code: "HEAT_TREATMENT", label: "Heat Treatment" },
  { code: "FINISHING", label: "Finishing" },
];

type QueueRow = {
  work_order_id: string; work_order_no: string; customer_name: string | null;
  specification: string | null; od: number | null; wl: number | null;
  l1: number | null; l2: number | null; avg_length: number | null;
  route_id: string; route_code: string; route_name: string; stage_code: StageCode;
  balance_to_make_mtr: number; balance_to_make_pcs: number; balance_to_make_mt: number; multiple: number;
};
type EntryRow = QueueRow & { pcs: string; mtr: string; rejection_mtr: string; htc_ok_mtr: string; heat_lot_no: string; remarks: string };
type RecentEntry = {
  id: string; work_order_no: string; customer_name: string | null; route_code: string; stage_code: StageCode;
  process_date: string; od: number | null; wl: number | null; l1: number | null; l2: number | null; avg_length: number | null;
  input_mtr: number; input_pcs: number; input_mt: number; output_mtr: number; output_pcs: number; output_mt: number;
  rejection_mtr: number; rejection_pcs: number; rejection_mt: number; htc_ok_mtr: number; heat_lot_no: string | null; remarks: string | null; created_at: string;
};

const fmt = (n: number | null | undefined) => n == null ? "—" : Number(n).toLocaleString(undefined, { maximumFractionDigits: 3 });
const calcMtrFromPcs = (pcs: number, avg: number) => avg > 0 ? pcs * avg : 0;
const calcPcsFromMtr = (mtr: number, avg: number) => avg > 0 ? mtr / avg : 0;
const calcMtFromMtr = (mtr: number, od: number, wt: number) => Math.max(od - wt, 0) * Math.max(wt, 0) * 0.0246615 * 0.001 * Math.max(mtr, 0);

export default function ProductionEntryGrid({ stageCode }: { stageCode?: StageCode } = {}) {
  const supabase = useMemo(() => createClient(), []);
  const [stage, setStage] = useState<StageCode>(stageCode ?? "ROLLING");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<EntryRow[]>([]);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [recentLoading, setRecentLoading] = useState(false);
  const [message, setMessage] = useState(""), [error, setError] = useState("");

  const loadQueue = useCallback(async () => {
    setLoading(true); setError("");
    const { data, error: rpcError } = await supabase.rpc("get_production_entry_queue", { p_stage_code: stage });
    if (rpcError) { setRows([]); setError(rpcError.message); }
    else setRows(((data ?? []) as QueueRow[]).map(r => ({ ...r, pcs: "", mtr: "", rejection_mtr: "", htc_ok_mtr: "", heat_lot_no: "", remarks: "" })));
    setLoading(false);
  }, [stage, supabase]);

  const loadRecent = useCallback(async () => {
    setRecentLoading(true);
    const { data, error: rpcError } = await supabase.rpc("get_recent_production_entries", { p_limit: 50 });
    if (rpcError) setError(rpcError.message); else setRecent((data ?? []) as RecentEntry[]);
    setRecentLoading(false);
  }, [supabase]);

  useEffect(() => { if (stageCode) setStage(stageCode); }, [stageCode]);
  useEffect(() => { void loadQueue(); }, [loadQueue]);
  useEffect(() => { void loadRecent(); }, [loadRecent]);

  function updateRow(key: string, field: keyof Pick<EntryRow, "pcs" | "mtr" | "rejection_mtr" | "htc_ok_mtr" | "heat_lot_no" | "remarks">, value: string) {
    setRows(current => current.map(r => `${r.work_order_id}|${r.route_id}` === key ? { ...r, [field]: value } : r));
  }

  function derived(r: EntryRow) {
    const avg = Number(r.avg_length || 0);
    const typedPcs = Number(r.pcs || 0);
    const typedMtr = Number(r.mtr || 0);
    const mtr = typedMtr > 0 ? typedMtr : calcMtrFromPcs(typedPcs, avg);
    const pcs = typedPcs > 0 ? typedPcs : calcPcsFromMtr(mtr, avg);
    const mt = calcMtFromMtr(mtr, Number(r.od || 0), Number(r.wl || 0));
    return { avg, mtr, pcs, mt };
  }

  async function save() {
    setMessage(""); setError("");
    const entries = rows.filter(r => Number(r.pcs) > 0 || Number(r.mtr) > 0);
    if (!entries.length) return setError("Enter Production PCS or MTR for at least one row.");

    for (const r of entries) {
      const d = derived(r);
      if (d.mtr <= 0) return setError(`${r.work_order_no}: enter valid PCS/MTR.`);
      if (d.mtr > Number(r.balance_to_make_mtr) + 0.000001) return setError(`${r.work_order_no}: production MTR ${fmt(d.mtr)} exceeds Balance to Make ${fmt(r.balance_to_make_mtr)} MTR.`);
      if (Number(r.pcs) > 0 && Number(r.mtr) > 0 && r.avg_length && Math.abs(Number(r.pcs) - calcPcsFromMtr(Number(r.mtr), r.avg_length)) > 0.01) return setError(`${r.work_order_no}: PCS and MTR do not match Average L1/L2.`);
      const rejection = Number(r.rejection_mtr || 0), htc = Number(r.htc_ok_mtr || 0);
      if (rejection < 0 || rejection > d.mtr) return setError(`${r.work_order_no}: rejection MTR must be between 0 and production MTR.`);
      if (htc < 0) return setError(`${r.work_order_no}: HTC OK MTR cannot be negative.`);
      if (stage !== "ROLLING" && htc !== 0) return setError("HTC OK can only be entered at Rolling.");
      if (stage === "ROLLING" && htc > d.mtr - rejection) return setError(`${r.work_order_no}: HTC OK cannot exceed net production MTR.`);
    }

    setSaving(true);
    try {
      for (const r of entries) {
        const d = derived(r);
        const { error: rpcError } = await supabase.rpc("record_production", {
          p_work_order_id: r.work_order_id, p_route_id: r.route_id, p_stage_code: r.stage_code,
          p_process_date: date, p_input_qty: d.mtr, p_output_qty: d.mtr,
          p_rejection_qty: Number(r.rejection_mtr || 0), p_htc_ok: stage === "ROLLING" ? Number(r.htc_ok_mtr || 0) : 0,
          p_heat_lot_no: r.heat_lot_no.trim() || null, p_remarks: r.remarks.trim() || null,
        });
        if (rpcError) throw rpcError;
      }
      setMessage(`${entries.length} production row(s) saved successfully. MTR is stored as the base quantity; PCS and MT are calculated.`);
      await Promise.all([loadQueue(), loadRecent()]);
    } catch (e) { setError(e instanceof Error ? e.message : "Production entry failed."); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-background p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm font-medium">Work Center
            <select className="mt-1 block h-10 min-w-64 rounded-md border bg-background px-3" value={stage} onChange={e => setStage(e.target.value as StageCode)}>
              {STAGES.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Production Date
            <input type="date" className="mt-1 block h-10 rounded-md border bg-background px-3" value={date} onChange={e => setDate(e.target.value)} />
          </label>
          <div className="rounded-md border px-3 py-2 text-sm">Production entry: <b>PCS / MTR</b>; <b>MT is calculated</b>.</div>
        </div>
      </section>

      {(message || error) && <div className={`rounded-md border p-3 text-sm ${error ? "border-red-300" : "border-green-300"}`}>{error || message}</div>}

      <section className="overflow-hidden rounded-xl border">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold">Production Entry — {STAGES.find(s => s.code === stage)?.label}</h2>
          <p className="text-xs text-muted-foreground">Enter PCS or MTR. If both are entered they must agree with Average(L1,L2). MT is calculated from MTR.</p>
        </div>
        <div className="overflow-auto">
          <table className="min-w-[1800px] w-full text-sm">
            <thead className="bg-muted/50"><tr className="border-b">
              {["S.No.","Work Order","Customer","Specification","OD","WT","L1","L2","Avg L1/L2","Route","Balance MTR","Balance PCS","Balance MT","Production PCS","Production MTR","Production MT","Rejection MTR",...(stage === "ROLLING" ? ["HTC OK MTR"] : []),"Heat/Lot No.","Remarks"].map(h => <th key={h} className="p-3 text-left font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={20} className="p-8 text-center">Loading…</td></tr> : rows.length === 0 ? <tr><td colSpan={20} className="p-8 text-center text-muted-foreground">No eligible orders for this Work Center.</td></tr> : rows.map((r, i) => {
                const key = `${r.work_order_id}|${r.route_id}`; const d = derived(r);
                return <tr key={key} className="border-b last:border-0">
                  <td className="p-3">{i + 1}</td><td className="p-3 font-medium">{r.work_order_no}</td><td className="p-3">{r.customer_name || "—"}</td><td className="p-3">{r.specification || "—"}</td>
                  <td className="p-3">{r.od ?? "—"}</td><td className="p-3">{r.wl ?? "—"}</td><td className="p-3">{r.l1 ?? "—"}</td><td className="p-3">{r.l2 ?? "—"}</td><td className="p-3">{fmt(r.avg_length)} m</td><td className="p-3 font-medium">{r.route_code}</td>
                  <td className="p-3 text-right">{fmt(r.balance_to_make_mtr)} MTR</td><td className="p-3 text-right">{fmt(r.balance_to_make_pcs)} PCS</td><td className="p-3 text-right">{fmt(r.balance_to_make_mt)} MT</td>
                  <td className="p-2"><input type="number" min="0" step="any" className="h-9 w-32 rounded-md border px-2 text-right" value={r.pcs} onChange={e => updateRow(key,"pcs",e.target.value)} /></td>
                  <td className="p-2"><input type="number" min="0" step="any" className="h-9 w-32 rounded-md border px-2 text-right" value={r.mtr} onChange={e => updateRow(key,"mtr",e.target.value)} /></td>
                  <td className="p-3 text-right font-semibold">{fmt(d.mt)} MT</td>
                  <td className="p-2"><input type="number" min="0" step="any" className="h-9 w-28 rounded-md border px-2 text-right" value={r.rejection_mtr} onChange={e => updateRow(key,"rejection_mtr",e.target.value)} /></td>
                  {stage === "ROLLING" && <td className="p-2"><input type="number" min="0" step="any" className="h-9 w-28 rounded-md border px-2 text-right" value={r.htc_ok_mtr} onChange={e => updateRow(key,"htc_ok_mtr",e.target.value)} /></td>}
                  <td className="p-2"><input className="h-9 w-44 rounded-md border px-2" placeholder="Optional" value={r.heat_lot_no} onChange={e => updateRow(key,"heat_lot_no",e.target.value)} /></td>
                  <td className="p-2"><input className="h-9 w-48 rounded-md border px-2" value={r.remarks} onChange={e => updateRow(key,"remarks",e.target.value)} /></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t p-4"><button type="button" onClick={() => void save()} disabled={saving || loading || rows.length === 0} className="rounded-md border px-5 py-2 font-medium disabled:opacity-50">{saving ? "Saving…" : "Save Production"}</button></div>
      </section>

      <section className="overflow-hidden rounded-xl border">
        <div className="border-b px-4 py-3"><h2 className="font-semibold">Recent Production Entries</h2><p className="text-xs text-muted-foreground">Quantities are displayed as PCS / MTR / calculated MT.</p></div>
        <div className="overflow-auto"><table className="min-w-[1550px] w-full text-sm"><thead className="bg-muted/50"><tr className="border-b">
          {["Date","Work Order","Customer","Route","Work Center","Input PCS","Input MTR","Input MT","Output PCS","Output MTR","Output MT","Rejection PCS","Rejection MTR","Rejection MT","HTC OK MTR","Heat/Lot","Remarks"].map(h => <th key={h} className="p-3 text-left font-medium">{h}</th>)}
        </tr></thead><tbody>
          {recentLoading ? <tr><td colSpan={17} className="p-8 text-center">Loading…</td></tr> : recent.length === 0 ? <tr><td colSpan={17} className="p-8 text-center text-muted-foreground">No production entries yet.</td></tr> : recent.map(e => <tr key={e.id} className="border-b last:border-0">
            <td className="p-3">{e.process_date}</td><td className="p-3 font-medium">{e.work_order_no}</td><td className="p-3">{e.customer_name || "—"}</td><td className="p-3">{e.route_code}</td><td className="p-3">{e.stage_code}</td>
            <td className="p-3 text-right">{fmt(e.input_pcs)}</td><td className="p-3 text-right">{fmt(e.input_mtr)}</td><td className="p-3 text-right">{fmt(e.input_mt)}</td>
            <td className="p-3 text-right">{fmt(e.output_pcs)}</td><td className="p-3 text-right">{fmt(e.output_mtr)}</td><td className="p-3 text-right">{fmt(e.output_mt)}</td>
            <td className="p-3 text-right">{fmt(e.rejection_pcs)}</td><td className="p-3 text-right">{fmt(e.rejection_mtr)}</td><td className="p-3 text-right">{fmt(e.rejection_mt)}</td><td className="p-3 text-right">{fmt(e.htc_ok_mtr)}</td>
            <td className="p-3">{e.heat_lot_no || "—"}</td><td className="p-3">{e.remarks || "—"}</td>
          </tr>)}
        </tbody></table></div>
      </section>
    </div>
  );
}
