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
    label: 'Cold Draw Bench & Pilger',
    shortLabel: 'Cold Draw',
    description: 'Cold drawing, plug drawing, and cold pilger reduction to final dimensions.',
    icon: Wrench,
    color: 'border-indigo-500 text-indigo-700 bg-indigo-50',
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
    code: 'VDI',
    label: 'STR/Cutting/Hydro/UT',
    shortLabel: 'VDI / QC',
    description: 'Dimensional verification (OD/WT/Length), surface inspection, and QA disposition.',
    icon: ClipboardCheck,
    color: 'border-purple-500 text-purple-700 bg-purple-50',
  },
  {
    code: 'FINISHING',
    label: 'Finishing, NDT & Dispatch',
    shortLabel: 'Finishing',
    description: 'Rotary straightening, ultrasonic/eddy current NDT, hydro-testing, and bundling.',
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

export default function WorkCenterProductionReportClient() {
  const [selectedWc, setSelectedWc] = useState<string>('ROLLING');
  const [entries, setEntries] = useState<ProductionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [shiftFilter, setShiftFilter] = useState('ALL');
  const [fromDate, setFromDate] = useState(() => {
    // Default to last 7 days
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const s = createClient();
      const stageArg = selectedWc === 'ALL' ? null : selectedWc;

      const [prodRes, woRes, routeRes, qcRes] = await Promise.all([
        s.rpc('get_production_entries', {
          p_search: search.trim() || null,
          p_stage_code: stageArg,
          p_route_code: null,
          p_from_date: fromDate || null,
          p_to_date: toDate || null,
          p_limit: 2500,
          p_offset: 0,
        }),
        s
          .from('work_orders')
          .select('id, work_order_no, customer_name, grade, specification, size_od, size_wt, avg_length, l1, l2, process_route_id')
          .limit(5000),
        s.from('process_routes').select('id, route_code, route_name').eq('active', true),
        (selectedWc === 'VDI' || selectedWc === 'ALL')
          ? s.from('qc_inspections').select('*').order('created_at', { ascending: false }).limit(2500)
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

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
      const planMhMap = new Map<string, { mh_od: number; mh_wt: number; mh_l1?: number; mh_l2?: number }>();
      const logMap = new Map<string, any>();

      try {
        const [{ data: logDetails }, { data: rpData }] = await Promise.all([
          s
            .from('production_logs')
            .select('id, rolling_plan_id, work_order_id, input_qty, output_qty, rejection_qty, htc_ok, output_pcs, rejection_pcs, htc_ok_pcs, heat_lot_no, remarks, created_at, process_date')
            .in('id', entryIds),
          s
            .from('rolling_plans')
            .select('id, plan_no, work_order_id, mh_od, mh_wt, mh_l1, mh_l2, status, created_at')
            .not('status', 'is', null)
            .limit(5000),
        ]);

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
              if (Array.isArray(meta?.child_work_orders)) {
                childIds = meta.child_work_orders.map((c: any) => c.work_order_id || c.id).filter(Boolean);
                meta.child_work_orders.forEach((c: any) => {
                  if (c.work_order_no && mhOd > 0 && mhWt > 0) {
                    planMhMap.set(String(c.work_order_no).trim(), { mh_od: mhOd, mh_wt: mhWt, mh_l1: mhL1, mh_l2: mhL2 });
                  }
                });
              }
            } catch {}
          }

          if (mhOd > 0 && mhWt > 0) {
            if (rp.work_order_id) planMhMap.set(rp.work_order_id, { mh_od: mhOd, mh_wt: mhWt, mh_l1: mhL1, mh_l2: mhL2 });
            for (const cId of childIds) {
              planMhMap.set(cId, { mh_od: mhOd, mh_wt: mhWt, mh_l1: mhL1, mh_l2: mhL2 });
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
      } catch {}

      const enriched = raw.map((e) => {
        const logRow = logMap.get(e.id);
        const targetWoId = logRow?.work_order_id || e.work_order_id;
        const woInfo = targetWoId ? woMap.get(targetWoId) : woMap.get(String(e.work_order_no).trim());

        let plan: any = null;
        if (logRow?.rolling_plan_id && planByIdMap.has(logRow.rolling_plan_id)) {
          plan = planByIdMap.get(logRow.rolling_plan_id);
        } else if (targetWoId && plansByWoMap.has(targetWoId)) {
          const woPlans = plansByWoMap.get(targetWoId) || [];
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
        const mhInfo = plan?.mh_od ? plan : (targetWoId ? planMhMap.get(targetWoId) : null) || (e.work_order_no ? planMhMap.get(String(e.work_order_no).trim()) : null);

        const { pcs: parsedPcs, rejPcs: parsedRejPcs, cleanRemarks } = extractPcsFromRemarks(e.remarks);
        const outPcs = parsedPcs != null ? parsedPcs : (Number(logRow?.output_pcs || e.output_pcs || 0));
        const rejPcs = parsedRejPcs != null ? parsedRejPcs : (Number(logRow?.rejection_pcs || e.rejection_pcs || 0));
        const outMtr = Number(e.output_mtr || logRow?.output_qty || 0);
        const rejMtr = Number(e.rejection_mtr || logRow?.rejection_qty || 0);
        const inMtr = Number(e.input_mtr || logRow?.input_qty || 0) > 0
          ? Number(e.input_mtr || logRow?.input_qty)
          : Math.max(outMtr + rejMtr, outMtr);
        const inPcs = Number(e.input_pcs || 0) > 0
          ? Number(e.input_pcs)
          : Math.max(outPcs + rejPcs, outPcs);
        const od = isMhStage && mhInfo?.mh_od ? Number(mhInfo.mh_od) : Number(e.od || woInfo?.size_od || 0);
        const wl = isMhStage && mhInfo?.mh_wt ? Number(mhInfo.mh_wt) : Number(e.wl || woInfo?.size_wt || 0);

        const calculatedInMt = mtFromMtr(inMtr, od, wl);
        const calculatedOutMt = mtFromMtr(outMtr, od, wl);
        const calculatedRejMt = mtFromMtr(rejMtr, od, wl);

        return {
          ...e,
          od,
          wl,
          customer_name: e.customer_name || woInfo?.customer_name || 'Standard Stock',
          grade: woInfo?.grade || woInfo?.specification || '—',
          rolling_plan_id: plan?.id || logRow?.rolling_plan_id,
          plan_no: plan?.plan_no,
          revision_no: plan?.revision_no,
          input_pcs: inPcs,
          input_mtr: inMtr,
          input_mt: isMhStage ? calculatedInMt : (Number(e.input_mt || 0) > 0 ? Number(e.input_mt) : calculatedInMt),
          output_pcs: outPcs,
          output_mtr: outMtr,
          output_mt: isMhStage ? calculatedOutMt : (Number(e.output_mt || 0) > 0 ? Number(e.output_mt) : calculatedOutMt),
          rejection_pcs: rejPcs,
          rejection_mtr: rejMtr,
          rejection_mt: calculatedRejMt,
          remarks: cleanRemarks || e.remarks,
        };
      });

      // Also merge records from qc_inspections for STR/Cutting/Hydro/UT (VDI)
      const qcEntries: ProductionEntry[] = [];
      if (qcRes?.data && Array.isArray(qcRes.data)) {
        qcRes.data.forEach((q: any) => {
          const wo = woMap.get(q.work_order_id);
          const qDate = q.inspection_date ? String(q.inspection_date).slice(0, 10) : String(q.created_at).slice(0, 10);
          if (fromDate && qDate < fromDate) return;
          if (toDate && qDate > toDate) return;
          if (search.trim()) {
            const term = search.trim().toLowerCase();
            const matchWo = (wo?.work_order_no || '').toLowerCase().includes(term);
            const matchCust = (wo?.customer_name || '').toLowerCase().includes(term);
            const matchHeat = (q.heat_lot_no || '').toLowerCase().includes(term);
            const matchRem = (q.remarks || '').toLowerCase().includes(term);
            if (!matchWo && !matchCust && !matchHeat && !matchRem) return;
          }

          const od = Number(wo?.size_od || 0);
          const wl = Number(wo?.size_wt || 0);
          const inPcs = Number(q.inspected_pcs || 0);
          const inMtr = Number(q.inspected_mtr || 0);
          const outPcs = Number(q.vdi_ok_pcs || 0);
          const outMtr = Number(q.vdi_ok_mtr || 0);
          const rejPcs = Number(q.vdi_rejection_pcs || 0) + Number(q.vdi_salvage_pcs || 0);
          const rejMtr = Number(q.vdi_rejection_mtr || 0) + Number(q.vdi_salvage_mtr || 0);
          const routeInfo = wo?.process_route_id ? routeMap.get(wo.process_route_id) : null;

          qcEntries.push({
            id: q.id,
            work_order_no: wo?.work_order_no || '—',
            customer_name: wo?.customer_name || 'Standard Stock',
            route_code: routeInfo?.route_code || 'HFS',
            stage_code: 'VDI',
            process_date: qDate,
            od,
            wl,
            l1: Number(wo?.l1 || 0),
            l2: Number(wo?.l2 || 0),
            avg_length: Number(wo?.avg_length || 6.0),
            input_pcs: inPcs > 0 ? inPcs : (outPcs + rejPcs),
            input_mtr: inMtr > 0 ? inMtr : (outMtr + rejMtr),
            input_mt: mtFromMtr(inMtr, od, wl),
            output_pcs: outPcs,
            output_mtr: outMtr,
            output_mt: mtFromMtr(outMtr, od, wl),
            rejection_pcs: rejPcs,
            rejection_mtr: rejMtr,
            rejection_mt: mtFromMtr(rejMtr, od, wl),
            htc_ok_pcs: outPcs,
            htc_ok_mtr: outMtr,
            heat_lot_no: q.heat_lot_no || '',
            remarks: q.remarks ? `[STR/Cutting/Hydro/UT QC] ${q.remarks}` : '[STR/Cutting/Hydro/UT QC]',
            created_at: q.created_at,
          } as ProductionEntry);
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
  }, [selectedWc, search, fromDate, toDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter entries further by shift (parsed from remarks or created_at timestamp hour)
  const filteredEntries = useMemo(() => {
    if (shiftFilter === 'ALL') return entries;

    return entries.filter((e) => {
      const rem = (e.remarks || '').toUpperCase();
      if (shiftFilter === 'SHIFT_A') {
        if (rem.includes('SHIFT A') || rem.includes('SHIFT-A')) return true;
        const hour = new Date(e.created_at).getHours();
        return hour >= 6 && hour < 14;
      }
      if (shiftFilter === 'SHIFT_B') {
        if (rem.includes('SHIFT B') || rem.includes('SHIFT-B')) return true;
        const hour = new Date(e.created_at).getHours();
        return hour >= 14 && hour < 22;
      }
      if (shiftFilter === 'SHIFT_C') {
        if (rem.includes('SHIFT C') || rem.includes('SHIFT-C')) return true;
        const hour = new Date(e.created_at).getHours();
        return hour >= 22 || hour < 6;
      }
      return true;
    });
  }, [entries, shiftFilter]);

  // Work Center Metrics Calculations
  const metrics = useMemo(() => {
    let inputMtr = 0;
    let inputPcs = 0;
    let inputMt = 0;

    let outputMtr = 0;
    let outputPcs = 0;
    let outputMt = 0;

    let rejMtr = 0;
    let rejPcs = 0;
    let rejMt = 0;

    let htcOkMtr = 0;

    filteredEntries.forEach((e) => {
      const isFinishing = e.stage_code === 'FINISHING' || selectedWc === 'FINISHING';
      const avgLen = Number(e.avg_length || 6.0);
      const effLen = avgLen > 0 ? avgLen : 6.0;

      const inMtr = Number(e.input_mtr || 0);
      const inPcs = isFinishing
        ? Math.round(Number(e.input_pcs || 0))
        : Math.round(Number(e.input_pcs || 0) > 0 ? Number(e.input_pcs) : (effLen > 0 && inMtr > 0 ? inMtr / effLen : 0));
      const outMtr = Number(e.output_mtr || 0);
      const outPcs = isFinishing
        ? Math.round(Number(e.output_pcs || 0))
        : Math.round(Number(e.output_pcs || 0) > 0 ? Number(e.output_pcs) : (effLen > 0 && outMtr > 0 ? outMtr / effLen : 0));
      const rMtr = Number(e.rejection_mtr || 0);
      const rPcs = isFinishing
        ? Math.round(Number(e.rejection_pcs || 0))
        : Math.round(Number(e.rejection_pcs || 0) > 0 ? Number(e.rejection_pcs) : (effLen > 0 && rMtr > 0 ? rMtr / effLen : 0));

      const isMhStage = e.stage_code === 'ROLLING' || e.stage_code === 'HOLLOW_HEAT_TREATMENT' || selectedWc === 'ROLLING' || selectedWc === 'HOLLOW_HEAT_TREATMENT';
      const stageOd = isMhStage && e.mh_od ? Number(e.mh_od) : Number(e.od || 0);
      const stageWt = isMhStage && e.mh_wt ? Number(e.mh_wt) : Number(e.wl || 0);

      const inMt = isFinishing
        ? mtFromMtr(inMtr, Number(e.od || 0), Number(e.wl || 0)) || Number(e.input_mt || 0)
        : (isMhStage ? mtFromMtr(inMtr, stageOd, stageWt) : (Number(e.input_mt || 0) || mtFromMtr(inMtr, stageOd, stageWt)));
      const outMt = isFinishing
        ? mtFromMtr(outMtr, Number(e.od || 0), Number(e.wl || 0)) || Number(e.output_mt || 0)
        : (isMhStage ? mtFromMtr(outMtr, stageOd, stageWt) : (Number(e.output_mt || 0) || mtFromMtr(outMtr, stageOd, stageWt)));
      const rMt = isFinishing
        ? mtFromMtr(rMtr, Number(e.od || 0), Number(e.wl || 0)) || Number(e.rejection_mt || 0)
        : (isMhStage ? mtFromMtr(rMtr, stageOd, stageWt) : (Number(e.rejection_mt || 0) || mtFromMtr(rMtr, stageOd, stageWt)));

      inputMtr += inMtr;
      inputPcs += inPcs;
      inputMt += inMt;

      outputMtr += outMtr;
      outputPcs += outPcs;
      outputMt += outMt;

      rejMtr += rMtr;
      rejPcs += rPcs;
      rejMt += rMt;

      htcOkMtr += Number(e.htc_ok_mtr || 0);
    });

    const netMtr = Math.max(outputMtr - rejMtr, 0);
    const netMt = Math.max(outputMt - rejMt, 0);
    const rejRatePct = outputMtr > 0 ? (rejMtr / outputMtr) * 100 : 0;
    const yieldPct = inputMtr > 0 ? (netMtr / inputMtr) * 100 : outputMtr > 0 ? ((outputMtr - rejMtr) / outputMtr) * 100 : 100;

    return {
      count: filteredEntries.length,
      inputMtr,
      inputPcs,
      inputMt,
      outputMtr,
      outputPcs,
      outputMt,
      rejMtr,
      rejPcs,
      rejMt,
      htcOkMtr,
      netMtr,
      netMt,
      rejRatePct,
      yieldPct,
    };
  }, [filteredEntries, selectedWc]);

  const activeWcConfig = useMemo(() => {
    return WORK_CENTERS.find((w) => w.code === selectedWc) || WORK_CENTERS[0];
  }, [selectedWc]);

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
      'HTC OK MTR',
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
      e.htc_ok_mtr ?? 0,
      e.input_mtr > 0 ? (((e.output_mtr - e.rejection_mtr) / e.input_mtr) * 100).toFixed(1) : '100',
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
            <span className="text-xs font-semibold text-slate-500">Document Ref: STP/PRD-SOP-03</span>
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
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={exportCSV}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-500 transition cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            Print Shift Sheet
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
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap cursor-pointer border ${
                  isSelected
                    ? `${wc.color} shadow-xs border-current ring-1 ring-current/20`
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
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
            <div className="h-11 w-11 rounded-xl bg-blue-800 text-white flex items-center justify-center font-black text-lg print:border print:border-black">
              STP
            </div>
            <div>
              <h2 className="text-base font-black uppercase tracking-wide text-slate-900 print:text-black">
                SEAMLESS TUBULAR PRODUCTS LTD.
              </h2>
              <div className="text-xs font-bold text-blue-700 print:text-black uppercase">
                {activeWcConfig.label} · Daily Shift Production Log
              </div>
              <div className="text-[11px] text-slate-500 print:text-black">
                {activeWcConfig.description}
              </div>
            </div>
          </div>

          <div className="text-right text-xs space-y-0.5 print:text-black">
            <div className="font-mono font-bold text-slate-900">DOC: STP/PRD-LOG/03</div>
            <div className="text-slate-500">Work Center Code: {activeWcConfig.code}</div>
            <div className="text-slate-500 font-mono">
              Period: {fromDate} to {toDate}
            </div>
            <div className="text-slate-500">
              Shift: {shiftFilter === 'ALL' ? 'All Shifts (A, B, C)' : shiftFilter.replace('_', ' ')}
            </div>
          </div>
        </div>

        {/* Filter Controls (hidden when printing) */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-5 print:hidden">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Search WO # / Heat / Remarks
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="e.g. WO-101 or HT-98"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Shift Selector
            </label>
            <select
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="ALL">All Shifts Combined</option>
              <option value="SHIFT_A">Shift A (06:00 - 14:00)</option>
              <option value="SHIFT_B">Shift B (14:00 - 22:00)</option>
              <option value="SHIFT_C">Shift C (22:00 - 06:00)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Quick Date Filter
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setQuickDate('today')}
                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setQuickDate('yesterday')}
                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer"
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => setQuickDate('7days')}
                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer"
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setQuickDate('month')}
                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer"
              >
                Month
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              From Date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              To Date
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Tailored Station KPI Summary Cards - Main focus on PCS and MT */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5 border-t border-slate-100 pt-4 print:border-black print:pt-2">
          {/* Card 1: Total Input */}
          <div className="rounded-xl bg-slate-50 p-3 border-2 border-slate-200 print:bg-white print:border-black shadow-2xs">
            <span className="block text-[10px] font-black uppercase tracking-wider text-slate-500 print:text-black">
              Total Input (Pcs & MT)
            </span>
            <div className="flex flex-wrap items-baseline gap-1.5 mt-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-sm sm:text-base font-black font-mono bg-indigo-100 text-indigo-950 border border-indigo-300 print:border-black print:bg-white print:text-black">
                {fmt(metrics.inputPcs, 0)} PCS
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-sm sm:text-base font-black font-mono bg-emerald-100 text-emerald-950 border border-emerald-300 print:border-black print:bg-white print:text-black">
                {fmt(metrics.inputMt)} MT
              </span>
            </div>
            <span className="text-[11px] text-slate-500 block font-mono mt-1 font-semibold print:text-black">
              Length: {fmt(metrics.inputMtr)} MTR
            </span>
          </div>

          {/* Card 2: Gross Output */}
          <div className="rounded-xl bg-blue-50/40 p-3 border-2 border-blue-200 print:bg-white print:border-black shadow-2xs">
            <span className="block text-[10px] font-black uppercase tracking-wider text-blue-900 print:text-black">
              Gross Output (Pcs & MT)
            </span>
            <div className="flex flex-wrap items-baseline gap-1.5 mt-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-sm sm:text-base font-black font-mono bg-blue-100 text-blue-950 border border-blue-300 print:border-black print:bg-white print:text-black">
                {fmt(metrics.outputPcs, 0)} PCS
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-sm sm:text-base font-black font-mono bg-emerald-100 text-emerald-950 border border-emerald-300 print:border-black print:bg-white print:text-black">
                {fmt(metrics.outputMt)} MT
              </span>
            </div>
            <span className="text-[11px] text-blue-800 block font-mono mt-1 font-semibold print:text-black">
              Length: {fmt(metrics.outputMtr)} MTR
            </span>
          </div>

          {/* Card 3: Scrap & Rejection */}
          <div className="rounded-xl bg-rose-50/40 p-3 border-2 border-rose-200 print:bg-white print:border-black shadow-2xs">
            <span className="block text-[10px] font-black uppercase tracking-wider text-rose-900 print:text-black">
              Scrap & Rejection (Pcs & MT)
            </span>
            <div className="flex flex-wrap items-baseline gap-1.5 mt-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-sm sm:text-base font-black font-mono bg-rose-100 text-rose-950 border border-rose-300 print:border-black print:bg-white print:text-black">
                {fmt(metrics.rejPcs, 0)} PCS
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-sm sm:text-base font-black font-mono bg-rose-100 text-rose-950 border border-rose-300 print:border-black print:bg-white print:text-black">
                {fmt(metrics.rejMt)} MT
              </span>
            </div>
            <span className="text-[11px] text-rose-700 block font-semibold mt-1 print:text-black">
              Rate: {fmt(metrics.rejRatePct, 1)}% ({fmt(metrics.rejMtr)} MTR)
            </span>
          </div>

          {/* Card 4: Prime / Net Accepted / HTC OK */}
          <div className="rounded-xl bg-emerald-50/40 p-3 border-2 border-emerald-200 print:bg-white print:border-black shadow-2xs">
            <span className="block text-[10px] font-black uppercase tracking-wider text-emerald-900 print:text-black">
              {selectedWc === 'ROLLING'
                ? 'HTC OK / Prime Output'
                : selectedWc === 'FINISHING'
                ? 'VDI HT OK / Net Accepted'
                : 'Prime / Net Accepted'}
            </span>
            <div className="flex flex-wrap items-baseline gap-1.5 mt-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-sm sm:text-base font-black font-mono bg-emerald-100 text-emerald-950 border border-emerald-300 print:border-black print:bg-white print:text-black">
                {fmt(Math.max(metrics.outputPcs - metrics.rejPcs, 0), 0)} PCS
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-sm sm:text-base font-black font-mono bg-emerald-100 text-emerald-950 border border-emerald-300 print:border-black print:bg-white print:text-black">
                {fmt(metrics.netMt)} MT
              </span>
            </div>
            <span className="text-[11px] text-emerald-800 block font-bold mt-1 font-mono print:text-black">
              {selectedWc === 'ROLLING'
                ? `HTC OK: ${fmt(metrics.htcOkMtr)} MTR`
                : selectedWc === 'FINISHING'
                ? `Net Accepted: ${fmt(metrics.netMtr)} MTR`
                : `Net MTR: ${fmt(metrics.netMtr)} MTR`}
            </span>
          </div>

          {/* Card 5: Station Yield Efficiency */}
          <div className="rounded-xl bg-indigo-50/40 p-3 border-2 border-indigo-200 print:bg-white print:border-black shadow-2xs">
            <span className="block text-[10px] font-black uppercase tracking-wider text-indigo-900 print:text-black">
              Station Yield Efficiency
            </span>
            <div className="mt-1.5">
              <span className="text-xl font-black text-indigo-950 font-mono print:text-black">
                {fmt(metrics.yieldPct, 1)}%
              </span>
            </div>
            <span className="text-[11px] text-slate-500 block mt-1 font-medium print:text-black">
              {metrics.count} shift batches logged
            </span>
          </div>
        </div>
      </div>

      {/* Production Log Detailed Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden print:border-black print:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100/90 font-bold uppercase tracking-wider text-slate-700 print:bg-slate-200 print:border-black print:text-black">
                <th className="px-3 py-2.5 whitespace-nowrap">Date & Time</th>
                <th className="px-3 py-2.5 whitespace-nowrap">Work Order #</th>
                <th className="px-3 py-2.5">Customer & Grade</th>
                <th className="px-3 py-2.5 whitespace-nowrap">Heat / Lot No</th>
                <th className="px-3 py-2.5 whitespace-nowrap">Pipe Size (OD × WT)</th>

                {/* Input Columns */}
                <th className="px-3 py-2.5 text-right whitespace-nowrap bg-slate-200/70 text-slate-800 border-l border-slate-300">
                  INPUT (PCS)
                </th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap bg-slate-200/70 text-slate-800 border-r border-slate-300">
                  INPUT (MTR)
                </th>

                {/* Primary Output Columns */}
                <th className="px-3 py-2.5 text-right whitespace-nowrap font-black text-indigo-950 bg-indigo-100/90 border-l border-indigo-300 print:border-black print:bg-white print:text-black">
                  OUTPUT (PCS) ★
                </th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap font-black text-blue-950 bg-blue-100/90 border-r border-blue-200 print:border-black print:bg-white print:text-black">
                  OUTPUT (MTR)
                </th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap font-black text-emerald-950 bg-emerald-100/90 border-r border-emerald-300 print:border-black print:bg-white print:text-black">
                  WEIGHT (MT) ★
                </th>

                <th className="px-3 py-2.5 text-right whitespace-nowrap bg-rose-50 text-rose-900 border-r border-rose-200">Rej (Pcs / m)</th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap bg-emerald-50 text-emerald-900 border-r border-emerald-200">
                  {selectedWc === 'ROLLING' ? 'HTC OK' : selectedWc === 'VDI' ? 'VDI OK (QC)' : 'Net Accepted'}
                </th>
                <th className="px-3 py-2.5 text-center whitespace-nowrap">Yield %</th>
                <th className="px-3 py-2.5">Operator Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 print:divide-black">
              {loading ? (
                <tr>
                  <td colSpan={14} className="p-8 text-center text-slate-500">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                    Loading shift production records...
                  </td>
                </tr>
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={14} className="p-8 text-center text-slate-500">
                    No production entries logged for {activeWcConfig.label} during this time frame.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((e) => {
                  const netMtr = Math.max(e.output_mtr - e.rejection_mtr, 0);
                  const netPcs = Math.max(e.output_pcs - e.rejection_pcs, 0);
                  const entryYield =
                    e.input_mtr > 0
                      ? (netMtr / e.input_mtr) * 100
                      : e.output_mtr > 0
                      ? (netMtr / e.output_mtr) * 100
                      : 100;

                  return (
                    <tr key={e.id} className="hover:bg-slate-50/50 print:text-black">
                      <td className="px-3 py-2 font-mono whitespace-nowrap text-slate-800 print:text-black">
                        <div>{e.process_date}</div>
                        <div className="text-[10px] text-slate-400 print:text-black">
                          {new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      <td className="px-3 py-2 font-mono font-bold text-slate-900 whitespace-nowrap print:text-black">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{e.work_order_no}</span>
                          {e.plan_no && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-sky-100 border border-sky-200 text-sky-800 px-1.5 py-0.2 text-[9px] font-bold font-mono tracking-tight print:border print:border-black">
                              PLAN: {e.plan_no}{e.revision_no && Number(e.revision_no) > 0 ? ` (R${e.revision_no})` : ''}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-2 max-w-[170px] truncate">
                        <div className="font-semibold text-slate-800 print:text-black">{e.customer_name || 'Standard Stock'}</div>
                        <div className="text-[10px] font-mono text-slate-500 print:text-black">
                          Grade: <span className="font-semibold text-slate-700">{e.grade || '—'}</span> · Route: {e.route_code}
                        </div>
                      </td>

                      <td className="px-3 py-2 font-mono font-bold text-slate-800 whitespace-nowrap print:text-black">
                        {e.heat_lot_no ? (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-800 print:border print:border-black font-black">
                            {e.heat_lot_no}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap print:text-black">
                        {e.od && e.wl ? `${fmt(e.od)} × ${fmt(e.wl)} mm` : '—'}
                      </td>

                      {/* Input PCS */}
                      <td className="px-3 py-2 text-right font-mono bg-slate-50/70 border-l border-slate-200 print:bg-white print:border-black">
                        <span className="font-bold text-slate-800">{fmt(e.input_pcs, 0)}</span>
                      </td>

                      {/* Input MTR */}
                      <td className="px-3 py-2 text-right font-mono text-slate-700 bg-slate-50/70 border-r border-slate-200 print:text-black">
                        {fmt(e.input_mtr)}
                      </td>

                      {/* Primary Focus Cells: Output PCS (Highlighted, Bold) */}
                      <td className="px-3 py-2 text-right font-mono bg-indigo-50/60 border-l border-indigo-200 print:bg-white print:border-black">
                        <span className="inline-block px-2 py-0.5 rounded-md font-black text-xs sm:text-sm text-indigo-950 bg-indigo-100/90 border border-indigo-300 print:bg-white print:border-black print:text-black">
                          {fmt(e.output_pcs, 0)}
                        </span>
                      </td>

                      {/* Output MTR */}
                      <td className="px-3 py-2 text-right font-mono font-bold text-blue-700 print:text-black">
                        {fmt(e.output_mtr)}
                      </td>

                      {/* Primary Focus Cells: Output MT (Highlighted, Bold) */}
                      <td className="px-3 py-2 text-right font-mono bg-emerald-50/60 border-r border-emerald-200 print:bg-white print:border-black">
                        <span className="inline-block px-2 py-0.5 rounded-md font-black text-xs sm:text-sm text-emerald-950 bg-emerald-100/90 border border-emerald-300 print:bg-white print:border-black print:text-black">
                          {fmt(e.output_mt)}
                        </span>
                      </td>

                      {/* Rejection */}
                      <td className="px-3 py-2 text-right font-mono font-semibold text-rose-600 bg-rose-50/30 border-r border-rose-100 print:text-black">
                        {e.rejection_pcs > 0 || e.rejection_mtr > 0 ? (
                          <span>
                            {fmt(e.rejection_pcs, 0)} pcs ({fmt(e.rejection_mtr)}m)
                          </span>
                        ) : (
                          '0'
                        )}
                      </td>

                      {/* HTC OK / VDI OK / Net Accepted */}
                      <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700 bg-emerald-50/30 border-r border-emerald-100 print:text-black">
                        {selectedWc === 'ROLLING' ? (
                          <span>{fmt(e.htc_ok_pcs, 0)} pcs ({fmt(e.htc_ok_mtr)}m)</span>
                        ) : selectedWc === 'VDI' ? (
                          <span>{fmt(e.output_pcs, 0)} pcs ({fmt(e.output_mtr)}m)</span>
                        ) : (
                          <span>{fmt(netPcs, 0)} pcs ({fmt(netMtr)}m)</span>
                        )}
                      </td>

                      <td className="px-3 py-2 text-center font-mono font-bold print:text-black">
                        <span
                          className={`rounded px-1.5 py-0.2 text-[11px] ${
                            entryYield >= 90
                              ? 'bg-emerald-100 text-emerald-800'
                              : entryYield >= 80
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          } print:border print:border-black print:bg-white print:text-black`}
                        >
                          {fmt(entryYield, 1)}%
                        </span>
                      </td>

                      <td className="px-3 py-2 text-slate-600 max-w-[180px] truncate text-xs print:text-black">
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
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs flex flex-wrap items-center justify-between font-bold text-slate-800 print:bg-slate-100 print:border-black gap-2">
          <div>
            Total Shift Logs: <span className="font-mono">{filteredEntries.length}</span> entries
          </div>
          <div className="flex flex-wrap items-center gap-3 font-mono">
            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-indigo-100 text-indigo-950 font-black text-xs sm:text-sm border border-indigo-300 print:border-black print:bg-white print:text-black">
              {selectedWc === 'FINISHING'
                ? `ACCEPTED: ${fmt(Math.max(metrics.outputPcs - metrics.rejPcs, 0), 0)} PCS`
                : `TOTAL: ${fmt(metrics.outputPcs, 0)} PCS`}
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-950 font-black text-xs sm:text-sm border border-emerald-300 print:border-black print:bg-white print:text-black">
              {selectedWc === 'FINISHING'
                ? `NET: ${fmt(metrics.netMt)} MT`
                : `TOTAL: ${fmt(metrics.outputMt)} MT`}
            </span>
            <span className="text-blue-700 font-semibold">Gross: {fmt(metrics.outputMtr)} MTR</span>
            <span className="text-rose-600 font-semibold">Rej: {fmt(metrics.rejMtr)} MTR</span>
            <span className="text-emerald-700 font-semibold">
              {selectedWc === 'FINISHING' ? 'VDI Accepted' : 'Prime'}: {fmt(metrics.netMtr)} MTR
            </span>
            <span className="text-indigo-700 font-semibold">Yield: {fmt(metrics.yieldPct, 1)}%</span>
          </div>
        </div>
      </div>

      {/* Formal 4-Part Shop Floor Shift Sign-Off Block */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs print:border-black print:shadow-none break-inside-avoid">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-4 print:text-black">
          Shop Floor Shift Verification & Authorization Sign-Off ({activeWcConfig.label})
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
            <div className="font-bold text-slate-800 print:text-black">Shift In-Charge</div>
            <div className="text-[11px] text-slate-500 mb-8 print:text-black">Work Center Shift Supervisor</div>
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
