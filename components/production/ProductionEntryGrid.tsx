"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type StageCode =
  | "ROLLING"
  | "HOLLOW_HEAT_TREATMENT"
  | "DRAW"
  | "HEAT_TREATMENT"
  | "FINISHING";

type QueueRow = {
  work_order_id: string;
  work_order_no: string;
  customer_name: string | null;
  specification: string | null;
  od: number | null;
  wl: number | null;
  uom: "Pcs" | "Mtrs";
  route_id: string;
  route_code: string;
  route_name: string;
  stage_code: StageCode;
  balance_to_make: number;
  multiple: number;
};

type EntryRow = QueueRow & {
  production_qty: string;
  rejection_qty: string;
  htc_ok: string;
  heat_lot_no: string;
  remarks: string;
};

type RecentEntry = {
  id: string;
  work_order_no: string;
  customer_name: string | null;
  route_code: string;
  stage_code: StageCode;
  process_date: string;
  input_qty: number;
  output_qty: number;
  rejection_qty: number;
  htc_ok: number;
  heat_lot_no: string | null;
  remarks: string | null;
  created_at: string;
};

const STAGES: { code: StageCode; label: string }[] = [
  { code: "ROLLING", label: "Rolling" },
  {
    code: "HOLLOW_HEAT_TREATMENT",
    label: "Hollow Heat Treatment",
  },
  { code: "DRAW", label: "Draw" },
  { code: "HEAT_TREATMENT", label: "Heat Treatment" },
  { code: "FINISHING", label: "Finishing" },
];

const emptyEdit = {
  id: "",
  process_date: "",
  output_qty: "",
  rejection_qty: "",
  htc_ok: "",
  heat_lot_no: "",
  remarks: "",
};

