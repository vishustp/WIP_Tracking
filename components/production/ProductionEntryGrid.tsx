'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type StageCode =
  | 'ROLLING'
  | 'HOLLOW_HEAT_TREATMENT'
  | 'DRAW'
  | 'HEAT_TREATMENT'
  | 'FINISHING';

type QueueRow = {
  work_order_id: string;
  work_order_no: string;
  customer_name: string | null;
  uom: 'Pcs' | 'Mtrs';
  route_id: string;
  route_code: string;
  route_name: string;
  stage_id: string;
  stage_code: StageCode;
  stage_name: string;
  sequence_no: number;
  balance_to_make: number;
};

type EntryRow = QueueRow & {
  production_qty: string;
  rejection_qty: string;
  heat_lot_no: string;
  remarks: string;
};

type ProductionEntryGridProps = {
  stageCode: StageCode;
};

const stageLabels: Record<StageCode, string> = {
  ROLLING: 'Rolling',
  HOLLOW_HEAT_TREATMENT: 'Hollow Heat Treatment',
  DRAW: 'Draw',
  HEAT_TREATMENT: 'Heat Treatment',
  FINISHING: 'Finishing',
};

export default function ProductionEntryGrid({
  stageCode,
}: ProductionEntryGridProps) {
  const supabase = createClient();

  const [date, setDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );

  const [rows, setRows] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const stageLabel = stageLabels[stageCode];

  async function loadQueue() {
    setLoading(true);
    setMessage('');

    const { data, error } = await supabase.rpc(
      'get_production_entry_queue',
      {
        p_stage_code: stageCode,
      }
    );

    if (error) {
      setRows([]);
      setMessage(error.message);
      setLoading(false);
      return;
    }

    const queue = (data ?? []) as QueueRow[];

    const entryRows: EntryRow[] = queue
      .filter((row) => Number(row.balance_to_make) > 0)
      .map((row) => ({
        ...row,
        production_qty: '',
        rejection_qty: '',
        heat_lot_no: '',
        remarks: '',
      }));

    setRows(entryRows);
    setLoading(false);
  }

  useEffect(() => {
    void loadQueue();
  }, [stageCode]);

  function updateRow(
    id: string,
    field:
      | 'production_qty'
      | 'rejection_qty'
      | 'heat_lot_no'
      | 'remarks',
    value: string
  ) {
    setRows((currentRows) =>
      currentRows.map((row) => {
        const rowId = `${row.work_order_id}-${row.route_id}`;

        if (rowId !== id) {
          return row;
        }

        return {
          ...row,
          [field]: value,
        };
      })
    );
  }

  async function saveProduction() {
    setMessage('');

    const entries = rows.filter(
      (row) => Number(row.production_qty) > 0
    );

    if (entries.length === 0) {
      setMessage(
        'Enter Production Qty for at least one work order.'
      );
      return;
    }

    for (const row of entries) {
      const productionQty = Number(row.production_qty);
      const rejectionQty = Number(row.rejection_qty || 0);
      const balanceToMake = Number(row.balance_to_make);

      if (!Number.isFinite(productionQty) || productionQty <= 0) {
        setMessage(
          `Invalid Production Qty for ${row.work_order_no}.`
        );
        return;
      }

      if (productionQty > balanceToMake) {
        setMessage(
          `${row.work_order_no}: Production Qty cannot exceed Balance to Make (${balanceToMake} ${row.uom}).`
        );
        return;
      }

      if (
        !Number.isFinite(rejectionQty) ||
        rejectionQty < 0
      ) {
        setMessage(
          `${row.work_order_no}: Invalid rejection quantity.`
        );
        return;
      }

      if (rejectionQty > productionQty) {
        setMessage(
          `${row.work_order_no}: Rejection cannot be greater than Production Qty.`
        );
        return;
      }
    }

    setSaving(true);

    try {
      for (const row of entries) {
        const productionQty = Number(row.production_qty);
        const rejectionQty = Number(row.rejection_qty || 0);

        const { error } = await supabase.rpc(
          'record_production',
          {
            p_work_order_id: row.work_order_id,
            p_route_id: row.route_id,
            p_stage_code: row.stage_code,
            p_process_date: date,
            p_input_qty: productionQty,
            p_output_qty: productionQty,
            p_rejection_qty: rejectionQty,
            p_heat_lot_no:
              row.heat_lot_no.trim() || null,
            p_remarks:
              row.remarks.trim() || null,
          }
        );

        if (error) {
          throw error;
        }
      }

      setMessage(
        `${entries.length} production row(s) saved successfully.`
      );

      await loadQueue();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Production entry failed.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            Production Entry
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            {stageLabel}
          </p>
        </div>

        <label className="text-sm font-medium">
          Production Date

          <input
            type="date"
            className="mt-1 block h-10 rounded-md border bg-background px-3"
            value={date}
            onChange={(event) =>
              setDate(event.target.value)
            }
          />
        </label>
      </div>

      {/* Stage information */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-md border bg-muted/30 px-4 py-2 text-sm">
          <span className="text-muted-foreground">
            Work Center:
          </span>{' '}
          <strong>{stageLabel}</strong>
        </div>

        <div className="rounded-md border bg-muted/30 px-4 py-2 text-sm">
          Only orders with{' '}
          <strong>Balance to Make &gt; 0</strong>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className="rounded-md border p-3 text-sm">
          {message}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="rounded-xl border p-8 text-center text-sm">
          Loading eligible work orders…
        </div>
      )}

      {/* Empty */}
      {!loading && rows.length === 0 && (
        <div className="rounded-xl border p-8 text-center">
          <div className="font-medium">
            No eligible orders
          </div>

          <div className="mt-1 text-sm text-muted-foreground">
            No work order with Balance to Make greater than
            zero is available for {stageLabel}.
          </div>
        </div>
      )}

      {/* Production Table */}
      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="min-w-[1250px] w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="border-b">
                <th className="p-3 text-left">
                  S No
                </th>

                <th className="p-3 text-left">
                  Work Order
                </th>

                <th className="p-3 text-left">
                  Customer
                </th>

                <th className="p-3 text-left">
                  Route
                </th>

                <th className="p-3 text-left">
                  UOM
                </th>

                <th className="p-3 text-right">
                  Balance to Make
                </th>

                <th className="p-3 text-right">
                  Production Qty
                </th>

                <th className="p-3 text-right">
                  Rejection
                </th>

                <th className="p-3 text-left">
                  Heat / Lot No.
                </th>

                <th className="p-3 text-left">
                  Remarks
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row, index) => {
                const rowId = `${row.work_order_id}-${row.route_id}`;

                return (
                  <tr
                    key={rowId}
                    className="border-b last:border-b-0"
                  >
                    {/* S No */}
                    <td className="p-3">
                      {index + 1}
                    </td>

                    {/* Work Order */}
                    <td className="p-3 font-medium">
                      {row.work_order_no}
                    </td>

                    {/* Customer */}
                    <td className="p-3">
                      {row.customer_name || '—'}
                    </td>

                    {/* Route */}
                    <td className="p-3">
                      <div className="font-medium">
                        {row.route_code}
                      </div>

                      {row.route_name && (
                        <div className="text-xs text-muted-foreground">
                          {row.route_name}
                        </div>
                      )}
                    </td>

                    {/* UOM */}
                    <td className="p-3 font-semibold">
                      {row.uom}
                    </td>

                    {/* Balance */}
                    <td className="p-3 text-right font-medium">
                      {Number(
                        row.balance_to_make
                      ).toLocaleString()}{' '}
                      {row.uom}
                    </td>

                    {/* Production */}
                    <td className="p-2">
                      <input
                        type="number"
                        min="0"
                        max={row.balance_to_make}
                        step="any"
                        className="h-9 w-32 rounded-md border px-2 text-right"
                        placeholder="0"
                        value={row.production_qty}
                        onChange={(event) =>
                          updateRow(
                            rowId,
                            'production_qty',
                            event.target.value
                          )
                        }
                      />
                    </td>

                    {/* Rejection */}
                    <td className="p-2">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        className="h-9 w-28 rounded-md border px-2 text-right"
                        placeholder="0"
                        value={row.rejection_qty}
                        onChange={(event) =>
                          updateRow(
                            rowId,
                            'rejection_qty',
                            event.target.value
                          )
                        }
                      />
                    </td>

                    {/* Heat / Lot */}
                    <td className="p-2">
                      <input
                        type="text"
                        className="h-9 w-44 rounded-md border px-2"
                        placeholder="Optional"
                        value={row.heat_lot_no}
                        onChange={(event) =>
                          updateRow(
                            rowId,
                            'heat_lot_no',
                            event.target.value
                          )
                        }
                      />
                    </td>

                    {/* Remarks */}
                    <td className="p-2">
                      <input
                        type="text"
                        className="h-9 w-52 rounded-md border px-2"
                        placeholder="Remarks"
                        value={row.remarks}
                        onChange={(event) =>
                          updateRow(
                            rowId,
                            'remarks',
                            event.target.value
                          )
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Save */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void saveProduction()}
          disabled={
            saving ||
            loading ||
            rows.length === 0
          }
          className="rounded-md border px-6 py-2.5 font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving
            ? 'Saving…'
            : 'Save Production'}
        </button>
      </div>
    </div>
  );
}
