'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { createMockClient } from '@/lib/supabase/mock-client';
import { mockStore } from '@/lib/supabase/mock-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Edit2,
  Trash2,
  RefreshCw,
  Search,
  Eye,
  Lock,
} from 'lucide-react';
import { usePermissions, getFormAccess } from '@/lib/permissions';
import FormAccessBanner from '@/components/common/FormAccessBanner';

type WO = {
  id: string;
  work_order_no: string;
  customer_name: string | null;
  grade: string | null;
  size_od: number | null;
  size_wt: number | null;
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

const calc = (
  wo: WO | Plan | null,
  pcs: number
) => {
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
  const initialWoId = searchParams?.get('wo') || '';

  const [wos, setWos] = useState<WO[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);

  const [wo, setWo] = useState(initialWoId);
  const [qtyPcs, setQtyPcs] = useState('');
  const [route, setRoute] = useState('');
  const [date, setDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  const [mhOd, setMhOd] = useState('');
  const [mhWt, setMhWt] = useState('');
  const [mhL1, setMhL1] = useState('');
  const [mhL2, setMhL2] = useState('');

  const [passRequired, setPassRequired] = useState('1');
  const [multiple, setMultiple] = useState('1');

  const [availableMtr, setAvailableMtr] =
    useState<number | null>(null);

  const [loading, setLoading] = useState(false);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [search, setSearch] = useState('');
  const [filterRoute, setFilterRoute] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [plansLoading, setPlansLoading] =
    useState(false);

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

  const { user } = usePermissions();
  const formAccess = useMemo(() => getFormAccess(user, 'rolling_plan'), [user]);
  const canManagePlans = formAccess.isAllowed;

  const loadPlans = useCallback(async () => {
    setPlansLoading(true);

    try {
      const s = createClient();

      const { data, error } = await s.rpc(
        'get_rolling_plans',
        {
          p_search: search.trim() || null,
          p_route_code: filterRoute || null,
          p_from_date: fromDate || null,
          p_to_date: toDate || null,
          p_limit: 2000,
          p_offset: 0,
        }
      );

      if (error || !data) {
        const fallbackPlans = mockStore.getRollingPlans({
          search: search.trim() || undefined,
          route_code: filterRoute || undefined,
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
        });
        setPlans(fallbackPlans as unknown as Plan[]);
      } else {
        setPlans((data ?? []) as Plan[]);
      }
    } catch {
      const fallbackPlans = mockStore.getRollingPlans({
        search: search.trim() || undefined,
        route_code: filterRoute || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      });
      setPlans(fallbackPlans as unknown as Plan[]);
    }

    setPlansLoading(false);
  }, [
    filterRoute,
    fromDate,
    search,
    toDate,
  ]);

  const lookup = async (id: string) => {
    setWo(id);
    setQtyPcs('');

    if (!id) {
      setAvailableMtr(null);
      return;
    }

    try {
      const { data, error } =
        await createClient().rpc(
          'get_unplanned_qty',
          {
            p_work_order_id: id,
          }
        );

      if (error || data == null) {
        const fallbackQty = mockStore.getUnplannedQty(id);
        setAvailableMtr(fallbackQty);
      } else {
        setAvailableMtr(Number(data ?? 0));
      }
    } catch {
      const fallbackQty = mockStore.getUnplannedQty(id);
      setAvailableMtr(fallbackQty);
    }
  };

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
      let woList: WO[] = [];
      if (!a?.error && Array.isArray(a?.data)) {
        woList = a.data as WO[];
      } else {
        woList = (mockStore.workOrders || []) as any;
      }
      setWos(woList);
      if (initialWoId) {
        void lookup(initialWoId);
      }

      let routeList: Route[] = [];
      if (!b?.error && Array.isArray(b?.data) && b.data.length > 0) {
        routeList = b.data as Route[];
      } else {
        routeList = (mockStore.routes.filter(r => r.active) || []) as any;
      }
      setRoutes(routeList);

      if (routeList.length > 0 && !route) {
        setRoute(routeList[0].id);
      }
    }).catch(() => {
      const woList = (mockStore.workOrders || []) as any;
      setWos(woList);
      const routeList = (mockStore.routes.filter(r => r.active) || []) as any;
      setRoutes(routeList);
      if (routeList.length > 0 && !route) {
        setRoute(routeList[0].id);
      }
    });
  }, [initialWoId]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const selected = useMemo(
    () =>
      wos.find((x) => x.id === wo),
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

  const allocation = useMemo(() => {
    if (
      !selected ||
      availableMtr === null
    ) {
      return null;
    }

    const totalOrderMtr = Number(
      selected.balance_qty_mtr ||
        selected.ordered_qty ||
        0
    );

    const plannedSoFar = Math.max(
      0,
      totalOrderMtr - availableMtr
    );

    const newlyPlannedMtr =
      derived.mtr;

    const remainingUnplanned =
      Math.max(
        0,
        availableMtr - newlyPlannedMtr
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

    const remainingPct = Math.max(
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

  async function submit(
    e: React.FormEvent
  ) {
    e.preventDefault();

    if (!wo || !route) {
      toast.error(
        'Select Work Order and Route.'
      );
      return;
    }

    const pcs = Number(qtyPcs);

    if (
      !Number.isFinite(pcs) ||
      pcs <= 0
    ) {
      toast.error(
        'Enter a valid Planned PCS.'
      );
      return;
    }

    const mhOdValue = Number(mhOd);
    const mhWtValue = Number(mhWt);
    const mhL1Value = Number(mhL1);
    const mhL2Value = Number(mhL2);

    if (
      !Number.isFinite(mhOdValue) ||
      mhOdValue <= 0
    ) {
      toast.error('Enter MH OD.');
      return;
    }

    if (
      !Number.isFinite(mhWtValue) ||
      mhWtValue <= 0
    ) {
      toast.error('Enter MH WT.');
      return;
    }

    if (
      !Number.isFinite(mhL1Value) ||
      mhL1Value <= 0
    ) {
      toast.error('Enter MH L1.');
      return;
    }

    if (
      !Number.isFinite(mhL2Value) ||
      mhL2Value <= 0
    ) {
      toast.error('Enter MH L2.');
      return;
    }

    const pass = Number(
      passRequired
    );

    if (![1, 2, 3].includes(pass)) {
      toast.error(
        'Pass must be 1, 2 or 3.'
      );
      return;
    }

    const mult = Number(multiple);

    if (
      !Number.isFinite(mult) ||
      mult <= 0
    ) {
      toast.error(
        'Multiple must be positive.'
      );
      return;
    }

    const d = calc(
      selected ?? null,
      pcs
    );

    if (
      availableMtr !== null &&
      d.mtr > availableMtr
    ) {
      toast.error(
        `Calculated MTR ${fmt(
          d.mtr
        )} exceeds available ${fmt(
          availableMtr
        )} MTR`
      );
      return;
    }

    setLoading(true);

    let planCreatedNo = '';
    let success = false;

    try {
      const { data, error } =
        await createClient().rpc(
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

            p_pass_required: pass,
            p_multiple: mult,
          }
        );

      if (!error && data) {
        planCreatedNo = String(data);
        success = true;
      }
    } catch {}

    if (!success) {
      // Fallback in-memory
      const mockResult = await createMockClient().rpc('create_rolling_plan', {
        p_work_order_id: wo,
        p_planned_qty: d.mtr,
        p_rolling_date: date,
        p_route_id: route,
        p_mh_od: mhOdValue,
        p_mh_wt: mhWtValue,
        p_mh_l1: mhL1Value,
        p_mh_l2: mhL2Value,
        p_pass_required: pass,
        p_multiple: mult,
      });
      if (mockResult?.data) {
        planCreatedNo = String(mockResult.data);
        success = true;
      }
    }

    setLoading(false);

    if (success) {
      toast.success(`Rolling plan ${planCreatedNo || 'issued'} created.`);
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
    } else {
      toast.error('Failed to create rolling plan.');
    }
  }

  function startEdit(p: Plan) {
    setEditing(p);

    setEditQtyPcs(
      String(
        p.planned_pcs ||
          ((p.avg_length || 0) > 0
            ? p.planned_mtr /
              (p.avg_length || 1)
            : 0)
      )
    );

    setEditDate(
      p.planned_rolling_date
    );

    setEditRoute(p.route_id);

    setEditMhOd(
      p.mh_od != null
        ? String(p.mh_od)
        : ''
    );

    setEditMhWt(
      p.mh_wt != null
        ? String(p.mh_wt)
        : ''
    );

    setEditMhL1(
      p.mh_l1 != null
        ? String(p.mh_l1)
        : ''
    );

    setEditMhL2(
      p.mh_l2 != null
        ? String(p.mh_l2)
        : ''
    );

    setEditPassRequired(
      String(p.pass_required ?? 1)
    );

    setEditMultiple(
      String(p.multiple ?? 1)
    );
  }

  async function saveEdit() {
    if (!editing) return;

    const pcs = Number(
      editQtyPcs
    );

    if (
      !Number.isFinite(pcs) ||
      pcs <= 0
    ) {
      toast.error(
        'Enter a valid Planned PCS.'
      );
      return;
    }

    const mhOdValue =
      Number(editMhOd);

    const mhWtValue =
      Number(editMhWt);

    const mhL1Value =
      Number(editMhL1);

    const mhL2Value =
      Number(editMhL2);

    if (
      !Number.isFinite(mhOdValue) ||
      mhOdValue <= 0
    ) {
      toast.error('Enter MH OD.');
      return;
    }

    if (
      !Number.isFinite(mhWtValue) ||
      mhWtValue <= 0
    ) {
      toast.error('Enter MH WT.');
      return;
    }

    if (
      !Number.isFinite(mhL1Value) ||
      mhL1Value <= 0
    ) {
      toast.error('Enter MH L1.');
      return;
    }

    if (
      !Number.isFinite(mhL2Value) ||
      mhL2Value <= 0
    ) {
      toast.error('Enter MH L2.');
      return;
    }

    const pass = Number(
      editPassRequired
    );

    if (![1, 2, 3].includes(pass)) {
      toast.error(
        'Pass must be 1, 2 or 3.'
      );
      return;
    }

    const mult = Number(
      editMultiple
    );

    if (
      !Number.isFinite(mult) ||
      mult <= 0
    ) {
      toast.error(
        'Multiple must be positive.'
      );
      return;
    }

    const d = calc(
      editing,
      pcs
    );

    setEditSaving(true);
    let editSuccess = false;

    try {
      const { error } =
        await createClient().rpc(
          'update_rolling_plan',
          {
            p_plan_id: editing.id,
            p_planned_qty: d.mtr,
            p_rolling_date: editDate,
            p_route_id: editRoute,

            p_mh_od: mhOdValue,
            p_mh_wt: mhWtValue,
            p_mh_l1: mhL1Value,
            p_mh_l2: mhL2Value,

            p_pass_required: pass,
            p_multiple: mult,
          }
        );

      if (!error) {
        editSuccess = true;
      }
    } catch {}

    if (!editSuccess) {
      const mockResult = await createMockClient().rpc('update_rolling_plan', {
        p_plan_id: editing.id,
        p_planned_qty: d.mtr,
        p_rolling_date: editDate,
        p_route_id: editRoute,
        p_mh_od: mhOdValue,
        p_mh_wt: mhWtValue,
        p_mh_l1: mhL1Value,
        p_mh_l2: mhL2Value,
        p_pass_required: pass,
        p_multiple: mult,
      });
      if (!mockResult.error) {
        editSuccess = true;
      }
    }

    setEditSaving(false);

    if (editSuccess) {
      toast.success('Rolling plan updated successfully.');
      setEditing(null);
      await loadPlans();
    } else {
      toast.error('Failed to update rolling plan.');
    }
  }

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

    let deleteSuccess = false;
    try {
      const { error } =
        await createClient().rpc(
          'delete_rolling_plan',
          {
            p_plan_id: p.id,
          }
        );

      if (!error) {
        deleteSuccess = true;
      }
    } catch {}

    if (!deleteSuccess) {
      const mockResult = await createMockClient().rpc('delete_rolling_plan', {
        p_plan_id: p.id,
      });
      if (!mockResult.error) {
        deleteSuccess = true;
      }
    }

    if (deleteSuccess) {
      toast.success('Rolling plan deleted successfully.');
      await loadPlans();
    } else {
      toast.error('Failed to delete rolling plan.');
    }
  }

  const routesInPlans = useMemo(
    () =>
      Array.from(
        new Set(
          plans.map(
            (p) => p.route_code
          )
        )
      ).sort(),
    [plans]
  );

  return (
    <div className="space-y-6">
      {/* Form Accessibility Banner */}
      <FormAccessBanner access={formAccess} />

      {/* Issue Rolling Plan */}

      <form
        onSubmit={submit}
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="mb-5">
          <h1 className="text-xl font-bold text-slate-900">
            Issue Rolling Plan
          </h1>
        </div>

        <div className="grid gap-4 md:grid-cols-2">

          {/* Work Order */}

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">
              Work Order *
            </label>

            <Select
              value={wo}
              disabled={!canManagePlans}
              onChange={(e) =>
                void lookup(
                  e.target.value
                )
              }
              required
            >
              <option value="">
                Select Work Order
              </option>

              {wos.map((x) => (
                <option
                  key={x.id}
                  value={x.id}
                >
                  {x.work_order_no} ·{' '}
                  {x.customer_name ||
                    'No Customer'}{' '}
                  · {x.size_od}×
                  {x.size_wt}mm ·{' '}
                  {x.grade}
                </option>
              ))}
            </Select>
          </div>

          {/* Route */}

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">
              Target Process Route *
            </label>

            <Select
              value={route}
              disabled={!canManagePlans}
              onChange={(e) =>
                setRoute(
                  e.target.value
                )
              }
              required
            >
              <option value="">
                Select Route
              </option>

              {routes.map((r) => (
                <option
                  key={r.id}
                  value={r.id}
                >
                  {r.route_code} —{' '}
                  {r.route_name}
                  {' ('}
                  {r.material_category}
                  {')'}
                </option>
              ))}
            </Select>
          </div>

          {/* Planned PCS */}

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">
              Planned Quantity (PCS) *
            </label>

            <Input
              type="number"
              min="1"
              step="1"
              disabled={!canManagePlans}
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
              onChange={(e) =>
                setQtyPcs(
                  e.target.value
                )
              }
              required
            />
          </div>

          {/* Date */}

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">
              Planned Rolling Date *
            </label>

            <Input
              type="date"
              value={date}
              disabled={!canManagePlans}
              onChange={(e) =>
                setDate(
                  e.target.value
                )
              }
              required
            />
          </div>

          {/* MH OD */}

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">
              MH OD *
            </label>

            <Input
              type="number"
              min="0"
              step="0.001"
              disabled={!canManagePlans}
              value={mhOd}
              onChange={(e) =>
                setMhOd(
                  e.target.value
                )
              }
              required
            />
          </div>

          {/* MH WT */}

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">
              MH WT *
            </label>

            <Input
              type="number"
              min="0"
              step="0.001"
              disabled={!canManagePlans}
              value={mhWt}
              onChange={(e) =>
                setMhWt(
                  e.target.value
                )
              }
              required
            />
          </div>

          {/* MH L1 */}

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">
              MH L1 *
            </label>

            <Input
              type="number"
              min="0"
              step="0.001"
              disabled={!canManagePlans}
              value={mhL1}
              onChange={(e) =>
                setMhL1(
                  e.target.value
                )
              }
              required
            />
          </div>

          {/* MH L2 */}

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">
              MH L2 *
            </label>

            <Input
              type="number"
              min="0"
              step="0.001"
              disabled={!canManagePlans}
              value={mhL2}
              onChange={(e) =>
                setMhL2(
                  e.target.value
                )
              }
              required
            />
          </div>

          {/* Pass */}

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">
              Pass *
            </label>

            <Select
              value={passRequired}
              disabled={!canManagePlans}
              onChange={(e) =>
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
            <label className="mb-1 block text-sm font-semibold text-slate-700">
              Multiple *
            </label>

            <Input
              type="number"
              min="0.001"
              step="0.001"
              disabled={!canManagePlans}
              value={multiple}
              onChange={(e) =>
                setMultiple(
                  e.target.value
                )
              }
              required
            />
          </div>

          {/* Allocation */}

          {allocation && (
            <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3">

              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-800">
                  Order Allocation
                </span>

                <span className="font-mono text-slate-500">
                  {fmt(
                    allocation.totalOrderMtr
                  )}{' '}
                  MTR
                </span>
              </div>

              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
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

              <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600">
                <span>
                  Prev: <b>
                    {fmt(
                      allocation.plannedSoFar
                    )}
                  </b>{' '}
                  MTR
                </span>

                <span>
                  This Plan: <b>
                    {fmt(
                      allocation.newlyPlannedMtr
                    )}
                  </b>{' '}
                  MTR
                </span>

                <span>
                  Remaining: <b>
                    {fmt(
                      allocation.remainingUnplanned
                    )}
                  </b>{' '}
                  MTR
                </span>
              </div>
            </div>
          )}

          {/* Calculated values */}

          {selected && (
            <div className="md:col-span-2 grid grid-cols-2 gap-3 sm:grid-cols-4">

              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-sm text-slate-500">
                  Avg Length
                </div>

                <div className="mt-1 font-bold">
                  {fmt(
                    derived.avg
                  )}{' '}
                  m
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-sm text-slate-500">
                  Planned PCS
                </div>

                <div className="mt-1 font-bold">
                  {fmt(
                    Number(
                      qtyPcs || 0
                    )
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-sm text-slate-500">
                  Planned MTR
                </div>

                <div className="mt-1 font-bold text-blue-600">
                  {fmt(
                    derived.mtr
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-sm text-slate-500">
                  Planned MT
                </div>

                <div className="mt-1 font-bold text-emerald-600">
                  {fmt(
                    derived.mt
                  )}
                </div>
              </div>

            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
          <div className="text-sm text-slate-500">
            {!canManagePlans && (
              <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                <Lock className="h-3.5 w-3.5" />
                Form is in View-Only mode. Creation requires Admin or Super User access.
              </span>
            )}
          </div>
          <Button
            type="submit"
            disabled={loading || !canManagePlans}
            className={`text-white ${
              canManagePlans
                ? 'bg-slate-900 hover:bg-slate-800'
                : 'bg-slate-400 cursor-not-allowed opacity-60'
            }`}
          >
            {loading
              ? 'Creating…'
              : !canManagePlans
              ? 'Issue Plan (View-Only)'
              : 'Issue Rolling Plan'}
          </Button>
        </div>
      </form>

      {/* Issued Plans */}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

        <div className="border-b border-slate-100 p-5">

          <div className="flex flex-wrap items-center justify-between gap-3">

            <h2 className="text-base font-bold text-slate-900">
              Issued Rolling Plans
            </h2>

            <button
              type="button"
              onClick={() =>
                void loadPlans()
              }
              disabled={plansLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
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

          <div className="mt-3 grid gap-2.5 md:grid-cols-2 lg:grid-cols-4">

            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />

              <Input
                className="h-9 pl-8 text-sm"
                placeholder="Search Plan / WO / Customer / Grade"
                value={search}
                onChange={(e) =>
                  setSearch(
                    e.target.value
                  )
                }
              />
            </div>

            <Select
              className="h-9 text-sm"
              value={filterRoute}
              onChange={(e) =>
                setFilterRoute(
                  e.target.value
                )
              }
            >
              <option value="">
                All Routes
              </option>

              {routesInPlans.map(
                (r) => (
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
              className="h-9 text-sm"
              type="date"
              value={fromDate}
              onChange={(e) =>
                setFromDate(
                  e.target.value
                )
              }
            />

            <Input
              className="h-9 text-sm"
              type="date"
              value={toDate}
              onChange={(e) =>
                setToDate(
                  e.target.value
                )
              }
            />
          </div>
        </div>

        <div className="overflow-x-auto">

          <table className="min-w-[1900px] w-full text-sm">

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
                ].map((h) => (
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
                    Loading…
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
                plans.map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-slate-50/50"
                  >
                    <td className="px-3 py-2 font-bold">
                      {p.plan_no}
                    </td>

                    <td className="px-3 py-2 font-mono">
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
                      {p.grade || '—'}
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
                      <span className="rounded bg-slate-100 px-2 py-1 font-semibold">
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
                      {fmt(p.multiple)}
                    </td>

                    <td className="px-3 py-2">
                      <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                        {p.status}
                      </span>
                    </td>

                    <td className="px-2.5 py-1.5">

                      {p.can_modify && canManagePlans ? (
                        <div className="flex gap-2">

                          <button
                            type="button"
                            onClick={() =>
                              startEdit(p)
                            }
                            className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-lg border-2 border-slate-300 bg-white px-3.5 text-sm font-semibold hover:bg-slate-50 cursor-pointer"
                          >
                            <Edit2 className="h-4 w-4" />
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              void removePlan(
                                p
                              )
                            }
                            className="inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-lg border-2 border-rose-300 bg-rose-50 px-3.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </button>

                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm text-slate-400 font-medium">
                          <Lock className="h-4 w-4" />
                          {p.can_modify ? 'View Only' : 'Executed / Locked'}
                        </span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">

            <div className="flex items-center justify-between border-b border-slate-100 pb-3">

              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Edit Rolling Plan{' '}
                  {editing.plan_no}
                </h3>

                <div className="mt-0.5 text-sm text-slate-500">
                  {editing.work_order_no}
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setEditing(null)
                }
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              >
                Close
              </button>

            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">

              {/* PCS */}

              <div>
                <label className="mb-1 block text-sm font-semibold">
                  Planned PCS *
                </label>

                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={editQtyPcs}
                  onChange={(e) =>
                    setEditQtyPcs(
                      e.target.value
                    )
                  }
                />
              </div>

              {/* Date */}

              <div>
                <label className="mb-1 block text-sm font-semibold">
                  Rolling Date *
                </label>

                <Input
                  type="date"
                  value={editDate}
                  onChange={(e) =>
                    setEditDate(
                      e.target.value
                    )
                  }
                />
              </div>

              {/* Route */}

              <div>
                <label className="mb-1 block text-sm font-semibold">
                  Process Route *
                </label>

                <Select
                  value={editRoute}
                  onChange={(e) =>
                    setEditRoute(
                      e.target.value
                    )
                  }
                >
                  {routes.map((r) => (
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

              {/* Pass */}

              <div>
                <label className="mb-1 block text-sm font-semibold">
                  Pass *
                </label>

                <Select
                  value={
                    editPassRequired
                  }
                  onChange={(e) =>
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

              {/* MH OD */}

              <div>
                <label className="mb-1 block text-sm font-semibold">
                  MH OD *
                </label>

                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  value={editMhOd}
                  onChange={(e) =>
                    setEditMhOd(
                      e.target.value
                    )
                  }
                />
              </div>

              {/* MH WT */}

              <div>
                <label className="mb-1 block text-sm font-semibold">
                  MH WT *
                </label>

                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  value={editMhWt}
                  onChange={(e) =>
                    setEditMhWt(
                      e.target.value
                    )
                  }
                />
              </div>

              {/* MH L1 */}

              <div>
                <label className="mb-1 block text-sm font-semibold">
                  MH L1 *
                </label>

                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  value={editMhL1}
                  onChange={(e) =>
                    setEditMhL1(
                      e.target.value
                    )
                  }
                />
              </div>

              {/* MH L2 */}

              <div>
                <label className="mb-1 block text-sm font-semibold">
                  MH L2 *
                </label>

                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  value={editMhL2}
                  onChange={(e) =>
                    setEditMhL2(
                      e.target.value
                    )
                  }
                />
              </div>

              {/* Multiple */}

              <div>
                <label className="mb-1 block text-sm font-semibold">
                  Multiple *
                </label>

                <Input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={editMultiple}
                  onChange={(e) =>
                    setEditMultiple(
                      e.target.value
                    )
                  }
                />
              </div>

              {/* Calculated */}

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm text-slate-500">
                  Calculated MTR / MT
                </div>

                <div className="mt-1 font-bold">
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

            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">

              <button
                type="button"
                onClick={() =>
                  setEditing(null)
                }
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>

              <Button
                type="button"
                disabled={editSaving}
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