export default function ProductionEntryGrid() {
  const supabase = useMemo(() => createClient(), []);

  const [stage, setStage] = useState<StageCode>("ROLLING");
  const [date, setDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );

  const [rows, setRows] = useState<EntryRow[]>([]);
  const [recent, setRecent] = useState<RecentEntry[]>([]);

  const [loading, setLoading] = useState(false);
  const [recentLoading, setRecentLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [edit, setEdit] = useState(emptyEdit);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError("");

    const { data, error: rpcError } = await supabase.rpc(
      "get_production_entry_queue",
      {
        p_stage_code: stage,
      }
    );

    if (rpcError) {
      setRows([]);
      setError(rpcError.message);
    } else {
      setRows(
        ((data ?? []) as QueueRow[]).map((r) => ({
          ...r,
          production_qty: "",
          rejection_qty: "",
          htc_ok: "",
          heat_lot_no: "",
          remarks: "",
        }))
      );
    }

    setLoading(false);
  }, [stage, supabase]);

  const loadRecent = useCallback(async () => {
    setRecentLoading(true);

    const { data, error: rpcError } = await supabase.rpc(
      "get_recent_production_entries",
      {
        p_limit: 50,
      }
    );

    if (rpcError) {
      setError(rpcError.message);
    } else {
      setRecent((data ?? []) as RecentEntry[]);
    }

    setRecentLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  function updateRow(
    key: string,
    field:
      | "production_qty"
      | "rejection_qty"
      | "htc_ok"
      | "heat_lot_no"
      | "remarks",
    value: string
  ) {
    setRows((current) =>
      current.map((r) =>
        `${r.work_order_id}|${r.route_id}` === key
          ? { ...r, [field]: value }
          : r
      )
    );
  }

  async function save() {
    setMessage("");
    setError("");

    const entries = rows.filter(
      (r) => Number(r.production_qty) > 0
    );

    if (!entries.length) {
      setError("Enter production quantity for at least one row.");
      return;
    }

    for (const r of entries) {
      const qty = Number(r.production_qty);
      const rejection = Number(r.rejection_qty || 0);
      const htcOk = Number(r.htc_ok || 0);

      if (!Number.isFinite(qty) || qty <= 0) {
        setError(
          `Invalid production quantity for ${r.work_order_no}.`
        );
        return;
      }

      if (qty > Number(r.balance_to_make)) {
        setError(
          `${r.work_order_no} (${r.route_code}): production exceeds Balance to Make ${Number(
            r.balance_to_make
          ).toLocaleString()} ${r.uom}.`
        );
        return;
      }

      if (
        !Number.isFinite(rejection) ||
        rejection < 0 ||
        rejection > qty
      ) {
        setError(
          `${r.work_order_no}: rejection must be between 0 and production quantity.`
        );
        return;
      }

      if (!Number.isFinite(htcOk) || htcOk < 0) {
        setError(`${r.work_order_no}: HTC OK cannot be negative.`);
        return;
      }

      if (stage !== "ROLLING" && htcOk !== 0) {
        setError("HTC OK can only be entered at Rolling.");
        return;
      }

      if (stage === "ROLLING" && htcOk > qty - rejection) {
        setError(
          `${r.work_order_no}: HTC OK cannot exceed net rolling production.`
        );
        return;
      }
    }

    setSaving(true);

    try {
      for (const r of entries) {
        const { error: rpcError } = await supabase.rpc(
          "record_production",
          {
            p_work_order_id: r.work_order_id,
            p_route_id: r.route_id,
            p_stage_code: r.stage_code,
            p_process_date: date,
            p_input_qty: Number(r.production_qty),
            p_output_qty: Number(r.production_qty),
            p_rejection_qty: Number(r.rejection_qty || 0),
            p_htc_ok:
              stage === "ROLLING"
                ? Number(r.htc_ok || 0)
                : 0,
            p_heat_lot_no:
              r.heat_lot_no.trim() || null,
            p_remarks:
              r.remarks.trim() || null,
          }
        );

        if (rpcError) {
          throw rpcError;
        }
      }

      setMessage(
        `${entries.length} production row(s) saved successfully.`
      );

      await Promise.all([
        loadQueue(),
        loadRecent(),
      ]);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Production entry failed."
      );
    } finally {
      setSaving(false);
    }
  }

  const latestIds = useMemo(() => {
    const map = new Map<string, string>();

    for (const entry of recent) {
      const key = `${entry.work_order_no}|${entry.route_code}`;

      if (!map.has(key)) {
        map.set(key, entry.id);
      }
    }

    return map;
  }, [recent]);

  function openEdit(entry: RecentEntry) {
    setError("");
    setMessage("");

    setEdit({
      id: entry.id,
      process_date: entry.process_date,
      output_qty: String(entry.output_qty),
      rejection_qty: String(entry.rejection_qty),
      htc_ok: String(entry.htc_ok ?? 0),
      heat_lot_no: entry.heat_lot_no ?? "",
      remarks: entry.remarks ?? "",
    });
  }

  async function saveEdit() {
    if (!edit.id) return;

    const current = recent.find(
      (r) => r.id === edit.id
    );

    if (!current) return;

    const output = Number(edit.output_qty);
    const rejection = Number(edit.rejection_qty || 0);
    const htcOk = Number(edit.htc_ok || 0);

    if (!Number.isFinite(output) || output <= 0) {
      setError(
        "Corrected production quantity must be positive."
      );
      return;
    }

    if (
      rejection < 0 ||
      rejection > output
    ) {
      setError(
        "Rejection must be between 0 and corrected production quantity."
      );
      return;
    }

    if (current.stage_code !== "ROLLING" && htcOk !== 0) {
      setError(
        "HTC OK can only be entered at Rolling."
      );
      return;
    }

    if (
      current.stage_code === "ROLLING" &&
      htcOk > output - rejection
    ) {
      setError(
        "HTC OK cannot exceed net rolling production."
      );
      return;
    }

    setBusyId(edit.id);
    setError("");
    setMessage("");

    try {
      const { error: rpcError } =
        await supabase.rpc(
          "update_production_entry",
          {
            p_production_id: edit.id,
            p_process_date: edit.process_date,
            p_output_qty: output,
            p_rejection_qty: rejection,
            p_htc_ok:
              current.stage_code === "ROLLING"
                ? htcOk
                : 0,
            p_heat_lot_no:
              edit.heat_lot_no.trim() || null,
            p_remarks:
              edit.remarks.trim() || null,
          }
        );

      if (rpcError) {
        throw rpcError;
      }

      setMessage(
        "Production entry corrected successfully."
      );

      setEdit(emptyEdit);

      await Promise.all([
        loadQueue(),
        loadRecent(),
      ]);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Correction failed."
      );
    } finally {
      setBusyId("");
    }
  }

  async function deleteEntry(entry: RecentEntry) {
    const key = `${entry.work_order_no}|${entry.route_code}`;

    if (
      !latestIds.has(key) ||
      latestIds.get(key) !== entry.id
    ) {
      setError(
        "Only the last production entry for that Work Order and Route can be deleted."
      );
      return;
    }

    if (
      !window.confirm(
        `Delete production entry for ${entry.work_order_no} / ${entry.route_code} / ${entry.stage_code}?`
      )
    ) {
      return;
    }

    setBusyId(entry.id);
    setError("");
    setMessage("");

    try {
      const { error: rpcError } =
        await supabase.rpc(
          "delete_production_entry",
          {
            p_production_id: entry.id,
          }
        );

      if (rpcError) {
        throw rpcError;
      }

      setMessage(
        "Production entry deleted successfully."
      );

      if (edit.id === entry.id) {
        setEdit(emptyEdit);
      }

      await Promise.all([
        loadQueue(),
        loadRecent(),
      ]);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Deletion failed."
      );
    } finally {
      setBusyId("");
    }
  }

  const stageLabel =
    STAGES.find((s) => s.code === stage)?.label ??
    stage;

  return (
    <div className="space-y-6">
      {/* HEADER / FILTERS */}
      <section className="rounded-xl border bg-background p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm font-medium">
            Work Center
            <select
              className="mt-1 block h-10 min-w-64 rounded-md border bg-background px-3"
              value={stage}
              onChange={(e) =>
                setStage(
                  e.target.value as StageCode
                )
              }
            >
              {STAGES.map((s) => (
                <option
                  key={s.code}
                  value={s.code}
                >
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium">
            Production Date
            <input
              type="date"
              className="mt-1 block h-10 rounded-md border bg-background px-3"
              value={date}
              onChange={(e) =>
                setDate(e.target.value)
              }
            />
          </label>

          <div className="rounded-md border px-3 py-2 text-sm">
            Only orders with{" "}
            <b>Balance to Make &gt; 0</b> are shown.
          </div>
        </div>
      </section>

      {/* MESSAGE */}
      {(message || error) && (
        <div
          className={`rounded-md border p-3 text-sm ${
            error
              ? "border-red-300 text-red-700"
              : "border-green-300 text-green-700"
          }`}
        >
          {error || message}
        </div>
      )}

      {/* PRODUCTION ENTRY */}
      <section className="overflow-hidden rounded-xl border">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold">
            Production Entry — {stageLabel}
          </h2>

          <p className="text-xs text-muted-foreground">
            Enter production only for the eligible Work
            Orders shown below.
          </p>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[1450px] w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="border-b">
                {[
                  "S.No.",
                  "Work Order",
                  "Customer",
                  "Specification",
                  "OD",
                  "WT",
                  "Route",
                  "UOM",
                  "Balance to Make",
                  "Production Qty",
                  "Rejection",
                  ...(stage === "ROLLING"
                    ? ["HTC OK"]
                    : []),
                  "Heat/Lot No. (Optional)",
                  "Remarks",
                ].map((h) => (
                  <th
                    key={h}
                    className="p-3 text-left font-medium"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={
                      stage === "ROLLING"
                        ? 14
                        : 13
                    }
                    className="p-8 text-center"
                  >
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      stage === "ROLLING"
                        ? 14
                        : 13
                    }
                    className="p-8 text-center text-muted-foreground"
                  >
                    No eligible orders for{" "}
                    {stageLabel}.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => {
                  const key = `${r.work_order_id}|${r.route_id}`;

                  return (
                    <tr
                      key={key}
                      className="border-b last:border-0"
                    >
                      <td className="p-3">
                        {i + 1}
                      </td>

                      <td className="p-3 font-medium">
                        {r.work_order_no}
                      </td>

                      <td className="p-3">
                        {r.customer_name || "—"}
                      </td>

                      <td className="p-3">
                        {r.specification || "—"}
                      </td>

                      <td className="p-3">
                        {r.od ?? "—"}
                      </td>

                      <td className="p-3">
                        {r.wl ?? "—"}
                      </td>

                      <td className="p-3 font-medium">
                        {r.route_code}
                      </td>

                      <td className="p-3 font-semibold">
                        {r.uom}
                      </td>

                      <td className="p-3 text-right">
                        {Number(
                          r.balance_to_make
                        ).toLocaleString()}{" "}
                        {r.uom}
                      </td>

                      <td className="p-2">
                        <input
                          type="number"
                          min="0"
                          max={r.balance_to_make}
                          step="any"
                          className="h-9 w-32 rounded-md border px-2 text-right"
                          value={
                            r.production_qty
                          }
                          onChange={(e) =>
                            updateRow(
                              key,
                              "production_qty",
                              e.target.value
                            )
                          }
                        />
                      </td>

                      <td className="p-2">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          className="h-9 w-28 rounded-md border px-2 text-right"
                          value={
                            r.rejection_qty
                          }
                          onChange={(e) =>
                            updateRow(
                              key,
                              "rejection_qty",
                              e.target.value
                            )
                          }
                        />
                      </td>

                      {stage === "ROLLING" && (
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            className="h-28 rounded-md border px-2 text-right w-28"
                            value={r.htc_ok}
                            onChange={(e) =>
                              updateRow(
                                key,
                                "htc_ok",
                                e.target.value
                              )
                            }
                          />
                        </td>
                      )}

                      <td className="p-2">
                        <input
                          className="h-9 w-48 rounded-md border px-2"
                          placeholder="Optional"
                          value={
                            r.heat_lot_no
                          }
                          onChange={(e) =>
                            updateRow(
                              key,
                              "heat_lot_no",
                              e.target.value
                            )
                          }
                        />
                      </td>

                      <td className="p-2">
                        <input
                          className="h-9 w-56 rounded-md border px-2"
                          value={r.remarks}
                          onChange={(e) =>
                            updateRow(
                              key,
                              "remarks",
                              e.target.value
                            )
                          }
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t p-4">
          <button
            type="button"
            onClick={() => void save()}
            disabled={
              saving ||
              loading ||
              rows.length === 0
            }
            className="rounded-md border px-5 py-2 font-medium disabled:opacity-50"
          >
            {saving
              ? "Saving…"
              : "Save Production"}
          </button>
        </div>
      </section>

      {/* RECENT ENTRIES */}
      <section className="overflow-hidden rounded-xl border">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold">
            Recent Production Entries
          </h2>

          <p className="text-xs text-muted-foreground">
            Only the latest entry for a Work Order +
            Route can be corrected or deleted.
          </p>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[1250px] w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="border-b">
                {[
                  "Date",
                  "Work Order",
                  "Customer",
                  "Route",
                  "Work Center",
                  "Input",
                  "Output",
                  "Rejection",
                  "HTC OK",
                  "Heat/Lot",
                  "Remarks",
                  "Action",
                ].map((h) => (
                  <th
                    key={h}
                    className="p-3 text-left font-medium"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {recentLoading ? (
                <tr>
                  <td
                    colSpan={12}
                    className="p-8 text-center"
                  >
                    Loading…
                  </td>
                </tr>
              ) : recent.length === 0 ? (
                <tr>
                  <td
                    colSpan={12}
                    className="p-8 text-center text-muted-foreground"
                  >
                    No production entries yet.
                  </td>
                </tr>
              ) : (
                recent.map((entry) => {
                  const key = `${entry.work_order_no}|${entry.route_code}`;

                  const isLatest =
                    latestIds.get(key) ===
                    entry.id;

                  return (
                    <tr
                      key={entry.id}
                      className="border-b last:border-0"
                    >
                      <td className="p-3">
                        {entry.process_date}
                      </td>

                      <td className="p-3 font-medium">
                        {entry.work_order_no}
                      </td>

                      <td className="p-3">
                        {entry.customer_name ||
                          "—"}
                      </td>

                      <td className="p-3">
                        {entry.route_code}
                      </td>

                      <td className="p-3">
                        {STAGES.find(
                          (s) =>
                            s.code ===
                            entry.stage_code
                        )?.label ??
                          entry.stage_code}
                      </td>

                      <td className="p-3 text-right">
                        {Number(
                          entry.input_qty
                        ).toLocaleString()}
                      </td>

                      <td className="p-3 text-right">
                        {Number(
                          entry.output_qty
                        ).toLocaleString()}
                      </td>

                      <td className="p-3 text-right">
                        {Number(
                          entry.rejection_qty
                        ).toLocaleString()}
                      </td>

                      <td className="p-3 text-right">
                        {Number(
                          entry.htc_ok
                        ).toLocaleString()}
                      </td>

                      <td className="p-3">
                        {entry.heat_lot_no ||
                          "—"}
                      </td>

                      <td className="p-3">
                        {entry.remarks || "—"}
                      </td>

                      <td className="p-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={
                              !isLatest ||
                              busyId ===
                                entry.id
                            }
                            onClick={() =>
                              openEdit(entry)
                            }
                            className="rounded-md border px-3 py-1.5 disabled:opacity-40"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            disabled={
                              !isLatest ||
                              busyId ===
                                entry.id
                            }
                            onClick={() =>
                              void deleteEntry(
                                entry
                              )
                            }
                            className="rounded-md border px-3 py-1.5 disabled:opacity-40"
                          >
                            {busyId ===
                            entry.id
                              ? "…"
                              : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* EDIT */}
      {edit.id && (
        <section className="rounded-xl border p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">
                Correct Production Entry
              </h2>

              <p className="text-xs text-muted-foreground">
                Backend will reject the correction
                if another later entry exists.
              </p>
            </div>

            <button
              type="button"
              className="rounded-md border px-3 py-1.5"
              onClick={() =>
                setEdit(emptyEdit)
              }
            >
              Cancel
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            <label className="text-sm font-medium">
              Date
              <input
                type="date"
                className="mt-1 h-10 w-full rounded-md border px-2"
                value={edit.process_date}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    process_date:
                      e.target.value,
                  })
                }
              />
            </label>

            <label className="text-sm font-medium">
              Production Qty
              <input
                type="number"
                min="0"
                step="any"
                className="mt-1 h-10 w-full rounded-md border px-2"
                value={edit.output_qty}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    output_qty:
                      e.target.value,
                  })
                }
              />
            </label>

            <label className="text-sm font-medium">
              Rejection
              <input
                type="number"
                min="0"
                step="any"
                className="mt-1 h-10 w-full rounded-md border px-2"
                value={
                  edit.rejection_qty
                }
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    rejection_qty:
                      e.target.value,
                  })
                }
              />
            </label>

            <label className="text-sm font-medium">
              HTC OK
              <input
                type="number"
                min="0"
                step="any"
                className="mt-1 h-10 w-full rounded-md border px-2"
                value={edit.htc_ok}
                disabled={
                  recent.find(
                    (r) =>
                      r.id === edit.id
                  )?.stage_code !==
                  "ROLLING"
                }
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    htc_ok:
                      e.target.value,
                  })
                }
              />
            </label>

            <label className="text-sm font-medium">
              Heat/Lot No.
              <span className="font-normal">
                {" "}
                (Optional)
              </span>
              <input
                className="mt-1 h-10 w-full rounded-md border px-2"
                value={
                  edit.heat_lot_no
                }
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    heat_lot_no:
                      e.target.value,
                  })
                }
              />
            </label>

            <label className="text-sm font-medium">
              Remarks
              <input
                className="mt-1 h-10 w-full rounded-md border px-2"
                value={edit.remarks}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    remarks:
                      e.target.value,
                  })
                }
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() =>
              void saveEdit()
            }
            disabled={
              busyId === edit.id
            }
            className="mt-4 rounded-md border px-5 py-2 font-medium disabled:opacity-50"
          >
            {busyId === edit.id
              ? "Saving…"
              : "Save Correction"}
          </button>
        </section>
      )}
    </div>
  );
}
