'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { exportJsonToExcel } from '@/lib/excelUtils';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import {
  Gauge,
  Layers,
  Search,
  Filter,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Factory,
  Package,
  ArrowRight,
  TrendingUp,
  Table as TableIcon,
  LayoutGrid,
  CheckCircle2,
  Calendar,
  Flame,
  Scissors,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { mtFromMtr, extractPcsFromRemarks, normalizeGrade } from '@/lib/productionUtils';
import { reconcileCampaignWorkOrderWip } from '@/lib/campaignWipUtils';
import { inferRouteFromMaterialOrSpec } from '@/lib/metallurgy/processSheetSpecHelper';

export const STANDARD_ROUTES: { code: string; name: string }[] = [
  { code: 'HFS', name: 'Hot Finished Seamless' },
  { code: 'ALLOY_HFS', name: 'Alloy Hot Finished' },
  { code: 'CDS', name: 'Cold Drawn Seamless' },
  { code: 'ALLOY_CDS', name: 'Alloy Cold Drawn' },
  { code: 'SS_STEEL', name: 'Stainless Steel' },
];

type StageCode = 'ROLLING' | 'HOLLOW_HEAT_TREATMENT' | 'PILGER' | 'DRAW' | 'HEAT_TREATMENT' | 'BAND_SAW' | 'VDI' | 'FINISHING' | 'VDI_SALVAGE';

interface ContributingOrder {
  work_order_id: string;
  work_order_no: string;
  customer_name: string | null;
  order_status?: string | null;
  balance_qty_pcs?: number | null;
  stage_code: StageCode;
  stage_name: string;
  route_code?: string;
  route_name?: string;
  rolling_date?: string | null;
  wip_mtr: number;
  wip_pcs: number;
  wip_mt: number;
}

interface SizeGradeGroup {
  key: string;
  od: number;
  wt: number;
  grade: string;
  // Hollow HT
  htc_mtr: number;
  htc_pcs: number;
  htc_mt: number;
  // Cold Draw / Pilger
  draw_mtr: number;
  draw_pcs: number;
  draw_mt: number;
  pilger_mtr: number;
  pilger_pcs: number;
  pilger_mt: number;
  // Final HT
  ht_mtr: number;
  ht_pcs: number;
  ht_mt: number;
  // Band Saw
  band_saw_mtr: number;
  band_saw_pcs: number;
  band_saw_mt: number;
  // VDI / QC
  vdi_mtr: number;
  vdi_pcs: number;
  vdi_mt: number;
  // VDI Salvage
  vdi_salvage_mtr: number;
  vdi_salvage_pcs: number;
  vdi_salvage_mt: number;
  // Finishing
  finishing_mtr: number;
  finishing_pcs: number;
  finishing_mt: number;
  // Total Row
  total_mtr: number;
  total_pcs: number;
  total_mt: number;
  contributing: ContributingOrder[];
}

