'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useQueue } from '@/hooks/useQueue';
import { useHistory } from '@/hooks/useHistory';
import { validateProductionEntry } from '@/lib/productionValidation';
import {
  calc,
  fmt,
  n,
  mtrFromPcs,
  mtFromMtr,
  attachPcsToRemarks,
  extractPcsFromRemarks,
} from '@/lib/productionUtils';
import { StageCode, STAGES, Row, ProductionEntry } from '@/types';
import { usePermissions, getFormAccess } from '@/lib/permissions';
import FormAccessBanner from '@/components/common/FormAccessBanner';
import { WipSummaryCards } from '@/components/production/WipSummaryCards';

// Modular Subcomponents
import ProductionToolbar from '@/components/production/ProductionToolbar';
import ProductionQueueTable from '@/components/production/ProductionQueueTable';
import ProductionHistoryTable from '@/components/production/ProductionHistoryTable';
import EditEntryModal from '@/components/production/modals/EditEntryModal';
import DeleteEntryModal from '@/components/production/modals/DeleteEntryModal';
import BundlingCampaignModal, { CampaignBundle } from '@/components/production/modals/BundlingCampaignModal';

export default function ProductionEntryGrid() {
  const supabase = useMemo(() => createClient(), []);
  const {
    user,
    groupConfig,
    roleTitle,
    workCenter,
    workCenterLabel,
    isStageAllowed,
    canDeleteForStage,
    canEditForStage,
    isAdmin,
    isSuperUser,
  } = usePermissions();

  // --- State ---
  const [stage, setStage] = useState<StageCode>('ROLLING');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [search, setSearch] = useState('');
  const [woFilter, setWoFilter] = useState('');
  const [entryStage, setEntryStage] = useState('');
  const [entryRoute, setEntryRoute] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Expandable work center WIP breakdown per row
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  // Modals state
  const [editing, setEditing] = useState<ProductionEntry | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Campaign multi-work order bundling modal state (Rule 2)
  const [bundlingCampaign, setBundlingCampaign] = useState<Row | null>(null);
  const [campaignBundles, setCampaignBundles] = useState<CampaignBundle[]>([]);
  const [bundlingSaving, setBundlingSaving] = useState(false);

  // --- Data fetching ---
  const { rows, setRows, loading: queueLoading, reload: reloadQueue } = useQueue(stage);
  const { entries, loading: historyLoading, reload: reloadHistory } = useHistory(
    search,
    entryStage,
    entryRoute,
    fromDate,
    toDate
  );

  const [factoryWip, setFactoryWip] = useState<any[]>([]);
  const [serverSummary, setServerSummary] = useState<any[] | null>(null);
  const [childWoIds, setChildWoIds] = useState<Set<string>>(new Set());

  const loadFactoryWip = useCallback(async () => {
    try {
      try {
        const qRes = await fetch(`/api/production/queue?stage=${stage}&_t=${Date.now()}`, {
          cache: 'no-store',
          headers: { Pragma: 'no-cache', 'Cache-Control': 'no-cache' },
        });
        if (qRes.ok) {
          const json = await qRes.json();
          if (Array.isArray(json?.summary)) {
            setServerSummary(json.summary);
          }
        }
      } catch {
        // ignore
      }

      const [wipRes, plansRes] = await Promise.all([
        supabase.from('vw_route_stage_wip').select('*'),
        supabase.from('rolling_plans').select('status, work_order_id').not('status', 'is', null),
      ]);
      if (wipRes.data) setFactoryWip(wipRes.data);
      if (plansRes.data) {
        const cIds = new Set<string>();
        for (const p of plansRes.data) {
          try {
            const parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
            if (parsed?.is_master && Array.isArray(parsed?.child_work_orders)) {
              for (const c of parsed.child_work_orders) {
                if (c.work_order_id) cIds.add(c.work_order_id);
                if (c.id) cIds.add(c.id);
              }
            } else if (parsed?.is_child && p.work_order_id) {
              cIds.add(p.work_order_id);
            }
          } catch {
            // ignore JSON parse error
          }
        }
        setChildWoIds(cIds);
      }
    } catch {
      // ignore
    }
  }, [supabase, stage]);

  useEffect(() => {
    void loadFactoryWip();
  }, [loadFactoryWip, stage]);

  const routes = useMemo(
    () => Array.from(new Set(entries.map((e) => e.route_code))).sort(),
    [entries]
  );

  const stageFormAccess = useMemo(() => {
    return getFormAccess(user, 'production_entry', stage);
  }, [user, stage]);
  const isAllowed = stageFormAccess.isAllowed;

  // Toggle single row expansion
  const toggleRowExpansion = (key: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Filter queue rows by Work Order No, Customer, Grade, or Master Plan No
  const filteredRows = useMemo(() => {
    if (!woFilter.trim()) return rows;
    const q = woFilter.toLowerCase().trim();
    return rows.filter(
      (r) =>
        (r.work_order_no || '').toLowerCase().includes(q) ||
        (r.customer_name || '').toLowerCase().includes(q) ||
        (r.specification || '').toLowerCase().includes(q) ||
        (r.master_plan_no || '').toLowerCase().includes(q) ||
        (r.child_work_orders &&
          r.child_work_orders.some(
            (c: any) =>
              (c.work_order_no || '').toLowerCase().includes(q) ||
              (c.customer_name || '').toLowerCase().includes(q)
          ))
    );
  }, [rows, woFilter]);

  // Toggle all rows expansion
  const toggleAllRows = () => {
    const targetRows = filteredRows.length > 0 ? filteredRows : rows;
    const allExpanded = targetRows.every((r) => expandedRows[`${r.work_order_id}|${r.route_id}`]);
    const newState: Record<string, boolean> = { ...expandedRows };
    targetRows.forEach((r) => {
      newState[`${r.work_order_id}|${r.route_id}`] = !allExpanded;
    });
    setExpandedRows(newState);
  };

  // Row update helper with bidirectional PCS <-> MTR conversion
  const updateRow = (
    key: string,
    field: keyof Pick<
      Row,
      'pcs' | 'mtr' | 'rejection_pcs' | 'rejection_mtr' | 'htc_ok_pcs' | 'htc_ok_mtr' | 'heat_lot_no' | 'remarks'
    >,
    value: string
  ) => {
    setRows((current) =>
      current.map((r) => {
        if (`${r.work_order_id}|${r.route_id}` !== key) return r;

        // Rule 5: Rolling Mtr and MT calculated based on MH dimensions if applicable
        const mhL1 = Number(r.mh_l1 || 0);
        const mhL2 = Number(r.mh_l2 || 0);
        const computedMhAvg = mhL1 > 0 && mhL2 > 0 ? (mhL1 + mhL2) / 2 : mhL1 || mhL2 || 0;
        const effectiveMhAvg = Number(r.mh_avg_length || 0) > 0 ? Number(r.mh_avg_length) : computedMhAvg;
        const effectiveAvg =
          stage === 'ROLLING' && effectiveMhAvg > 0 ? effectiveMhAvg : n(r.avg_length);

        // For Finishing: Do NOT calculate PCS based on MTR or MTR based on PCS.
        if (stage === 'FINISHING') {
          return { ...r, [field]: value };
        }

        if (field === 'pcs') {
          const mtr = value === '' ? '' : String(mtrFromPcs(n(value), effectiveAvg).toFixed(3).replace(/\.?0+$/, ''));
          const extra: Record<string, string> = {};
          if (stage === 'ROLLING') {
            const newPcs = n(value);
            const rejPcs = n(r.rejection_pcs);
            const autoHtcPcs = Math.max(0, newPcs - rejPcs);
            extra.htc_ok_pcs = autoHtcPcs > 0 ? String(autoHtcPcs) : newPcs > 0 ? '0' : '';
            extra.htc_ok_mtr =
              autoHtcPcs > 0 ? String(mtrFromPcs(autoHtcPcs, effectiveAvg).toFixed(3).replace(/\.?0+$/, '')) : newPcs > 0 ? '0' : '';
          }
          return { ...r, pcs: value, mtr, ...extra };
        }
        if (field === 'mtr') {
          const extra: Record<string, string> = {};
          if (stage === 'ROLLING' && n(r.pcs) <= 0) {
            const newMtr = n(value);
            const rejMtr = n(r.rejection_mtr);
            const autoHtcMtr = Math.max(0, newMtr - rejMtr);
            extra.htc_ok_mtr = autoHtcMtr > 0 ? String(autoHtcMtr.toFixed(3).replace(/\.?0+$/, '')) : newMtr > 0 ? '0' : '';
          }
          return { ...r, mtr: value, ...extra };
        }
        if (field === 'rejection_pcs') {
          const rejection_mtr =
            value === '' ? '' : String(mtrFromPcs(n(value), effectiveAvg).toFixed(3).replace(/\.?0+$/, ''));
          const extra: Record<string, string> = {};
          if (stage === 'ROLLING') {
            const prodPcs = n(r.pcs);
            const rejPcs = n(value);
            const autoHtcPcs = Math.max(0, prodPcs - rejPcs);
            extra.htc_ok_pcs = autoHtcPcs > 0 ? String(autoHtcPcs) : prodPcs > 0 ? '0' : '';
            extra.htc_ok_mtr =
              autoHtcPcs > 0 ? String(mtrFromPcs(autoHtcPcs, effectiveAvg).toFixed(3).replace(/\.?0+$/, '')) : prodPcs > 0 ? '0' : '';
          }
          return { ...r, rejection_pcs: value, rejection_mtr, ...extra };
        }
        if (field === 'rejection_mtr') {
          const extra: Record<string, string> = {};
          if (stage === 'ROLLING' && n(r.pcs) <= 0) {
            const prodMtr = n(r.mtr);
            const rejMtr = n(value);
            const autoHtcMtr = Math.max(0, prodMtr - rejMtr);
            extra.htc_ok_mtr = autoHtcMtr > 0 ? String(autoHtcMtr.toFixed(3).replace(/\.?0+$/, '')) : prodMtr > 0 ? '0' : '';
          }
          return { ...r, rejection_mtr: value, ...extra };
        }
        if (field === 'htc_ok_pcs') {
          const htc_ok_mtr =
            value === '' ? '' : String(mtrFromPcs(n(value), effectiveAvg).toFixed(3).replace(/\.?0+$/, ''));
          return { ...r, htc_ok_pcs: value, htc_ok_mtr };
        }
        if (field === 'htc_ok_mtr') {
          return { ...r, htc_ok_mtr: value };
        }
        return { ...r, [field]: value };
      })
    );
  };

  // Aggregate WIP across all work orders in current queue & factory-wide
  const workCenterSummary = useMemo(() => {
    if (serverSummary && serverSummary.length > 0) {
      const baseList = serverSummary.map((s) => ({ ...s }));
      const activeItem = baseList.find((x) => x.stage_code === stage);
      if (activeItem) {
        activeItem.availMtr = rows.reduce(
          (sum, r) => sum + Number(r.balance_to_make_mtr ?? r.max_allowed_mtr ?? 0),
          0
        );
        activeItem.availPcs = rows.reduce(
          (sum, r) => sum + Number(r.balance_to_make_pcs ?? r.max_allowed_pcs ?? 0),
          0
        );
        activeItem.availMt = rows.reduce((sum, r) => {
          const isRoll = stage === 'ROLLING';
          const od = isRoll && r.mh_od ? Number(r.mh_od) : Number(r.od || 0);
          const wt = isRoll && r.mh_wt ? Number(r.mh_wt) : Number(r.wl || 0);
          const mtrVal = Number(r.balance_to_make_mtr ?? r.max_allowed_mtr ?? 0);
          return sum + mtFromMtr(mtrVal, od, wt);
        }, 0);
        activeItem.count = rows.length;
      }
      return baseList;
    }

    const summary: Record<
      string,
      { label: string; stage_code: StageCode; availMtr: number; availPcs: number; availMt: number; count: number }
    > = {
      ROLLING: { label: 'Rolling Mill', stage_code: 'ROLLING', availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      HOLLOW_HEAT_TREATMENT: {
        label: 'Hollow Heat Treatment',
        stage_code: 'HOLLOW_HEAT_TREATMENT',
        availMtr: 0,
        availPcs: 0,
        availMt: 0,
        count: 0,
      },
      DRAW: { label: 'Draw Bench', stage_code: 'DRAW', availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      HEAT_TREATMENT: { label: 'Heat Treatment', stage_code: 'HEAT_TREATMENT', availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
      FINISHING: { label: 'Finishing Line', stage_code: 'FINISHING', availMtr: 0, availPcs: 0, availMt: 0, count: 0 },
    };

    const resolveStageCode = (w: any): StageCode | null => {
      if (!w) return null;
      const raw = String(w.stage_code || w.stage_name || w.stage_id || '').toUpperCase().trim();
      if (raw === 'HOLLOW_HEAT_TREATMENT' || raw.includes('HOLLOW')) return 'HOLLOW_HEAT_TREATMENT';
      if (raw === 'ROLLING' || raw.includes('ROLL')) return 'ROLLING';
      if (raw === 'DRAW' || raw.includes('DRAW')) return 'DRAW';
      if (raw === 'HEAT_TREATMENT' || raw.includes('HEAT')) return 'HEAT_TREATMENT';
      if (raw === 'FINISHING' || raw.includes('FINISH')) return 'FINISHING';
      return null;
    };

    let hasFactoryData = false;
    if (factoryWip && factoryWip.length > 0) {
      factoryWip.forEach((w) => {
        const sc = resolveStageCode(w);
        if (sc && summary[sc]) {
          if (sc !== 'FINISHING' && childWoIds.has(w.work_order_id)) {
            return;
          }

          const mtr = Number(w.current_wip ?? w.available_mtr ?? 0);
          let pcs = Number(w.current_wip_pcs ?? w.available_pcs ?? 0);
          const isMhStage = sc === 'ROLLING' || sc === 'HOLLOW_HEAT_TREATMENT' || sc === 'DRAW';
          const mhAvgLen = Number(w.mh_avg_length || w.mh_l1 || 0);
          const avgLen = isMhStage && mhAvgLen > 0 ? mhAvgLen : Number(w.avg_length || 6.0);
          if (pcs === 0 && mtr > 0 && avgLen > 0) {
            pcs = Number((mtr / avgLen).toFixed(2));
          }
          const isMhDim = sc === 'ROLLING' || sc === 'HOLLOW_HEAT_TREATMENT' || sc === 'DRAW';
          const od = isMhDim && w.mh_od ? Number(w.mh_od) : Number(w.od || w.size_od || 0);
          const wt = isMhDim && w.mh_wt ? Number(w.mh_wt) : Number(w.wl || w.wt || w.size_wt || 0);
          const mt = Number(w.available_mt ?? w.current_wip_mt ?? mtFromMtr(mtr, od, wt));

          if (mtr > 0 || pcs > 0) {
            summary[sc].availMtr += mtr;
            summary[sc].availPcs += pcs;
            summary[sc].availMt += mt;
            summary[sc].count += 1;
            hasFactoryData = true;
          }
        }
      });
    }

    if (rows && rows.length > 0) {
      rows.forEach((r) => {
        if (r.work_centers_wip && r.work_centers_wip.length > 0) {
          r.work_centers_wip.forEach((w) => {
            const sc = resolveStageCode(w);
            if (sc && summary[sc]) {
              if (sc !== 'FINISHING' && childWoIds.has(r.work_order_id)) {
                return;
              }
              const mtr = Number(w.available_mtr || 0);
              const pcs = Number(w.available_pcs || 0);
              const isRoll = sc === 'ROLLING';
              const od = isRoll && r.mh_od ? Number(r.mh_od) : Number(r.od || 0);
              const wt = isRoll && r.mh_wt ? Number(r.mh_wt) : Number(r.wl || 0);
              const mt = Number(w.available_mt ?? mtFromMtr(mtr, od, wt));
              if (!hasFactoryData) {
                summary[sc].availMtr += mtr;
                summary[sc].availPcs += pcs;
                summary[sc].availMt += mt;
                if (mtr > 0 || pcs > 0) summary[sc].count += 1;
              }
            }
          });
        }
      });

      const activeSc = resolveStageCode({ stage_code: stage });
      if (activeSc && summary[activeSc]) {
        const queueTotalMtr = rows.reduce((sum, r) => {
          if (r.is_child && r.master_wo_id) return sum;
          return sum + Number(r.balance_to_make_mtr ?? r.max_allowed_mtr ?? 0);
        }, 0);
        const queueTotalPcs = rows.reduce((sum, r) => {
          if (r.is_child && r.master_wo_id) return sum;
          return sum + Number(r.balance_to_make_pcs ?? r.max_allowed_pcs ?? 0);
        }, 0);
        const queueTotalMt = rows.reduce((sum, r) => {
          if (r.is_child && r.master_wo_id) return sum;
          const isRoll = activeSc === 'ROLLING';
          const od = isRoll && r.mh_od ? Number(r.mh_od) : Number(r.od || 0);
          const wt = isRoll && r.mh_wt ? Number(r.mh_wt) : Number(r.wl || 0);
          const mtrVal = Number(r.balance_to_make_mtr ?? r.max_allowed_mtr ?? 0);
          return sum + mtFromMtr(mtrVal, od, wt);
        }, 0);

        summary[activeSc].availMtr = queueTotalMtr;
        summary[activeSc].availPcs = queueTotalPcs;
        summary[activeSc].availMt = queueTotalMt;
        summary[activeSc].count = rows.filter((r) => !(r.is_child && r.master_wo_id)).length;
      }
    }

    return Object.values(summary);
  }, [factoryWip, rows, stage, childWoIds, serverSummary]);

  // Batch save (atomic)
  async function save() {
    setMessage('');
    setError('');

    if (!isStageAllowed(stage)) {
      setError(
        `Permission Denied: Your account (${groupConfig.name}) is assigned to ${workCenterLabel}. You can only record data for your assigned work center.`
      );
      return;
    }

    const selected = rows.filter((r) => n(r.mtr) > 0 || n(r.pcs) > 0);
    if (!selected.length) {
      setError('Enter Production PCS/MTR for at least one row.');
      return;
    }

    const allErrors = selected.flatMap((r) => validateProductionEntry(r, stage));
    if (allErrors.length) {
      setError(allErrors.map((e) => `${e.workOrder}: ${e.message}`).join(' | '));
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
          rejection_qty: d.rejectionMtr,
          htc_ok: stage === 'ROLLING' ? d.htcMtr : 0,
          output_pcs: d.pcs || null,
          rejection_pcs: d.rejectionPcs || null,
          htc_ok_pcs: stage === 'ROLLING' ? d.htcPcs || null : null,
          heat_lot_no: r.heat_lot_no || null,
          remarks: attachPcsToRemarks(r.remarks, d.pcs, d.rejectionPcs) || null,
        };
      });

      const res = await fetch('/api/production/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: payload,
          p_process_date: date,
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || 'Failed to save production.');
      }

      setMessage('All production entries saved successfully.');
      await Promise.all([reloadQueue(), reloadHistory(), loadFactoryWip()]);
    } catch (e: unknown) {
      console.error('Full error:', e);
      setError(e instanceof Error ? e.message : 'Failed to save production.');
    } finally {
      setSaving(false);
    }
  }

  // Multi-Work Order Campaign Bundling Handlers (Rule 2)
  const openCampaignBundling = (r: Row) => {
    let targetRow = r;
    if (r.is_child && r.master_wo_id) {
      const foundMaster = rows.find((x) => x.work_order_id === r.master_wo_id);
      if (foundMaster) targetRow = foundMaster;
    }

    setBundlingCampaign(targetRow);

    const targetWoIds = new Set<string>();
    targetWoIds.add(targetRow.work_order_id);
    if (targetRow.child_work_orders && targetRow.child_work_orders.length > 0) {
      targetRow.child_work_orders.forEach((c: any) => {
        const cId = c.work_order_id || c.id;
        if (cId) targetWoIds.add(cId);
      });
    }

    const existingForTarget = campaignBundles.filter((b) => targetWoIds.has(b.wo_id));
    if (existingForTarget.length > 0) return;

    const initial: CampaignBundle[] = [];
    initial.push({
      id: `b_${Date.now()}_m`,
      wo_id: targetRow.work_order_id,
      bundle_no: targetRow.heat_lot_no || 'BDL-01',
      pcs: targetRow.pcs || '',
      mtr: targetRow.mtr || '',
      remarks: '',
    });

    if (targetRow.child_work_orders && targetRow.child_work_orders.length > 0) {
      targetRow.child_work_orders.forEach((c: any, idx: number) => {
        const cId = c.work_order_id || c.id;
        if (cId) {
          const childInRows = rows.find((x) => x.work_order_id === cId);
          initial.push({
            id: `b_${Date.now()}_c_${idx}`,
            wo_id: cId,
            bundle_no: childInRows?.heat_lot_no || `BDL-${String(idx + 2).padStart(2, '0')}`,
            pcs: childInRows?.pcs || '',
            mtr: childInRows?.mtr || '',
            remarks: '',
          });
        }
      });
    }

    setCampaignBundles(initial);
  };

  const addBundleToWo = (woId: string, defaultPrefix?: string) => {
    setCampaignBundles((prev) => {
      const existingForWo = prev.filter((b) => b.wo_id === woId);
      const nextNum = existingForWo.length + 1;
      const proposedNo = defaultPrefix
        ? `${defaultPrefix}/${nextNum}`
        : `BDL-${String(prev.length + 1).padStart(2, '0')}`;
      return [
        ...prev,
        {
          id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          wo_id: woId,
          bundle_no: proposedNo,
          pcs: '',
          mtr: '',
          remarks: '',
        },
      ];
    });
  };

  const removeBundle = (bundleId: string) => {
    setCampaignBundles((prev) => prev.filter((b) => b.id !== bundleId));
  };

  const updateBundleField = (
    bundleId: string,
    field: 'bundle_no' | 'pcs' | 'mtr' | 'remarks',
    val: string
  ) => {
    setCampaignBundles((prev) =>
      prev.map((b) => {
        if (b.id !== bundleId) return b;
        return {
          ...b,
          [field]: val,
        };
      })
    );
  };

  const applyBundlesToGrid = () => {
    if (!bundlingCampaign) return;
    const validBundles = campaignBundles.filter((b) => n(b.pcs) > 0 || n(b.mtr) > 0);
    if (!validBundles.length) {
      setError('Please enter bundling PCS or MTR for at least one bundle.');
      return;
    }

    setRows((prevRows) =>
      prevRows.map((r) => {
        const bundlesForWo = validBundles.filter((b) => b.wo_id === r.work_order_id);
        if (!bundlesForWo.length) return r;
        const sumPcs = bundlesForWo.reduce((s, b) => s + n(b.pcs), 0);
        const sumMtr = bundlesForWo.reduce((s, b) => s + n(b.mtr), 0);
        const bundleNos = bundlesForWo.map((b) => b.bundle_no).filter(Boolean).join(', ');
        const baseRemarks =
          bundlesForWo.length > 1 ? `Multi-Bundle (${bundlesForWo.length} bundles: ${sumPcs} PCS)` : r.remarks;
        return {
          ...r,
          pcs: String(sumPcs),
          mtr: String(Number(sumMtr.toFixed(3))),
          heat_lot_no: bundleNos || r.heat_lot_no,
          remarks: attachPcsToRemarks(baseRemarks, sumPcs, 0),
        };
      })
    );

    setMessage('Bundles applied! Finishing production for each work order is now the sum of its bundles.');
    setBundlingCampaign(null);
  };

  const saveCampaignBundling = async () => {
    if (!bundlingCampaign) return;
    const validBundles = campaignBundles.filter((b) => n(b.pcs) > 0 || n(b.mtr) > 0);
    if (!validBundles.length) {
      setError('Please enter bundling PCS or MTR for at least one bundle.');
      return;
    }

    const totalBundledPcs = validBundles.reduce((sum, b) => sum + n(b.pcs), 0);
    const maxAvailPcs =
      n(bundlingCampaign.max_allowed_pcs) > 0
        ? n(bundlingCampaign.max_allowed_pcs)
        : calc(bundlingCampaign).avg > 0
        ? Math.round(n(bundlingCampaign.balance_to_make_mtr) / calc(bundlingCampaign).avg)
        : n(bundlingCampaign.balance_to_make_pcs);

    if (maxAvailPcs > 0 && totalBundledPcs > maxAvailPcs) {
      setError(
        `Total bundled pieces (${fmt(totalBundledPcs)} PCS) exceeds available finishing WIP (${fmt(maxAvailPcs)} PCS).`
      );
      return;
    }

    setBundlingSaving(true);
    try {
      const payload = validBundles.map((b) => {
        const baseRemarks = b.remarks
          ? `Bundle ${b.bundle_no}: ${b.remarks}`
          : b.bundle_no
          ? `Bundle: ${b.bundle_no}`
          : 'Campaign Bundling';
        return {
          work_order_id: b.wo_id,
          route_id: bundlingCampaign.route_id,
          stage_code: 'FINISHING',
          input_qty: n(b.mtr),
          output_qty: n(b.mtr),
          rejection_qty: 0,
          htc_ok: 0,
          output_pcs: n(b.pcs) || null,
          heat_lot_no: b.bundle_no || null,
          remarks: attachPcsToRemarks(baseRemarks, n(b.pcs), 0),
        };
      });

      const res = await fetch('/api/production/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: payload,
          p_process_date: date,
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || 'Failed to record campaign bundling.');
      }

      setRows((prevRows) =>
        prevRows.map((r) => {
          const bundlesForWo = validBundles.filter((b) => b.wo_id === r.work_order_id);
          if (!bundlesForWo.length) return r;
          const sumPcs = bundlesForWo.reduce((s, b) => s + n(b.pcs), 0);
          const sumMtr = bundlesForWo.reduce((s, b) => s + n(b.mtr), 0);
          const bundleNos = bundlesForWo.map((b) => b.bundle_no).filter(Boolean).join(', ');
          return {
            ...r,
            pcs: String(sumPcs),
            mtr: String(Number(sumMtr.toFixed(3))),
            heat_lot_no: bundleNos || r.heat_lot_no,
            remarks: `Bundled: ${bundlesForWo.length} bundles (${sumPcs} PCS)`,
          };
        })
      );

      setMessage(`Campaign bundling recorded successfully! ${validBundles.length} bundles saved.`);
      setBundlingCampaign(null);
      await Promise.all([reloadQueue(), reloadHistory(), loadFactoryWip()]);
    } catch (e: unknown) {
      console.error('Bundling error:', e);
      setError(e instanceof Error ? e.message : 'Failed to record campaign bundling.');
    } finally {
      setBundlingSaving(false);
    }
  };

  const getEntryAvgLength = (entry: ProductionEntry | null) => {
    if (!entry) return 6.0;
    const isMhStage = entry.stage_code === 'ROLLING' || entry.stage_code === 'HOLLOW_HEAT_TREATMENT';
    const rowMatch = rows.find((r) => r.work_order_no === entry.work_order_no || r.work_order_id === entry.work_order_id);
    const mhL1 = Number(entry.mh_l1 || rowMatch?.mh_l1 || 0);
    const mhL2 = Number(entry.mh_l2 || rowMatch?.mh_l2 || 0);
    const computedMhAvg = mhL1 > 0 && mhL2 > 0 ? (mhL1 + mhL2) / 2 : mhL1 || mhL2 || 0;
    const mhLen = Number(entry.mh_avg_length || rowMatch?.mh_avg_length || computedMhAvg || 0);
    const woLen = Number(
      entry.avg_length ||
        rowMatch?.avg_length ||
        (Number(rowMatch?.total_order_mtr || 0) > 0 && Number(rowMatch?.total_order_pcs || 0) > 0
          ? Number(rowMatch?.total_order_mtr) / Number(rowMatch?.total_order_pcs)
          : 6.0)
    );
    return isMhStage && mhLen > 0 ? mhLen : woLen > 0 ? woLen : 6.0;
  };

  // Edit handler execution
  async function handleUpdateEntry(payload: {
    editDate: string;
    editMtr: number;
    editPcs: string;
    editRejectionMtr: number;
    editRejectionPcs: string;
    editHtcMtr: number;
    editHtcPcs: string;
    editHeatLot: string;
    editRemarks: string;
  }) {
    if (!editing) return;
    const finalRemarks = attachPcsToRemarks(payload.editRemarks, n(payload.editPcs), n(payload.editRejectionPcs));

    const { error: rpcError } = await supabase.rpc('update_production_entry', {
      p_production_id: editing.id,
      p_process_date: payload.editDate,
      p_output_qty: payload.editMtr,
      p_rejection_qty: payload.editRejectionMtr,
      p_htc_ok: editing.stage_code === 'ROLLING' ? payload.editHtcMtr : 0,
      p_heat_lot_no: payload.editHeatLot.trim() || null,
      p_remarks: finalRemarks.trim() || null,
    });
    if (rpcError) throw rpcError;

    setMessage('Production entry updated successfully.');
    setEditing(null);
    await Promise.all([reloadQueue(), reloadHistory()]);
  }

  // Delete handler execution
  async function handleDeleteEntry() {
    if (!deleteId) return;
    setDeleteBusy(true);
    setError('');
    setMessage('');

    const targetEntry = entries.find((e) => e.id === deleteId);
    if (targetEntry) {
      const delCheck = canDeleteForStage(targetEntry.stage_code);
      if (!delCheck.allowed) {
        setError(delCheck.reason || 'Permission Denied: Unauthorized to delete this entry.');
        setDeleteBusy(false);
        return;
      }
    }

    try {
      const { error: rpcError } = await supabase.rpc('delete_production_entry', {
        p_production_id: deleteId,
      });
      if (rpcError) throw rpcError;

      const targetWoNo = targetEntry?.work_order_no;
      if (targetWoNo) {
        const { data: woData } = await supabase
          .from('work_orders')
          .select('id')
          .eq('work_order_no', targetWoNo)
          .maybeSingle();

        const woId = targetEntry?.work_order_id || woData?.id;
        if (woId) {
          const { data: remainingLogs } = await supabase
            .from('production_logs')
            .select('id')
            .eq('work_order_id', woId)
            .limit(1);

          if (!remainingLogs || remainingLogs.length === 0) {
            const { data: plans } = await supabase
              .from('rolling_plans')
              .select('id')
              .eq('work_order_id', woId)
              .limit(1);

            const newStatus = plans && plans.length > 0 ? 'Scheduled' : 'Pending Plan';
            await supabase.from('work_orders').update({ status: newStatus }).eq('id', woId);
          }
        }
      }

      setDeleteId(null);
      setMessage('Production entry deleted successfully.');
      await Promise.all([reloadQueue(), reloadHistory()]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete.');
    } finally {
      setDeleteBusy(false);
    }
  }

  const targetDeleteEntry = deleteId ? entries.find((e) => e.id === deleteId) || null : null;
  const targetDeleteCheck = targetDeleteEntry
    ? canDeleteForStage(targetDeleteEntry.stage_code)
    : { allowed: false, reason: 'Entry not found' };

  return (
    <div className="space-y-4">
      {/* Top Toolbar */}
      <ProductionToolbar
        stage={stage}
        setStage={setStage}
        date={date}
        setDate={setDate}
        isAllowed={isAllowed}
        ordersCount={filteredRows.length}
        loading={queueLoading || historyLoading}
        onRefresh={() => void Promise.all([reloadQueue(), reloadHistory(), loadFactoryWip()])}
        allExpanded={rows.length > 0 && rows.every((r) => expandedRows[`${r.work_order_id}|${r.route_id}`])}
        onToggleAllRows={toggleAllRows}
      />

      {/* Messages */}
      {message && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-xs sm:text-sm font-medium text-emerald-800 shadow-2xs animate-in fade-in">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-xs sm:text-sm font-medium text-rose-800 shadow-2xs animate-in fade-in">
          <AlertTriangle size={16} className="mt-0.5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Work Center WIP Summary Strip */}
      <WipSummaryCards workCenterSummary={workCenterSummary} stage={stage} setStage={setStage} />

      {/* Form Access & Permissions Banner */}
      <FormAccessBanner access={stageFormAccess} className="mb-2" />

      {/* Main Queue Entry Grid */}
      <ProductionQueueTable
        stage={stage}
        rows={rows}
        filteredRows={filteredRows}
        woFilter={woFilter}
        setWoFilter={setWoFilter}
        expandedRows={expandedRows}
        onToggleRowExpansion={toggleRowExpansion}
        onUpdateRow={updateRow}
        onOpenBundling={openCampaignBundling}
        isAllowed={isAllowed}
        roleTitle={roleTitle}
        isAuditor={user?.role === 'auditor'}
        saving={saving}
        queueLoading={queueLoading}
        onSave={save}
      />

      {/* Production History Table */}
      <ProductionHistoryTable
        entries={entries}
        rows={rows}
        search={search}
        setSearch={setSearch}
        entryStage={entryStage}
        setEntryStage={setEntryStage}
        entryRoute={entryRoute}
        setEntryRoute={setEntryRoute}
        routes={routes}
        fromDate={fromDate}
        setFromDate={setFromDate}
        toDate={toDate}
        setToDate={setToDate}
        historyLoading={historyLoading}
        canEditForStage={canEditForStage}
        canDeleteForStage={canDeleteForStage}
        onOpenEdit={(entry) => setEditing(entry)}
        onOpenDelete={(id) => setDeleteId(id)}
        isAdmin={isAdmin}
        isSuperUser={isSuperUser}
        workCenter={workCenter}
      />

      {/* Edit Entry Modal */}
      {editing && (
        <EditEntryModal
          editing={editing}
          onClose={() => setEditing(null)}
          onSave={handleUpdateEntry}
          avgLength={getEntryAvgLength(editing)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && targetDeleteEntry && (
        <DeleteEntryModal
          targetEntry={targetDeleteEntry}
          onClose={() => setDeleteId(null)}
          onConfirm={handleDeleteEntry}
          delCheck={targetDeleteCheck}
          isAdmin={isAdmin}
          isSuperUser={isSuperUser}
          workCenter={workCenter}
          busy={deleteBusy}
        />
      )}

      {/* Campaign Multi-Work Order Bundling Modal (Rule 2) */}
      {bundlingCampaign && (
        <BundlingCampaignModal
          bundlingCampaign={bundlingCampaign}
          campaignBundles={campaignBundles}
          onClose={() => setBundlingCampaign(null)}
          onAddBundle={addBundleToWo}
          onRemoveBundle={removeBundle}
          onUpdateBundleField={updateBundleField}
          onApplyToGrid={applyBundlesToGrid}
          onSaveBundles={saveCampaignBundling}
          saving={bundlingSaving}
        />
      )}
    </div>
  );
}
