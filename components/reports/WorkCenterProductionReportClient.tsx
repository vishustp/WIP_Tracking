'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Printer,
  Search,
  RefreshCw,
  Download,
  Factory,
  Flame,
  Layers,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Calendar,
  Filter,
  ClipboardCheck,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ProductionEntry, StageCode } from '@/types';
import { mtFromMtr, extractPcsFromRemarks } from '@/lib/productionUtils';
import { toast } from 'sonner';

interface WorkCenterTabConfig {
  code: string;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const WORK_CENTERS: WorkCenterTabConfig[] = [
  {
    code: 'ROLLING',
    label: 'Hot Rolling Mill',
    shortLabel: 'Rolling',
    description: 'Hot billet piercing, mother hollow rolling, and initial hot sizing.',
    icon: Flame,
    color: 'border-amber-500 text-amber-700 bg-amber-50',
  },
  {
    code: 'HOLLOW_HEAT_TREATMENT',
    label: 'Hollow Heat Treatment',
    shortLabel: 'Hollow HT',
    description: 'Mother hollow annealing and stress relieving prior to pilgering/draw.',
    icon: Flame,
    color: 'border-orange-500 text-orange-700 bg-orange-50',
  },
  {
    code: 'DRAW',
    label: 'Cold Draw Bench',
    shortLabel: 'Cold Draw',
    description: 'Cold drawing, plug drawing, and cold reduction to final dimensions.',
    icon: Wrench,
    color: 'border-indigo-500 text-indigo-700 bg-indigo-50',
  },
  {
    code: 'PILGER',
    label: 'Cold Pilger Mill',
    shortLabel: 'Pilger',
    description: 'Cold pilgering and roll-die reduction of stainless steel hollows.',
    icon: Wrench,
    color: 'border-cyan-500 text-cyan-700 bg-cyan-50',
  },
  {
    code: 'HEAT_TREATMENT',
    label: 'Final Heat Treatment',
    shortLabel: 'Final HT',
    description: 'Quench, temper, normalizing, and final metallurgical property conditioning.',
    icon: Flame,
    color: 'border-rose-500 text-rose-700 bg-rose-50',
  },
  {
    code: 'BAND_SAW',
    label: 'Band Saw Cutting',
    shortLabel: 'Band Saw',
    description: 'Precision pipe cutting into customer finished lengths prior to inspection.',
    icon: Layers,
    color: 'border-yellow-500 text-yellow-700 bg-yellow-50',
  },
  {
    code: 'VDI',
    label: 'VDI',
    shortLabel: 'VDI',
    description: 'Visual Dimension Inspection: OD, WT, length verification, surface inspection, and QA disposition.',
    icon: ClipboardCheck,
    color: 'border-purple-500 text-purple-700 bg-purple-50',
  },
  {
    code: 'FINISHING',
    label: 'BUNDLING',
    shortLabel: 'BUNDLING',
    description: 'BUNDLING.',
    icon: Factory,
    color: 'border-teal-500 text-teal-700 bg-teal-50',
  },
  {
    code: 'ALL',
    label: 'All Work Centers Combined',
    shortLabel: 'Plant Summary',
    description: 'Consolidated plant-wide cross-station throughput and yield overview.',
    icon: Layers,
    color: 'border-blue-500 text-blue-700 bg-blue-50',
  },
];

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

const LAST_WC_MAP: Record<string, string> = {
  ROLLING: 'PPC Rolling Plan',
  HOLLOW_HEAT_TREATMENT: 'Hot Rolling Mill',
  DRAW: 'Hollow HT / Rolling',
  PILGER: 'Hot Rolling Mill',
  HEAT_TREATMENT: 'Cold Draw / Pilger',
  BAND_SAW: 'Final Heat Treatment',
  VDI: 'Band Saw Cutting',
  FINISHING: 'VDI',
  ALL: 'Upstream Feed',
};

export default function WorkCenterProductionReportClient() {
  const [selectedWc, setSelectedWc] = useState<string>('ROLLING');
  const [entries, setEntries] = useState<ProductionEntry[]>([]);
  const [wipData, setWipData] = useState<any[]>([]);
  const [rollingPlansData, setRollingPlansData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedRoute, setSelectedRoute] = useState<string>('ALL');
  const [routesList, setRoutesList] = useState<Array<{ id: string; route_code: string; route_name: string }>>([]);
  const [fromDate, setFromDate] = useState(() => {
    // Default to last 7 days
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const s = createClient();
      const routeArg = selectedRoute === 'ALL' ? null : selectedRoute;

      const [prodRes, woRes, routeRes, qcRes, wipRes] = await Promise.all([
        s.rpc('get_production_entries', {
          p_search: debouncedSearch.trim() || null,
          p_stage_code: null, // query all stages for seamless preceding-stage balancing and instant tab switching
          p_route_code: routeArg,
          p_from_date: fromDate || null,
          p_to_date: toDate || null,
          p_limit: 2500,
          p_offset: 0,
        }),
        s
          .from('work_orders')
          .select('id, work_order_no, customer_name, grade, specification, size_od, size_wt, l1, l2')
          .limit(5000),
        s.from('process_routes').select('id, route_code, route_name').eq('active', true),
        s.from('qc_inspections').select('*').order('created_at', { ascending: false }).limit(2500),
        s.from('vw_route_stage_wip').select('*'),
      ]);

      if (wipRes?.data) {
        setWipData(wipRes.data);
      }

      if (routeRes?.data) {
        setRoutesList(routeRes.data);
      }

      if (prodRes.error) throw prodRes.error;
      const raw = (prodRes.data as ProductionEntry[]) || [];

      // Route and Work Order Maps
      const routeMap = new Map<string, { route_code: string; route_name: string }>();
      (routeRes.data || []).forEach((r: any) => {
        routeMap.set(r.id, { route_code: r.route_code, route_name: r.route_name });
      });

      const woMap = new Map<string, any>();
      (woRes.data || []).forEach((w: any) => {
        woMap.set(w.id, w);
        if (w.work_order_no) woMap.set(String(w.work_order_no).trim(), w);
      });

      // Fetch log details and rolling plans to attach exact plan_no per log entry
      const entryIds = raw.map((e) => e.id).filter(Boolean);
      const planByIdMap = new Map<string, any>();
      const plansByWoMap = new Map<string, any[]>();
      const planMhMap = new Map<string, { mh_od: number; mh_wt: number; mh_l1?: number; mh_l2?: number; mh_avg_length?: number }>();
      const logMap = new Map<string, any>();

      try {
        const [{ data: logDetails }, { data: rpData }] = await Promise.all([
          s
            .from('production_logs')
            .select('id, rolling_plan_id, work_order_id, input_qty, output_qty, rejection_qty, htc_ok, heat_lot_no, remarks, created_at, process_date')
            .in('id', entryIds),
          s
            .from('rolling_plans')
            .select('id, plan_no, work_order_id, mh_od, mh_wt, mh_l1, mh_l2, planned_qty, status, created_at')
            .not('status', 'is', null)
            .limit(5000),
        ]);

        if (rpData) {
          setRollingPlansData(rpData as any[]);
        }

        ((logDetails as any[]) || []).forEach((l: any) => {
          logMap.set(l.id, l);
        });

        ((rpData as any[]) || []).forEach((rp: any) => {
          let planNo = rp.plan_no ? String(rp.plan_no).trim() : '';
          let revisionNo = 0;
          let childIds: string[] = [];
          let mhOd = Number(rp.mh_od || 0);
          let mhWt = Number(rp.mh_wt || 0);
          let mhL1 = Number(rp.mh_l1 || 0);
          let mhL2 = Number(rp.mh_l2 || 0);

          if (rp.status) {
            try {
              const meta = typeof rp.status === 'string' ? JSON.parse(rp.status) : rp.status;
              if (meta?.campaign_plan_no) planNo = String(meta.campaign_plan_no).trim();
              else if (meta?.master_plan_no) planNo = String(meta.master_plan_no).trim();
              else if (meta?.plan_no) planNo = String(meta.plan_no).trim();
              if (meta?.revision_no) revisionNo = Number(meta.revision_no) || 0;
              if (!mhOd) mhOd = Number(meta?.mh_od || meta?.cust_od || meta?.sm?.cust_od || meta?.sizing_mill?.cust_od || 0);
              if (!mhWt) mhWt = Number(meta?.mh_wt || meta?.cust_wt || meta?.sm?.rolling_wt || meta?.sm?.cust_wt || meta?.sizing_mill?.rolling_wt || 0);
              if (!mhL1) mhL1 = Number(meta?.mh_l1 || meta?.l1 || 0);
              if (!mhL2) mhL2 = Number(meta?.mh_l2 || meta?.l2 || 0);
              let mhAvg = Number(rp.mh_avg_length || 0);
              if (!mhAvg) mhAvg = Number(meta?.mh_avg_length || meta?.sm?.sm_len || meta?.eff_len || (mhL1 && mhL2 ? (mhL1 + mhL2) / 2 : mhL1 || 4.49));
              if (Array.isArray(meta?.child_work_orders)) {
                childIds = meta.child_work_orders.map((c: any) => c.work_order_id || c.id).filter(Boolean);
                meta.child_work_orders.forEach((c: any) => {
                  if (c.work_order_no && mhOd > 0 && mhWt > 0) {
                    planMhMap.set(String(c.work_order_no).trim(), { mh_od: mhOd, mh_wt: mhWt, mh_l1: mhL1, mh_l2: mhL2, mh_avg_length: mhAvg });
                  }
                });
              }
            } catch { }
          }

          if (mhOd > 0 && mhWt > 0) {
            const mhPayload = { mh_od: mhOd, mh_wt: mhWt, mh_l1: mhL1, mh_l2: mhL2, mh_avg_length: Number((rp.status as any)?.sm?.sm_len || (rp.status as any)?.eff_len || (mhL1 && mhL2 ? (mhL1 + mhL2) / 2 : mhL1 || 4.49)) };
            if (rp.work_order_id) planMhMap.set(rp.work_order_id, mhPayload);
            for (const cId of childIds) {
              planMhMap.set(cId, mhPayload);
            }
          }

          const planObj = {
            id: rp.id,
            work_order_id: rp.work_order_id,
            child_work_order_ids: childIds,
            plan_no: planNo || undefined,
            revision_no: revisionNo || undefined,
            mh_od: mhOd || undefined,
            mh_wt: mhWt || undefined,
            mh_l1: mhL1 || undefined,
            mh_l2: mhL2 || undefined,
            mh_avg_length: Number((rp.status as any)?.sm?.sm_len || (rp.status as any)?.eff_len || (mhL1 && mhL2 ? (mhL1 + mhL2) / 2 : mhL1 || 4.49)),
            created_at: rp.created_at,
          };

          planByIdMap.set(rp.id, planObj);

          if (rp.work_order_id) {
            const list = plansByWoMap.get(rp.work_order_id) || [];
            list.push(planObj);
            plansByWoMap.set(rp.work_order_id, list);
          }

          for (const cId of childIds) {
            const list = plansByWoMap.get(cId) || [];
            list.push(planObj);
            plansByWoMap.set(cId, list);
          }
        });
      } catch { }

      const enriched = raw.map((e) => {
        const logRow = logMap.get(e.id);
        const targetWoId = logRow?.work_order_id || e.work_order_id;
        const woInfo = targetWoId ? woMap.get(targetWoId) : woMap.get(String(e.work_order_no).trim());
        const effectiveWoId = targetWoId || woInfo?.id;

        let plan: any = null;
        if (logRow?.rolling_plan_id && planByIdMap.has(logRow.rolling_plan_id)) {
          plan = planByIdMap.get(logRow.rolling_plan_id);
        } else if (effectiveWoId && plansByWoMap.has(effectiveWoId)) {
          const woPlans = plansByWoMap.get(effectiveWoId) || [];
          if (woPlans.length === 1) {
            plan = woPlans[0];
          } else if (woPlans.length > 1) {
            const logTime = new Date(logRow?.created_at || e.created_at || e.process_date || 0).getTime();
            const sorted = [...woPlans].sort(
              (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
            );
            let matched = sorted[0];
            for (const p of sorted) {
              if (new Date(p.created_at || 0).getTime() <= logTime) {
                matched = p;
              }
            }
            plan = matched;
          }
        }

        const isMhStage = (e.stage_code || '').toUpperCase() === 'ROLLING' || (e.stage_code || '').toUpperCase() === 'HOLLOW_HEAT_TREATMENT';
        const mhInfo = plan?.mh_od ? plan : (effectiveWoId ? planMhMap.get(effectiveWoId) : null) || (e.work_order_no ? planMhMap.get(String(e.work_order_no).trim()) : null);
        const effAvgLen = isMhStage
          ? (plan?.mh_l1 && plan?.mh_l2 ? (Number(plan.mh_l1) + Number(plan.mh_l2)) / 2 : Number(plan?.mh_l1 || plan?.mh_l2 || mhInfo?.mh_l1 || mhInfo?.mh_l2 || 6.0))
          : (woInfo?.l1 && woInfo?.l2 ? (Number(woInfo.l1) + Number(woInfo.l2)) / 2 : Number(woInfo?.l1 || woInfo?.l2 || 6.0));

        const { pcs: parsedPcs, rejPcs: parsedRejPcs, cleanRemarks } = extractPcsFromRemarks(logRow?.remarks || e.remarks);

        // Strictly use user-entered pieces and rejections from log remarks/database
        const outPcs = parsedPcs != null ? parsedPcs : Number(logRow?.output_pcs ?? e.output_pcs ?? 0);
        const rejPcs = parsedRejPcs != null ? parsedRejPcs : Number(logRow?.rejection_pcs ?? e.rejection_pcs ?? 0);
        const inPcs = Number(logRow?.input_pcs ?? e.input_pcs ?? 0) > 0
          ? Number(logRow?.input_pcs ?? e.input_pcs)
          : Math.max(outPcs + rejPcs, outPcs);

        // Strictly use exact meters entered by user in the database log
        const outMtr = Number(logRow?.output_qty ?? e.output_mtr ?? 0);
        const rejMtr = Number(logRow?.rejection_qty ?? e.rejection_mtr ?? 0);
        const inMtr = Number(logRow?.input_qty ?? e.input_mtr ?? (outMtr + rejMtr));

        const isDraw = (e.stage_code || '').toUpperCase() === 'DRAW' || (e.stage_code || '').toUpperCase() === 'PILGER';
        const od = Number(isMhStage && mhInfo?.mh_od ? mhInfo.mh_od : (e.od || woInfo?.size_od || 0));
        const wl = Number(isMhStage && mhInfo?.mh_wt ? mhInfo.mh_wt : (e.wl || woInfo?.size_wt || 0));
        const calculatedInMt = mtFromMtr(inMtr, od, wl);
        let calculatedOutMt = mtFromMtr(outMtr, od, wl);
        const calculatedRejMt = mtFromMtr(rejMtr, od, wl);

        // Mass conservation for cold drawing (AGENTS.md Rule 3: Mass_In = Mass_Out)
        if (isDraw && mhInfo?.mh_od && mhInfo?.mh_wt) {
          const mhLen = Number(mhInfo.mh_avg_length || (mhInfo.mh_l1 && mhInfo.mh_l2 ? (Number(mhInfo.mh_l1) + Number(mhInfo.mh_l2)) / 2 : mhInfo.mh_l1 || 4.49));
          if (outPcs > 0 && mhLen > 0) {
            const drawnConservedMt = mtFromMtr(outPcs * mhLen, Number(mhInfo.mh_od), Number(mhInfo.mh_wt));
            if (drawnConservedMt > calculatedOutMt) {
              calculatedOutMt = drawnConservedMt;
            }
          }
        }

        const isRolling = (e.stage_code || '').toUpperCase() === 'ROLLING';
        const rawHtcMtr = Number(logRow?.htc_ok ?? e.htc_ok_mtr ?? (e as any).htc_ok ?? 0);
        const htcOkMtr = isRolling
          ? (rawHtcMtr > 0 ? rawHtcMtr : Math.max(0, outMtr - rejMtr))
          : 0;

        const htcMatch = (logRow?.remarks || e.remarks || '').match(/\[HTC(?:_OK)?(?:_PCS)?:(\d+)\]/i);
        const remarkHtcPcs = htcMatch ? parseInt(htcMatch[1], 10) : null;

        // User logged HTC OK PCS: strictly what operator entered
        const htcOkPcs = isRolling
          ? (remarkHtcPcs != null && remarkHtcPcs > 0
              ? remarkHtcPcs
              : Math.max(0, outPcs - rejPcs))
          : 0;

        return {
          ...e,
          work_order_id: effectiveWoId || e.work_order_id,
          work_order_no: e.work_order_no || woInfo?.work_order_no || '—',
          od,
          wl,
          mh_od: isMhStage && mhInfo?.mh_od ? Number(mhInfo.mh_od) : undefined,
          mh_wt: isMhStage && mhInfo?.mh_wt ? Number(mhInfo.mh_wt) : undefined,
          customer_name: e.customer_name || woInfo?.customer_name || 'Standard Stock',
          grade: woInfo?.grade || woInfo?.specification || '—',
          heat_lot_no: logRow?.heat_lot_no || e.heat_lot_no || woInfo?.heat_lot_no || '',
          rolling_plan_id: plan?.id || logRow?.rolling_plan_id,
          plan_no: plan?.plan_no,
          revision_no: plan?.revision_no,
          input_pcs: inPcs,
          input_mtr: inMtr,
          input_mt: calculatedInMt,
          output_pcs: outPcs,
          output_mtr: outMtr,
          output_mt: calculatedOutMt,
          rejection_pcs: rejPcs,
          rejection_mtr: rejMtr,
          rejection_mt: calculatedRejMt,
          htc_ok_pcs: htcOkPcs,
          htc_ok_mtr: htcOkMtr,
          remarks: cleanRemarks,
        };
      });

      // Also merge records from qc_inspections for VDI
      const qcEntries: ProductionEntry[] = [];
      if (qcRes?.data && Array.isArray(qcRes.data)) {
        qcRes.data.forEach((q: any) => {
          const wo = woMap.get(q.work_order_id) || (q.work_order_no ? woMap.get(String(q.work_order_no).trim()) : undefined);
          const qDate = q.inspection_date ? String(q.inspection_date).slice(0, 10) : String(q.created_at).slice(0, 10);
          if (fromDate && qDate < fromDate) return;
          if (toDate && qDate > toDate) return;
          if (debouncedSearch.trim()) {
            const term = debouncedSearch.trim().toLowerCase();
            const matchWo = (wo?.work_order_no || '').toLowerCase().includes(term);
            const matchCust = (wo?.customer_name || '').toLowerCase().includes(term);
            const matchHeat = (q.heat_lot_no || '').toLowerCase().includes(term);
            const matchRem = (q.remarks || '').toLowerCase().includes(term);
            if (!matchWo && !matchCust && !matchHeat && !matchRem) return;
          }

          const woPlans = q.work_order_id ? (plansByWoMap.get(q.work_order_id) || []) : [];
          const plan = woPlans[0];
          const planMh = q.work_order_id ? planMhMap.get(q.work_order_id) : undefined;

          const od = Number(wo?.size_od || q.od || planMh?.mh_od || plan?.mh_od || 0);
          const wl = Number(wo?.size_wt || q.wl || planMh?.mh_wt || plan?.mh_wt || 0);
          const inPcs = Number(q.inspected_pcs || 0);
          const inMtr = Number(q.inspected_mtr || 0);
          const outPcs = Number(q.vdi_ok_pcs || 0);
          const outMtr = Number(q.vdi_ok_mtr || 0);
          const rejPcs = Number(q.vdi_rejection_pcs || 0) + Number(q.vdi_salvage_pcs || 0);
          const rejMtr = Number(q.vdi_rejection_mtr || 0) + Number(q.vdi_salvage_mtr || 0);

          const routeId = q.process_route_id || plan?.process_route_id;
          const routeInfo = routeId ? routeMap.get(routeId) : null;
          const wipRow = (wipRes?.data || []).find((w: any) => w.work_order_id === q.work_order_id);
          const routeCode = routeInfo?.route_code || wipRow?.route_code || 'HFS';
          if (selectedRoute !== 'ALL' && routeCode !== selectedRoute) return;

          // For VDI:
          // Card 3: Total Inspected = inPcs / inMtr / inMt
          // Card 4: QC Losses = rejPcs / rejMtr / rejMt
          // Card 5: VDI Passed OK = outPcs / outMtr / outMt
          qcEntries.push({
            id: q.id,
            work_order_id: q.work_order_id,
            work_order_no: wo?.work_order_no || '—',
            customer_name: wo?.customer_name || 'Standard Stock',
            grade: wo?.grade || wo?.specification || '—',
            route_code: routeCode,
            stage_code: 'VDI',
            process_date: qDate,
            od,
            wl,
            plan_no: plan?.plan_no,
            revision_no: plan?.revision_no,
            l1: Number(wo?.l1 || 0),
            l2: Number(wo?.l2 || 0),
            avg_length: Number(wo?.avg_length || 6.0),
            input_pcs: inPcs > 0 ? inPcs : (outPcs + rejPcs),
            input_mtr: inMtr > 0 ? inMtr : (outMtr + rejMtr),
            input_mt: Number(q.inspected_mt || 0) || mtFromMtr(inMtr, od, wl),
            output_pcs: inPcs > 0 ? inPcs : (outPcs + rejPcs),
            output_mtr: inMtr > 0 ? inMtr : (outMtr + rejMtr),
            output_mt: Number(q.inspected_mt || 0) || mtFromMtr(inMtr, od, wl),
            rejection_pcs: rejPcs,
            rejection_mtr: rejMtr,
            rejection_mt: Number(q.vdi_rejection_mt || 0) + Number(q.vdi_salvage_mt || 0) || mtFromMtr(rejMtr, od, wl),
            htc_ok_pcs: outPcs,
            htc_ok_mtr: outMtr,
            htc_ok_mt: Number(q.vdi_ok_mt || 0) || mtFromMtr(outMtr, od, wl),
            heat_lot_no: q.heat_lot_no || '',
            remarks: q.remarks ? `[VDI QC] ${q.remarks}` : '[VDI QC]',
            created_at: q.created_at,
            can_modify: false,
          } as unknown as ProductionEntry);
        });
      }

      // Combine and sort by date/time descending
      const combined = [...enriched, ...qcEntries].sort(
        (a, b) => new Date(b.created_at || b.process_date).getTime() - new Date(a.created_at || a.process_date).getTime()
      );

      setEntries(combined);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load production entries.');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, fromDate, toDate, selectedRoute]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered entries strictly for the currently active work center
  const filteredEntries = useMemo(() => {
    if (selectedWc === 'ALL') return entries;
    return entries.filter((e) => (e.stage_code || '').toUpperCase() === selectedWc);
  }, [entries, selectedWc]);

  // Work Center Metrics: Pure Production OK & Rejections Logged by Users
  const metrics = useMemo(() => {
    let outputMtr = 0;
    let outputPcs = 0;
    let outputMt = 0;
    let rejMtr = 0;
    let rejPcs = 0;
    let rejMt = 0;

    filteredEntries.forEach((e) => {
      const isRolling = (e.stage_code || '').toUpperCase() === 'ROLLING';
      const okPcs = isRolling && Number(e.htc_ok_pcs || 0) > 0 ? Number(e.htc_ok_pcs) : Number(e.output_pcs || 0);
      const okMtr = isRolling && Number(e.htc_ok_mtr || 0) > 0 ? Number(e.htc_ok_mtr) : Number(e.output_mtr || 0);
      const okMt = Number(e.output_mt || 0);

      outputPcs += okPcs;
      outputMtr += okMtr;
      outputMt += okMt;

      rejPcs += Number(e.rejection_pcs || 0);
      rejMtr += Number(e.rejection_mtr || 0);
      rejMt += Number(e.rejection_mt || 0);
    });

    const totalLoggedPieces = outputPcs + rejPcs;
    const yieldPct = totalLoggedPieces > 0 ? Math.min(100, Math.max(0, (outputPcs / totalLoggedPieces) * 100)) : 100;

    return {
      count: filteredEntries.length,
      outputPcs,
      outputMtr,
      outputMt,
      rejPcs,
      rejMtr,
      rejMt,
      yieldPct,
    };
  }, [filteredEntries]);

  // Feeder Balance Calculations:
  // Preceding Stage OK -> Current Stage OK -> Stage Active WIP Balance
  // "Stage WIP is calculated directly: Stage Active WIP = Preceding Stage OK - Current Stage OK"
  const feederMetrics = useMemo(() => {
    const lastWcName = LAST_WC_MAP[selectedWc] || 'Preceding Stage';
    const searchTerm = debouncedSearch.trim().toLowerCase();
    const isSearchFiltered = searchTerm.length > 0;

    const activeWoNos = new Set(
      filteredEntries
        .map((e) => (e.work_order_no || '').toLowerCase().trim())
        .filter((no) => no && no !== '—')
    );

    if (selectedWc === 'ROLLING') {
      let totalPlanMtr = 0;
      let totalPlanPcs = 0;
      let totalPlanMt = 0;

      const relevantPlans = rollingPlansData.filter((p) => {
        if (selectedRoute !== 'ALL') {
          const rCode = (p as any).route_code || (p as any).status?.route_code;
          if (rCode && rCode !== selectedRoute) return false;
        }
        if (isSearchFiltered) {
          const pNo = (p.plan_no || '').toLowerCase();
          return pNo.includes(searchTerm);
        }
        return true;
      });

      relevantPlans.forEach((p) => {
        let st: any = {};
        if (typeof p.status === 'object' && p.status !== null) {
          st = p.status;
        } else if (typeof p.status === 'string') {
          try {
            st = JSON.parse(p.status);
          } catch {
            st = {};
          }
        }
        const pMtr = Number(p.planned_qty || st.planned_mtr || 0);
        const pPcs = Number(st.master_planned_pcs || st.planned_pcs || st.plan_qty?.nos || (pMtr > 0 ? Math.round(pMtr / 6) : 0));
        const od = Number(st.mh_od || p.mh_od || st.cust_od || 60);
        const wt = Number(st.mh_wt || p.mh_wt || st.cust_wt || 4);
        totalPlanMtr += pMtr;
        totalPlanPcs += pPcs;
        totalPlanMt += mtFromMtr(pMtr, od, wt);
      });

      const donePcs = metrics.outputPcs;
      const doneMtr = metrics.outputMtr;
      const doneMt = metrics.outputMt;

      const balancePcs = Math.max(0, totalPlanPcs - donePcs);
      const balanceMtr = Math.max(0, totalPlanMtr - doneMtr);
      const balanceMt = Math.max(0, totalPlanMt - doneMt);

      return {
        lastWcName,
        receivedPcs: totalPlanPcs,
        receivedMtr: totalPlanMtr,
        receivedMt: totalPlanMt,
        balancePcs,
        balanceMtr,
        balanceMt,
      };
    }

    if (selectedWc === 'ALL') {
      const donePcs = metrics.outputPcs;
      const doneMtr = metrics.outputMtr;
      const doneMt = metrics.outputMt;
      const relevantWip = wipData.filter((r) => {
        if (selectedRoute !== 'ALL' && r.route_code !== selectedRoute) return false;
        if (isSearchFiltered) {
          const woNo = (r.work_order_no || '').toLowerCase();
          const cust = (r.customer_name || '').toLowerCase();
          return activeWoNos.has(woNo) || woNo.includes(searchTerm) || cust.includes(searchTerm);
        }
        return true;
      });
      const balancePcs = relevantWip.reduce((acc, r) => acc + Number(r.current_wip_pcs || 0), 0);
      const balanceMt = relevantWip.reduce((acc, r) => acc + Number(r.current_wip_mt || 0), 0);
      const balanceMtr = relevantWip.reduce((acc, r) => acc + Number(r.current_wip || 0), 0);
      return {
        lastWcName,
        receivedPcs: donePcs + balancePcs,
        receivedMtr: doneMtr + balanceMtr,
        receivedMt: doneMt + balanceMt,
        balancePcs,
        balanceMtr,
        balanceMt,
      };
    }

    // Determine preceding stage for stage-to-stage direct balance (AGENTS.md Rule 1)
    let precedingStageCode = 'ROLLING';
    if (selectedWc === 'HOLLOW_HEAT_TREATMENT') {
      precedingStageCode = 'ROLLING';
    } else if (selectedWc === 'DRAW') {
      precedingStageCode = selectedRoute.includes('ALLOY') ? 'HOLLOW_HEAT_TREATMENT' : 'ROLLING';
    } else if (selectedWc === 'PILGER') {
      precedingStageCode = 'ROLLING';
    } else if (selectedWc === 'HEAT_TREATMENT') {
      precedingStageCode = selectedRoute === 'SS_STEEL' ? 'PILGER' : 'DRAW';
    } else if (selectedWc === 'BAND_SAW') {
      precedingStageCode = selectedRoute.includes('HFS') ? 'ROLLING' : 'HEAT_TREATMENT';
    } else if (selectedWc === 'VDI') {
      precedingStageCode = 'BAND_SAW';
    } else if (selectedWc === 'FINISHING') {
      precedingStageCode = 'VDI';
    }

    const precedingEntries = entries.filter((e) => {
      const eStage = (e.stage_code || '').toUpperCase();
      if (selectedWc === 'DRAW' && selectedRoute === 'ALL') {
        if (eStage !== 'ROLLING' && eStage !== 'HOLLOW_HEAT_TREATMENT') return false;
      } else if (selectedWc === 'HEAT_TREATMENT' && selectedRoute === 'ALL') {
        if (eStage !== 'DRAW' && eStage !== 'PILGER') return false;
      } else if (selectedWc === 'BAND_SAW' && selectedRoute === 'ALL') {
        if (eStage !== 'HEAT_TREATMENT' && eStage !== 'ROLLING' && eStage !== 'HOLLOW_HEAT_TREATMENT') return false;
      } else if (eStage !== precedingStageCode) {
        return false;
      }
      if (selectedRoute !== 'ALL' && e.route_code !== selectedRoute) return false;
      if (isSearchFiltered) {
        const woNo = (e.work_order_no || '').toLowerCase();
        const cust = (e.customer_name || '').toLowerCase();
        return activeWoNos.has(woNo) || woNo.includes(searchTerm) || cust.includes(searchTerm);
      }
      return true;
    });

    let feederOkPcs = 0;
    let feederOkMtr = 0;
    let feederOkMt = 0;

    precedingEntries.forEach((e) => {
      const isRolling = (e.stage_code || '').toUpperCase() === 'ROLLING';
      const okPcs = isRolling && Number(e.htc_ok_pcs || 0) > 0 ? Number(e.htc_ok_pcs) : Number(e.output_pcs || 0);
      const okMtr = isRolling && Number(e.htc_ok_mtr || 0) > 0 ? Number(e.htc_ok_mtr) : Number(e.output_mtr || 0);
      const okMt = Number(e.output_mt || 0);
      feederOkPcs += okPcs;
      feederOkMtr += okMtr;
      feederOkMt += okMt;
    });

    const relevantWip = wipData.filter((r) => {
      if (selectedWc !== 'ALL' && r.stage_code !== selectedWc) return false;
      if (selectedRoute !== 'ALL' && r.route_code !== selectedRoute) return false;
      if (isSearchFiltered) {
        const woNo = (r.work_order_no || '').toLowerCase();
        const cust = (r.customer_name || '').toLowerCase();
        return activeWoNos.has(woNo) || woNo.includes(searchTerm) || cust.includes(searchTerm);
      }
      return true;
    });

    const fallbackWipPcs = relevantWip.reduce((acc, r) => acc + Number(r.current_wip_pcs || 0), 0);
    const fallbackWipMt = relevantWip.reduce((acc, r) => acc + Number(r.current_wip_mt || 0), 0);
    const fallbackWipMtr = relevantWip.reduce((acc, r) => acc + Number(r.current_wip || 0), 0);

    const donePcs = metrics.outputPcs;
    const doneMt = metrics.outputMt;
    const doneMtr = metrics.outputMtr;

    // Strict Stage Balancing:
    // If preceding stage production is in scope, Received = feederOk (exactly matches upstream Production OK).
    // If work orders were rolled prior to date filter, ensure Received >= Done.
    const receivedPcs = feederOkPcs > 0 ? feederOkPcs : (donePcs + fallbackWipPcs);
    const receivedMt = feederOkMt > 0 ? feederOkMt : (doneMt + fallbackWipMt);
    const receivedMtr = feederOkMtr > 0 ? feederOkMtr : (doneMtr + fallbackWipMtr);

    const balancePcs = Math.max(0, receivedPcs - donePcs);
    const balanceMtr = Math.max(0, receivedMtr - doneMtr);
    const balanceMt = Math.max(0, receivedMt - doneMt);

    return {
      lastWcName,
      receivedPcs,
      receivedMtr,
      receivedMt,
      balancePcs,
      balanceMtr,
      balanceMt,
    };
  }, [selectedWc, metrics, rollingPlansData, wipData, selectedRoute, debouncedSearch, filteredEntries, entries]);

  const activeWcConfig = useMemo(() => {
    return WORK_CENTERS.find((w) => w.code === selectedWc) || WORK_CENTERS[0];
  }, [selectedWc]);

  const cardConfig = useMemo(() => {
    switch (selectedWc) {
      case 'ROLLING':
        return {
          c1Category: 'Authorized Plan',
          c1Title: 'PPC Rolling Plan',
          c2Category: 'Production Done',
          c2Title: 'Rolling OK (HTC)',
          c3Category: 'Work Center Balance',
          c3Title: 'Balance to Roll',
          c4Category: 'Rejections Logged',
          c4Title: 'Rolling Rejections',
          c5Category: 'Performance',
          c5Title: 'Rolling Efficiency',
        };
      case 'HOLLOW_HEAT_TREATMENT':
        return {
          c1Category: 'Received from',
          c1Title: 'Rolling OK (HTC)',
          c2Category: 'Production Done',
          c2Title: 'Hollow HT OK',
          c3Category: 'Work Center Balance',
          c3Title: 'Furnace Queue Balance',
          c4Category: 'Rejections Logged',
          c4Title: 'Furnace Rejections',
          c5Category: 'Performance',
          c5Title: 'Furnace Yield',
        };
      case 'DRAW':
        return {
          c1Category: 'Received from',
          c1Title: selectedRoute === 'CDS' ? 'Rolling OK (HTC)' : 'Rolling / Hollow HT (HTC)',
          c2Category: 'Production Done',
          c2Title: 'Draw Bench OK',
          c3Category: 'Work Center Balance',
          c3Title: 'Draw Bench Balance',
          c4Category: 'Rejections Logged',
          c4Title: 'Draw Rejections',
          c5Category: 'Performance',
          c5Title: 'Drawing Yield',
        };
      case 'PILGER':
        return {
          c1Category: 'Received from',
          c1Title: 'Rolling OK (HTC)',
          c2Category: 'Production Done',
          c2Title: 'Pilger OK',
          c3Category: 'Work Center Balance',
          c3Title: 'Pilger Balance',
          c4Category: 'Rejections Logged',
          c4Title: 'Pilger Rejections',
          c5Category: 'Performance',
          c5Title: 'Pilger Yield',
        };
      case 'HEAT_TREATMENT':
        return {
          c1Category: 'Received from',
          c1Title: selectedRoute === 'SS_STEEL' ? 'Cold Pilger Mill' : 'Cold Draw Bench',
          c2Category: 'Production Done',
          c2Title: 'Final HT OK',
          c3Category: 'Work Center Balance',
          c3Title: 'Furnace Balance',
          c4Category: 'Rejections Logged',
          c4Title: 'HT Rejections',
          c5Category: 'Performance',
          c5Title: 'Furnace Yield',
        };
      case 'BAND_SAW':
        return {
          c1Category: 'Received from',
          c1Title: 'Final Heat Treatment',
          c2Category: 'Production Done',
          c2Title: 'Band Saw Cut OK',
          c3Category: 'Work Center Balance',
          c3Title: 'Saw Station Balance',
          c4Category: 'Rejections Logged',
          c4Title: 'Band Saw Rejections',
          c5Category: 'Performance',
          c5Title: 'Band Saw Yield',
        };
      case 'VDI':
        return {
          c1Category: 'Received from',
          c1Title: 'Band Saw Cutting',
          c2Category: 'Production Done',
          c2Title: 'VDI Passed OK',
          c3Category: 'Work Center Balance',
          c3Title: 'VDI Inspection Balance',
          c4Category: 'Rejections Logged',
          c4Title: 'QC Rejections',
          c5Category: 'Performance',
          c5Title: 'Quality Pass Rate',
        };
      case 'FINISHING':
        return {
          c1Category: 'Received from',
          c1Title: 'VDI Inspection',
          c2Category: 'Production Done',
          c2Title: 'Finishing Bundled OK',
          c3Category: 'Work Center Balance',
          c3Title: 'Finishing Line Balance',
          c4Category: 'Rejections Logged',
          c4Title: 'Finishing Rejections',
          c5Category: 'Performance',
          c5Title: 'Bundling Yield',
        };
      case 'ALL':
      default:
        return {
          c1Category: 'Plant Inflow',
          c1Title: 'Total Mill Inflow',
          c2Category: 'Production Done',
          c2Title: 'Total Production OK',
          c3Category: 'Work Center Balance',
          c3Title: 'Active Mill WIP',
          c4Category: 'Rejections Logged',
          c4Title: 'Total Rejections',
          c5Category: 'Performance',
          c5Title: 'Overall Plant Yield',
        };
    }
  }, [selectedWc, selectedRoute]);

  const setQuickDate = (preset: 'today' | 'yesterday' | '7days' | 'month') => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    if (preset === 'today') {
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (preset === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().slice(0, 10);
      setFromDate(yStr);
      setToDate(yStr);
    } else if (preset === '7days') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setFromDate(d.toISOString().slice(0, 10));
      setToDate(todayStr);
    } else if (preset === 'month') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      setFromDate(first.toISOString().slice(0, 10));
      setToDate(todayStr);
    }
  };

  const exportCSV = () => {
    if (!filteredEntries.length) {
      toast.error('No production logs to export.');
      return;
    }

    const headers = [
      'Process Date',
      'Work Center',
      'Work Order No',
      'Customer',
      'Heat/Lot No',
      'Pipe OD (mm)',
      'Pipe WT (mm)',
      'Route Code',
      'Input MTR',
      'Input PCS',
      'Output MTR',
      'Output PCS',
      'Output MT',
      'Rejection MTR',
      'Rejection PCS',
      'HTC OK (Nos)',
      'HTC OK (MTR)',
      'Yield %',
      'Remarks',
    ];

    const rows = filteredEntries.map((e) => [
      e.process_date,
      e.stage_code,
      e.work_order_no,
      `"${(e.customer_name || '').replace(/"/g, '""')}"`,
      e.heat_lot_no || '',
      e.od ?? '',
      e.wl ?? '',
      e.route_code,
      e.input_mtr ?? 0,
      e.input_pcs ?? 0,
      e.output_mtr ?? 0,
      e.output_pcs ?? 0,
      e.output_mt ?? 0,
      e.rejection_mtr ?? 0,
      e.rejection_pcs ?? 0,
      e.htc_ok_pcs ?? 0,
      e.htc_ok_mtr ?? 0,
      e.input_mtr > 0 ? Math.min(100, Math.max(0, ((e.output_mtr - e.rejection_mtr) / e.input_mtr) * 100)).toFixed(1) : '100',
      `"${(e.remarks || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${selectedWc}_Production_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Production report exported to CSV.');
  };

  return (
    <div className="space-y-6 print:space-y-4 print:p-0">
      {/* Screen Toolbar / Header Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800 border border-blue-200">
              <Factory className="h-3.5 w-3.5 text-blue-700" />
              SHOP FLOOR CIRCULATION
            </span>
            <span className="text-xs font-semibold text-slate-500">Document Ref: RGHS/PRD-SOP-03</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Work Center Shift Production Report
          </h1>
          <p className="text-xs text-slate-500">
            Dedicated station-by-station production tracking, gross output, rejections, yield, and supervisor sign-offs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-blue-600' : 'text-slate-500 dark:text-slate-400'}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={exportCSV}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-500 transition cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            Print Production Report
          </button>
        </div>
      </div>

      {/* Dedicated Work Center Tabs Selector (hidden on print) */}
      <div className="print:hidden">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200">
          {WORK_CENTERS.map((wc) => {
            const isSelected = selectedWc === wc.code;
            const Icon = wc.icon;
            return (
              <button
                key={wc.code}
                type="button"
                onClick={() => setSelectedWc(wc.code)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap cursor-pointer border ${isSelected
                    ? `${wc.color} shadow-xs border-current ring-1 ring-current/20`
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
                  }`}
              >
                <Icon className="h-4 w-4" />
                <span>{wc.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Printable Formal Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs print:border-black print:p-3 print:shadow-none">
        <div className="flex items-start justify-between border-b border-slate-200 pb-4 print:border-black print:pb-2">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-lg print:border print:border-black">
              RG
            </div>
            <div>
              <h2 className="text-base font-black uppercase tracking-wide text-slate-900 print:text-black">
                RASHMI GREEN HYDROGEN STEEL PVT. LTD.
              </h2>
              <div className="text-xs font-bold text-slate-700 print:text-black uppercase">
                (SEAMLESS DIVISION) · {activeWcConfig.label} · Production Log
              </div>
              <div className="text-[11px] text-slate-500 print:text-black">
                {activeWcConfig.description}
              </div>
            </div>
          </div>

          <div className="text-right text-xs space-y-0.5 print:text-black">
            <div className="font-mono font-bold text-slate-900">DOC: RGHS/PRD-LOG/03</div>
            <div className="text-slate-500">Work Center Code: {activeWcConfig.code}</div>
            <div className="text-slate-500 font-mono">
              Period: {fromDate} to {toDate}
            </div>
          </div>
        </div>

        {/* Filter Controls (hidden when printing) */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 print:hidden">
          <div>
            <label
              htmlFor="wc-filter-search"
              className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1"
            >
              Search WO # / Heat / Remarks
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
              <input
                id="wc-filter-search"
                type="text"
                placeholder="e.g. WO-101 or HT-98"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-8 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-hidden"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer p-0.5 rounded transition"
                  title="Clear search"
                  aria-label="Clear search query"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="wc-filter-route"
              className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1"
            >
              Process Route
            </label>
            <select
              id="wc-filter-route"
              value={selectedRoute}
              onChange={(e) => setSelectedRoute(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-hidden cursor-pointer"
            >
              <option value="ALL">All Routes (CDS, HFS, etc.)</option>
              {routesList.map((r) => (
                <option key={r.id} value={r.route_code}>
                  {r.route_code} — {r.route_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Quick Date Filter
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setQuickDate('today')}
                className="flex-1 min-h-[36px] px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer active:scale-95 text-center flex items-center justify-center"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setQuickDate('yesterday')}
                className="flex-1 min-h-[36px] px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer active:scale-95 text-center flex items-center justify-center"
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => setQuickDate('7days')}
                className="flex-1 min-h-[36px] px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer active:scale-95 text-center flex items-center justify-center"
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setQuickDate('month')}
                className="flex-1 min-h-[36px] px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer active:scale-95 text-center flex items-center justify-center"
              >
                Month
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="wc-filter-from-date"
              className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1"
            >
              From Date
            </label>
            <input
              id="wc-filter-from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-hidden"
            />
          </div>

          <div>
            <label
              htmlFor="wc-filter-to-date"
              className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1"
            >
              To Date
            </label>
            <input
              id="wc-filter-to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Dynamic Filter Scope Banner */}
        {(debouncedSearch.trim() || selectedRoute !== 'ALL') && (
          <div className="mt-3 flex items-center justify-between bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-1.5 text-xs text-blue-900 dark:text-blue-200 print:hidden">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 rounded bg-blue-200/80 dark:bg-blue-900/60 px-1.5 py-0.5 text-[10px] font-bold text-blue-900 dark:text-blue-200 uppercase">
                Dynamic Scope
              </span>
              <span>
                Summary metrics &amp; records scoped to:
                {selectedRoute !== 'ALL' && (
                  <span className="ml-1.5 inline-flex items-center rounded bg-indigo-100 dark:bg-indigo-900/60 px-1.5 py-0.5 font-mono font-bold text-indigo-900 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-700 text-[11px]">
                    Route: {selectedRoute}
                  </span>
                )}
                {debouncedSearch.trim() && (
                  <span className="ml-1.5 font-bold text-blue-950 dark:text-blue-100 font-mono">
                    &ldquo;{debouncedSearch}&rdquo;
                  </span>
                )}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSelectedRoute('ALL');
              }}
              className="text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 font-bold underline cursor-pointer text-[11px]"
            >
              Clear All Filters (Show Station Totals)
            </button>
          </div>
        )}

        {/* 5-Card Operational Summary: Received -> Production Done OK -> Balance -> Losses -> Yield */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 border-t border-slate-200 pt-4 print:grid-cols-5 print:gap-2 print:border-black print:pt-2">
          {/* Card 1: Received from Last Work Center / Plan */}
          <div className="rounded-xl bg-slate-50/90 p-3.5 border-2 border-slate-300 print:bg-white print:border-black shadow-2xs flex flex-col justify-between min-w-0">
            <div>
              <div className="min-h-[2.25rem] flex flex-col justify-start">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 print:text-black">
                  {cardConfig.c1Category}
                </span>
                <span
                  className="text-xs font-black text-slate-900 print:text-black leading-tight break-words"
                  title={cardConfig.c1Title}
                >
                  {cardConfig.c1Title}
                </span>
              </div>
              <div className="my-2.5 flex items-baseline justify-between gap-1 flex-wrap">
                <div className="flex items-baseline gap-1">
                  <span className="text-lg sm:text-xl font-black font-mono text-slate-950 tabular-nums">
                    {fmt(feederMetrics.receivedPcs, 0)}
                  </span>
                  <span className="text-[10px] font-bold text-slate-600 uppercase">
                    {selectedWc === 'BAND_SAW' ? 'M-PCS' : (selectedWc === 'VDI' || selectedWc === 'FINISHING' ? 'Cut PCS' : 'PCS')}
                  </span>
                </div>
                <span className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-md font-mono bg-slate-200 text-slate-950 border border-slate-400 tabular-nums whitespace-nowrap shadow-2xs">
                  <span className="text-xs sm:text-sm font-black">{fmt(feederMetrics.receivedMt)}</span>
                  <span className="text-[10px] font-black uppercase text-slate-900">MT</span>
                </span>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-1 text-[11px] font-mono text-slate-700 print:text-black">
              <span className="whitespace-nowrap">Inward Length</span>
              <span className="font-bold text-slate-950 whitespace-nowrap">{fmt(feederMetrics.receivedMtr)} MTR</span>
            </div>
          </div>

          {/* Card 2: Total Production OK Logged */}
          <div className="rounded-xl bg-blue-50/70 p-3.5 border-2 border-blue-400/90 print:bg-white print:border-black shadow-2xs flex flex-col justify-between min-w-0">
            <div>
              <div className="min-h-[2.25rem] flex flex-col justify-start">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 print:text-black">
                  {cardConfig.c2Category}
                </span>
                <span className="text-xs font-black text-blue-950 print:text-black leading-tight">
                  {cardConfig.c2Title}
                </span>
              </div>
              <div className="my-2.5 flex items-baseline justify-between gap-1 flex-wrap">
                <div className="flex items-baseline gap-1">
                  <span className="text-lg sm:text-xl font-black font-mono text-blue-950 tabular-nums">
                    {fmt(metrics.outputPcs, 0)}
                  </span>
                  <span className="text-[10px] font-bold text-blue-800 uppercase">
                    {selectedWc === 'BAND_SAW' || selectedWc === 'VDI' || selectedWc === 'FINISHING' ? 'Cut PCS' : 'PCS'}
                  </span>
                </div>
                <span className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-md font-mono bg-blue-100 text-blue-950 border border-blue-400 tabular-nums whitespace-nowrap shadow-2xs">
                  <span className="text-xs sm:text-sm font-black">{fmt(metrics.outputMt)}</span>
                  <span className="text-[10px] font-black uppercase text-blue-950">MT</span>
                </span>
              </div>
            </div>
            <div className="pt-2 border-t border-blue-200/80 flex items-center justify-between gap-1 text-[11px] font-mono text-blue-900 print:text-black">
              <span className="whitespace-nowrap">Produced Length</span>
              <span className="font-bold text-blue-950 whitespace-nowrap">{fmt(metrics.outputMtr)} MTR</span>
            </div>
          </div>

          {/* Card 3: Work Center Balance (Received - Production OK) */}
          <div className="rounded-xl bg-amber-50/70 p-3.5 border-2 border-amber-400/90 print:bg-white print:border-black shadow-2xs flex flex-col justify-between min-w-0">
            <div>
              <div className="min-h-[2.25rem] flex flex-col justify-start">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 print:text-black">
                  {cardConfig.c3Category}
                </span>
                <span className="text-xs font-black text-amber-950 print:text-black leading-tight">
                  {cardConfig.c3Title}
                </span>
              </div>
              <div className="my-2.5 flex items-baseline justify-between gap-1 flex-wrap">
                <div className="flex items-baseline gap-1">
                  <span className="text-lg sm:text-xl font-black font-mono text-amber-950 tabular-nums">
                    {fmt(feederMetrics.balancePcs, 0)}
                  </span>
                  <span className="text-[10px] font-bold text-amber-800 uppercase">
                    {selectedWc === 'BAND_SAW' ? 'M-PCS' : (selectedWc === 'VDI' || selectedWc === 'FINISHING' ? 'Cut PCS' : 'PCS')}
                  </span>
                </div>
                <span className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-md font-mono bg-amber-100 text-amber-950 border border-amber-400 tabular-nums whitespace-nowrap shadow-2xs">
                  <span className="text-xs sm:text-sm font-black">{fmt(feederMetrics.balanceMt)}</span>
                  <span className="text-[10px] font-black uppercase text-amber-950">MT</span>
                </span>
              </div>
            </div>
            <div className="pt-2 border-t border-amber-200/80 flex items-center justify-between gap-1 text-[11px] font-mono text-amber-900 print:text-black">
              <span className="whitespace-nowrap">Balance Queue</span>
              <span className="font-bold text-amber-950 whitespace-nowrap">{fmt(feederMetrics.balanceMtr)} MTR</span>
            </div>
          </div>

          {/* Card 4: Defects / Rejections Logged */}
          <div className="rounded-xl bg-rose-50/70 p-3.5 border-2 border-rose-300 print:bg-white print:border-black shadow-2xs flex flex-col justify-between min-w-0">
            <div>
              <div className="min-h-[2.25rem] flex flex-col justify-start">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 print:text-black">
                  {cardConfig.c4Category}
                </span>
                <span className="text-xs font-black text-rose-950 print:text-black leading-tight">
                  {cardConfig.c4Title}
                </span>
              </div>
              <div className="my-2.5 flex items-baseline justify-between gap-1 flex-wrap">
                <div className="flex items-baseline gap-1">
                  <span className="text-lg sm:text-xl font-black font-mono text-rose-950 tabular-nums">
                    {fmt(metrics.rejPcs, 0)}
                  </span>
                  <span className="text-[10px] font-bold text-rose-700 uppercase">
                    {selectedWc === 'BAND_SAW' || selectedWc === 'VDI' || selectedWc === 'FINISHING' ? 'Cut PCS' : 'PCS'}
                  </span>
                </div>
                <span className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-md font-mono bg-rose-100 text-rose-950 border border-rose-300 tabular-nums whitespace-nowrap shadow-2xs">
                  <span className="text-xs sm:text-sm font-black">{fmt(metrics.rejMt)}</span>
                  <span className="text-[10px] font-black uppercase text-rose-900">MT</span>
                </span>
              </div>
            </div>
            <div className="pt-2 border-t border-rose-200/70 flex items-center justify-between gap-1 text-[11px] font-mono text-rose-800 print:text-black">
              <span className="whitespace-nowrap">Rejected Length</span>
              <span className="font-bold text-rose-950 whitespace-nowrap">{fmt(metrics.rejMtr)} MTR</span>
            </div>
          </div>

          {/* Card 5: Efficiency / Station Yield */}
          <div className="rounded-xl bg-emerald-50/70 p-3.5 border-2 border-emerald-300 print:bg-white print:border-black shadow-2xs flex flex-col justify-between min-w-0">
            <div>
              <div className="min-h-[2.25rem] flex flex-col justify-start">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 print:text-black">
                  {cardConfig.c5Category}
                </span>
                <span className="text-xs font-black text-emerald-950 print:text-black leading-tight">
                  {cardConfig.c5Title}
                </span>
              </div>
              <div className="my-2.5 flex items-baseline justify-between gap-1">
                <span className="text-xl sm:text-2xl font-black text-emerald-950 font-mono tabular-nums print:text-black">
                  {fmt(metrics.yieldPct, 1)}%
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-emerald-100 text-emerald-900 border border-emerald-300 tabular-nums whitespace-nowrap">
                  Yield
                </span>
              </div>
            </div>
            <div className="pt-2 border-t border-emerald-200/70 flex items-center justify-between gap-1 text-[11px] font-mono text-slate-700 print:text-black">
              <span className="whitespace-nowrap">Entries Logged</span>
              <span className="font-bold text-emerald-950 whitespace-nowrap">{metrics.count}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Production Log Detailed Table - Exclusively Production OK & Logged Details */}
      <div className="rounded-xl border border-slate-300 bg-white shadow-xs overflow-hidden print:border-black print:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-100/95 font-bold uppercase tracking-wider text-slate-800 print:bg-slate-200 print:border-black print:text-black">
                <th className="px-3 py-3 whitespace-nowrap">Date & Time</th>
                <th className="px-3 py-3 whitespace-nowrap">Work Order #</th>
                <th className="px-3 py-3">Customer & Grade</th>
                <th className="px-3 py-3 whitespace-nowrap">Heat / Lot No</th>
                <th className="px-3 py-3 whitespace-nowrap">Pipe Size (OD × WT)</th>

                {/* Exclusive Production OK Columns */}
                <th className="px-3 py-3 text-right whitespace-nowrap font-black text-blue-950 bg-blue-100/80 border-l border-blue-300 print:border-black print:bg-white print:text-black">
                  PRODUCTION OK (PCS) ★
                </th>
                <th className="px-3 py-3 text-right whitespace-nowrap font-black text-blue-950 bg-blue-100/80 border-r border-blue-200 print:border-black print:bg-white print:text-black">
                  PRODUCTION OK (MTR)
                </th>
                <th className="px-3 py-3 text-right whitespace-nowrap font-black text-slate-950 bg-slate-200/90 border-r border-slate-300 print:border-black print:bg-white print:text-black">
                  WEIGHT (MT) ★
                </th>

                <th className="px-3 py-3 text-right whitespace-nowrap bg-rose-50 text-rose-900 border-r border-rose-200">
                  Rejection Logged
                </th>
                <th className="px-3 py-3 text-center whitespace-nowrap">
                  Yield %
                </th>
                <th className="px-3 py-3">
                  Operator Remarks
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 print:divide-black">
              {loading ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-500">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                    Loading production records...
                  </td>
                </tr>
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-500">
                    No production entries logged for {activeWcConfig.label} during this time frame.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((e) => {
                  const isRolling = e.stage_code === 'ROLLING' || selectedWc === 'ROLLING';
                  const okPcs = isRolling && Number(e.htc_ok_pcs || 0) > 0 ? Number(e.htc_ok_pcs) : Number(e.output_pcs || 0);
                  const okMtr = isRolling && Number(e.htc_ok_mtr || 0) > 0 ? Number(e.htc_ok_mtr) : Number(e.output_mtr || 0);
                  const okMt = Number(e.output_mt || 0);
                  const rejPcs = Number(e.rejection_pcs || 0);
                  const rejMtr = Number(e.rejection_mtr || 0);
                  const rejMt = Number(e.rejection_mt || 0);

                  const totalPcs = okPcs + rejPcs;
                  const entryYield = totalPcs > 0 ? Math.min(100, Math.max(0, (okPcs / totalPcs) * 100)) : 100;

                  return (
                    <tr key={e.id} className="hover:bg-slate-50/60 transition-colors print:text-black">
                      <td className="px-3 py-2.5 font-mono whitespace-nowrap text-slate-800 print:text-black">
                        <div className="font-bold">{e.process_date}</div>
                        <div className="text-[10px] text-slate-500 print:text-black">
                          {new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      <td className="px-3 py-2.5 font-mono font-bold text-slate-900 whitespace-nowrap print:text-black">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setSearch(e.work_order_no)}
                            className="hover:underline hover:text-blue-600 dark:hover:text-blue-400 text-left cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 rounded-xs"
                            title={`Click to filter for ${e.work_order_no}`}
                            aria-label={`Filter records for work order ${e.work_order_no}`}
                          >
                            {e.work_order_no}
                          </button>
                          {e.plan_no && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-sky-100 border border-sky-300 text-sky-800 px-1.5 py-0.2 text-[9px] font-bold font-mono tracking-tight print:border print:border-black">
                              PLAN: {e.plan_no}{e.revision_no && Number(e.revision_no) > 0 ? ` (R${e.revision_no})` : ''}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-2.5 max-w-[180px] truncate">
                        <div className="font-semibold text-slate-900 print:text-black">{e.customer_name || 'Standard Stock'}</div>
                        <div className="text-[10px] font-mono text-slate-600 print:text-black">
                          Grade: <span className="font-semibold text-slate-800">{e.grade || '—'}</span> · Route: {e.route_code}
                        </div>
                      </td>

                      <td className="px-3 py-2.5 font-mono font-bold text-slate-800 whitespace-nowrap print:text-black">
                        {e.heat_lot_no ? (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-900 border border-slate-200 print:border print:border-black font-black">
                            {e.heat_lot_no}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-3 py-2.5 font-mono text-slate-800 whitespace-nowrap print:text-black font-semibold">
                        {Number(e.od) > 0 && Number(e.wl) > 0
                          ? `${fmt(e.od)} × ${fmt(e.wl)} mm`
                          : Number(e.od) > 0
                          ? `${fmt(e.od)} mm`
                          : '—'}
                      </td>

                      {/* Hero Output Cell: Production OK PCS (Highlighted, Bold) */}
                      <td className="px-3 py-2.5 text-right font-mono bg-blue-50/50 border-l border-blue-200 print:bg-white print:border-black">
                        <span className="inline-block px-2.5 py-1 rounded-md font-black text-xs sm:text-sm text-blue-950 bg-blue-100/90 border border-blue-300 print:bg-white print:border-black print:text-black shadow-2xs">
                          {fmt(okPcs, 0)}
                        </span>
                      </td>

                      {/* Production OK MTR */}
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-blue-900 print:text-black">
                        {fmt(okMtr)}
                      </td>

                      {/* Hero Output Cell: Production OK MT (Bold, Highlighted) */}
                      <td className="px-3 py-2.5 text-right font-mono bg-slate-100/70 border-r border-slate-300 print:bg-white print:border-black">
                        <span className="inline-block px-2.5 py-1 rounded-md font-black text-xs sm:text-sm text-slate-950 bg-slate-200/90 border border-slate-400 print:bg-white print:border-black print:text-black shadow-2xs">
                          {fmt(okMt)} <span className="text-[10px] uppercase font-black text-slate-700 ml-0.5">MT</span>
                        </span>
                      </td>

                      {/* Rejection Logged */}
                      <td className="px-3 py-2.5 text-right font-mono font-semibold text-rose-700 bg-rose-50/30 border-r border-rose-100 print:text-black">
                        {rejPcs > 0 || rejMt > 0 || rejMtr > 0 ? (
                          <span>
                            {fmt(rejPcs, 0)} pcs {rejMt > 0 ? `(${fmt(rejMt)} MT)` : `(${fmt(rejMtr)}m)`}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">—</span>
                        )}
                      </td>

                      {/* Yield % */}
                      <td className="px-3 py-2.5 text-center font-mono font-bold print:text-black">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] ${entryYield >= 90
                              ? 'bg-emerald-100 text-emerald-800'
                              : entryYield >= 80
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            } print:border print:border-black print:bg-white print:text-black`}
                        >
                          {fmt(entryYield, 1)}%
                        </span>
                      </td>

                      <td className="px-3 py-2.5 text-slate-600 max-w-[200px] truncate text-xs print:text-black">
                        {e.remarks || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Summary Footer with highlighted PCS and MT */}
        <div className="border-t-2 border-slate-300 bg-slate-50 px-4 py-3 text-xs flex flex-wrap items-center justify-between font-bold text-slate-800 print:bg-slate-100 print:border-black gap-2">
          <div>
            Total Production Logs: <span className="font-mono font-black text-slate-950">{filteredEntries.length}</span> records
          </div>
          <div className="flex flex-wrap items-center gap-3 font-mono">
            <span className="inline-flex items-center px-3 py-1 rounded-md bg-blue-100 text-blue-950 font-black text-xs sm:text-sm border border-blue-400 shadow-2xs">
              TOTAL OK: {fmt(metrics.outputPcs, 0)} PCS
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-md bg-slate-200 text-slate-950 font-black text-xs sm:text-sm border border-slate-400 shadow-2xs">
              TOTAL OK: {fmt(metrics.outputMt)} MT
            </span>
            <span className="text-blue-900 font-black">Length: {fmt(metrics.outputMtr)} MTR</span>
            {metrics.rejPcs > 0 || metrics.rejMt > 0 ? (
              <span className="text-rose-700 font-bold">Rej: {fmt(metrics.rejPcs, 0)} PCS ({fmt(metrics.rejMt)} MT)</span>
            ) : null}
            <span className="text-emerald-800 font-black">Yield: {fmt(metrics.yieldPct, 1)}%</span>
          </div>
        </div>
      </div>

      {/* Formal 4-Part Shop Floor Verification Sign-Off Block */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs print:border-black print:shadow-none break-inside-avoid">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-4 print:text-black">
          Shop Floor Production Verification & Authorization Sign-Off ({activeWcConfig.label})
        </h3>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs">
          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 print:bg-white print:border-black">
            <div className="font-bold text-slate-800 print:text-black">Machine Operator</div>
            <div className="text-[11px] text-slate-500 mb-8 print:text-black">{activeWcConfig.shortLabel} Line Operator</div>
            <div className="border-t border-dashed border-slate-300 pt-1 text-[11px] text-slate-400 print:text-black print:border-black">
              Signature & Employee ID
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 print:bg-white print:border-black">
            <div className="font-bold text-slate-800 print:text-black">Production In-Charge</div>
            <div className="text-[11px] text-slate-500 mb-8 print:text-black">Work Center Supervisor</div>
            <div className="border-t border-dashed border-slate-300 pt-1 text-[11px] text-slate-400 print:text-black print:border-black">
              Signature & Date
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 print:bg-white print:border-black">
            <div className="font-bold text-slate-800 print:text-black">Quality & NDT Inspector</div>
            <div className="text-[11px] text-slate-500 mb-8 print:text-black">QA / Metallurgical Lab</div>
            <div className="border-t border-dashed border-slate-300 pt-1 text-[11px] text-slate-400 print:text-black print:border-black">
              Signature & Clearance Stamp
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 print:bg-white print:border-black">
            <div className="font-bold text-slate-800 print:text-black">Department Head</div>
            <div className="text-[11px] text-slate-500 mb-8 print:text-black">Production Manager / GM Works</div>
            <div className="border-t border-dashed border-slate-300 pt-1 text-[11px] text-slate-400 print:text-black print:border-black">
              Signature & Approval
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