type Unit = 'MTRS' | 'PCS' | 'MT';

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null || isNaN(n) ? (digits > 0 ? (0).toFixed(digits) : '0') : Number(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function getRouteBadgeClass(code?: string) {
  const c = (code || 'HFS').toUpperCase();
  if (c === 'SS_STEEL') {
    return 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800';
  }
  if (c === 'CDS' || c === 'ALLOY_CDS') {
    return 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
  }
  if (c === 'ALLOY_HFS') {
    return 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
  }
  return 'bg-[var(--bg-surface-subtle,#f1f5f9)] text-[var(--text-main,#334155)] border-[var(--border-subtle,#e2e8f0)]';
}

export function getOrderStatusBadge(status?: string | null, balancePcs?: number | null) {
  const s = (status || 'Pending Plan').trim();
  const bal = balancePcs != null ? Number(balancePcs) : null;

  let badgeColor = 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  if (s === 'In Progress') {
    badgeColor = 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800';
  } else if (s === 'Scheduled') {
    badgeColor = 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800';
  } else if (s === 'Pending Plan') {
    badgeColor = 'bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800';
  } else if (s === 'Completed') {
    badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800';
  } else if (s === 'Diverted') {
    badgeColor = 'bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800';
  }

  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border font-mono ${badgeColor}`}>
        {s}
      </span>
      {s === 'Completed' || bal === 0 ? (
        <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
          Bal: 0 pcs
        </span>
      ) : bal != null && bal > 0 ? (
        <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-amber-400">
          Bal: {Number(bal).toLocaleString()} pcs
        </span>
      ) : (
        <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
          Bal: —
        </span>
      )}
    </div>
  );
}

export default function SizeGradeWipReportClient() {
  const router = useRouter();
  const [rawWipRows, setRawWipRows] = useState<any[]>([]);
  const [allRoutes, setAllRoutes] = useState<{ id?: string; route_code: string; route_name: string }[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [unit, setUnit] = useState<Unit>('PCS');
  const [viewMode, setViewMode] = useState<'matrix' | 'ledger'>('matrix');

  // Filters
  const [search, setSearch] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedRoute, setSelectedRoute] = useState<string>('ALL');
  const [selectedGrade, setSelectedGrade] = useState<string>('ALL');
  const [fromOd, setFromOd] = useState<string>('');
  const [toOd, setToOd] = useState<string>('');
  const [fromRollingDate, setFromRollingDate] = useState<string>('');
  const [toRollingDate, setToRollingDate] = useState<string>('');
  const [asOnDate, setAsOnDate] = useState<string>(new Date().toISOString().slice(0, 10));

  // Debounced filters for responsive typing & optimized matrix reduction
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [debouncedFromOd, setDebouncedFromOd] = useState<string>('');
  const [debouncedToOd, setDebouncedToOd] = useState<string>('');

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedFromOd(fromOd);
      setDebouncedToOd(toOd);
    }, 200);
    return () => clearTimeout(t);
  }, [fromOd, toOd]);

  // Expanded groups in matrix
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const supabase = createClient();

      // 1. Fetch live production queue containing exact active stage WIP across all work centers
      let queueLoaded = false;
      try {
        const [queueRes, routesOnlyRes] = await Promise.all([
          fetch(`/api/production/queue?all_stages=true&_t=${Date.now()}`),
          supabase.from('process_routes').select('id, route_code, route_name').eq('active', true),
        ]);

        if (routesOnlyRes.data) {
          setAllRoutes(routesOnlyRes.data);
        }

        if (queueRes.ok) {
          const queueJson = await queueRes.json();
          if (queueJson?.success && Array.isArray(queueJson.data) && queueJson.data.length > 0) {
            const mapped = queueJson.data.map((r: any) => {
              const pcs = Math.round(Number(r.ready_pcs ?? r.balance_to_make_pcs ?? 0));
              const mtr = Number(Number(r.ready_mtr ?? r.balance_to_make_mtr ?? 0).toFixed(2));
              const mt = Number(Number(r.ready_mt ?? r.balance_to_make_mt ?? 0).toFixed(2));
              const stCode = (r.stage_code || '').toUpperCase() as StageCode;

              return {
                ...r,
                work_order_id: r.work_order_id || r.id,
                work_order_no: r.work_order_no,
                customer_name: r.customer_name || null,
                stage_code: stCode,
                stage_name: stCode === 'HOLLOW_HEAT_TREATMENT' ? 'Hollow Heat Treatment' :
                            stCode === 'PILGER' ? 'Cold Pilger Mill' :
                            stCode === 'DRAW' ? 'Cold Draw Bench' :
                            stCode === 'HEAT_TREATMENT' ? 'Final Heat Treatment' :
                            stCode === 'BAND_SAW' ? 'Band Saw Cutting' :
                            stCode === 'VDI' ? 'VDI / QC Inspection' :
                            stCode === 'VDI_SALVAGE' ? 'VDI Salvage' :
                            stCode === 'FINISHING' ? 'Finishing & Dispatch' : (r.stage_name || stCode),
                grade: normalizeGrade(r.specification || r.grade || 'Standard'),
                od: Number(r.od || 0),
                wt: Number(r.wl || r.size_wt || r.wt || 0),
                mh_od: r.mh_od ? Number(r.mh_od) : null,
                mh_wt: r.mh_wt ? Number(r.mh_wt) : null,
                route_code: r.route_code || 'CDS',
                route_name: r.route_name || 'Standard CDS',
                rolling_date: r.rolling_date || null,
                order_status: r.order_status || (Number(r.balance_to_make_order_pcs ?? r.balance_qty_pcs ?? 1) === 0 ? 'Completed' : 'In Progress'),
                balance_qty_pcs: r.balance_qty_pcs != null ? Number(r.balance_qty_pcs) : (r.balance_to_make_order_pcs != null ? Number(r.balance_to_make_order_pcs) : null),
                balance_qty_mtr: r.balance_qty_mtr != null ? Number(r.balance_qty_mtr) : (r.balance_to_make_order_mtr != null ? Number(r.balance_to_make_order_mtr) : null),
                is_feeder_stage: false,
                current_wip: mtr,
                current_wip_pcs: pcs,
                available_mt: mt,
                current_wip_mt: mt,
              };
            });

            setRawWipRows(mapped);
            queueLoaded = true;
          }
        }
      } catch (queueErr) {
        console.warn('Queue API fetch failed, falling back to database view:', queueErr);
      }

      if (queueLoaded) {
        return;
      }

      // 2. Fallback: Query view for live stage physical WIP + rolling logs + plans + qc inspections + diversion plans
      const [wipRes, woRes, plansRes, routesRes, prodRes, stagesRes, qcRes, divRes] = await Promise.all([
        supabase.from('vw_route_stage_wip').select('*').limit(5000),
        supabase.from('work_orders').select('id, work_order_no, customer_name, grade, specification, size_od, size_wt, l1, l2, ordered_qty_pcs, ordered_qty_mt, status, balance_qty_pcs, balance_qty_mtr').limit(5000),
        supabase.from('rolling_plans').select('id, work_order_id, plan_no, multiple, planned_qty, status, planned_rolling_date, mh_od, mh_wt, mh_l1, mh_l2, process_route_id, created_at').not('status', 'is', null).limit(5000),
        supabase.from('process_routes').select('id, route_code, route_name').eq('active', true),
        supabase.from('production_logs').select('work_order_id, stage_id, process_date, created_at, remarks, output_qty, rejection_qty, htc_ok, process_stages(stage_name, stage_code)').order('process_date', { ascending: false }).limit(5000),
        supabase.from('process_stages').select('id, stage_code, stage_name'),
        supabase.from('qc_inspections').select('work_order_id, inspected_pcs, inspected_mtr, vdi_ok_pcs, vdi_ok_mtr, vdi_salvage_pcs, vdi_salvage_mtr, vdi_rejection_pcs, vdi_rejection_mtr').limit(5000),
        supabase.from('diversion_plans').select('target_wo_id, source_wo_id, diversion_date, created_at').limit(5000),
      ]);

      if (routesRes.data) {
        setAllRoutes(routesRes.data);
      }

      const queryErrors = [wipRes.error, woRes.error, plansRes.error, routesRes.error, prodRes.error, stagesRes.error, qcRes.error, divRes.error].filter(Boolean);
      if (queryErrors.length > 0) {
        console.error('Supabase query error in WIP Report:', queryErrors);
        toast.error('Failed to load WIP report data: ' + queryErrors[0]?.message);
      }

      if (wipRes.data) {
        const stageCodeById = new Map<string, string>();
        (stagesRes.data || []).forEach((s: any) => {
          if (s.id && s.stage_code) stageCodeById.set(s.id, (s.stage_code || '').toUpperCase());
        });

        const rollingStageId = (stagesRes.data || []).find((s: any) => (s.stage_code || '').toUpperCase() === 'ROLLING')?.id;
        const finishingStageId = (stagesRes.data || []).find((s: any) => (s.stage_code || '').toUpperCase() === 'FINISHING')?.id;

        // Build rolling date map per work order ID
        const rollingDateMap = new Map<string, string>();

        // 1. From production logs for Rolling Mill
        (prodRes.data || []).forEach((p: any) => {
          const isRolling = !rollingStageId || p.stage_id === rollingStageId;
          const pDate = p.process_date ? String(p.process_date).slice(0, 10) : (p.created_at ? String(p.created_at).slice(0, 10) : null);
          if (isRolling && pDate && p.work_order_id) {
            if (!rollingDateMap.has(p.work_order_id)) {
              rollingDateMap.set(p.work_order_id, pDate);
            }
          }
        });

        // 2. Fallback from rolling plans (with child work order propagation)
        (plansRes.data || []).forEach((pl: any) => {
          let planDate = pl.planned_rolling_date ? String(pl.planned_rolling_date).slice(0, 10) : null;
          try {
            const parsed = typeof pl.status === 'string' ? JSON.parse(pl.status) : pl.status;
            if (!planDate && parsed?.planned_rolling_date) {
              planDate = String(parsed.planned_rolling_date).slice(0, 10);
            }
            if (!planDate && pl.created_at) {
              planDate = String(pl.created_at).slice(0, 10);
            }

            const effectiveRollingDate = (pl.work_order_id && rollingDateMap.get(pl.work_order_id)) || planDate;
            if (pl.work_order_id && effectiveRollingDate && !rollingDateMap.has(pl.work_order_id)) {
              rollingDateMap.set(pl.work_order_id, effectiveRollingDate);
            }

            // Propagate to all child work orders in master campaign
            if (parsed?.is_master && Array.isArray(parsed?.child_work_orders) && effectiveRollingDate) {
              for (const c of parsed.child_work_orders) {
                const cId = c.work_order_id || c.id;
                if (cId && !rollingDateMap.has(cId)) {
                  rollingDateMap.set(cId, effectiveRollingDate);
                }
              }
            }
          } catch {}
        });

        // 3. Fallback for any remaining WIP rows from production_logs
        (prodRes.data || []).forEach((p: any) => {
          if (p.work_order_id && !rollingDateMap.has(p.work_order_id)) {
            const fbDate = p.process_date ? String(p.process_date).slice(0, 10) : (p.created_at ? String(p.created_at).slice(0, 10) : null);
            if (fbDate) rollingDateMap.set(p.work_order_id, fbDate);
          }
        });

        // 4. Fallback for orders with diversions (so target work orders receiving stock have a valid date)
        (divRes.data || []).forEach((d: any) => {
          const dDate = d.diversion_date ? String(d.diversion_date).slice(0, 10) : (d.created_at ? String(d.created_at).slice(0, 10) : null);
          if (dDate) {
            if (d.target_wo_id && !rollingDateMap.has(d.target_wo_id)) {
              rollingDateMap.set(d.target_wo_id, dDate);
            }
            if (d.source_wo_id && !rollingDateMap.has(d.source_wo_id)) {
              rollingDateMap.set(d.source_wo_id, dDate);
            }
          }
        });

        const routeMap = new Map<string, { route_code: string; route_name: string }>();
        (routesRes.data || []).forEach((r: any) => {
          routeMap.set(r.id, { route_code: r.route_code, route_name: r.route_name });
        });
        setAllRoutes(routesRes.data || []);

        const gradeMap = new Map<string, string>();
        const woRouteMap = new Map<string, { route_code?: string; route_name?: string }>();
        const woDetailsMap = new Map<string, any>();
        (woRes.data || []).forEach((w: any) => {
          woDetailsMap.set(w.id, w);
          if (w.work_order_no) woDetailsMap.set(String(w.work_order_no).trim(), w);
          const g = String(w.grade || w.specification || '').trim();
          if (g) {
            gradeMap.set(w.id, g);
            if (w.work_order_no) gradeMap.set(String(w.work_order_no).trim(), g);
          }
        });

        // Campaign membership maps for multi-order campaigns
        const campaignMembersMap = new Map<string, Set<string>>();
        const childToMasterMap = new Map<string, string>();

        const mhMap = new Map<string, { mh_od?: number | null; mh_wt?: number | null; mh_l1?: number | null; mh_l2?: number | null; mh_avg_length?: number | null; multiple?: number; planned_qty?: number }>();
        (plansRes.data || []).forEach((p: any) => {
          try {
            if (p.work_order_id && p.process_route_id && routeMap.has(p.process_route_id)) {
              woRouteMap.set(p.work_order_id, routeMap.get(p.process_route_id)!);
            }
            const parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
            const planGrade = String(parsed?.grade || parsed?.specification || '').trim();
            if (planGrade && p.work_order_id && !gradeMap.has(p.work_order_id)) {
              gradeMap.set(p.work_order_id, planGrade);
            }

            const mhOd = Number(p.mh_od || parsed?.mh_od || parsed?.cust_od || parsed?.sm?.cust_od || parsed?.sizing_mill?.cust_od || 0) || null;
            const mhWt = Number(p.mh_wt || parsed?.mh_wt || parsed?.cust_wt || parsed?.sm?.rolling_wt || parsed?.sm?.cust_wt || parsed?.sizing_mill?.rolling_wt || 0) || null;
            const mhL1 = Number(p.mh_l1 || parsed?.mh_l1 || parsed?.l1 || 0) || null;
            const mhL2 = Number(p.mh_l2 || parsed?.mh_l2 || parsed?.l2 || 0) || null;
            const mhAvg = mhL1 && mhL2 ? (mhL1 + mhL2) / 2 : (mhL1 || mhL2 || null);
            const mult = Number(p.multiple || parsed?.multiple || 1) || 1;
            const plannedQty = Number(p.planned_qty || parsed?.planned_qty || 0);

            const mhEntry = { mh_od: mhOd, mh_wt: mhWt, mh_l1: mhL1, mh_l2: mhL2, mh_avg_length: mhAvg, multiple: mult, planned_qty: plannedQty };

            if (p.work_order_id) {
              mhMap.set(p.work_order_id, mhEntry);
            }
            if (parsed?.master_wo_id) {
              mhMap.set(parsed.master_wo_id, mhEntry);
            }
            if (parsed?.master_wo_no) {
              mhMap.set(String(parsed.master_wo_no).trim(), mhEntry);
            }
            if (parsed?.is_master && Array.isArray(parsed?.child_work_orders)) {
              const members = new Set<string>([p.work_order_id]);
              for (const c of parsed.child_work_orders) {
                const cId = c.work_order_id || c.id;
                if (cId) {
                  members.add(cId);
                  childToMasterMap.set(cId, p.work_order_id);
                  if (p.process_route_id && routeMap.has(p.process_route_id)) {
                    woRouteMap.set(cId, routeMap.get(p.process_route_id)!);
                  }
                }
                const cGrade = String(c.grade || c.specification || planGrade).trim();
                if (cId && cGrade) gradeMap.set(cId, cGrade);
                if (c.work_order_no && cGrade) gradeMap.set(String(c.work_order_no).trim(), cGrade);
                if (cId) mhMap.set(cId, mhEntry);
                if (c.work_order_no) mhMap.set(String(c.work_order_no).trim(), mhEntry);
              }
              campaignMembersMap.set(p.work_order_id, members);
            }
          } catch {}
        });

        // Pre-calculate exact piece counts per work order from production_logs
        const woPieceLedger = new Map<string, {
          rolledPcs: number;
          hhtPcs: number;
          pilgerPcs: number;
          drawPcs: number;
          htPcs: number;
          bandSawPcs: number;
          vdiPcs: number;
          finPcs: number;
          htcOkPcs: number;
        }>();

        (prodRes.data || []).forEach((log: any) => {
          if (!log.work_order_id) return;
          const entry = woPieceLedger.get(log.work_order_id) || {
            rolledPcs: 0,
            hhtPcs: 0,
            pilgerPcs: 0,
            drawPcs: 0,
            htPcs: 0,
            bandSawPcs: 0,
            vdiPcs: 0,
            finPcs: 0,
            htcOkPcs: 0,
          };
          const { pcs: parsedPcs } = extractPcsFromRemarks(log.remarks);
          const pcs = parsedPcs != null ? parsedPcs : 0;
          const stage = stageCodeById.get(log.stage_id) || '';

          if (stage === 'ROLLING') {
            entry.rolledPcs += pcs;
            entry.htcOkPcs += pcs;
          } else if (stage === 'HOLLOW_HEAT_TREATMENT') {
            entry.hhtPcs += pcs;
          } else if (stage === 'PILGER') {
            entry.pilgerPcs += pcs;
          } else if (stage === 'DRAW') {
            entry.drawPcs += pcs;
          } else if (stage === 'HEAT_TREATMENT') {
            entry.htPcs += pcs;
          } else if (stage === 'BAND_SAW') {
            entry.bandSawPcs += pcs;
          } else if (stage === 'VDI') {
            entry.vdiPcs += pcs;
          } else if (stage === 'FINISHING' || stage === 'CUTTING') {
            entry.finPcs += pcs;
          }
          woPieceLedger.set(log.work_order_id, entry);
        });

        // Also incorporate VDI inspection results from qc_inspections
        (qcRes.data || []).forEach((qc: any) => {
          if (!qc.work_order_id) return;
          const qcPcs = Number(qc.inspected_pcs || 0) > 0
            ? Number(qc.inspected_pcs)
            : (Number(qc.vdi_ok_pcs || 0) + Number(qc.vdi_salvage_pcs || 0) + Number(qc.vdi_rejection_pcs || 0));

          const entry = woPieceLedger.get(qc.work_order_id) || {
            rolledPcs: 0,
            hhtPcs: 0,
            pilgerPcs: 0,
            drawPcs: 0,
            htPcs: 0,
            bandSawPcs: 0,
            vdiPcs: 0,
            finPcs: 0,
            htcOkPcs: 0,
          };
          entry.vdiPcs += qcPcs;
          woPieceLedger.set(qc.work_order_id, entry);

          // If this WO is a child in a campaign, ALSO credit to the master WO so master VDI WIP reconciles
          const masterWoId = childToMasterMap.get(qc.work_order_id);
          if (masterWoId) {
            const masterEntry = woPieceLedger.get(masterWoId) || {
              rolledPcs: 0,
              hhtPcs: 0,
              pilgerPcs: 0,
              drawPcs: 0,
              htPcs: 0,
              bandSawPcs: 0,
              vdiPcs: 0,
              finPcs: 0,
              htcOkPcs: 0,
            };
            masterEntry.vdiPcs += qcPcs;
            woPieceLedger.set(masterWoId, masterEntry);
          }
        });

        // Group raw WIP by work order
        const wipByWo = new Map<string, any[]>();
        for (const r of (wipRes.data || [])) {
          if (!wipByWo.has(r.work_order_id)) wipByWo.set(r.work_order_id, []);
          wipByWo.get(r.work_order_id)!.push(r);
        }

        const mapped: any[] = [];

        for (const [woId, rows] of wipByWo.entries()) {
          const wo = woDetailsMap.get(woId) || woDetailsMap.get(String(rows[0]?.work_order_no).trim());
          const planMh = mhMap.get(woId) || mhMap.get(String(rows[0]?.work_order_no).trim());
          const routeInfo = woRouteMap.get(woId);

          const rollingDate = rollingDateMap.get(woId) || null;
          const resolvedGrade =
            gradeMap.get(woId) ||
            gradeMap.get(String(rows[0]?.work_order_no).trim()) ||
            wo?.grade ||
            wo?.specification ||
            rows[0]?.grade ||
            rows[0]?.specification ||
            'Standard';

          const hasPilgerStage = rows.some((r: any) => (r.stage_code || '').toUpperCase() === 'PILGER') || (woPieceLedger.get(woId)?.pilgerPcs || 0) > 0;
          const inferredRoute = inferRouteFromMaterialOrSpec(wo?.material_code || '', wo?.specification || '', resolvedGrade);

          let routeCode = (rows[0]?.route_code || routeInfo?.route_code || (rows[0]?.route_id ? routeMap.get(rows[0]?.route_id)?.route_code : '') || '').toUpperCase();
          let routeName = rows[0]?.route_name || routeInfo?.route_name || (rows[0]?.route_id ? routeMap.get(rows[0]?.route_id)?.route_name : '');

          if (!routeCode || routeCode === 'HFS') {
            if (hasPilgerStage || inferredRoute.route_code === 'SS_STEEL') {
              routeCode = 'SS_STEEL';
              routeName = 'Stainless Steel';
            } else if (inferredRoute.route_code && inferredRoute.route_code !== 'HFS') {
              routeCode = inferredRoute.route_code;
              routeName = inferredRoute.route_name;
            } else {
              routeCode = 'HFS';
              routeName = 'Hot Finished Seamless';
            }
          }

          const rollStage = rows.find((r: any) => (r.stage_code || '').toUpperCase() === 'ROLLING');
          const rollLedger = woPieceLedger.get(woId);
          const rollPcs = Number(rollStage?.gross_output_pcs || rollLedger?.rolledPcs || 0);
          const rollMtr = Number(rollStage?.gross_output_mtr || rollStage?.production_qty || 0);
          const actualMhLen = (rollPcs > 0 && rollMtr > 0)
            ? Number((rollMtr / rollPcs).toFixed(3))
            : Number(planMh?.mh_avg_length || planMh?.mh_l1 || 6.0);

          const mhOd = Number(planMh?.mh_od || rollStage?.mh_od || wo?.size_od || rows[0]?.size_od || 0);
          const mhWt = Number(planMh?.mh_wt || rollStage?.mh_wt || wo?.size_wt || rows[0]?.size_wt || 0);

          const finStageId = (stagesRes.data || []).find((s: any) => (s.stage_code || '').toUpperCase() === 'FINISHING')?.id;
          const { summary } = reconcileCampaignWorkOrderWip({
            woId,
            wo,
            rows,
            qcInspections: qcRes.data || [],
            productionLogs: prodRes.data || [],
            hierarchyMaps: {
              campaignMembersMap,
              childToMasterMap,
              mhMap,
            },
            finishingStageId,
            stageCodeById,
            routeCode,
          });

          for (const recStage of summary.stages) {
            // Rolling is strictly raw upstream feeder, excluded from post-rolling station columns
            if (recStage.is_feeder_stage || recStage.stage_code === 'ROLLING') continue;
            // Child work orders in a master campaign are bundled under master for pre-finishing stages
            if (childToMasterMap.has(woId) && recStage.stage_code !== 'FINISHING') continue;
            // Master work orders in a campaign do NOT have finishing unless positive WIP exists
            const campMembers = campaignMembersMap.get(woId);
            if (campMembers && campMembers.size > 1 && recStage.stage_code === 'FINISHING' && recStage.capped_wip_pcs <= 0) continue;
            // Only include stages that have active physical WIP inventory
            if (recStage.capped_wip_pcs <= 0 && recStage.capped_wip_mtr <= 0) continue;

            const originalRow = rows.find((r) => (r.stage_code || '').toUpperCase() === recStage.stage_code) || rows[0];
            // Strict Final Finished Customer Size (never mother hollow size)
            const targetOd = Number(wo?.size_od || rows[0]?.size_od || 0);
            const targetWt = Number(wo?.size_wt || rows[0]?.size_wt || 0);

            mapped.push({
              ...originalRow,
              work_order_id: woId,
              work_order_no: wo?.work_order_no || originalRow.work_order_no,
              customer_name: wo?.customer_name || originalRow.customer_name,
              stage_code: recStage.stage_code,
              stage_name: recStage.stage_code === 'HOLLOW_HEAT_TREATMENT' ? 'Hollow Heat Treatment' :
                          recStage.stage_code === 'PILGER' ? 'Cold Pilger Mill' :
                          recStage.stage_code === 'DRAW' ? 'Cold Draw Bench' :
                          recStage.stage_code === 'HEAT_TREATMENT' ? 'Final Heat Treatment' :
                          recStage.stage_code === 'BAND_SAW' ? 'Band Saw Cutting' :
                          recStage.stage_code === 'VDI' ? 'VDI / QC Inspection' :
                          recStage.stage_code === 'FINISHING' ? 'Finishing & Dispatch' : recStage.stage_code,
              grade: normalizeGrade(resolvedGrade),
              od: targetOd,
              wt: targetWt,
              mh_od: mhOd,
              mh_wt: mhWt,
              route_code: routeCode,
              route_name: routeName,
              rolling_date: rollingDate,
              order_status: wo?.status || originalRow.status || null,
              balance_qty_pcs: wo?.balance_qty_pcs != null ? Number(wo.balance_qty_pcs) : null,
              balance_qty_mtr: wo?.balance_qty_mtr != null ? Number(wo.balance_qty_mtr) : null,
              is_feeder_stage: false,
              current_wip: Number(recStage.capped_wip_mtr.toFixed(2)),
              current_wip_pcs: Math.round(recStage.capped_wip_pcs),
              available_mt: Number(recStage.capped_wip_mt.toFixed(2)),
              current_wip_mt: Number(recStage.capped_wip_mt.toFixed(2)),
            });
          }

          // Also incorporate active VDI Salvage in fallback if positive
          const woQcItems = (qcRes.data || []).filter((q: any) => q.work_order_id === woId);
          const woSalvagePcs = woQcItems.reduce((sum: number, q: any) => sum + Number(q.vdi_salvage_pcs || 0), 0);
          const woSalvageMtrDirect = woQcItems.reduce((sum: number, q: any) => sum + Number(q.vdi_salvage_mtr || 0), 0);
          const avgLen = Number(wo?.l1 && wo?.l2 ? (Number(wo.l1) + Number(wo.l2)) / 2 : wo?.l1 || wo?.l2 || 6.0);
          const woSalvageMtr = woSalvageMtrDirect > 0 ? woSalvageMtrDirect : Number((woSalvagePcs * avgLen).toFixed(2));
          const targetOd = Number(wo?.size_od || rows[0]?.size_od || 0);
          const targetWt = Number(wo?.size_wt || rows[0]?.size_wt || 0);
          const woSalvageMt = mtFromMtr(woSalvageMtr, targetOd, targetWt);

          if ((wo?.status || '').toLowerCase() !== 'completed' && (woSalvagePcs >= 1 || woSalvageMtr >= 1.0)) {
            mapped.push({
              ...(rows[0] || {}),
              work_order_id: woId,
              work_order_no: wo?.work_order_no || rows[0]?.work_order_no,
              customer_name: wo?.customer_name || rows[0]?.customer_name,
              stage_code: 'VDI_SALVAGE',
              stage_name: 'VDI Salvage',
              grade: normalizeGrade(resolvedGrade),
              od: targetOd,
              wt: targetWt,
              mh_od: mhOd,
              mh_wt: mhWt,
              route_code: routeCode,
              route_name: routeName,
              rolling_date: rollingDate,
              order_status: wo?.status || rows[0]?.status || null,
              balance_qty_pcs: wo?.balance_qty_pcs != null ? Number(wo.balance_qty_pcs) : null,
              balance_qty_mtr: wo?.balance_qty_mtr != null ? Number(wo.balance_qty_mtr) : null,
              is_feeder_stage: false,
              current_wip: woSalvageMtr,
              current_wip_pcs: woSalvagePcs,
              available_mt: woSalvageMt,
              current_wip_mt: woSalvageMt,
            });
          }
        }
        setRawWipRows(mapped);
      }
    } catch (err) {
      toast.error('Failed to load WIP data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Extract unique process routes (ensuring SS_STEEL, CDS, HFS are always visible)
  const uniqueRoutes = useMemo(() => {
    const map = new Map<string, string>();
    STANDARD_ROUTES.forEach((r) => map.set(r.code, r.name));
    allRoutes.forEach((r) => {
      if (r.route_code) map.set(r.route_code, r.route_name || r.route_code);
    });
    rawWipRows.forEach((r) => {
      const code = r.route_code || 'HFS';
      const name = r.route_name || map.get(code) || code;
      map.set(code, name);
    });
    return Array.from(map.entries()).map(([code, name]) => ({ code, name }));
  }, [allRoutes, rawWipRows]);

  // Extract unique material grades
  const uniqueGrades = useMemo(() => {
    const set = new Set<string>();
    rawWipRows.forEach((r) => {
      if (r.grade) set.add(r.grade);
    });
    return Array.from(set).sort();
  }, [rawWipRows]);

  // Filter raw rows
  const filteredRawRows = useMemo(() => {
    return rawWipRows.filter((r) => {
      // Must have positive physical inventory
      if (Number(r.current_wip_pcs || 0) <= 0 && Number(r.current_wip || 0) <= 0) return false;
      // Completed orders with 0 balance cannot have active upstream physical WIP
      if ((r.order_status || '').toLowerCase() === 'completed' && Number(r.balance_qty_pcs ?? 0) === 0 && r.stage_code !== 'FINISHING') return false;
      // Order Status filter
      if (selectedStatus === 'COMPLETED') {
        if ((r.order_status || '').toLowerCase() !== 'completed') return false;
      } else if (selectedStatus === 'IN_PROCESS') {
        if ((r.order_status || '').toLowerCase() === 'completed') return false;
      }

      // Route filter
      if (selectedRoute !== 'ALL' && (r.route_code || '').toUpperCase() !== selectedRoute.toUpperCase()) return false;

      // Grade filter
      if (selectedGrade !== 'ALL' && r.grade !== selectedGrade) return false;

      // OD Range filter
      const od = Number(r.od || 0);
      if (debouncedFromOd !== '' && !isNaN(Number(debouncedFromOd)) && od < Number(debouncedFromOd)) return false;
      if (debouncedToOd !== '' && !isNaN(Number(debouncedToOd)) && od > Number(debouncedToOd)) return false;

      // Rolling Production Date Range Filter
      const rDate = r.rolling_date ? String(r.rolling_date).slice(0, 10) : null;
      if (fromRollingDate) {
        if (!rDate || rDate < fromRollingDate) return false;
      }
      if (toRollingDate) {
        if (!rDate || rDate > toRollingDate) return false;
      }

      // Search
      if (debouncedSearch.trim()) {
        const q = debouncedSearch.trim().toLowerCase();
        const matchSize = `${r.od}x${r.wt}`.includes(q) || `${r.od}*${r.wt}`.includes(q);
        const matchGrade = (r.grade || '').toLowerCase().includes(q);
        const matchWo = (r.work_order_no || '').toLowerCase().includes(q);
        const matchCust = (r.customer_name || '').toLowerCase().includes(q);
        const matchRoute = (r.route_code || '').toLowerCase().includes(q) || (r.route_name || '').toLowerCase().includes(q);
        if (!matchSize && !matchGrade && !matchWo && !matchCust && !matchRoute) return false;
      }

      return true;
    });
  }, [rawWipRows, selectedStatus, selectedRoute, selectedGrade, debouncedFromOd, debouncedToOd, debouncedSearch, fromRollingDate, toRollingDate]);

  // Aggregate into Size & Grade Matrix
  const matrixGroups = useMemo(() => {
    const map = new Map<string, SizeGradeGroup>();

    filteredRawRows.forEach((r) => {
      const od = Number(r.od || 0);
      const wt = Number(r.wt || 0);
      const grade = r.grade || 'Standard';
      const key = `${od}_${wt}_${grade}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          od,
          wt,
          grade,
          htc_mtr: 0,
          htc_pcs: 0,
          htc_mt: 0,
          draw_mtr: 0,
          draw_pcs: 0,
          draw_mt: 0,
          pilger_mtr: 0,
          pilger_pcs: 0,
          pilger_mt: 0,
          ht_mtr: 0,
          ht_pcs: 0,
          ht_mt: 0,
          band_saw_mtr: 0,
          band_saw_pcs: 0,
          band_saw_mt: 0,
          vdi_mtr: 0,
          vdi_pcs: 0,
          vdi_mt: 0,
          vdi_salvage_mtr: 0,
          vdi_salvage_pcs: 0,
          vdi_salvage_mt: 0,
          finishing_mtr: 0,
          finishing_pcs: 0,
          finishing_mt: 0,
          total_mtr: 0,
          total_pcs: 0,
          total_mt: 0,
          contributing: [],
        });
      }

      const group = map.get(key)!;
      const mtr = Number(r.current_wip || 0);
      const pcs = Number(r.current_wip_pcs || 0);
      const mt = Number(r.current_wip_mt || r.available_mt || 0) > 0
        ? Number(r.current_wip_mt || r.available_mt)
        : mtFromMtr(mtr, od, wt);
      const stage = (r.stage_code || '').toUpperCase() as StageCode;

      if (stage === 'HOLLOW_HEAT_TREATMENT') {
        group.htc_mtr += mtr;
        group.htc_pcs += pcs;
        group.htc_mt += mt;
      } else if (stage === 'PILGER') {
        group.pilger_mtr += mtr;
        group.pilger_pcs += pcs;
        group.pilger_mt += mt;
        group.draw_mtr += mtr;
        group.draw_pcs += pcs;
        group.draw_mt += mt;
      } else if (stage === 'DRAW') {
        group.draw_mtr += mtr;
        group.draw_pcs += pcs;
        group.draw_mt += mt;
      } else if (stage === 'HEAT_TREATMENT') {
        group.ht_mtr += mtr;
        group.ht_pcs += pcs;
        group.ht_mt += mt;
      } else if (stage === 'BAND_SAW') {
        group.band_saw_mtr += mtr;
        group.band_saw_pcs += pcs;
        group.band_saw_mt += mt;
      } else if (stage === 'VDI') {
        group.vdi_mtr += mtr;
        group.vdi_pcs += pcs;
        group.vdi_mt += mt;
      } else if (stage === 'VDI_SALVAGE') {
        group.vdi_salvage_mtr += mtr;
        group.vdi_salvage_pcs += pcs;
        group.vdi_salvage_mt += mt;
      } else if (stage === 'FINISHING') {
        group.finishing_mtr += mtr;
        group.finishing_pcs += pcs;
        group.finishing_mt += mt;
      }

      group.total_mtr += mtr;
      group.total_pcs += pcs;
      group.total_mt += mt;

      group.contributing.push({
        work_order_id: r.work_order_id,
        work_order_no: r.work_order_no,
        customer_name: r.customer_name,
        order_status: r.order_status,
        balance_qty_pcs: r.balance_qty_pcs,
        stage_code: stage,
        stage_name: r.stage_name || stage,
        route_code: r.route_code || 'HFS',
        route_name: r.route_name || r.route_code || 'HFS',
        rolling_date: r.rolling_date || null,
        wip_mtr: mtr,
        wip_pcs: pcs,
        wip_mt: mt,
      });
    });

    // Sort matrix by OD ascending, then WT ascending
    return Array.from(map.values()).sort((a, b) => {
      if (a.od !== b.od) return a.od - b.od;
      if (a.wt !== b.wt) return a.wt - b.wt;
      return a.grade.localeCompare(b.grade);
    });
  }, [filteredRawRows]);

  // Metric summaries across all active combinations
  const kpis = useMemo(() => {
    let totalWipMtr = 0;
    let totalWipPcs = 0;
    let totalWipMt = 0;
    let htcMtr = 0;
    let htcPcs = 0;
    let htcMt = 0;
    let drawMtr = 0;
    let drawPcs = 0;
    let drawMt = 0;
    let htMtr = 0;
    let htPcs = 0;
    let htMt = 0;
    let bandSawMtr = 0;
    let bandSawPcs = 0;
    let bandSawMt = 0;
    let vdiMtr = 0;
    let vdiPcs = 0;
    let vdiMt = 0;
    let vdiSalvageMtr = 0;
    let vdiSalvagePcs = 0;
    let vdiSalvageMt = 0;
    let finishingMtr = 0;
    let finishingPcs = 0;
    let finishingMt = 0;

    matrixGroups.forEach((g) => {
      totalWipMtr += g.total_mtr;
      totalWipPcs += g.total_pcs;
      totalWipMt += g.total_mt;
      htcMtr += g.htc_mtr;
      htcPcs += g.htc_pcs;
      htcMt += g.htc_mt;
      drawMtr += g.draw_mtr;
      drawPcs += g.draw_pcs;
      drawMt += g.draw_mt;
      htMtr += g.ht_mtr;
      htPcs += g.ht_pcs;
      htMt += g.ht_mt;
      bandSawMtr += g.band_saw_mtr;
      bandSawPcs += g.band_saw_pcs;
      bandSawMt += g.band_saw_mt;
      vdiMtr += g.vdi_mtr;
      vdiPcs += g.vdi_pcs;
      vdiMt += g.vdi_mt;
      vdiSalvageMtr += g.vdi_salvage_mtr;
      vdiSalvagePcs += g.vdi_salvage_pcs;
      vdiSalvageMt += g.vdi_salvage_mt;
      finishingMtr += g.finishing_mtr;
      finishingPcs += g.finishing_pcs;
      finishingMt += g.finishing_mt;
    });

    return {
      totalWipMtr,
      totalWipPcs,
      totalWipMt,
      htcMtr,
      htcPcs,
      htcMt,
      drawMtr,
      drawPcs,
      drawMt,
      htMtr,
      htPcs,
      htMt,
      bandSawMtr,
      bandSawPcs,
      bandSawMt,
      vdiMtr,
      vdiPcs,
      vdiMt,
      vdiSalvageMtr,
      vdiSalvagePcs,
      vdiSalvageMt,
      finishingMtr,
      finishingPcs,
      finishingMt,
    };
  }, [matrixGroups]);

  // Helper to format values according to currently selected unit with quiet typography
  const formatCell = (mtr: number, pcs: number, mt: number) => {
    if (unit === 'MTRS') {
      if (mtr > 0) return <span className="text-slate-800 dark:text-slate-200 font-medium">{fmt(mtr, 0)} <span className="text-slate-500 dark:text-slate-400 text-[10px]">m</span></span>;
      return <span className="text-slate-400 dark:text-slate-500 font-normal">0</span>;
    }
    if (unit === 'PCS') {
      if (pcs > 0) return <span className="text-slate-800 dark:text-slate-200 font-medium">{fmt(pcs, 0)} <span className="text-slate-500 dark:text-slate-400 text-[10px]">pcs</span></span>;
      return <span className="text-slate-400 dark:text-slate-500 font-normal">0</span>;
    }
    if (mt > 0) return <span className="text-slate-800 dark:text-slate-200 font-medium">{fmt(mt, 3)} <span className="text-slate-500 dark:text-slate-400 text-[10px]">MT</span></span>;
    return <span className="text-slate-400 dark:text-slate-500 font-normal">0</span>;
  };

  const clearAllFilters = useCallback(() => {
    setSearch('');
    setSelectedStatus('ALL');
    setSelectedRoute('ALL');
    setSelectedGrade('ALL');
    setFromOd('');
    setToOd('');
    setFromRollingDate('');
    setToRollingDate('');
  }, []);

  const hasActiveFilters = Boolean(
    search ||
    selectedStatus !== 'ALL' ||
    selectedRoute !== 'ALL' ||
    selectedGrade !== 'ALL' ||
    fromOd ||
    toOd ||
    fromRollingDate ||
    toRollingDate
  );

  const toggleGroup = (key: string) => {
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAll = () => {
    const anyExpanded = matrixGroups.some((g) => expandedKeys[g.key]);
    const next: Record<string, boolean> = {};
    matrixGroups.forEach((g) => {
      next[g.key] = !anyExpanded;
    });
    setExpandedKeys(next);
  };

  // Excel Export
  const exportExcel = async () => {
    if (viewMode === 'matrix') {
      const exportData = matrixGroups.map((g, i) => ({
        '#': i + 1,
        'Size (OD × WT mm)': `${g.od} × ${g.wt}`,
        'Material Grade': g.grade,
        'Hollow HT (m)': g.htc_mtr,
        'Hollow HT (pcs)': g.htc_pcs,
        'Hollow HT (MT)': g.htc_mt,
        'Cold Draw (m)': g.draw_mtr,
        'Cold Draw (pcs)': g.draw_pcs,
        'Cold Draw (MT)': g.draw_mt,
        'Heat Treatment (m)': g.ht_mtr,
        'Heat Treatment (pcs)': g.ht_pcs,
        'Heat Treatment (MT)': g.ht_mt,
        'Band Saw Cutting (m)': g.band_saw_mtr,
        'Band Saw Cutting (pcs)': g.band_saw_pcs,
        'Band Saw Cutting (MT)': g.band_saw_mt,
        'VDI / QC (m)': g.vdi_mtr,
        'VDI / QC (pcs)': g.vdi_pcs,
        'VDI / QC (MT)': g.vdi_mt,
        'VDI Salvage (m)': g.vdi_salvage_mtr,
        'VDI Salvage (pcs)': g.vdi_salvage_pcs,
        'VDI Salvage (MT)': g.vdi_salvage_mt,
        'Finishing Goods (m)': g.finishing_mtr,
        'Finishing Goods (pcs)': g.finishing_pcs,
        'Finishing Goods (MT)': g.finishing_mt,
        'Total WIP (Mtrs)': g.total_mtr,
        'Total WIP (Pcs)': g.total_pcs,
        'Total WIP (MT)': g.total_mt,
      }));

      await exportJsonToExcel(
        exportData,
        'OD-WT-Grade WIP',
        `od-wt-grade-station-wip-report-${asOnDate}.xlsx`
      );
    } else {
      const exportData = filteredRawRows.map((r, i) => ({
        '#': i + 1,
        'Work Order': r.work_order_no,
        'Order Status': r.order_status || '—',
        'Balance to Make (Pcs)': r.balance_qty_pcs != null ? r.balance_qty_pcs : '—',
        'Rolling Date': r.rolling_date || '—',
        'Customer': r.customer_name || '—',
        'Route': r.route_code || 'HFS',
        'Size (OD × WT mm)': `${r.od} × ${r.wt}`,
        'Material Grade': r.grade,
        'Stage': r.stage_name || r.stage_code,
        'Physical WIP (Mtrs)': r.current_wip,
        'Physical WIP (Pcs)': r.current_wip_pcs,
        'Physical WIP (MT)': r.available_mt,
      }));

      await exportJsonToExcel(
        exportData,
        'Detailed WO WIP',
        `detailed-wo-wip-report-${asOnDate}.xlsx`
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 pb-3.5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Gauge className="h-5 w-5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
              OD & WT Grade-Wise Station-Wise WIP Status
            </h1>
            <span className="rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:text-slate-300 font-mono">
              As On: {asOnDate}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Plant-wide physical inventory matrix cross-tabulated across manufacturing work centers by pipe size and specification.
          </p>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Unit Toggle Buttons */}
          <div
            role="radiogroup"
            aria-label="Display Unit"
            className="inline-flex rounded-md border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100/70 dark:bg-slate-800 text-xs shadow-2xs"
          >
            <button
              type="button"
              role="radio"
              aria-checked={unit === 'PCS'}
              aria-label="Display inventory in Pieces"
              onClick={() => setUnit('PCS')}
              className={`px-3 py-1.5 min-h-[32px] rounded font-semibold transition cursor-pointer ${
                unit === 'PCS' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-2xs' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Pieces (pcs)
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={unit === 'MTRS'}
              aria-label="Display inventory in Meters"
              onClick={() => setUnit('MTRS')}
              className={`px-3 py-1.5 min-h-[32px] rounded font-semibold transition cursor-pointer ${
                unit === 'MTRS' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-2xs' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Meters (m)
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={unit === 'MT'}
              aria-label="Display inventory in Metric Tons"
              onClick={() => setUnit('MT')}
              className={`px-3 py-1.5 min-h-[32px] rounded font-semibold transition cursor-pointer ${
                unit === 'MT' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-2xs' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Weight (MT)
            </button>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={loadData}
            disabled={loading}
            aria-label="Refresh live WIP matrix data"
            className="text-xs h-8"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button
            type="button"
            onClick={exportExcel}
            aria-label="Export WIP matrix to Excel spreadsheet"
            className="text-xs h-8 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 font-medium flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95 transition-transform"
          >
            <Download className="h-3.5 w-3.5 text-slate-300" />
            Export Matrix
          </Button>
        </div>
      </div>

      {/* Screen Reader Live Status Announcement */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {`Displaying ${matrixGroups.length} size-grade combinations. Total plant WIP is ${fmt(kpis.totalWipMtr, 0)} meters, ${fmt(kpis.totalWipPcs, 0)} pieces, and ${fmt(kpis.totalWipMt, 2)} metric tons.`}
      </div>

      {/* WIP Summary Cards: Total Plant WIP + Work Centers (PCS, MTR, MT) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2.5">
        {/* 1. Total Plant WIP */}
        <div className="rounded-lg border border-slate-800 bg-slate-900 text-white p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-slate-800">
            <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider truncate">Total Plant WIP</span>
            <Gauge className="h-3.5 w-3.5 text-slate-400 shrink-0" aria-hidden="true" />
          </div>
          <div className="mt-2 space-y-1 font-mono text-[11px]">
            <div className="flex items-baseline justify-between text-slate-300">
              <span className="text-[10px] uppercase text-slate-400 font-sans font-semibold">PCS</span>
              <span className="text-xs font-bold text-white">{fmt(kpis.totalWipPcs, 0)}</span>
            </div>
            <div className="flex items-baseline justify-between text-slate-300">
              <span className="text-[10px] uppercase text-slate-400 font-sans font-semibold">MTR</span>
              <span className="text-xs font-bold text-white">{fmt(kpis.totalWipMtr, 0)} <span className="text-[9px] text-slate-400 font-normal">m</span></span>
            </div>
            <div className="flex items-baseline justify-between text-slate-300">
              <span className="text-[10px] uppercase text-slate-400 font-sans font-semibold">MT</span>
              <span className="text-xs font-bold text-white">{fmt(kpis.totalWipMt, 2)} <span className="text-[9px] text-slate-400 font-normal">MT</span></span>
            </div>
          </div>
        </div>

        {/* 2. Hollow HT */}
        <div className="rounded-lg border border-[var(--border-subtle,#e2e8f0)] bg-[var(--bg-surface,#ffffff)] p-3 shadow-2xs flex flex-col justify-between hover:border-[var(--border-strong,#cbd5e1)] transition-colors">
          <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-[var(--border-subtle,#f1f5f9)]">
            <span className="text-[11px] font-semibold text-[var(--text-main,#334155)] uppercase tracking-wider truncate">Hollow HT</span>
            <Flame className="h-3.5 w-3.5 text-[var(--text-muted,#94a3b8)] shrink-0" aria-hidden="true" />
          </div>
          <div className="mt-2 space-y-1 font-mono text-[11px]">
            <div className="flex items-baseline justify-between text-[var(--text-muted,#475569)]">
              <span className="text-[10px] uppercase text-[var(--text-muted,#64748b)] font-sans font-medium">PCS</span>
              <span className="text-xs font-bold text-[var(--text-main,#0f172a)]">{fmt(kpis.htcPcs, 0)}</span>
            </div>
            <div className="flex items-baseline justify-between text-[var(--text-muted,#475569)]">
              <span className="text-[10px] uppercase text-[var(--text-muted,#64748b)] font-sans font-medium">MTR</span>
              <span className="text-xs font-bold text-[var(--text-main,#0f172a)]">{fmt(kpis.htcMtr, 0)} <span className="text-[9px] text-[var(--text-muted,#64748b)] font-normal">m</span></span>
            </div>
            <div className="flex items-baseline justify-between text-[var(--text-muted,#475569)]">
              <span className="text-[10px] uppercase text-[var(--text-muted,#64748b)] font-sans font-medium">MT</span>
              <span className="text-xs font-bold text-[var(--text-main,#0f172a)]">{fmt(kpis.htcMt, 2)} <span className="text-[9px] text-[var(--text-muted,#64748b)] font-normal">MT</span></span>
            </div>
          </div>
        </div>

        {/* 4. Cold Draw */}
        <div className="rounded-lg border border-[var(--border-subtle,#e2e8f0)] bg-[var(--bg-surface,#ffffff)] p-3 shadow-2xs flex flex-col justify-between hover:border-[var(--border-strong,#cbd5e1)] transition-colors">
          <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-[var(--border-subtle,#f1f5f9)]">
            <span className="text-[11px] font-semibold text-[var(--text-main,#334155)] uppercase tracking-wider truncate">
              {selectedRoute === 'SS_STEEL' ? 'Cold Pilger Mill' : selectedRoute === 'CDS' || selectedRoute === 'ALLOY_CDS' ? 'Cold Draw Bench' : 'Cold Draw / Pilger'}
            </span>
            <TrendingUp className="h-3.5 w-3.5 text-[var(--text-muted,#94a3b8)] shrink-0" aria-hidden="true" />
          </div>
          <div className="mt-2 space-y-1 font-mono text-[11px]">
            <div className="flex items-baseline justify-between text-[var(--text-muted,#475569)]">
              <span className="text-[10px] uppercase text-[var(--text-muted,#64748b)] font-sans font-medium">PCS</span>
              <span className="text-xs font-bold text-[var(--text-main,#0f172a)]">{fmt(kpis.drawPcs, 0)}</span>
            </div>
            <div className="flex items-baseline justify-between text-[var(--text-muted,#475569)]">
              <span className="text-[10px] uppercase text-[var(--text-muted,#64748b)] font-sans font-medium">MTR</span>
              <span className="text-xs font-bold text-[var(--text-main,#0f172a)]">{fmt(kpis.drawMtr, 0)} <span className="text-[9px] text-[var(--text-muted,#64748b)] font-normal">m</span></span>
            </div>
            <div className="flex items-baseline justify-between text-[var(--text-muted,#475569)]">
              <span className="text-[10px] uppercase text-[var(--text-muted,#64748b)] font-sans font-medium">MT</span>
              <span className="text-xs font-bold text-[var(--text-main,#0f172a)]">{fmt(kpis.drawMt, 2)} <span className="text-[9px] text-[var(--text-muted,#64748b)] font-normal">MT</span></span>
            </div>
          </div>
        </div>

        {/* 5. Final HT */}
        <div className="rounded-lg border border-[var(--border-subtle,#e2e8f0)] bg-[var(--bg-surface,#ffffff)] p-3 shadow-2xs flex flex-col justify-between hover:border-[var(--border-strong,#cbd5e1)] transition-colors">
          <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-[var(--border-subtle,#f1f5f9)]">
            <span className="text-[11px] font-semibold text-[var(--text-main,#334155)] uppercase tracking-wider truncate">Final HT</span>
            <Layers className="h-3.5 w-3.5 text-[var(--text-muted,#94a3b8)] shrink-0" aria-hidden="true" />
          </div>
          <div className="mt-2 space-y-1 font-mono text-[11px]">
            <div className="flex items-baseline justify-between text-[var(--text-muted,#475569)]">
              <span className="text-[10px] uppercase text-[var(--text-muted,#64748b)] font-sans font-medium">PCS</span>
              <span className="text-xs font-bold text-[var(--text-main,#0f172a)]">{fmt(kpis.htPcs, 0)}</span>
            </div>
            <div className="flex items-baseline justify-between text-[var(--text-muted,#475569)]">
              <span className="text-[10px] uppercase text-[var(--text-muted,#64748b)] font-sans font-medium">MTR</span>
              <span className="text-xs font-bold text-[var(--text-main,#0f172a)]">{fmt(kpis.htMtr, 0)} <span className="text-[9px] text-[var(--text-muted,#64748b)] font-normal">m</span></span>
            </div>
            <div className="flex items-baseline justify-between text-[var(--text-muted,#475569)]">
              <span className="text-[10px] uppercase text-[var(--text-muted,#64748b)] font-sans font-medium">MT</span>
              <span className="text-xs font-bold text-[var(--text-main,#0f172a)]">{fmt(kpis.htMt, 2)} <span className="text-[9px] text-[var(--text-muted,#64748b)] font-normal">MT</span></span>
            </div>
          </div>
        </div>

        {/* 6. Band Saw Cutting */}
        <div className="rounded-lg border border-[var(--border-subtle,#e2e8f0)] bg-[var(--bg-surface,#ffffff)] p-3 shadow-2xs flex flex-col justify-between hover:border-[var(--border-strong,#cbd5e1)] transition-colors">
          <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-[var(--border-subtle,#f1f5f9)]">
            <span className="text-[11px] font-semibold text-[var(--text-main,#334155)] uppercase tracking-wider truncate">Band Saw</span>
            <Scissors className="h-3.5 w-3.5 text-[var(--text-muted,#94a3b8)] shrink-0" aria-hidden="true" />
          </div>
          <div className="mt-2 space-y-1 font-mono text-[11px]">
            <div className="flex items-baseline justify-between text-[var(--text-muted,#475569)]">
              <span className="text-[10px] uppercase text-[var(--text-muted,#64748b)] font-sans font-medium">PCS</span>
              <span className="text-xs font-bold text-[var(--text-main,#0f172a)]">{fmt(kpis.bandSawPcs, 0)}</span>
            </div>
            <div className="flex items-baseline justify-between text-[var(--text-muted,#475569)]">
              <span className="text-[10px] uppercase text-[var(--text-muted,#64748b)] font-sans font-medium">MTR</span>
              <span className="text-xs font-bold text-[var(--text-main,#0f172a)]">{fmt(kpis.bandSawMtr, 0)} <span className="text-[9px] text-[var(--text-muted,#64748b)] font-normal">m</span></span>
            </div>
            <div className="flex items-baseline justify-between text-[var(--text-muted,#475569)]">
              <span className="text-[10px] uppercase text-[var(--text-muted,#64748b)] font-sans font-medium">MT</span>
              <span className="text-xs font-bold text-[var(--text-main,#0f172a)]">{fmt(kpis.bandSawMt, 2)} <span className="text-[9px] text-[var(--text-muted,#64748b)] font-normal">MT</span></span>
            </div>
          </div>
        </div>

        {/* 7. VDI Inspection */}
        <div className="rounded-lg border border-[var(--border-subtle,#e2e8f0)] bg-[var(--bg-surface,#ffffff)] p-3 shadow-2xs flex flex-col justify-between hover:border-[var(--border-strong,#cbd5e1)] transition-colors">
          <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-[var(--border-subtle,#f1f5f9)]">
            <span className="text-[11px] font-semibold text-[var(--text-main,#334155)] uppercase tracking-wider truncate">VDI / QC</span>
            <Search className="h-3.5 w-3.5 text-[var(--text-muted,#94a3b8)] shrink-0" aria-hidden="true" />
          </div>
          <div className="mt-2 space-y-1 font-mono text-[11px]">
            <div className="flex items-baseline justify-between text-[var(--text-muted,#475569)]">
              <span className="text-[10px] uppercase text-[var(--text-muted,#64748b)] font-sans font-medium">PCS</span>
              <span className="text-xs font-bold text-[var(--text-main,#0f172a)]">{fmt(kpis.vdiPcs, 0)}</span>
            </div>
            <div className="flex items-baseline justify-between text-[var(--text-muted,#475569)]">
              <span className="text-[10px] uppercase text-[var(--text-muted,#64748b)] font-sans font-medium">MTR</span>
              <span className="text-xs font-bold text-[var(--text-main,#0f172a)]">{fmt(kpis.vdiMtr, 0)} <span className="text-[9px] text-[var(--text-muted,#64748b)] font-normal">m</span></span>
            </div>
            <div className="flex items-baseline justify-between text-[var(--text-muted,#475569)]">
              <span className="text-[10px] uppercase text-[var(--text-muted,#64748b)] font-sans font-medium">MT</span>
              <span className="text-xs font-bold text-[var(--text-main,#0f172a)]">{fmt(kpis.vdiMt, 2)} <span className="text-[9px] text-[var(--text-muted,#64748b)] font-normal">MT</span></span>
            </div>
          </div>
        </div>

        {/* 7b. VDI Salvage */}
        <div className="rounded-lg border border-amber-200/80 dark:border-amber-900/50 bg-[var(--bg-surface,#ffffff)] p-3 shadow-2xs flex flex-col justify-between hover:border-amber-300 dark:hover:border-amber-800 transition-colors">
          <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-[var(--border-subtle,#f1f5f9)]">
            <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-400 uppercase tracking-wider truncate">VDI Salvage</span>
            <RotateCcw className="h-3.5 w-3.5 text-amber-600 dark:text-amber-500 shrink-0" aria-hidden="true" />
          </div>
          <div className="mt-2 space-y-1 font-mono text-[11px]">
            <div className="flex items-baseline justify-between text-[var(--text-muted,#475569)]">
              <span className="text-[10px] uppercase text-[var(--text-muted,#64748b)] font-sans font-medium">PCS</span>
              <span className="text-xs font-bold text-amber-700 dark:text-amber-300">{fmt(kpis.vdiSalvagePcs, 0)}</span>
            </div>
            <div className="flex items-baseline justify-between text-[var(--text-muted,#475569)]">
              <span className="text-[10px] uppercase text-[var(--text-muted,#64748b)] font-sans font-medium">MTR</span>
              <span className="text-xs font-bold text-amber-700 dark:text-amber-300">{fmt(kpis.vdiSalvageMtr, 0)} <span className="text-[9px] text-[var(--text-muted,#64748b)] font-normal">m</span></span>
            </div>
            <div className="flex items-baseline justify-between text-[var(--text-muted,#475569)]">
              <span className="text-[10px] uppercase text-[var(--text-muted,#64748b)] font-sans font-medium">MT</span>
              <span className="text-xs font-bold text-amber-700 dark:text-amber-300">{fmt(kpis.vdiSalvageMt, 2)} <span className="text-[9px] text-[var(--text-muted,#64748b)] font-normal">MT</span></span>
            </div>
          </div>
        </div>

        {/* 8. Finishing (FG) */}
        <div className="rounded-lg border border-[var(--border-subtle,#e2e8f0)] bg-[var(--bg-surface,#ffffff)] p-3 shadow-2xs flex flex-col justify-between hover:border-[var(--border-strong,#cbd5e1)] transition-colors">
          <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-[var(--border-subtle,#f1f5f9)]">
            <span className="text-[11px] font-semibold text-[var(--text-main,#334155)] uppercase tracking-wider truncate">Finishing</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-[var(--text-muted,#94a3b8)] shrink-0" aria-hidden="true" />
          </div>
          <div className="mt-2 space-y-1 font-mono text-[11px]">
            <div className="flex items-baseline justify-between text-[var(--text-muted,#475569)]">
              <span className="text-[10px] uppercase text-[var(--text-muted,#64748b)] font-sans font-medium">PCS</span>
              <span className="text-xs font-bold text-[var(--text-main,#0f172a)]">{fmt(kpis.finishingPcs, 0)}</span>
            </div>
            <div className="flex items-baseline justify-between text-[var(--text-muted,#475569)]">
              <span className="text-[10px] uppercase text-[var(--text-muted,#64748b)] font-sans font-medium">MTR</span>
              <span className="text-xs font-bold text-[var(--text-main,#0f172a)]">{fmt(kpis.finishingMtr, 0)} <span className="text-[9px] text-[var(--text-muted,#64748b)] font-normal">m</span></span>
            </div>
            <div className="flex items-baseline justify-between text-[var(--text-muted,#475569)]">
              <span className="text-[10px] uppercase text-[var(--text-muted,#64748b)] font-sans font-medium">MT</span>
              <span className="text-xs font-bold text-[var(--text-main,#0f172a)]">{fmt(kpis.finishingMt, 2)} <span className="text-[9px] text-[var(--text-muted,#64748b)] font-normal">MT</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-[var(--bg-surface,#ffffff)] p-3 rounded-lg border border-[var(--border-subtle,#e2e8f0)] shadow-2xs space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 items-end">
          {/* Search Size or Grade */}
          <div className="relative">
            <label htmlFor="wip-matrix-search" className="block text-[11px] font-semibold text-[var(--text-muted,#475569)] mb-1">
              Search Keywords
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--text-muted,#94a3b8)]" aria-hidden="true" />
              <Input
                id="wip-matrix-search"
                type="text"
                placeholder="Search Size, Grade, WO, Route..."
                aria-label="Search by size, grade, work order, or process route"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 text-xs h-8 border-[var(--border-subtle,#cbd5e1)] focus:border-[var(--border-strong,#64748b)]"
              />
            </div>
          </div>

          {/* Order Status Filter */}
          <div>
            <label htmlFor="wip-matrix-status" className="block text-[11px] font-semibold text-[var(--text-muted,#475569)] mb-1">
              Order Status
            </label>
            <Select
              id="wip-matrix-status"
              aria-label="Filter by order status"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="text-xs h-8 font-medium"
            >
              <option value="ALL">All Orders (Live & Completed)</option>
              <option value="IN_PROCESS">In-Process / Live Orders</option>
              <option value="COMPLETED">Completed Orders Only</option>
            </Select>
          </div>

          {/* Route Dropdown Filter */}
          <div>
            <label htmlFor="wip-matrix-route" className="block text-[11px] font-semibold text-[var(--text-muted,#475569)] mb-1">
              Process Route
            </label>
            <Select
              id="wip-matrix-route"
              aria-label="Filter by process route"
              value={selectedRoute}
              onChange={(e) => setSelectedRoute(e.target.value)}
              className="text-xs h-8 font-medium"
            >
              <option value="ALL">All Routes (HFS / CDS / SS...)</option>
              {uniqueRoutes.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.code} {r.name && r.name !== r.code ? `(${r.name})` : ''}
                </option>
              ))}
            </Select>
          </div>

          {/* Grade Dropdown */}
          <div>
            <label htmlFor="wip-matrix-grade" className="block text-[11px] font-semibold text-[var(--text-muted,#475569)] mb-1">
              Material Grade
            </label>
            <Select
              id="wip-matrix-grade"
              aria-label="Filter by material grade"
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="text-xs h-8"
            >
              <option value="ALL">All Material Grades</option>
              {uniqueGrades.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </div>

          {/* OD Range Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-muted,#475569)] mb-1">OD Range (mm)</label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                placeholder="Min OD"
                aria-label="Minimum Outer Diameter in millimeters"
                value={fromOd}
                onChange={(e) => setFromOd(e.target.value)}
                className="text-xs h-8 w-full font-mono"
              />
              <span className="text-[var(--text-muted,#94a3b8)] text-xs shrink-0" aria-hidden="true">-</span>
              <Input
                type="number"
                placeholder="Max OD"
                aria-label="Maximum Outer Diameter in millimeters"
                value={toOd}
                onChange={(e) => setToOd(e.target.value)}
                className="text-xs h-8 w-full font-mono"
              />
            </div>
          </div>

          {/* Rolling Production Date Range Filter */}
          <div>
            <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-muted,#475569)] mb-1">
              <span className="flex items-center gap-1 text-[var(--text-main,#1e293b)] font-semibold">
                <Calendar className="h-3 w-3 text-[var(--text-muted,#94a3b8)]" aria-hidden="true" />
                Rolling Date Range:
              </span>
              {(fromRollingDate || toRollingDate) && (
                <button
                  type="button"
                  aria-label="Clear rolling date range filter"
                  onClick={() => {
                    setFromRollingDate('');
                    setToRollingDate('');
                  }}
                  className="text-[10px] text-[var(--text-muted,#64748b)] hover:text-[var(--text-main,#0f172a)] underline font-medium cursor-pointer"
                >
                  Clear Date
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Input
                type="date"
                title="From Rolling Date"
                aria-label="From Rolling Production Date"
                value={fromRollingDate}
                onChange={(e) => setFromRollingDate(e.target.value)}
                className="text-[11px] h-8 font-mono px-1.5 w-full bg-[var(--bg-surface,#ffffff)]"
              />
              <span className="text-[var(--text-muted,#94a3b8)] text-xs shrink-0" aria-hidden="true">to</span>
              <Input
                type="date"
                title="To Rolling Date"
                aria-label="To Rolling Production Date"
                value={toRollingDate}
                onChange={(e) => setToRollingDate(e.target.value)}
                className="text-[11px] h-8 font-mono px-1.5 w-full bg-[var(--bg-surface,#ffffff)]"
              />
            </div>
          </div>
        </div>

        {/* View Mode Switcher & Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle,#f1f5f9)] pt-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-muted,#64748b)] font-medium">View Mode:</span>
            <div
              role="tablist"
              aria-label="Report View Mode"
              className="inline-flex rounded-md border border-[var(--border-subtle,#e2e8f0)] p-0.5 bg-[var(--bg-surface-subtle,#f8fafc)] text-xs"
            >
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'matrix'}
                onClick={() => setViewMode('matrix')}
                className={`px-3 py-1 min-h-[30px] rounded font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'matrix' ? 'bg-[var(--bg-surface,#ffffff)] text-[var(--text-main,#0f172a)] shadow-2xs border border-[var(--border-subtle,#e2e8f0)]' : 'text-[var(--text-muted,#64748b)] hover:text-[var(--text-main,#0f172a)]'
                }`}
              >
                <LayoutGrid size={13} aria-hidden="true" />
                Matrix (OD × WT × Grade)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'ledger'}
                onClick={() => setViewMode('ledger')}
                className={`px-3 py-1 min-h-[30px] rounded font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'ledger' ? 'bg-[var(--bg-surface,#ffffff)] text-[var(--text-main,#0f172a)] shadow-2xs border border-[var(--border-subtle,#e2e8f0)]' : 'text-[var(--text-muted,#64748b)] hover:text-[var(--text-main,#0f172a)]'
                }`}
              >
                <TableIcon size={13} aria-hidden="true" />
                Work Order Ledger
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs font-semibold text-rose-700 dark:text-rose-400 hover:text-rose-900 dark:hover:text-rose-300 hover:underline cursor-pointer min-h-[36px] flex items-center"
              >
                Clear All Filters
              </button>
            )}
            {viewMode === 'matrix' && (
              <button
                type="button"
                onClick={toggleAll}
                aria-label={matrixGroups.some((g) => expandedKeys[g.key]) ? 'Collapse all work order details' : 'Expand all work order details'}
                className="text-xs font-medium text-[var(--text-muted,#475569)] hover:text-[var(--text-main,#0f172a)] hover:underline cursor-pointer min-h-[36px] flex items-center"
              >
                {matrixGroups.some((g) => expandedKeys[g.key]) ? 'Collapse All Details' : 'Expand All WO Details'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* MATRIX VIEW */}
      {viewMode === 'matrix' && (
        <div className="rounded-lg border border-[var(--border-subtle,#e2e8f0)] bg-[var(--bg-surface,#ffffff)] shadow-2xs overflow-hidden">
          <div className="overflow-auto max-h-[70vh] relative">
            <table className="w-full text-left text-xs border-collapse min-w-[1200px]">
              <thead className="sticky top-0 z-20 bg-[var(--bg-surface-subtle,#f8fafc)] backdrop-blur-xs border-b border-[var(--border-subtle,#e2e8f0)] text-[var(--text-muted,#475569)] font-semibold uppercase tracking-wider text-[11px] shadow-2xs bg-clip-padding">
                <tr>
                  <th className="sticky left-0 top-0 z-30 bg-[var(--bg-surface-subtle,#f8fafc)] py-2.5 px-3 w-10 text-center bg-clip-padding"></th>
                  <th className="sticky left-10 top-0 z-30 bg-[var(--bg-surface-subtle,#f8fafc)] py-2.5 px-3 bg-clip-padding min-w-[120px]">Size (OD × WT)</th>
                  <th className="sticky left-[160px] top-0 z-30 bg-[var(--bg-surface-subtle,#f8fafc)] py-2.5 px-3 bg-clip-padding border-r border-[var(--border-subtle,#e2e8f0)] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] min-w-[100px]">Grade</th>
                  <th className="py-2.5 px-3 text-right border-l border-[var(--border-subtle,#e2e8f0)] bg-clip-padding">
                    Hollow HT (HTC)
                  </th>
                  <th className="py-2.5 px-3 text-right border-l border-[var(--border-subtle,#e2e8f0)] bg-clip-padding">
                    {selectedRoute === 'SS_STEEL' ? 'Cold Pilger Mill' : selectedRoute === 'CDS' || selectedRoute === 'ALLOY_CDS' ? 'Cold Draw Bench' : 'Cold Draw / Pilger'}
                  </th>
                  <th className="py-2.5 px-3 text-right border-l border-[var(--border-subtle,#e2e8f0)] bg-clip-padding">
                    Final Heat Treatment
                  </th>
                  <th className="py-2.5 px-3 text-right border-l border-[var(--border-subtle,#e2e8f0)] bg-clip-padding">
                    Band Saw Cutting
                  </th>
                  <th className="py-2.5 px-3 text-right border-l border-[var(--border-subtle,#e2e8f0)] bg-clip-padding">
                    VDI / QC Inspection
                  </th>
                  <th className="py-2.5 px-3 text-right border-l border-[var(--border-subtle,#e2e8f0)] bg-clip-padding">
                    VDI Salvage
                  </th>
                  <th className="py-2.5 px-3 text-right border-l border-[var(--border-subtle,#e2e8f0)] bg-clip-padding">
                    Finishing (FG)
                  </th>
                  <th className="py-2.5 px-3 text-right border-l border-[var(--border-subtle,#e2e8f0)] bg-[var(--bg-surface-subtle,#f1f5f9)] font-bold text-[var(--text-main,#0f172a)] bg-clip-padding">
                    Total Plant WIP
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[var(--border-subtle,#f1f5f9)]">
                {loading && matrixGroups.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-[var(--text-muted,#94a3b8)]">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-[var(--text-muted,#64748b)]" />
                      Aggregating OD, WT and Grade station-wise WIP matrix...
                    </td>
                  </tr>
                ) : matrixGroups.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-[var(--text-muted,#94a3b8)]">
                      <CheckCircle2 className="h-8 w-8 text-[var(--text-muted,#cbd5e1)] mx-auto mb-2" />
                      <div className="font-semibold text-[var(--text-main,#1e293b)]">No matching WIP inventory found</div>
                      <div className="text-[11px] text-[var(--text-muted,#94a3b8)] mt-0.5">
                        {hasActiveFilters
                          ? 'Try clearing active filters to see available physical inventory.'
                          : 'No active physical WIP currently recorded in the plant.'}
                      </div>
                      {hasActiveFilters && (
                        <div className="mt-3">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={clearAllFilters}
                            className="text-xs h-8 font-semibold"
                          >
                            Clear All Filters
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  matrixGroups.map((g) => {
                    const isExpanded = !!expandedKeys[g.key];

                    return (
                      <React.Fragment key={g.key}>
                        <tr
                          role="button"
                          tabIndex={0}
                          aria-expanded={isExpanded}
                          aria-label={`Toggle work order details for size ${g.od} by ${g.wt} mm grade ${g.grade}`}
                          onClick={() => toggleGroup(g.key)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleGroup(g.key);
                            }
                          }}
                          className={`group transition cursor-pointer hover:bg-[var(--bg-surface-subtle,#f8fafc)] focus:outline-none focus-visible:bg-[var(--bg-surface-subtle,#f1f5f9)] ${
                            isExpanded ? 'bg-[var(--bg-surface-subtle,#f8fafc)]' : ''
                          }`}
                        >
                          {/* Chevron (Sticky Left) */}
                          <td className="sticky left-0 z-10 bg-[var(--bg-surface,#ffffff)] group-hover:bg-[var(--bg-surface-subtle,#f8fafc)] py-2.5 px-3 text-center text-[var(--text-muted,#94a3b8)] w-10">
                            <ChevronRight
                              size={14}
                              aria-hidden="true"
                              className={`transition-transform duration-200 ${
                                isExpanded ? 'rotate-90 text-[var(--text-main,#334155)]' : 'rotate-0 text-[var(--text-muted,#94a3b8)]'
                              }`}
                            />
                          </td>

                          {/* Size (OD × WT) (Sticky Left) */}
                          <td className="sticky left-10 z-10 bg-[var(--bg-surface,#ffffff)] group-hover:bg-[var(--bg-surface-subtle,#f8fafc)] py-2.5 px-3 font-mono font-bold text-[var(--text-main,#0f172a)] text-[12px] min-w-[120px]">
                            {g.od} × {g.wt} <span className="text-[11px] text-[var(--text-muted,#94a3b8)] font-normal">mm</span>
                          </td>

                          {/* Grade (Sticky Left) */}
                          <td className="sticky left-[160px] z-10 bg-[var(--bg-surface,#ffffff)] group-hover:bg-[var(--bg-surface-subtle,#f8fafc)] py-2.5 px-3 border-r border-[var(--border-subtle,#e2e8f0)] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] min-w-[100px]">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-[var(--bg-surface-subtle,#f1f5f9)] text-[var(--text-main,#334155)] border border-[var(--border-subtle,#e2e8f0)] font-mono">
                              {g.grade}
                            </span>
                          </td>

                          {/* Hollow HT */}
                          <td className="py-2.5 px-3 text-right font-mono border-l border-[var(--border-subtle,#f1f5f9)]">
                            {formatCell(g.htc_mtr, g.htc_pcs, g.htc_mt)}
                          </td>

                          {/* Cold Draw */}
                          <td className="py-2.5 px-3 text-right font-mono border-l border-[var(--border-subtle,#f1f5f9)]">
                            {formatCell(g.draw_mtr, g.draw_pcs, g.draw_mt)}
                          </td>

                          {/* Final HT */}
                          <td className="py-2.5 px-3 text-right font-mono border-l border-[var(--border-subtle,#f1f5f9)]">
                            {formatCell(g.ht_mtr, g.ht_pcs, g.ht_mt)}
                          </td>

                          {/* Band Saw */}
                          <td className="py-2.5 px-3 text-right font-mono border-l border-[var(--border-subtle,#f1f5f9)]">
                            {formatCell(g.band_saw_mtr, g.band_saw_pcs, g.band_saw_mt)}
                          </td>

                          {/* VDI */}
                          <td className="py-2.5 px-3 text-right font-mono border-l border-[var(--border-subtle,#f1f5f9)]">
                            {formatCell(g.vdi_mtr, g.vdi_pcs, g.vdi_mt)}
                          </td>

                          {/* VDI Salvage */}
                          <td className="py-2.5 px-3 text-right font-mono border-l border-[var(--border-subtle,#f1f5f9)]">
                            {formatCell(g.vdi_salvage_mtr, g.vdi_salvage_pcs, g.vdi_salvage_mt)}
                          </td>

                          {/* Finishing */}
                          <td className="py-2.5 px-3 text-right font-mono border-l border-[var(--border-subtle,#f1f5f9)]">
                            {formatCell(g.finishing_mtr, g.finishing_pcs, g.finishing_mt)}
                          </td>

                          {/* Total Row WIP */}
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-[var(--text-main,#0f172a)] bg-[var(--bg-surface-subtle,#f8fafc)] border-l border-[var(--border-subtle,#e2e8f0)] text-[12px]">
                            {formatCell(g.total_mtr, g.total_pcs, g.total_mt)}
                          </td>
                        </tr>

                        {/* Inline Contributing Work Orders Sub-Table */}
                        {isExpanded && (
                          <tr className="bg-[var(--bg-surface-subtle,#f8fafc)]">
                            <td colSpan={11} className="py-3 px-6 border-y border-[var(--border-subtle,#e2e8f0)]">
                              <div className="rounded border border-[var(--border-subtle,#e2e8f0)] bg-[var(--bg-surface,#ffffff)] p-3 shadow-2xs space-y-2">
                                <div className="text-xs font-semibold text-[var(--text-main,#334155)] flex items-center justify-between border-b border-[var(--border-subtle,#f1f5f9)] pb-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <Package className="h-3.5 w-3.5 text-[var(--text-muted,#64748b)]" />
                                    Contributing Work Orders for {g.od} × {g.wt} mm ({g.grade}):
                                  </div>
                                  <span className="font-mono text-[11px] text-[var(--text-muted,#64748b)] font-normal">
                                    {g.contributing.length} Active Lots
                                  </span>
                                </div>

                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs text-left">
                                    <thead className="text-[10px] uppercase font-semibold text-[var(--text-muted,#64748b)] border-b border-[var(--border-subtle,#e2e8f0)]">
                                      <tr>
                                        <th className="py-1 px-2">Work Order No</th>
                                        <th className="py-1 px-2">Customer</th>
                                        <th className="py-1 px-2">Order Status</th>
                                        <th className="py-1 px-2">Route</th>
                                        <th className="py-1 px-2">Current Work Center</th>
                                        <th className="py-1 px-2 text-right">Physical WIP ({unit})</th>
                                        <th className="py-1 px-2 text-right">Action</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border-subtle,#f1f5f9)]">
                                      {g.contributing.map((c, idx) => (
                                        <tr key={idx} className="hover:bg-[var(--bg-surface-subtle,#f8fafc)]">
                                          <td className="py-1.5 px-2 font-mono font-bold text-[var(--text-main,#0f172a)]">
                                            {c.work_order_no}
                                          </td>
                                          <td className="py-1.5 px-2 text-[var(--text-muted,#475569)] truncate max-w-[200px]">
                                            {c.customer_name || 'Generic Customer'}
                                          </td>
                                          <td className="py-1.5 px-2">
                                            {getOrderStatusBadge(c.order_status, c.balance_qty_pcs)}
                                          </td>
                                          <td className="py-1.5 px-2">
                                            <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium border font-mono ${getRouteBadgeClass(c.route_code)}`}>
                                              {c.route_code || 'HFS'}
                                            </span>
                                          </td>
                                          <td className="py-1.5 px-2">
                                            <span className="font-medium text-[var(--text-main,#334155)]">
                                              {c.stage_name}
                                            </span>
                                          </td>
                                          <td className="py-1.5 px-2 text-right font-mono font-semibold text-[var(--text-main,#0f172a)]">
                                            {formatCell(c.wip_mtr, c.wip_pcs, c.wip_mt)}
                                          </td>
                                          <td className="py-1.5 px-2 text-right">
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                router.push(`/reports/tracking?wo=${encodeURIComponent(c.work_order_no)}`);
                                              }}
                                              className="inline-flex items-center gap-1 text-[11px] text-[var(--text-main,#334155)] hover:text-blue-600 dark:hover:text-blue-400 hover:underline font-semibold"
                                            >
                                              <span>Track</span>
                                              <ArrowRight size={11} />
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>

              {/* Total Summary Footer */}
              {matrixGroups.length > 0 && (
                <tfoot className="bg-[var(--bg-surface-subtle,#f8fafc)] border-t-2 border-[var(--border-subtle,#cbd5e1)] font-semibold text-[var(--text-main,#0f172a)] text-xs">
                  <tr>
                    <td colSpan={3} className="py-2.5 px-3 uppercase tracking-wider text-right font-bold text-[var(--text-main,#334155)]">
                      Total Plant Inventory:
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-[var(--text-main,#0f172a)] border-l border-[var(--border-subtle,#e2e8f0)]">
                      {formatCell(kpis.htcMtr, kpis.htcPcs, kpis.htcMt)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-[var(--text-main,#0f172a)] border-l border-[var(--border-subtle,#e2e8f0)]">
                      {formatCell(kpis.drawMtr, kpis.drawPcs, kpis.drawMt)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-[var(--text-main,#0f172a)] border-l border-[var(--border-subtle,#e2e8f0)]">
                      {formatCell(kpis.htMtr, kpis.htPcs, kpis.htMt)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-[var(--text-main,#0f172a)] border-l border-[var(--border-subtle,#e2e8f0)]">
                      {formatCell(kpis.bandSawMtr, kpis.bandSawPcs, kpis.bandSawMt)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-[var(--text-main,#0f172a)] border-l border-[var(--border-subtle,#e2e8f0)]">
                      {formatCell(kpis.vdiMtr, kpis.vdiPcs, kpis.vdiMt)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-[var(--text-main,#0f172a)] border-l border-[var(--border-subtle,#e2e8f0)]">
                      {formatCell(kpis.vdiSalvageMtr, kpis.vdiSalvagePcs, kpis.vdiSalvageMt)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-[var(--text-main,#0f172a)] border-l border-[var(--border-subtle,#e2e8f0)]">
                      {formatCell(kpis.finishingMtr, kpis.finishingPcs, kpis.finishingMt)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-[var(--text-main,#0f172a)] bg-[var(--bg-surface-subtle,#f1f5f9)] border-l border-[var(--border-subtle,#cbd5e1)] text-[12px]">
                      {formatCell(kpis.totalWipMtr, kpis.totalWipPcs, kpis.totalWipMt)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* LEDGER WORK ORDER DETAIL VIEW */}
      {viewMode === 'ledger' && (
        <div className="rounded-lg border border-[var(--border-subtle,#e2e8f0)] bg-[var(--bg-surface,#ffffff)] shadow-2xs overflow-hidden">
          <div className="overflow-auto max-h-[70vh] relative">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-20 bg-[var(--bg-surface-subtle,#f8fafc)] backdrop-blur-xs border-b border-[var(--border-subtle,#e2e8f0)] text-[var(--text-muted,#475569)] font-semibold uppercase tracking-wider text-[11px] shadow-2xs bg-clip-padding">
                <tr>
                  <th className="py-2.5 px-3 bg-clip-padding">Work Order #</th>
                  <th className="py-2.5 px-3 bg-clip-padding">Customer</th>
                  <th className="py-2.5 px-3 bg-clip-padding">Order Status</th>
                  <th className="py-2.5 px-3 bg-clip-padding">Route</th>
                  <th className="py-2.5 px-3 bg-clip-padding">Size (OD × WT)</th>
                  <th className="py-2.5 px-3 bg-clip-padding">Material Grade</th>
                  <th className="py-2.5 px-3 bg-clip-padding">Current Station</th>
                  <th className="py-2.5 px-3 text-right bg-clip-padding">Physical WIP (Mtrs)</th>
                  <th className="py-2.5 px-3 text-right bg-clip-padding">WIP (Pcs)</th>
                  <th className="py-2.5 px-3 text-right bg-clip-padding">WIP (MT)</th>
                  <th className="py-2.5 px-3 text-right bg-clip-padding">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle,#f1f5f9)]">
                {filteredRawRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-[var(--text-muted,#94a3b8)]">
                      No active work orders matching filters.
                    </td>
                  </tr>
                ) : (
                  filteredRawRows.map((r, i) => (
                    <tr key={i} className="hover:bg-[var(--bg-surface-subtle,#f8fafc)] transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-[var(--text-main,#0f172a)]">
                        {r.work_order_no}
                      </td>
                      <td className="py-2.5 px-3 text-[var(--text-muted,#475569)] truncate max-w-[160px]">
                        {r.customer_name || 'Generic Customer'}
                      </td>
                      <td className="py-2.5 px-3">
                        {getOrderStatusBadge(r.order_status, r.balance_qty_pcs)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border font-mono ${getRouteBadgeClass(r.route_code)}`}>
                          {r.route_code || 'HFS'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-[var(--text-main,#0f172a)]">
                        {r.od} × {r.wt} mm
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-mono text-[var(--text-main,#334155)] bg-[var(--bg-surface-subtle,#f1f5f9)] px-1.5 py-0.5 rounded text-[11px] border border-[var(--border-subtle,#e2e8f0)]">
                          {r.grade}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-[var(--text-main,#334155)]">
                        {r.stage_name || r.stage_code}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-[var(--text-main,#0f172a)]">
                        {fmt(r.current_wip)} m
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[var(--text-muted,#64748b)]">
                        {fmt(r.current_wip_pcs, 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[var(--text-muted,#64748b)]">
                        {fmt(r.available_mt, 3)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => router.push(`/reports/tracking?wo=${encodeURIComponent(r.work_order_no)}`)}
                          className="inline-flex items-center gap-1 text-[11px] text-[var(--text-main,#334155)] hover:text-blue-600 dark:hover:text-blue-400 hover:underline font-semibold"
                        >
                          <span>Track</span>
                          <ArrowRight size={11} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
