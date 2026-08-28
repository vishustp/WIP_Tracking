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

const STAGES = [
  {
    code: "ROLLING",
    label: "Rolling",
  },
  {
    code: "DRAW",
    label: "Draw Bench",
  },
  {
    code: "HEAT_TREATMENT",
    label: "Heat Treatment",
  },
  {
    code: "FINISHING",
    label: "Finishing",
  },
];

export default function ProductionEntryGrid() {
  const [stageCode, setStageCode] = useState("ROLLING");

  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);

  const [selected, setSelected] = useState<QueueRow | null>(null);

  const [processDate, setProcessDate] = useState(
    getLocalDate()
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

  /*
   * ---------------------------------------------------------
   * LOAD PROCESS STAGES
   * ---------------------------------------------------------
   */

  useEffect(() => {
    loadStages();
  }, []);

  async function loadStages() {
    const { data, error } = await supabase
      .from("process_stages")
      .select("id, stage_code, stage_name")
      .eq("active", true);

    if (error) {
      setError(error.message);
      return;
    }

    setStages((data || []) as Stage[]);
  }

  /*
   * ---------------------------------------------------------
   * LOAD PRODUCTION QUEUE
   * ---------------------------------------------------------
   */

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
      setQueue([]);
      setError(error.message);
      return;
    }

    setQueue((data || []) as QueueRow[]);
  }

  /*
   * ---------------------------------------------------------
   * SELECT WORK ORDER
   * ---------------------------------------------------------
   */

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

  /*
   * ---------------------------------------------------------
   * STAGE LABEL
   * ---------------------------------------------------------
   */

  const stageLabel = useMemo(() => {
    return (
      STAGES.find((x) => x.code === stageCode)?.label ||
      stageCode
    );
  }, [stageCode]);

  /*
   * ---------------------------------------------------------
   * SELECTED VALUES
   *
   * max_allowed_mtr ALWAYS COMES FROM BACKEND
   * ---------------------------------------------------------
   */

  const balanceMtr = selected
    ? Number(selected.balance_to_make_mtr || 0)
    : 0;

  const balancePcs = selected
    ? Number(selected.balance_to_make_pcs || 0)
    : 0;

  const balanceMt = selected
    ? Number(selected.balance_to_make_mt || 0)
    : 0;

  const multiple = selected
    ? Number(selected.multiple || 1)
    : 1;

  const maxAllowed = selected
    ? Number(selected.max_allowed_mtr || 0)
    : 0;

  /*
   * ---------------------------------------------------------
   * MAXIMUM FORMULA LABEL
   * ---------------------------------------------------------
   */

  function getMaximumFormula(row: QueueRow | null) {
    if (!row) return "";

    switch (stageCode) {
      case "ROLLING":
        return "Plan × 110%";

      case "DRAW":
        return "Rolling Production";

      case "HEAT_TREATMENT":
        return "Draw Bench Production";

      case "FINISHING":
        if (
          row.route_code === "HFS" ||
          row.route_code === "ALLOY_HFS"
        ) {
          return "Rolling HTC OK × Multiple";
        }

        if (
          row.route_code === "CDS" ||
          row.route_code === "ALLOY_CDS"
        ) {
          return "Heat Treatment × Multiple";
        }

        return "Route based maximum";

      default:
        return "";
    }
  }

  /*
   * ---------------------------------------------------------
   * VALIDATION
   * ---------------------------------------------------------
   */

  function validateForm() {
    setError("");

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

    if (!outputQty || qty <= 0) {
      setError(
        "Production MTR must be greater than zero."
      );
      return false;
    }

    if (rejection < 0) {
      setError(
        "Rejection MTR cannot be negative."
      );
      return false;
    }

    if (rejection > qty) {
      setError(
        "Rejection MTR cannot exceed Production MTR."
      );
      return false;
    }

    if (htc < 0) {
      setError("HTC OK cannot be negative.");
      return false;
    }

    /*
     * HTC OK only at Rolling
     */

    if (
      stageCode !== "ROLLING" &&
      htc !== 0
    ) {
      setError(
        "HTC OK can only be entered at Rolling."
      );
      return false;
    }

    /*
     * Rolling HTC OK cannot exceed net rolling production
     */

    if (stageCode === "ROLLING") {
      const netRolling =
        qty - rejection;

      if (htc > netRolling + 0.000001) {
        setError(
          "HTC OK cannot exceed Net Rolling Production."
        );
        return false;
      }
    }

    /*
     * IMPORTANT:
     *
     * Maximum comes directly from backend.
     */

    if (
      qty >
      maxAllowed + 0.000001
    ) {
      setError(
        `Production exceeds Maximum Allowed ${formatNumber(
          maxAllowed,
          3
        )} MTR.`
      );

      return false;
    }

    return true;
  }

  /*
   * ---------------------------------------------------------
   * SAVE PRODUCTION
   * ---------------------------------------------------------
   */

  async function saveProduction() {
    setError("");
    setSuccess("");

    if (!validateForm()) {
      return;
    }

    if (!selected) {
      return;
    }

    const stage = stages.find(
      (s) =>
        s.stage_code === selected.stage_code
    );

    if (!stage) {
      setError(
        `Process stage ${selected.stage_code} not found.`
      );
      return;
    }

    setSaving(true);

    const { data, error } =
      await supabase.rpc(
        "create_production_entry",
        {
          p_work_order_id:
            selected.work_order_id,

          /*
           * Currently queue does not return
           * rolling_plan_id.
           *
           * Backend column allows NULL.
           */
          p_rolling_plan_id: null,

          p_stage_id: stage.id,

          p_process_route_id:
            selected.route_id,

          p_process_date:
            processDate,

          p_output_qty:
            Number(outputQty),

          p_rejection_qty:
            Number(rejectionQty || 0),

          p_htc_ok:
            Number(htcOk || 0),

          p_heat_lot_no:
            heatLotNo.trim() || null,

          p_remarks:
            remarks.trim() || null,
        }
      );

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess(
      `Production entry saved successfully.`
    );

    /*
     * Clear form
     */

    setOutputQty("");
    setRejectionQty("");
    setHtcOk("");
    setHeatLotNo("");
    setRemarks("");

    /*
     * Reload WIP
     */

    await loadQueue();
  }

  /*
   * ---------------------------------------------------------
   * FORMAT HELPERS
   * ---------------------------------------------------------
   */

  function formatNumber(
    value: number | null | undefined,
    digits = 3
  ) {
    if (
      value === null ||
      value === undefined ||
      Number.isNaN(Number(value))
    ) {
      return "-";
    }

    return Number(value).toLocaleString(
      "en-IN",
      {
        minimumFractionDigits: 0,
        maximumFractionDigits: digits,
      }
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl">

        {/* =====================================================
            HEADER
        ===================================================== */}

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            Production Entry
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Enter production against available Work Order WIP.
          </p>
        </div>

        {/* =====================================================
            STAGE SELECTOR
        ===================================================== */}

        <div className="mb-5 rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-4">

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Production Stage
              </label>

              <select
                value={stageCode}
                onChange={(e) => {
                  setStageCode(e.target.value);
                  setError("");
                  setSuccess("");
                }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium outline-none focus:border-blue-500"
              >
                {STAGES.map((stage) => (
                  <option
                    key={stage.code}
                    value={stage.code}
                  >
                    {stage.label}
                  </option>
                ))}
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
              disabled={loading}
              className="ml-auto rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {/* =====================================================
            ERROR
        ===================================================== */}

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* =====================================================
            SUCCESS
        ===================================================== */}

        {success && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {success}
          </div>
        )}

        {/* =====================================================
            QUEUE
        ===================================================== */}

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
              No production WIP available for{" "}
              {stageLabel}.
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
                      selected?.route_id ===
                        row.route_id;

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
                          {formatNumber(
                            row.balance_to_make_mtr
                          )}
                        </td>

                        <td className="px-4 py-3 text-right">
                          {formatNumber(
                            row.multiple,
                            2
                          )}
                        </td>

                        <td className="px-4 py-3 text-right font-bold text-blue-700">
                          {formatNumber(
                            row.max_allowed_mtr
                          )}
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

        {/* =====================================================
            ENTRY SECTION
        ===================================================== */}

        {selected && (
          <div className="grid gap-6 lg:grid-cols-3">

            {/* =================================================
                WORK ORDER INFORMATION
            ================================================= */}

            <div className="rounded-xl border bg-white p-5 shadow-sm">

              <h2 className="mb-4 font-semibold text-slate-900">
                Work Order
              </h2>

              <div className="space-y-3 text-sm">

                <Info
                  label="WO No."
                  value={
                    selected.work_order_no
                  }
                />

                <Info
                  label="Customer"
                  value={
                    selected.customer_name ||
                    "-"
                  }
                />

                <Info
                  label="Specification"
                  value={
                    selected.specification ||
                    "-"
                  }
                />

                <Info
                  label="Route"
                  value={`${selected.route_code} — ${selected.route_name}`}
                />

                <Info
                  label="OD × WT"
                  value={`${formatNumber(
                    selected.od,
                    2
                  )} × ${formatNumber(
                    selected.wl,
                    2
                  )}`}
                />

                <Info
                  label="L1 × L2"
                  value={`${formatNumber(
                    selected.l1,
                    2
                  )} × ${formatNumber(
                    selected.l2,
                    2
                  )}`}
                />

                <Info
                  label="Average Length"
                  value={`${formatNumber(
                    selected.avg_length,
                    3
                  )} m`}
                />

              </div>
            </div>

            {/* =================================================
                CAPACITY
            ================================================= */}

            <div className="rounded-xl border bg-white p-5 shadow-sm">

              <h2 className="mb-4 font-semibold text-slate-900">
                Production Capacity
              </h2>

              <div className="space-y-4">

                <Capacity
                  label="Balance to Make"
                  value={`${formatNumber(
                    balanceMtr
                  )} MTR`}
                />

                <Capacity
                  label="Balance PCS"
                  value={formatNumber(
                    balancePcs,
                    0
                  )}
                />

                <Capacity
                  label="Balance MT"
                  value={`${formatNumber(
                    balanceMt
                  )} MT`}
                />

                <Capacity
                  label="Multiple"
                  value={`${formatNumber(
                    multiple,
                    2
                  )} ×`}
                />

                {/* MAXIMUM */}

                <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4">

                  <div className="text-xs font-semibold uppercase text-blue-600">
                    Maximum Allowed
                  </div>

                  <div className="mt-1 text-2xl font-bold text-blue-900">
                    {formatNumber(
                      maxAllowed
                    )} MTR
                  </div>

                  <div className="mt-1 text-xs font-medium text-blue-700">
                    {getMaximumFormula(
                      selected
                    )}
                  </div>

                </div>

              </div>
            </div>

            {/* =================================================
                PRODUCTION ENTRY
            ================================================= */}

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

                {/* PRODUCTION */}

                <Field label="Production MTR">

                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={outputQty}
                    onChange={(e) =>
                      setOutputQty(
                        e.target.value
                      )
                    }
                    placeholder="Enter production MTR"
                    className="input"
                  />

                  <div className="mt-1 text-xs text-slate-500">
                    Maximum Allowed:{" "}
                    <strong className="text-slate-700">
                      {formatNumber(
                        maxAllowed
                      )} MTR
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
                        setHtcOk(
                          e.target.value
                        )
                      }
                      placeholder="Enter HTC OK"
                      className="input"
                    />

                    <div className="mt-1 text-xs text-slate-500">
                      HTC OK cannot exceed
                      Net Rolling Production.
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

                {/* FINISHING HEAT LOT */}

                {stageCode ===
                  "FINISHING" && (
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
                      setRemarks(
                        e.target.value
                      )
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

      {/* =======================================================
          INPUT CSS
      ======================================================= */}

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

        .input:disabled {
          background: rgb(241 245 249);
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

/* =========================================================
   LOCAL DATE
========================================================= */

function getLocalDate() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(
    now.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    now.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/* =========================================================
   INFO
========================================================= */

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

/* =========================================================
   CAPACITY
========================================================= */

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

/* =========================================================
   FIELD
========================================================= */

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
