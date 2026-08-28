'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Edit2,
  Trash2,
  RefreshCw,
  Search,
} from 'lucide-react';

type WO = {
  id: string;
  work_order_no: string;
  customer_name: string | null;
  grade: string | null;
  size_od: number | null;
  size_wt: number | null;
  od?: number | null;
  wt?: number | null;
  l1: number | null;
  l2: number | null;
  ordered_qty: number;
  uom: 'Pcs' | 'Mtrs';
  balance_qty_mtr: number;
};

type Route = {
  id: string;
  route_code: string;
  route_name: string;
  material_category: string;
};

type Plan = {
  id: string;
  plan_no: string;
  work_order_id: string;
  work_order_no: string;
  customer_name: string | null;
  grade: string | null;

  size_od?: number | null;
  size_wt?: number | null;

  od: number | null;
  wt: number | null;
  l1: number | null;
  l2: number | null;
  avg_length: number | null;

  route_id: string;
  route_code: string;
  route_name: string;

  planned_rolling_date: string;

  planned_mtr: number;
  planned_pcs: number;
  planned_mt: number;

  mh_od: number | null;
  mh_wt: number | null;
  mh_l1: number | null;
  mh_l2: number | null;
  pass_required: number;

  multiple: number;

  status: string;
  created_at: string;
  updated_at: string;
  can_modify: boolean;
};

const fmt = (n: number | null | undefined) =>
  n == null
    ? '—'
    : Number(n).toLocaleString(undefined, {
        maximumFractionDigits: 3,
      });

const calc = (wo: WO | Plan | null, pcs: number) => {
  if (!wo) {
    return {
      avg: 0,
      mtr: 0,
      mt: 0,
    };
  }

  const l1 = Number(wo.l1 || 0);
  const l2 = Number(wo.l2 || 0);

  const avg =
    l1 > 0 && l2 > 0
      ? (l1 + l2) / 2
      : l1 > 0
        ? l1
        : l2 > 0
          ? l2
          : 0;

  const mtr = pcs * avg;

  const od = Number(
    (wo as any).size_od ??
      (wo as any).od ??
      0
  );

  const wt = Number(
    (wo as any).size_wt ??
      (wo as any).wt ??
      0
  );

  const mt =
    Math.max(od - wt, 0) *
    Math.max(wt, 0) *
    0.0246615 *
    0.001 *
    mtr;

  return {
    avg,
    mtr,
    mt,
  };
};

