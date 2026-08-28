"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type QueueRow = {
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

  stage_code: string;

  balance_to_make_mtr: number;
  balance_to_make_pcs: number;
  balance_to_make_mt: number;

  multiple: number;
  max_allowed_mtr: number;
};

type Stage = {
  id: string;
  stage_code: string;
  stage_name: string;
};

export default function ProductionPage() {
  const [stageCode, setStageCode] = useState("ROLLING");

  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);

  const [selected, setSelected] = useState<QueueRow | null>(null);

  const [processDate, setProcessDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const [outputQty, setOutputQty] = useState("");
  const [rejectionQty, setRejectionQty] = useState("");
  const [htcOk, setHtcOk] = useState("");
  const [heatLotNo, setHeatLotNo] = useState("");
  const [remarks, setRemarks] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  /* ---------------------------------------------------------
     LOAD STAGES
  --------------------------------------------------------- */

  useEffect(() => {
    loadStages();
  }, []);

  async function loadStages() {
    const { data, error } = await supabase
      .from("process_stages")
      .select("id, stage_code, stage_name")
      .eq("active", true)
      .order("sequence_no");

    if (error) {
      setError(error.message);
      return;
    }

    setStages(data || []);
  }

  /* ---------------------------------------------------------
     LOAD PRODUCTION QUEUE
  --------------------------------------------------------- */

  useEffect(() => {
    loadQueue();
  }, [stageCode]);

  async function loadQueue() {
    setLoading(true);
    setError("");
    setSelected(null);

    const { data, error } = await supabase.rpc(
      "get_production_entry_queue",
      {
        p_stage_code: stageCode,
      }
    );

    setLoading(false);

    if (error) {
      setError(error.message);
      setQueue([]);
      return;
    }

    setQueue((data || []) as QueueRow[]);
  }

  /* ---------------------------------------------------------
     SELECT WO
  --------------------------------------------------------- */

  function selectRow(row: QueueRow) {
    setSelected(row);

    setOutputQty("");
    setRejectionQty("");
    setHtcOk("");
    setHeatLotNo("");
    setRemarks("");
    setError("");
    setSuccess("");
  }

  /* ---------------------------------------------------------
     STAGE LABEL
  --------------------------------------------------------- */

  const stageLabel = useMemo(() => {
    switch (stageCode) {
      case "ROLLING":
        return "Rolling";

      case "DRAW":
        return "Draw Bench";

      case "HEAT_TREATMENT":
        return "Heat Treatment";

      case "FINISHING":
        return "Finishing";

      default:
        return stageCode;
    }
  }, [stageCode]);

  /* ---------------------------------------------------------
     MAXIMUM
     
     IMPORTANT:
     max_allowed_mtr comes directly from backend.
     Do NOT independently calculate it here.
  --------------------------------------------------------- */

  const maxAllowed = selected
    ? Number(selected.max_allowed_mtr || 0)
    : 0;

  const balanceMtr = selected
    ? Number(selected.balance_to_make_mtr || 0)
    : 0;

  const multiple = selected
    ? Number(selected.multiple || 1)
    : 1;

  /* ---------------------------------------------------------
     FORM VALIDATION
  --------------------------------------------------------- */

  function validateForm() {
    if (!selected) {
      setError("Please select a Work Order.");
      return false;
    }

    const qty = Number(outputQty);
    const rejection = Number(rejectionQty || 0);
    const htc = Number(htcOk || 0);

    if (!processDate) {
      setError("Production date is required.");
      return false;
    }

    if (!qty || qty <= 0) {
      setError("Production MTR must be greater than zero.");
      return false;
    }

    if (rejection < 0) {
      setError("Rejection MTR cannot be negative.");
      return false;
    }

    if (rejection > qty) {
      setError("Rejection MTR cannot exceed Production MTR.");
      return false;
    }

    if (htc < 0) {
      setError("HTC OK cannot be negative.");
      return false;
    }

    if (stageCode !== "ROLLING" && htc !== 0) {
      setError("HTC OK can only be entered at Rolling.");
      return false;
    }

    if (stageCode === "ROLLING") {
      if (htc > qty - rejection) {
        setError(
          "HTC OK cannot exceed Net Rolling Production."
        );
        return false;
      }
    }

    if (qty > maxAllowed + 0.000001) {
      setError(
        `Production exceeds Maximum Allowed ${maxAllowed.toFixed(
          3
        )} MTR.`
      );
      return false;
    }

    return true;
  }

  /* ---------------------------------------------------------
     SAVE
  --------------------------------------------------------- */

  async function saveProduction() {
    setError("");
    setSuccess("");

    if (!validateForm()) return;

    if (!selected) return;

    setSaving(true);

    const { data, error } = await supabase.rpc(
      "create_production_entry",
      {
        p_work_order_id: selected.work_order_id,
        p_rolling_plan_id: null,
        p_stage_id:
          stages.find(
            (s) => s.stage_code === selected.stage_code
          )?.id || null,
        p_process_route_id: selected.route_id,
        p_process_date: processDate,
        p_output_qty: Number(outputQty),
        p_rejection_qty: Number(rejectionQty || 0),
        p_htc_ok: Number(htcOk || 0),
        p_heat_lot_no: heatLotNo || null,
        p_remarks: remarks || null,
      }
    );

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess(
      `Production entry saved successfully. ID: ${data}`
    );

    setOutputQty("");
    setRejectionQty("");
    setHtcOk("");
    setHeatLotNo("");
    setRemarks("");

    await loadQueue();
  }

  /* ---------------------------------------------------------
     FORMAT
  --------------------------------------------------------- */

  function n(value: number | null | undefined, digits = 3) {
    if (value === null || value === undefined) return "-";

    return Number(value).toLocaleString("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    });
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl">

        {/* HEADER */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            Production Entry
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Enter production against available Work Order WIP.
          </p>
        </div>

        {/* STAGE SELECTOR */}
        <div className="mb-5 rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-4">

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Production Stage
              </label>

              <select
                value={stageCode}
                onChange={(e) =>
                  setStageCode(e.target.value)
                }
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium outline-none focus:border-blue-500"
              >
                <option value="ROLLING">
                  Rolling
                </option>

                <option value="DRAW">
                  Draw Bench
                </option>

                <option value="HEAT_TREATMENT">
                  Heat Treatment
                </option>

                <option value="FINISHING">
                  Finishing
                </option>
              </select>
            </div>

            <div className="rounded-lg bg-slate-100 px-4 py-2">
              <div className="text-xs text-slate-500">
                Current Stage
              </div>

              <div className="font-semibold text-slate-800">
                {stageLabel}
              </div>
            </div>

            <button
              type="button"
              onClick={loadQueue}
              className="ml-auto rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Refresh
            </button>

          </div>
        </div>

        {/* ERROR */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* SUCCESS */}
        {success && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {success}
          </div>
        )}

        {/* QUEUE */}
        <div className="mb-6 overflow-hidden rounded-xl border bg-white shadow-sm">

          <div className="border-b px-5 py-4">
            <h2 className="font-semibold text-slate-900">
              Available Work Orders
            </h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Loading production queue...
            </div>
          ) : queue.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No production WIP available for {stageLabel}.
            </div>
          ) : (
            <div className="overflow-x-auto">

              <table className="min-w-full text-sm">

                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">
                      WO
                    </th>

                    <th className="px-4 py-3">
                      Customer
                    </th>

                    <th className="px-4 py-3">
                      Grade
                    </th>

                    <th className="px-4 py-3">
                      Route
                    </th>

                    <th className="px-4 py-3 text-right">
                      Balance MTR
                    </th>

                    <th className="px-4 py-3 text-right">
                      Multiple
                    </th>

                    <th className="px-4 py-3 text-right">
                      Max Allowed
                    </th>

                    <th className="px-4 py-3">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y">

                  {queue.map((row) => {
                    const isSelected =
                      selected?.work_order_id ===
                        row.work_order_id &&
                      selected?.route_id === row.route_id;

                    return (
                      <tr
                        key={`${row.work_order_id}-${row.route_id}`}
                        className={
                          isSelected
                            ? "bg-blue-50"
                            : "hover:bg-slate-50"
                        }
                      >

                        <td className="px-4 py-3 font-semibold">
                          {row.work_order_no}
                        </td>

                        <td className="px-4 py-3">
                          {row.customer_name || "-"}
                        </td>

                        <td className="px-4 py-3">
                          {row.specification || "-"}
                        </td>

                        <td className="px-4 py-3">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold">
                            {row.route_code}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-right font-medium">
                          {n(row.balance_to_make_mtr)}
                        </td>

                        <td className="px-4 py-3 text-right">
                          {n(row.multiple, 2)}
                        </td>

                        <td className="px-4 py-3 text-right font-bold">
                          {n(row.max_allowed_mtr)}
                        </td>

                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() =>
                              selectRow(row)
                            }
                            className={
                              isSelected
                                ? "rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
                                : "rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            }
                          >
                            {isSelected
                              ? "Selected"
                              : "Select"}
                          </button>
                        </td>

                      </tr>
                    );
                  })}

                </tbody>
              </table>

            </div>
          )}
        </div>

        {/* ENTRY FORM */}
        {selected && (
          <div className="grid gap-6 lg:grid-cols-3">

            {/* WO INFORMATION */}
            <div className="rounded-xl border bg-white p-5 shadow-sm">

              <h2 className="mb-4 font-semibold text-slate-900">
                Work Order
              </h2>

              <div className="space-y-3 text-sm">

                <Info
                  label="WO No."
                  value={selected.work_order_no}
                />

                <Info
                  label="Customer"
                  value={
                    selected.customer_name || "-"
                  }
                />

                <Info
                  label="Specification"
                  value={
                    selected.specification || "-"
                  }
                />

                <Info
                  label="Route"
                  value={`${selected.route_code} — ${selected.route_name}`}
                />

                <Info
                  label="OD × WT"
                  value={`${n(selected.od, 2)} × ${n(
                    selected.wl,
                    2
                  )}`}
                />

                <Info
                  label="L1 × L2"
                  value={`${n(selected.l1, 2)} × ${n(
                    selected.l2,
                    2
                  )}`}
                />

              </div>
            </div>

            {/* CAPACITY */}
            <div className="rounded-xl border bg-white p-5 shadow-sm">

              <h2 className="mb-4 font-semibold text-slate-900">
                Production Capacity
              </h2>

              <div className="space-y-4">

                <Capacity
                  label="Balance to Make"
                  value={`${n(balanceMtr)} MTR`}
                />

                <Capacity
                  label="Multiple"
                  value={`${n(multiple, 2)} ×`}
                />

                <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4">

                  <div className="text-xs font-semibold uppercase text-blue-600">
                    Maximum Allowed
                  </div>

                  <div className="mt-1 text-2xl font-bold text-blue-900">
                    {n(maxAllowed)} MTR
                  </div>

                  <div className="mt-1 text-xs text-blue-700">
                    {stageCode === "ROLLING" &&
                      "Plan × 110%"}

                    {stageCode === "DRAW" &&
                      "Rolling Production"}

                    {stageCode ===
                      "HEAT_TREATMENT" &&
                      "Draw Bench Production"}

                    {stageCode === "FINISHING" &&
                      selected.route_code.includes(
                        "HFS"
                      ) &&
                      "Rolling HTC OK × Multiple"}

                    {stageCode === "FINISHING" &&
                      selected.route_code.includes(
                        "CDS"
                      ) &&
                      "Heat Treatment × Multiple"}
                  </div>

                </div>

              </div>
            </div>

            {/* ENTRY */}
            <div className="rounded-xl border bg-white p-5 shadow-sm">

              <h2 className="mb-4 font-semibold text-slate-900">
                Production Entry
              </h2>

              <div className="space-y-4">

                {/* DATE */}
                <Field label="Production Date">
                  <input
                    type="date"
                    value={processDate}
                    onChange={(e) =>
                      setProcessDate(
                        e.target.value
                      )
                    }
                    className="input"
                  />
                </Field>

                {/* OUTPUT */}
                <Field label="Production MTR">
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={outputQty}
                    onChange={(e) =>
                      setOutputQty(e.target.value)
                    }
                    placeholder="Enter production MTR"
                    className="input"
                  />

                  <div className="mt-1 text-xs text-slate-500">
                    Maximum:{" "}
                    <strong>
                      {n(maxAllowed)} MTR
                    </strong>
                  </div>
                </Field>

                {/* REJECTION */}
                <Field label="Rejection MTR">
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={rejectionQty}
                    onChange={(e) =>
                      setRejectionQty(
                        e.target.value
                      )
                    }
                    placeholder="0"
                    className="input"
                  />
                </Field>

                {/* HTC */}
                {stageCode === "ROLLING" && (
                  <Field label="HTC OK MTR">
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={htcOk}
                      onChange={(e) =>
                        setHtcOk(e.target.value)
                      }
                      placeholder="Enter HTC OK"
                      className="input"
                    />

                    <div className="mt-1 text-xs text-slate-500">
                      HTC OK cannot exceed net
                      Rolling Production.
                    </div>
                  </Field>
                )}

                {/* HEAT LOT */}
                {stageCode ===
                  "HEAT_TREATMENT" && (
                  <Field label="Heat Lot No.">
                    <input
                      type="text"
                      value={heatLotNo}
                      onChange={(e) =>
                        setHeatLotNo(
                          e.target.value
                        )
                      }
                      placeholder="Enter heat lot no."
                      className="input"
                    />
                  </Field>
                )}

                {/* HEAT LOT CAN ALSO BE USED WHERE REQUIRED */}
                {stageCode === "FINISHING" && (
                  <Field label="Heat Lot No.">
                    <input
                      type="text"
                      value={heatLotNo}
                      onChange={(e) =>
                        setHeatLotNo(
                          e.target.value
                        )
                      }
                      placeholder="Enter heat lot no."
                      className="input"
                    />
                  </Field>
                )}

                {/* REMARKS */}
                <Field label="Remarks">
                  <textarea
                    value={remarks}
                    onChange={(e) =>
                      setRemarks(e.target.value)
                    }
                    rows={3}
                    placeholder="Optional remarks"
                    className="input resize-none"
                  />
                </Field>

                {/* SAVE */}
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveProduction}
                  className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving
                    ? "Saving..."
                    : "Save Production Entry"}
                </button>

              </div>
            </div>

          </div>
        )}
      </div>

      {/* SIMPLE INPUT CSS */}
      <style jsx global>{`
        .input {
          width: 100%;
          border: 1px solid rgb(203 213 225);
          border-radius: 0.5rem;
          padding: 0.625rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
          background: white;
        }

        .input:focus {
          border-color: rgb(59 130 246);
          box-shadow: 0 0 0 2px rgb(191 219 254);
        }
      `}</style>
    </div>
  );
}

/* ---------------------------------------------------------
   SMALL COMPONENTS
--------------------------------------------------------- */

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex justify-between gap-4 border-b pb-2">
      <span className="text-slate-500">
        {label}
      </span>

      <span className="text-right font-medium text-slate-800">
        {value}
      </span>
    </div>
  );
}

function Capacity({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
      <span className="text-sm text-slate-500">
        {label}
      </span>

      <span className="font-semibold text-slate-900">
        {value}
      </span>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>

      {children}
    </div>
  );
}