export default function RollingPlanForm() {
  const searchParams = useSearchParams();

  const initialWoId =
    searchParams?.get('wo') || '';

  const [wos, setWos] = useState<WO[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);

  const [wo, setWo] = useState(initialWoId);
  const [qtyPcs, setQtyPcs] = useState('');

  const [route, setRoute] = useState('');

  const [date, setDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  /* Mother Hollow fields */
  const [mhOd, setMhOd] = useState('');
  const [mhWt, setMhWt] = useState('');
  const [mhL1, setMhL1] = useState('');
  const [mhL2, setMhL2] = useState('');

  /* Pass */
  const [passRequired, setPassRequired] =
    useState('1');

  /* Multiple */
  const [multiple, setMultiple] =
    useState('1');

  const [availableMtr, setAvailableMtr] =
    useState<number | null>(null);

  const [loading, setLoading] =
    useState(false);

  /* Plans */
  const [plans, setPlans] =
    useState<Plan[]>([]);

  const [search, setSearch] =
    useState('');

  const [filterRoute, setFilterRoute] =
    useState('');

  const [fromDate, setFromDate] =
    useState('');

  const [toDate, setToDate] =
    useState('');

  const [plansLoading, setPlansLoading] =
    useState(false);

  /* Edit */
  const [editing, setEditing] =
    useState<Plan | null>(null);

  const [editQtyPcs, setEditQtyPcs] =
    useState('');

  const [editDate, setEditDate] =
    useState('');

  const [editRoute, setEditRoute] =
    useState('');

  const [editMhOd, setEditMhOd] =
    useState('');

  const [editMhWt, setEditMhWt] =
    useState('');

  const [editMhL1, setEditMhL1] =
    useState('');

  const [editMhL2, setEditMhL2] =
    useState('');

  const [editPassRequired, setEditPassRequired] =
    useState('1');

  const [editMultiple, setEditMultiple] =
    useState('1');

  const [editSaving, setEditSaving] =
    useState(false);

  /* --------------------------------------------------
     Load plans
  -------------------------------------------------- */

  const loadPlans = useCallback(async () => {
    setPlansLoading(true);

    const s = createClient();

    const { data, error } =
      await s.rpc('get_rolling_plans', {
        p_search:
          search.trim() || null,

        p_route_code:
          filterRoute || null,

        p_from_date:
          fromDate || null,

        p_to_date:
          toDate || null,

        p_limit: 2000,
        p_offset: 0,
      });

    if (error) {
      toast.error(error.message);
    } else {
      setPlans(
        (data ?? []) as Plan[]
      );
    }

    setPlansLoading(false);
  }, [
    filterRoute,
    fromDate,
    search,
    toDate,
  ]);

  /* --------------------------------------------------
     Load work orders + routes
  -------------------------------------------------- */

  useEffect(() => {
    const s = createClient();

    Promise.all([
      s
        .from('work_orders')
        .select(
          'id,work_order_no,customer_name,grade,size_od,size_wt,l1,l2,ordered_qty,uom,balance_qty_mtr'
        )
        .order('work_order_no'),

      s
        .from('process_routes')
        .select(
          'id,route_code,route_name,material_category'
        )
        .eq('active', true)
        .order('route_code'),
    ]).then(([a, b]) => {
      if (a.error) {
        toast.error(a.error.message);
      } else {
        setWos(
          (a.data ?? []) as WO[]
        );

        if (initialWoId) {
          lookup(initialWoId);
        }
      }

      if (b.error) {
        toast.error(b.error.message);
      } else {
        const routeList =
          (b.data ?? []) as Route[];

        setRoutes(routeList);

        if (
          routeList.length > 0 &&
          !route
        ) {
          setRoute(routeList[0].id);
        }
      }
    });
  }, [initialWoId]);

  /* --------------------------------------------------
     Load plans
  -------------------------------------------------- */

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  /* --------------------------------------------------
     Selected WO
  -------------------------------------------------- */

  const selected = useMemo(
    () =>
      wos.find(
        x => x.id === wo
      ),
    [wos, wo]
  );

  const derived = useMemo(
    () =>
      calc(
        selected ?? null,
        Number(qtyPcs || 0)
      ),
    [selected, qtyPcs]
  );

  /* --------------------------------------------------
     Work order lookup
  -------------------------------------------------- */

  const lookup = async (id: string) => {
    setWo(id);
    setQtyPcs('');

    if (!id) {
      setAvailableMtr(null);
      return;
    }

    const {
      data,
      error,
    } = await createClient().rpc(
      'get_unplanned_qty',
      {
        p_work_order_id: id,
      }
    );

    if (error) {
      toast.error(error.message);
    } else {
      setAvailableMtr(
        Number(data ?? 0)
      );
    }
  };

  /* --------------------------------------------------
     Allocation
  -------------------------------------------------- */

  const allocation = useMemo(() => {
    if (
      !selected ||
      availableMtr === null
    ) {
      return null;
    }

    const totalOrderMtr =
      Number(
        selected.balance_qty_mtr ||
          selected.ordered_qty ||
          0
      );

    const plannedSoFar = Math.max(
      0,
      totalOrderMtr -
        availableMtr
    );

    const newlyPlannedMtr =
      derived.mtr;

    const remainingUnplanned =
      Math.max(
        0,
        availableMtr -
          newlyPlannedMtr
      );

    const plannedPct = Math.min(
      100,
      (plannedSoFar /
        (totalOrderMtr || 1)) *
        100
    );

    const newPct = Math.min(
      100 - plannedPct,
      (newlyPlannedMtr /
        (totalOrderMtr || 1)) *
        100
    );

    const remainingPct =
      Math.max(
        0,
        100 -
          plannedPct -
          newPct
      );

    return {
      totalOrderMtr,
      plannedSoFar,
      newlyPlannedMtr,
      remainingUnplanned,
      plannedPct,
      newPct,
      remainingPct,
    };
  }, [
    selected,
    availableMtr,
    derived.mtr,
  ]);

  /* --------------------------------------------------
     Create rolling plan
  -------------------------------------------------- */

  async function submit(
    e: React.FormEvent
  ) {
    e.preventDefault();

    if (!wo || !route) {
      return toast.error(
        'Select Work Order and route'
      );
    }

    const pcs =
      Number(qtyPcs);

    if (
      !Number.isFinite(pcs) ||
      pcs <= 0
    ) {
      return toast.error(
        'Enter a valid Planned PCS.'
      );
    }

    const d = calc(
      selected ?? null,
      pcs
    );

    if (
      availableMtr !== null &&
      d.mtr > availableMtr
    ) {
      return toast.error(
        `Calculated MTR ${fmt(
          d.mtr
        )} exceeds available ${fmt(
          availableMtr
        )} MTR`
      );
    }

    const mhOdValue =
      Number(mhOd);

    const mhWtValue =
      Number(mhWt);

    const mhL1Value =
      Number(mhL1);

    const mhL2Value =
      Number(mhL2);

    const passValue =
      Number(passRequired);

    const multipleValue =
      Number(multiple);

    if (
      !Number.isFinite(mhOdValue) ||
      mhOdValue <= 0
    ) {
      return toast.error(
        'Enter valid MH OD.'
      );
    }

    if (
      !Number.isFinite(mhWtValue) ||
      mhWtValue <= 0
    ) {
      return toast.error(
        'Enter valid MH WT.'
      );
    }

    if (
      !Number.isFinite(mhL1Value) ||
      mhL1Value <= 0
    ) {
      return toast.error(
        'Enter valid MH L1.'
      );
    }

    if (
      !Number.isFinite(mhL2Value) ||
      mhL2Value <= 0
    ) {
      return toast.error(
        'Enter valid MH L2.'
      );
    }

    if (
      ![1, 2, 3].includes(
        passValue
      )
    ) {
      return toast.error(
        'Pass Required must be 1, 2 or 3.'
      );
    }

    if (
      !Number.isFinite(
        multipleValue
      ) ||
      multipleValue <= 0
    ) {
      return toast.error(
        'Multiple must be positive.'
      );
    }

    setLoading(true);

    const {
      data,
      error,
    } = await createClient().rpc(
      'create_rolling_plan',
      {
        p_work_order_id: wo,

        p_planned_qty: d.mtr,

        p_rolling_date: date,

        p_route_id: route,

        p_mh_od: mhOdValue,

        p_mh_wt: mhWtValue,

        p_mh_l1: mhL1Value,

        p_mh_l2: mhL2Value,

        p_pass_required:
          passValue,

        p_multiple:
          multipleValue,
      }
    );

    setLoading(false);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(
        `Rolling plan ${data} created for ${fmt(
          pcs
        )} PCS (${fmt(
          d.mtr
        )} MTR)`
      );

      setQtyPcs('');

      setMhOd('');
      setMhWt('');
      setMhL1('');
      setMhL2('');

      setPassRequired('1');
      setMultiple('1');

      await Promise.all([
        lookup(wo),
        loadPlans(),
      ]);
    }
  }

  /* --------------------------------------------------
     Start edit
  -------------------------------------------------- */

  function startEdit(
    p: Plan
  ) {
    setEditing(p);

    setEditQtyPcs(
      String(
        p.planned_pcs ||
          (
            (p.avg_length || 0) > 0
              ? p.planned_mtr /
                (p.avg_length || 1)
              : 0
          )
      )
    );

    setEditDate(
      p.planned_rolling_date
    );

    setEditRoute(
      p.route_id
    );

    setEditMhOd(
      String(p.mh_od ?? '')
    );

    setEditMhWt(
      String(p.mh_wt ?? '')
    );

    setEditMhL1(
      String(p.mh_l1 ?? '')
    );

    setEditMhL2(
      String(p.mh_l2 ?? '')
    );

    setEditPassRequired(
      String(
        p.pass_required ?? 1
      )
    );

    setEditMultiple(
      String(
        p.multiple ?? 1
      )
    );
  }

  /* --------------------------------------------------
     Save edit
  -------------------------------------------------- */

  async function saveEdit() {
    if (!editing) {
      return;
    }

    const pcs =
      Number(editQtyPcs);

    if (
      !Number.isFinite(pcs) ||
      pcs <= 0
    ) {
      return toast.error(
        'Enter a valid Planned PCS.'
      );
    }

    const d = calc(
      editing,
      pcs
    );

    const mhOdValue =
      Number(editMhOd);

    const mhWtValue =
      Number(editMhWt);

    const mhL1Value =
      Number(editMhL1);

    const mhL2Value =
      Number(editMhL2);

    const passValue =
      Number(editPassRequired);

    const mult =
      Number(editMultiple);

    if (
      !Number.isFinite(mhOdValue) ||
      mhOdValue <= 0
    ) {
      return toast.error(
        'Enter valid MH OD.'
      );
    }

    if (
      !Number.isFinite(mhWtValue) ||
      mhWtValue <= 0
    ) {
      return toast.error(
        'Enter valid MH WT.'
      );
    }

    if (
      !Number.isFinite(mhL1Value) ||
      mhL1Value <= 0
    ) {
      return toast.error(
        'Enter valid MH L1.'
      );
    }

    if (
      !Number.isFinite(mhL2Value) ||
      mhL2Value <= 0
    ) {
      return toast.error(
        'Enter valid MH L2.'
      );
    }

    if (
      ![1, 2, 3].includes(
        passValue
      )
    ) {
      return toast.error(
        'Pass Required must be 1, 2 or 3.'
      );
    }

    if (
      !Number.isFinite(mult) ||
      mult <= 0
    ) {
      return toast.error(
        'Multiple must be positive.'
      );
    }

    setEditSaving(true);

    const {
      error,
    } = await createClient().rpc(
      'update_rolling_plan',
      {
        p_plan_id: editing.id,

        p_planned_qty: d.mtr,

        p_rolling_date:
          editDate,

        p_route_id:
          editRoute,

        p_mh_od:
          mhOdValue,

        p_mh_wt:
          mhWtValue,

        p_mh_l1:
          mhL1Value,

        p_mh_l2:
          mhL2Value,

        p_pass_required:
          passValue,

        p_multiple:
          mult,
      }
    );

    setEditSaving(false);

    if (error) {
      toast.error(
        error.message
      );
    } else {
      toast.success(
        'Rolling plan updated successfully.'
      );

      setEditing(null);

      await loadPlans();
    }
  }

  /* --------------------------------------------------
     Delete
  -------------------------------------------------- */

  async function removePlan(
    p: Plan
  ) {
    if (
      !window.confirm(
        `Delete Rolling Plan ${p.plan_no} for WO ${p.work_order_no}?`
      )
    ) {
      return;
    }

    const {
      error,
    } = await createClient().rpc(
      'delete_rolling_plan',
      {
        p_plan_id: p.id,
      }
    );

    if (error) {
      toast.error(
        error.message
      );
    } else {
      toast.success(
        'Rolling plan deleted successfully.'
      );

      await loadPlans();
    }
  }

  const routesInPlans =
    useMemo(
      () =>
        Array.from(
          new Set(
            plans.map(
              p => p.route_code
            )
          )
        ).sort(),
      [plans]
    );

  return (
    <div className="space-y-6">

      {/* ==================================================
          ROLLING PLAN FORM
      ================================================== */}

      <form
        onSubmit={submit}
        className="space-y-5 rounded-xl border border-slate-200/90 bg-white p-6 shadow-sm"
      >

        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Issue Rolling Plan
          </h1>
        </div>

        <div className="grid gap-4 md:grid-cols-2">

          {/* Work Order */}

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Work Order *
            </label>

            <Select
              value={wo}
              onChange={e =>
                void lookup(
                  e.target.value
                )
              }
              required
            >
              <option value="">
                Select Work Order
              </option>

              {wos.map(x => (
                <option
                  key={x.id}
                  value={x.id}
                >
                  {x.work_order_no} ·{' '}
                  {x.customer_name ||
                    'No Customer'} ·{' '}
                  {x.size_od}×
                  {x.size_wt}mm (
                  {x.grade})
                </option>
              ))}
            </Select>
          </div>

          {/* Route */}

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Target Process Route *
            </label>

            <Select
              value={route}
              onChange={e =>
                setRoute(
                  e.target.value
                )
              }
              required
            >
              <option value="">
                Select Route
              </option>

              {routes.map(r => (
                <option
                  key={r.id}
                  value={r.id}
                >
                  {r.route_code} —{' '}
                  {r.route_name} (
                  {
                    r.material_category
                  }
                  )
                </option>
              ))}
            </Select>
          </div>

          {/* Allocation */}

          {allocation && (
            <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4">

              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800">
                  Order Allocation
                </span>

                <span className="font-mono text-slate-500">
                  Total:{' '}
                  {fmt(
                    allocation.totalOrderMtr
                  )}{' '}
                  MTR
                </span>
              </div>

              <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-slate-200">

                <div
                  className="bg-blue-600"
                  style={{
                    width: `${allocation.plannedPct}%`,
                  }}
                />

                <div
                  className="bg-emerald-500"
                  style={{
                    width: `${allocation.newPct}%`,
                  }}
                />

                <div
                  className="bg-slate-300"
                  style={{
                    width: `${allocation.remainingPct}%`,
                  }}
                />

              </div>

              <div className="mt-2 flex flex-wrap gap-4 text-[11px]">

                <span>
                  Prev Planned:{' '}
                  <b>
                    {fmt(
                      allocation.plannedSoFar
                    )}{' '}
                    MTR
                  </b>
                </span>

                <span>
                  This Batch:{' '}
                  <b>
                    {fmt(
                      allocation.newlyPlannedMtr
                    )}{' '}
                    MTR
                  </b>
                </span>

                <span>
                  Remaining:{' '}
                  <b>
                    {fmt(
                      allocation.remainingUnplanned
                    )}{' '}
                    MTR
                  </b>
                </span>

              </div>
            </div>
          )}

          {/* Summary */}

          {selected && (
            <div className="md:col-span-2 grid grid-cols-2 gap-3 sm:grid-cols-4">

              <div className="rounded-lg border p-3">
                <div className="text-xs text-slate-500">
                  Average Length
                </div>

                <div className="mt-0.5 text-base font-bold">
                  {fmt(
                    derived.avg
                  )}{' '}
                  m
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="text-xs text-slate-500">
                  Planned PCS
                </div>

                <div className="mt-0.5 text-base font-bold">
                  {fmt(
                    Number(
                      qtyPcs || 0
                    )
                  )}{' '}
                  PCS
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="text-xs text-slate-500">
                  Planned MTR
                </div>

                <div className="mt-0.5 text-base font-bold">
                  {fmt(
                    derived.mtr
                  )}{' '}
                  MTR
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="text-xs text-slate-500">
                  Planned MT
                </div>

                <div className="mt-0.5 text-base font-bold">
                  {fmt(
                    derived.mt
                  )}{' '}
                  MT
                </div>
              </div>

            </div>
          )}

          {/* Planned PCS */}

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Planned Quantity (PCS) *
            </label>

            <Input
              type="number"
              min="1"
              step="1"
              max={
                selected &&
                derived.avg > 0 &&
                availableMtr != null
                  ? Math.floor(
                      availableMtr /
                        derived.avg
                    )
                  : undefined
              }
              value={qtyPcs}
              onChange={e =>
                setQtyPcs(
                  e.target.value
                )
              }
              required
            />
          </div>

          {/* Date */}

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Planned Rolling Date *
            </label>

            <Input
              type="date"
              value={date}
              onChange={e =>
                setDate(
                  e.target.value
                )
              }
              required
            />
          </div>

          {/* MH OD */}

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              MH OD *
            </label>

            <Input
              type="number"
              step="any"
              min="0"
              value={mhOd}
              onChange={e =>
                setMhOd(
                  e.target.value
                )
              }
              required
            />
          </div>

          {/* MH WT */}

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              MH WT *
            </label>

            <Input
              type="number"
              step="any"
              min="0"
              value={mhWt}
              onChange={e =>
                setMhWt(
                  e.target.value
                )
              }
              required
            />
          </div>

          {/* MH L1 */}

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              MH L1 *
            </label>

            <Input
              type="number"
              step="any"
              min="0"
              value={mhL1}
              onChange={e =>
                setMhL1(
                  e.target.value
                )
              }
              required
            />
          </div>

          {/* MH L2 */}

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              MH L2 *
            </label>

            <Input
              type="number"
              step="any"
              min="0"
              value={mhL2}
              onChange={e =>
                setMhL2(
                  e.target.value
                )
              }
              required
            />
          </div>

          {/* Pass */}

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Pass *
            </label>

            <Select
              value={passRequired}
              onChange={e =>
                setPassRequired(
                  e.target.value
                )
              }
              required
            >
              <option value="1">
                1
              </option>

              <option value="2">
                2
              </option>

              <option value="3">
                3
              </option>
            </Select>
          </div>

          {/* Multiple */}

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Multiple *
            </label>

            <Input
              type="number"
              min="0.001"
              step="0.001"
              value={multiple}
              onChange={e =>
                setMultiple(
                  e.target.value
                )
              }
              required
            />
          </div>

        </div>

        <div className="flex justify-end border-t border-slate-100 pt-3">

          <Button
            disabled={loading}
            className="bg-slate-900 text-white hover:bg-slate-800"
          >
            {loading
              ? 'Creating Plan…'
              : 'Issue Rolling Plan'}
          </Button>

        </div>

      </form>

      {/* ==================================================
          PLAN HISTORY
      ================================================== */}

      <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm">

        <div className="border-b border-slate-100 p-5">

          <div className="flex flex-wrap items-center justify-between gap-3">

            <div>
              <h2 className="text-base font-bold text-slate-900">
                Issued Rolling Plans
              </h2>
            </div>

            <button
              type="button"
              onClick={() =>
                void loadPlans()
              }
              disabled={plansLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  plansLoading
                    ? 'animate-spin'
                    : ''
                }`}
              />

              Refresh
            </button>

          </div>

          <div className="mt-3.5 grid gap-2.5 md:grid-cols-2 lg:grid-cols-4">

            <div className="relative">

              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />

              <Input
                className="h-9 pl-8 text-xs"
                placeholder="Search Plan / WO / Customer / Grade"
                value={search}
                onChange={e =>
                  setSearch(
                    e.target.value
                  )
                }
              />

            </div>

            <Select
              className="h-9 text-xs"
              value={filterRoute}
              onChange={e =>
                setFilterRoute(
                  e.target.value
                )
              }
            >
              <option value="">
                All Routes
              </option>

              {routesInPlans.map(
                r => (
                  <option
                    key={r}
                    value={r}
                  >
                    {r}
                  </option>
                )
              )}
            </Select>

            <Input
              className="h-9 text-xs"
              type="date"
              value={fromDate}
              onChange={e =>
                setFromDate(
                  e.target.value
                )
              }
            />

            <Input
              className="h-9 text-xs"
              type="date"
              value={toDate}
              onChange={e =>
                setToDate(
                  e.target.value
                )
              }
            />

          </div>
        </div>

        <div className="overflow-x-auto">

          <table className="min-w-[2100px] w-full text-xs">

            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">

              <tr>

                {[
                  'Plan No',
                  'Date',
                  'Work Order',
                  'Customer',
                  'Grade',
                  'OD',
                  'WT',
                  'L1',
                  'L2',
                  'Avg L',
                  'Route',
                  'Planned PCS',
                  'Planned MTR',
                  'Planned MT',
                  'MH OD',
                  'MH WT',
                  'MH L1',
                  'MH L2',
                  'Pass',
                  'Multiple',
                  'Status',
                  'Actions',
                ].map(h => (
                  <th
                    key={h}
                    className="px-3 py-2.5 text-left font-semibold"
                  >
                    {h}
                  </th>
                ))}

              </tr>

            </thead>

            <tbody className="divide-y divide-slate-100">

              {plansLoading ? (

                <tr>
                  <td
                    colSpan={22}
                    className="p-8 text-center text-slate-400"
                  >
                    Loading plans…
                  </td>
                </tr>

              ) : plans.length === 0 ? (

                <tr>
                  <td
                    colSpan={22}
                    className="p-8 text-center text-slate-500"
                  >
                    No rolling plans found.
                  </td>
                </tr>

              ) : (

                plans.map(p => (

                  <tr
                    key={p.id}
                    className="hover:bg-slate-50/50"
                  >

                    <td className="px-3 py-2 font-bold">
                      {p.plan_no}
                    </td>

                    <td className="px-3 py-2 font-mono text-slate-600">
                      {p.planned_rolling_date}
                    </td>

                    <td className="px-3 py-2 font-semibold">
                      {p.work_order_no}
                    </td>

                    <td className="max-w-[140px] truncate px-3 py-2">
                      {p.customer_name ||
                        '—'}
                    </td>

                    <td className="max-w-[140px] truncate px-3 py-2">
                      {p.grade ||
                        '—'}
                    </td>

                    <td className="px-3 py-2 font-mono">
                      {fmt(p.od)}
                    </td>

                    <td className="px-3 py-2 font-mono">
                      {fmt(p.wt)}
                    </td>

                    <td className="px-3 py-2 font-mono">
                      {fmt(p.l1)}
                    </td>

                    <td className="px-3 py-2 font-mono">
                      {fmt(p.l2)}
                    </td>

                    <td className="px-3 py-2 font-mono">
                      {fmt(
                        p.avg_length
                      )}
                    </td>

                    <td className="px-3 py-2">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold">
                        {p.route_code}
                      </span>
                    </td>

                    <td className="px-3 py-2 text-right font-mono">
                      {fmt(
                        p.planned_pcs
                      )}
                    </td>

                    <td className="px-3 py-2 text-right font-mono font-bold">
                      {fmt(
                        p.planned_mtr
                      )}
                    </td>

                    <td className="px-3 py-2 text-right font-mono">
                      {fmt(
                        p.planned_mt
                      )}
                    </td>

                    <td className="px-3 py-2 font-mono">
                      {fmt(p.mh_od)}
                    </td>

                    <td className="px-3 py-2 font-mono">
                      {fmt(p.mh_wt)}
                    </td>

                    <td className="px-3 py-2 font-mono">
                      {fmt(p.mh_l1)}
                    </td>

                    <td className="px-3 py-2 font-mono">
                      {fmt(p.mh_l2)}
                    </td>

                    <td className="px-3 py-2 text-center font-semibold">
                      {p.pass_required}
                    </td>

                    <td className="px-3 py-2 font-mono">
                      {fmt(
                        p.multiple
                      )}
                    </td>

                    <td className="px-3 py-2">

                      <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                        {p.status}
                      </span>

                    </td>

                    <td className="px-2 py-1.5">

                      <div className="flex gap-1.5">

                        {p.can_modify ? (

                          <>

                            <button
                              type="button"
                              onClick={() =>
                                startEdit(p)
                              }
                              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Edit2 className="h-3 w-3" />
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                void removePlan(
                                  p
                                )
                              }
                              className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-100"
                            >
                              <Trash2 className="h-3 w-3" />
                              Delete
                            </button>

                          </>

                        ) : (

                          <span className="text-[11px] text-slate-400">
                            Locked
                          </span>

                        )}

                      </div>

                    </td>

                  </tr>

                ))

              )}

            </tbody>

          </table>

        </div>

      </section>

      {/* ==================================================
          EDIT MODAL
      ================================================== */}

      {editing && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">

          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">

            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">

              <div>

                <h3 className="text-base font-bold text-slate-900">
                  Edit Rolling Plan{' '}
                  {editing.plan_no}
                </h3>

                <p className="text-xs text-slate-500">
                  Work Order:{' '}
                  {editing.work_order_no}
                </p>

              </div>

              <button
                type="button"
                onClick={() =>
                  setEditing(null)
                }
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>

            </div>

            <div className="mt-4 grid gap-3.5 sm:grid-cols-2 text-xs">

              {/* PCS */}

              <div>

                <label className="font-semibold text-slate-700">
                  Planned PCS
                </label>

                <Input
                  type="number"
                  min="1"
                  step="1"
                  className="mt-1 text-xs"
                  value={editQtyPcs}
                  onChange={e =>
                    setEditQtyPcs(
                      e.target.value
                    )
                  }
                />

              </div>

              {/* Calculated */}

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">

                <div className="text-slate-500">
                  Calculated MTR / Weight
                </div>

                <div className="mt-0.5 text-sm font-bold text-slate-900">

                  {fmt(
                    calc(
                      editing,
                      Number(
                        editQtyPcs ||
                          0
                      )
                    ).mtr
                  )}{' '}
                  MTR ·{' '}

                  {fmt(
                    calc(
                      editing,
                      Number(
                        editQtyPcs ||
                          0
                      )
                    ).mt
                  )}{' '}
                  MT

                </div>

              </div>

              {/* Date */}

              <div>

                <label className="font-semibold text-slate-700">
                  Rolling Date
                </label>

                <Input
                  type="date"
                  className="mt-1 text-xs"
                  value={editDate}
                  onChange={e =>
                    setEditDate(
                      e.target.value
                    )
                  }
                />

              </div>

              {/* Route */}

              <div>

                <label className="font-semibold text-slate-700">
                  Process Route
                </label>

                <Select
                  className="mt-1 text-xs"
                  value={editRoute}
                  onChange={e =>
                    setEditRoute(
                      e.target.value
                    )
                  }
                >

                  {routes.map(r => (

                    <option
                      key={r.id}
                      value={r.id}
                    >
                      {r.route_code} —{' '}
                      {r.route_name}
                    </option>

                  ))}

                </Select>

              </div>

              {/* MH OD */}

              <div>

                <label className="font-semibold text-slate-700">
                  MH OD
                </label>

                <Input
                  type="number"
                  step="any"
                  min="0"
                  className="mt-1 text-xs"
                  value={editMhOd}
                  onChange={e =>
                    setEditMhOd(
                      e.target.value
                    )
                  }
                />

              </div>

              {/* MH WT */}

              <div>

                <label className="font-semibold text-slate-700">
                  MH WT
                </label>

                <Input
                  type="number"
                  step="any"
                  min="0"
                  className="mt-1 text-xs"
                  value={editMhWt}
                  onChange={e =>
                    setEditMhWt(
                      e.target.value
                    )
                  }
                />

              </div>

              {/* MH L1 */}

              <div>

                <label className="font-semibold text-slate-700">
                  MH L1
                </label>

                <Input
                  type="number"
                  step="any"
                  min="0"
                  className="mt-1 text-xs"
                  value={editMhL1}
                  onChange={e =>
                    setEditMhL1(
                      e.target.value
                    )
                  }
                />

              </div>

              {/* MH L2 */}

              <div>

                <label className="font-semibold text-slate-700">
                  MH L2
                </label>

                <Input
                  type="number"
                  step="any"
                  min="0"
                  className="mt-1 text-xs"
                  value={editMhL2}
                  onChange={e =>
                    setEditMhL2(
                      e.target.value
                    )
                  }
                />

              </div>

              {/* Pass */}

              <div>

                <label className="font-semibold text-slate-700">
                  Pass
                </label>

                <Select
                  className="mt-1 text-xs"
                  value={
                    editPassRequired
                  }
                  onChange={e =>
                    setEditPassRequired(
                      e.target.value
                    )
                  }
                >

                  <option value="1">
                    1
                  </option>

                  <option value="2">
                    2
                  </option>

                  <option value="3">
                    3
                  </option>

                </Select>

              </div>

              {/* Multiple */}

              <div>

                <label className="font-semibold text-slate-700">
                  Multiple
                </label>

                <Input
                  type="number"
                  min="0.001"
                  step="0.001"
                  className="mt-1 text-xs"
                  value={
                    editMultiple
                  }
                  onChange={e =>
                    setEditMultiple(
                      e.target.value
                    )
                  }
                />

              </div>

            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-3">

              <button
                type="button"
                onClick={() =>
                  setEditing(null)
                }
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <Button
                disabled={
                  editSaving
                }
                onClick={() =>
                  void saveEdit()
                }
                className="bg-slate-900 text-white hover:bg-slate-800"
              >
                {editSaving
                  ? 'Saving…'
                  : 'Save Changes'}
              </Button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}
