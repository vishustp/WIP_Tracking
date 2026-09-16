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
} from 'lucide-react';
import { toast } from 'sonner';
import { mtFromMtr, extractPcsFromRemarks } from '@/lib/productionUtils';

type StageCode = 'ROLLING' | 'HOLLOW_HEAT_TREATMENT' | 'DRAW' | 'HEAT_TREATMENT' | 'VDI' | 'FINISHING';

interface ContributingOrder {
  work_order_id: string;
  work_order_no: string;
  customer_name: string | null;
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
  // Rolling Mill
  rolling_mtr: number;
  rolling_pcs: number;
  rolling_mt: number;
  // Hollow HT
  htc_mtr: number;
  htc_pcs: number;
  htc_mt: number;
  // Cold Draw
  draw_mtr: number;
  draw_pcs: number;
  draw_mt: number;
  // Final HT
  ht_mtr: number;
  ht_pcs: number;
  ht_mt: number;
  // VDI / QC
  vdi_mtr: number;
  vdi_pcs: number;
  vdi_mt: number;
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

export default function SizeGradeWipReportClient() {
  const router = useRouter();
  const [rawWipRows, setRawWipRows] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [unit, setUnit] = useState<Unit>('MTRS');
  const [viewMode, setViewMode] = useState<'matrix' | 'ledger'>('matrix');

  // Filters
  const [search, setSearch] = useState<string>('');
  const [selectedRoute, setSelectedRoute] = useState<string>('ALL');
  const [selectedGrade, setSelectedGrade] = useState<string>('ALL');
  const [fromOd, setFromOd] = useState<string>('');
  const [toOd, setToOd] = useState<string>('');
  const [fromRollingDate, setFromRollingDate] = useState<string>('');
  const [toRollingDate, setToRollingDate] = useState<string>('');
  const [asOnDate, setAsOnDate] = useState<string>(new Date().toISOString().slice(0, 10));

  // Expanded groups in matrix
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const supabase = createClient();

      // Query view for live stage physical WIP + rolling logs + plans
      const [wipRes, woRes, plansRes, routesRes, prodRes, stagesRes] = await Promise.all([
        supabase.from('vw_route_stage_wip').select('*').gt('current_wip', 0).limit(5000),
        supabase.from('work_orders').select('id, work_order_no, customer_name, grade, specification, process_route_id, size_od, size_wt, l1, l2, ordered_qty_pcs').limit(5000),
        supabase.from('rolling_plans').select('id, work_order_id, plan_no, multiple, status, planned_rolling_date, mh_od, mh_wt, mh_l1, mh_l2, process_route_id, created_at').not('status', 'is', null).limit(5000),
        supabase.from('process_routes').select('id, route_code, route_name').eq('active', true),
        supabase.from('production_logs').select('work_order_id, stage_id, process_date, created_at, remarks, htc_ok_pcs, output_pcs, rejection_pcs').order('process_date', { ascending: false }).limit(5000),
        supabase.from('process_stages').select('id, stage_code, stage_name'),
      ]);

      if (wipRes.data) {
        const stageCodeById = new Map<string, string>();
        (stagesRes.data || []).forEach((s: any) => {
          if (s.id && s.stage_code) stageCodeById.set(s.id, (s.stage_code || '').toUpperCase());
        });

        const rollingStageId = (stagesRes.data || []).find((s: any) => (s.stage_code || '').toUpperCase() === 'ROLLING')?.id;

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

        const routeMap = new Map<string, { route_code: string; route_name: string }>();
        (routesRes.data || []).forEach((r: any) => {
          routeMap.set(r.id, { route_code: r.route_code, route_name: r.route_name });
        });

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
          if (w.process_route_id && routeMap.has(w.process_route_id)) {
            woRouteMap.set(w.id, routeMap.get(w.process_route_id)!);
          }
        });

        const mhMap = new Map<string, { mh_od?: number | null; mh_wt?: number | null; mh_l1?: number | null; mh_l2?: number | null; mh_avg_length?: number | null; multiple?: number }>();
        (plansRes.data || []).forEach((p: any) => {
          try {
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

            const mhEntry = { mh_od: mhOd, mh_wt: mhWt, mh_l1: mhL1, mh_l2: mhL2, mh_avg_length: mhAvg, multiple: mult };

            if (p.work_order_id) {
              mhMap.set(p.work_order_id, mhEntry);
            }
            if (parsed?.is_master && Array.isArray(parsed?.child_work_orders)) {
              for (const c of parsed.child_work_orders) {
                const cId = c.work_order_id || c.id;
                const cGrade = String(c.grade || c.specification || planGrade).trim();
                if (cId && cGrade) gradeMap.set(cId, cGrade);
                if (c.work_order_no && cGrade) gradeMap.set(String(c.work_order_no).trim(), cGrade);
                if (cId) mhMap.set(cId, mhEntry);
                if (c.work_order_no) mhMap.set(String(c.work_order_no).trim(), mhEntry);
              }
            }
          } catch {}
        });

        // Pre-calculate exact piece counts per work order from production_logs
        const woPieceLedger = new Map<string, {
          rolledPcs: number;
          hhtPcs: number;
          drawPcs: number;
          htPcs: number;
          vdiPcs: number;
          finPcs: number;
          htcOkPcs: number;
        }>();

        (prodRes.data || []).forEach((log: any) => {
          if (!log.work_order_id) return;
          const entry = woPieceLedger.get(log.work_order_id) || {
            rolledPcs: 0,
            hhtPcs: 0,
            drawPcs: 0,
            htPcs: 0,
            vdiPcs: 0,
            finPcs: 0,
            htcOkPcs: 0,
          };
          const { pcs: parsedPcs } = extractPcsFromRemarks(log.remarks);
          const pcs = parsedPcs != null ? parsedPcs : (Number(log.output_pcs || 0));
          const stage = stageCodeById.get(log.stage_id) || '';

          if (stage === 'ROLLING') {
            entry.rolledPcs += pcs;
            entry.htcOkPcs += Number(log.htc_ok_pcs || pcs);
          } else if (stage === 'HOLLOW_HEAT_TREATMENT') {
            entry.hhtPcs += pcs;
          } else if (stage === 'DRAW') {
            entry.drawPcs += pcs;
          } else if (stage === 'HEAT_TREATMENT') {
            entry.htPcs += pcs;
          } else if (stage === 'VDI') {
            entry.vdiPcs += pcs;
          } else if (stage === 'FINISHING' || stage === 'CUTTING') {
            entry.finPcs += pcs;
          }
          woPieceLedger.set(log.work_order_id, entry);
        });

        const mapped = wipRes.data
          .filter((r: any) => (r.stage_code || '').toUpperCase() !== 'ROLLING')
          .map((r: any) => {
          const routeInfo = woRouteMap.get(r.work_order_id);
          const routeCode = r.route_code || routeInfo?.route_code || (r.route_id ? routeMap.get(r.route_id)?.route_code : '') || 'HFS';
          const routeName = r.route_name || routeInfo?.route_name || (r.route_id ? routeMap.get(r.route_id)?.route_name : '') || routeCode;
          const isCds = routeCode.toUpperCase().includes('CDS');
          const stage = (r.stage_code || '').toUpperCase();

          const planMh = mhMap.get(r.work_order_id) || mhMap.get(String(r.work_order_no).trim());
          const wo = woDetailsMap.get(r.work_order_id) || woDetailsMap.get(String(r.work_order_no).trim());
          const mult = Number(planMh?.multiple || 1) || 1;

          const mhOd = Number(planMh?.mh_od || wo?.size_od || r.size_od || 0);
          const mhWt = Number(planMh?.mh_wt || wo?.size_wt || r.size_wt || 0);
          const mhAvgLen = Number(planMh?.mh_avg_length || planMh?.mh_l1 || 6.0);

          const orderOd = Number(wo?.size_od || r.size_od || r.od || 0);
          const orderWt = Number(wo?.size_wt || r.size_wt || r.wt || 0);
          const orderAvgLen = Number(wo?.l1 && wo?.l2 ? (Number(wo.l1) + Number(wo.l2)) / 2 : (wo?.l1 || wo?.l2 || r.l1 || r.l2 || 6.0));

          const ledger = woPieceLedger.get(r.work_order_id) || { rolledPcs: 0, hhtPcs: 0, drawPcs: 0, htPcs: 0, vdiPcs: 0, finPcs: 0, htcOkPcs: 0 };

          let calculatedPcs = 0;
          let calculatedMtr = 0;
          let calculatedMt = 0;
          let activeOd = orderOd;
          let activeWt = orderWt;

          if (isCds) {
            if (stage === 'HOLLOW_HEAT_TREATMENT') {
              calculatedPcs = Math.max(0, ledger.rolledPcs - ledger.hhtPcs);
              calculatedMtr = calculatedPcs * mhAvgLen;
              calculatedMt = mtFromMtr(calculatedMtr, mhOd, mhWt);
              activeOd = mhOd;
              activeWt = mhWt;
            } else if (stage === 'DRAW') {
              const incoming = ledger.hhtPcs > 0 ? ledger.hhtPcs : ledger.rolledPcs;
              calculatedPcs = Math.max(0, incoming - ledger.drawPcs);
              calculatedMtr = calculatedPcs * mhAvgLen;
              calculatedMt = mtFromMtr(calculatedMtr, mhOd, mhWt);
              activeOd = mhOd;
              activeWt = mhWt;
            } else if (stage === 'HEAT_TREATMENT') {
              calculatedPcs = Math.max(0, ledger.drawPcs - ledger.htPcs);
              calculatedMtr = calculatedPcs * orderAvgLen;
              calculatedMt = mtFromMtr(calculatedMtr, orderOd, orderWt);
              activeOd = orderOd;
              activeWt = orderWt;
            } else if (stage === 'VDI') {
              const htSource = ledger.htPcs > 0 ? ledger.htPcs : ledger.drawPcs;
              const incomingVdi = htSource * mult;
              calculatedPcs = Math.max(0, incomingVdi - ledger.vdiPcs - ledger.finPcs);
              calculatedMtr = calculatedPcs * orderAvgLen;
              calculatedMt = mtFromMtr(calculatedMtr, orderOd, orderWt);
              activeOd = orderOd;
              activeWt = orderWt;
            } else if (stage === 'FINISHING' || stage === 'CUTTING') {
              const incomingFin = ledger.vdiPcs > 0 ? ledger.vdiPcs : 0;
              calculatedPcs = Math.max(0, incomingFin - ledger.finPcs);
              calculatedMtr = calculatedPcs * orderAvgLen;
              calculatedMt = mtFromMtr(calculatedMtr, orderOd, orderWt);
              activeOd = orderOd;
              activeWt = orderWt;
            }
          } else {
            // HFS Route
            if (stage === 'HOLLOW_HEAT_TREATMENT') {
              calculatedPcs = Math.max(0, ledger.rolledPcs - ledger.hhtPcs);
              calculatedMtr = calculatedPcs * mhAvgLen;
              calculatedMt = mtFromMtr(calculatedMtr, mhOd, mhWt);
              activeOd = mhOd;
              activeWt = mhWt;
            } else if (stage === 'VDI') {
              const htcNos = ledger.htcOkPcs > 0 ? ledger.htcOkPcs : (ledger.hhtPcs > 0 ? ledger.hhtPcs : ledger.rolledPcs);
              const incomingVdi = htcNos * mult;
              calculatedPcs = Math.max(0, incomingVdi - ledger.vdiPcs - ledger.finPcs);
              calculatedMtr = calculatedPcs * orderAvgLen;
              calculatedMt = mtFromMtr(calculatedMtr, orderOd, orderWt);
              activeOd = orderOd;
              activeWt = orderWt;
            } else if (stage === 'FINISHING' || stage === 'CUTTING') {
              const incomingFin = ledger.vdiPcs > 0 ? ledger.vdiPcs : 0;
              calculatedPcs = Math.max(0, incomingFin - ledger.finPcs);
              calculatedMtr = calculatedPcs * orderAvgLen;
              calculatedMt = mtFromMtr(calculatedMtr, orderOd, orderWt);
              activeOd = orderOd;
              activeWt = orderWt;
            }
          }

          const hasLedger = ledger.rolledPcs > 0 || ledger.drawPcs > 0 || ledger.htPcs > 0 || ledger.vdiPcs > 0 || ledger.finPcs > 0;
          const finalPcs = hasLedger ? calculatedPcs : Number(r.current_wip_pcs || 0);
          const finalMtr = hasLedger ? calculatedMtr : Number(r.current_wip || 0);
          const finalMt = hasLedger ? calculatedMt : (Number(r.current_wip_mt || r.available_mt || 0) > 0 ? Number(r.current_wip_mt || r.available_mt) : mtFromMtr(finalMtr, activeOd, activeWt));

          const rollingDate = rollingDateMap.get(r.work_order_id) || null;
          const resolvedGrade =
            gradeMap.get(r.work_order_id) ||
            gradeMap.get(String(r.work_order_no).trim()) ||
            r.grade ||
            r.specification ||
            'Standard';

          return {
            ...r,
            grade: resolvedGrade,
            od: activeOd,
            wt: activeWt,
            route_code: routeCode,
            route_name: routeName,
            rolling_date: rollingDate,
            current_wip: Number(finalMtr.toFixed(2)),
            current_wip_pcs: Math.round(finalPcs),
            available_mt: Number(finalMt.toFixed(2)),
            current_wip_mt: Number(finalMt.toFixed(2)),
          };
        });
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

  // Extract unique process routes
  const uniqueRoutes = useMemo(() => {
    const map = new Map<string, string>();
    rawWipRows.forEach((r) => {
      const code = r.route_code || 'HFS';
      const name = r.route_name || code;
      map.set(code, name);
    });
    return Array.from(map.entries()).map(([code, name]) => ({ code, name }));
  }, [rawWipRows]);

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
      // Route filter
      if (selectedRoute !== 'ALL' && (r.route_code || '').toUpperCase() !== selectedRoute.toUpperCase()) return false;

      // Grade filter
      if (selectedGrade !== 'ALL' && r.grade !== selectedGrade) return false;

      // OD Range filter
      const od = Number(r.od || 0);
      if (fromOd !== '' && !isNaN(Number(fromOd)) && od < Number(fromOd)) return false;
      if (toOd !== '' && !isNaN(Number(toOd)) && od > Number(toOd)) return false;

      // Rolling Production Date Range Filter
      const rDate = r.rolling_date ? String(r.rolling_date).slice(0, 10) : null;
      if (fromRollingDate) {
        if (!rDate || rDate < fromRollingDate) return false;
      }
      if (toRollingDate) {
        if (!rDate || rDate > toRollingDate) return false;
      }

      // Search
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchSize = `${r.od}x${r.wt}`.includes(q) || `${r.od}*${r.wt}`.includes(q);
        const matchGrade = (r.grade || '').toLowerCase().includes(q);
        const matchWo = (r.work_order_no || '').toLowerCase().includes(q);
        const matchCust = (r.customer_name || '').toLowerCase().includes(q);
        const matchRoute = (r.route_code || '').toLowerCase().includes(q) || (r.route_name || '').toLowerCase().includes(q);
        if (!matchSize && !matchGrade && !matchWo && !matchCust && !matchRoute) return false;
      }

      return true;
    });
  }, [rawWipRows, selectedRoute, selectedGrade, fromOd, toOd, search, fromRollingDate, toRollingDate]);

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
          rolling_mtr: 0,
          rolling_pcs: 0,
          rolling_mt: 0,
          htc_mtr: 0,
          htc_pcs: 0,
          htc_mt: 0,
          draw_mtr: 0,
          draw_pcs: 0,
          draw_mt: 0,
          ht_mtr: 0,
          ht_pcs: 0,
          ht_mt: 0,
          vdi_mtr: 0,
          vdi_pcs: 0,
          vdi_mt: 0,
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

      if (stage === 'ROLLING') {
        group.rolling_mtr += mtr;
        group.rolling_pcs += pcs;
        group.rolling_mt += mt;
      } else if (stage === 'HOLLOW_HEAT_TREATMENT') {
        group.htc_mtr += mtr;
        group.htc_pcs += pcs;
        group.htc_mt += mt;
      } else if (stage === 'DRAW') {
        group.draw_mtr += mtr;
        group.draw_pcs += pcs;
        group.draw_mt += mt;
      } else if (stage === 'HEAT_TREATMENT') {
        group.ht_mtr += mtr;
        group.ht_pcs += pcs;
        group.ht_mt += mt;
      } else if (stage === 'VDI') {
        group.vdi_mtr += mtr;
        group.vdi_pcs += pcs;
        group.vdi_mt += mt;
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
    let totalSizes = matrixGroups.length;
    let totalWipMtr = 0;
    let totalWipPcs = 0;
    let totalWipMt = 0;
    let rollingMtr = 0;
    let rollingPcs = 0;
    let rollingMt = 0;
    let drawMtr = 0;
    let drawPcs = 0;
    let drawMt = 0;
    let vdiMtr = 0;
    let vdiPcs = 0;
    let vdiMt = 0;
    let finishingMtr = 0;
    let finishingPcs = 0;
    let finishingMt = 0;
    let topGroup: SizeGradeGroup | null = null;

    matrixGroups.forEach((g) => {
      totalWipMtr += g.total_mtr;
      totalWipPcs += g.total_pcs;
      totalWipMt += g.total_mt;
      rollingMtr += g.rolling_mtr;
      rollingPcs += g.rolling_pcs;
      rollingMt += g.rolling_mt;
      drawMtr += g.draw_mtr;
      drawPcs += g.draw_pcs;
      drawMt += g.draw_mt;
      vdiMtr += g.vdi_mtr;
      vdiPcs += g.vdi_pcs;
      vdiMt += g.vdi_mt;
      finishingMtr += g.finishing_mtr;
      finishingPcs += g.finishing_pcs;
      finishingMt += g.finishing_mt;

      if (!topGroup || g.total_mtr > topGroup.total_mtr) {
        topGroup = g;
      }
    });

    return {
      totalSizes,
      totalWipMtr,
      totalWipPcs,
      totalWipMt,
      rollingMtr,
      rollingPcs,
      rollingMt,
      drawMtr,
      drawPcs,
      drawMt,
      vdiMtr,
      vdiPcs,
      vdiMt,
      finishingMtr,
      finishingPcs,
      finishingMt,
      topSize: topGroup ? `${(topGroup as SizeGradeGroup).od} × ${(topGroup as SizeGradeGroup).wt} mm (${(topGroup as SizeGradeGroup).grade})` : '—',
      topSizeMtr: topGroup ? (topGroup as SizeGradeGroup).total_mtr : 0,
    };
  }, [matrixGroups]);

  // Helper to format values according to currently selected unit
  const formatCell = (mtr: number, pcs: number, mt: number) => {
    if (unit === 'MTRS') {
      return mtr > 0 ? `${fmt(mtr, 0)} m` : '—';
    }
    if (unit === 'PCS') {
      return pcs > 0 ? `${fmt(pcs, 0)} pcs` : '—';
    }
    return mt > 0 ? `${fmt(mt, 3)} MT` : '—';
  };

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
        'Rolling Mill (m)': g.rolling_mtr,
        'Rolling Mill (pcs)': g.rolling_pcs,
        'Rolling Mill (MT)': g.rolling_mt,
        'Hollow HT (m)': g.htc_mtr,
        'Hollow HT (pcs)': g.htc_pcs,
        'Hollow HT (MT)': g.htc_mt,
        'Cold Draw (m)': g.draw_mtr,
        'Cold Draw (pcs)': g.draw_pcs,
        'Cold Draw (MT)': g.draw_mt,
        'Heat Treatment (m)': g.ht_mtr,
        'Heat Treatment (pcs)': g.ht_pcs,
        'Heat Treatment (MT)': g.ht_mt,
        'VDI / QC (m)': g.vdi_mtr,
        'VDI / QC (pcs)': g.vdi_pcs,
        'VDI / QC (MT)': g.vdi_mt,
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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <Gauge className="h-6 w-6 text-[#0078d4]" />
              OD & WT Grade-Wise Station-Wise WIP Status
            </h1>
            <span className="rounded-md bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-bold text-[#0078d4] font-mono">
              As On: {asOnDate}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Plant-wide physical inventory matrix cross-tabulated across manufacturing work centers by pipe size and specification.
          </p>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Unit Toggle Buttons */}
          <div className="inline-flex rounded-md border border-slate-300 p-0.5 bg-white text-xs shadow-2xs">
            <button
              type="button"
              onClick={() => setUnit('MTRS')}
              className={`px-2.5 py-1 rounded font-semibold transition ${
                unit === 'MTRS' ? 'bg-[#0078d4] text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Meters (m)
            </button>
            <button
              type="button"
              onClick={() => setUnit('PCS')}
              className={`px-2.5 py-1 rounded font-semibold transition ${
                unit === 'PCS' ? 'bg-[#0078d4] text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pieces (pcs)
            </button>
            <button
              type="button"
              onClick={() => setUnit('MT')}
              className={`px-2.5 py-1 rounded font-semibold transition ${
                unit === 'MT' ? 'bg-[#0078d4] text-white' : 'text-slate-600 hover:text-slate-900'
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
            className="text-xs h-9 border-slate-300"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            Refresh
          </Button>

          <Button
            type="button"
            onClick={exportExcel}
            className="text-xs h-9 bg-[#107c41] hover:bg-[#0b5a2f] text-white font-semibold flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Export Matrix
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Active Sizes */}
        <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Active Sizes</span>
            <Layers className="h-4 w-4 text-[#0078d4]" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900 font-mono tracking-tight">{kpis.totalSizes}</span>
            <span className="text-xs text-slate-500 font-medium">OD × WT Combinations</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400 truncate">
            Top: {kpis.topSize}
          </div>
        </div>

        {/* Total Physical WIP (Mtrs) */}
        <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-900 uppercase tracking-wider">Total Plant WIP</span>
            <Gauge className="h-4 w-4 text-[#0078d4]" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-[#0078d4] font-mono tracking-tight">{fmt(kpis.totalWipMtr, 0)}</span>
            <span className="text-xs text-blue-700 font-semibold">Mtrs</span>
          </div>
          <div className="mt-1 text-[11px] text-blue-800 font-mono">
            {fmt(kpis.totalWipPcs, 0)} Pcs · {fmt(kpis.totalWipMt, 2)} MT
          </div>
        </div>

        {/* Rolling Mill Stock */}
        <div className="rounded-lg border border-blue-200 bg-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Rolling Mill (Mother Hollow)</span>
            <Factory className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-blue-900 font-mono tracking-tight">{fmt(kpis.rollingMtr, 0)}</span>
            <span className="text-xs text-slate-500 font-medium">Mtrs</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Rolled stock awaiting downstream
          </div>
        </div>

        {/* Cold Draw Buffer */}
        <div className="rounded-lg border border-indigo-200 bg-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Draw Bench Buffer</span>
            <TrendingUp className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-indigo-900 font-mono tracking-tight">{fmt(kpis.drawMtr, 0)}</span>
            <span className="text-xs text-slate-500 font-medium">Mtrs</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            In-draw & intermediate queue
          </div>
        </div>

        {/* Finished Goods WIP */}
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider">Finished Stock</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-emerald-800 font-mono tracking-tight">{fmt(kpis.finishingMtr, 0)}</span>
            <span className="text-xs text-emerald-700 font-semibold">Mtrs</span>
          </div>
          <div className="mt-1 text-[11px] text-emerald-700">
            Inspection passed / dispatch ready
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-end">
          {/* Search Size or Grade */}
          <div className="relative lg:col-span-3">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Search Keywords</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                type="text"
                placeholder="Search Size, Grade, WO, Route..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 text-xs h-9"
              />
            </div>
          </div>

          {/* Route Dropdown Filter */}
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Process Route</label>
            <Select
              value={selectedRoute}
              onChange={(e) => setSelectedRoute(e.target.value)}
              className="text-xs h-9 font-medium"
            >
              <option value="ALL">All Routes (HFS/CDS...)</option>
              {uniqueRoutes.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.code} {r.name && r.name !== r.code ? `(${r.name})` : ''}
                </option>
              ))}
            </Select>
          </div>

          {/* Grade Dropdown */}
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Material Grade</label>
            <Select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="text-xs h-9"
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
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">OD Range (mm)</label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                placeholder="Min OD"
                value={fromOd}
                onChange={(e) => setFromOd(e.target.value)}
                className="text-xs h-9 w-full font-mono"
              />
              <span className="text-slate-400 text-xs shrink-0">-</span>
              <Input
                type="number"
                placeholder="Max OD"
                value={toOd}
                onChange={(e) => setToOd(e.target.value)}
                className="text-xs h-9 w-full font-mono"
              />
            </div>
          </div>

          {/* Rolling Production Date Range Filter */}
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 mb-1">
              <span className="flex items-center gap-1 text-blue-900 font-bold">
                <Calendar className="h-3 w-3 text-blue-600" />
                Rolling Date Range:
              </span>
              {(fromRollingDate || toRollingDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setFromRollingDate('');
                    setToRollingDate('');
                  }}
                  className="text-[10px] text-blue-600 hover:text-blue-800 underline font-semibold cursor-pointer active:scale-95 transition-transform"
                >
                  Clear Date
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Input
                type="date"
                title="From Rolling Date"
                value={fromRollingDate}
                onChange={(e) => setFromRollingDate(e.target.value)}
                className="text-[11px] h-9 font-mono px-1.5 w-full bg-blue-50/30 border-blue-200"
              />
              <span className="text-slate-400 text-xs shrink-0">to</span>
              <Input
                type="date"
                title="To Rolling Date"
                value={toRollingDate}
                onChange={(e) => setToRollingDate(e.target.value)}
                className="text-[11px] h-9 font-mono px-1.5 w-full bg-blue-50/30 border-blue-200"
              />
            </div>
          </div>
        </div>

        {/* View Mode Switcher & Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">View Mode:</span>
            <div className="inline-flex rounded-md border border-slate-200 p-0.5 bg-slate-50 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('matrix')}
                className={`px-2.5 py-1 rounded font-semibold transition flex items-center gap-1.5 ${
                  viewMode === 'matrix' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <LayoutGrid size={13} />
                Matrix (OD × WT × Grade)
              </button>
              <button
                type="button"
                onClick={() => setViewMode('ledger')}
                className={`px-2.5 py-1 rounded font-semibold transition flex items-center gap-1.5 ${
                  viewMode === 'ledger' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <TableIcon size={13} />
                Work Order Ledger
              </button>
            </div>
          </div>

          {viewMode === 'matrix' && (
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs font-semibold text-[#0078d4] hover:underline"
            >
              {matrixGroups.some((g) => expandedKeys[g.key]) ? 'Collapse All Details' : 'Expand All WO Details'}
            </button>
          )}
        </div>
      </div>

      {/* MATRIX VIEW */}
      {viewMode === 'matrix' && (
        <div className="rounded-lg border border-slate-200 bg-white shadow-2xs overflow-hidden">
          <div className="overflow-auto max-h-[70vh] relative">
            <table className="w-full text-left text-xs border-collapse min-w-[1100px]">
              <thead className="sticky top-0 z-20 bg-slate-100 border-b border-slate-300 text-slate-700 font-bold uppercase tracking-wider text-[11px] shadow-2xs">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center"></th>
                  <th className="py-2.5 px-3">Size (OD × WT)</th>
                  <th className="py-2.5 px-3">Material Grade</th>
                  <th className="py-2.5 px-3 text-right bg-blue-50/60 border-x border-blue-200 text-blue-900">
                    Rolling Mill (MH)
                  </th>
                  <th className="py-2.5 px-3 text-right bg-amber-50/60 border-r border-amber-200 text-amber-900">
                    Hollow HT (HTC)
                  </th>
                  <th className="py-2.5 px-3 text-right bg-indigo-50/60 border-r border-indigo-200 text-indigo-900">
                    Cold Draw Bench
                  </th>
                  <th className="py-2.5 px-3 text-right bg-orange-50/60 border-r border-orange-200 text-orange-900">
                    Final Heat Treatment
                  </th>
                  <th className="py-2.5 px-3 text-right bg-purple-50/60 border-r border-purple-200 text-purple-900">
                    VDI / QC Inspection
                  </th>
                  <th className="py-2.5 px-3 text-right bg-emerald-50/60 border-r border-emerald-200 text-emerald-900">
                    Finishing (FG)
                  </th>
                  <th className="py-2.5 px-3 text-right bg-slate-200/60 font-black text-slate-900">
                    Total Physical WIP
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {loading && matrixGroups.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                      Aggregating OD, WT and Grade station-wise WIP matrix...
                    </td>
                  </tr>
                ) : matrixGroups.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400">
                      <CheckCircle2 className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <div className="font-semibold text-slate-700">No matching WIP inventory found</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Try clearing OD or Grade filters to see available stock.
                      </div>
                    </td>
                  </tr>
                ) : (
                  matrixGroups.map((g) => {
                    const isExpanded = !!expandedKeys[g.key];

                    return (
                      <React.Fragment key={g.key}>
                        <tr
                          onClick={() => toggleGroup(g.key)}
                          className={`transition cursor-pointer hover:bg-blue-50/30 ${
                            isExpanded ? 'bg-blue-50/20' : ''
                          }`}
                        >
                          {/* Chevron */}
                          <td className="py-2.5 px-3 text-center text-slate-400">
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </td>

                          {/* Size (OD × WT) */}
                          <td className="py-2.5 px-3 font-mono font-black text-slate-900 text-[13px]">
                            {g.od} × {g.wt} <span className="text-[11px] text-slate-500 font-normal">mm</span>
                          </td>

                          {/* Grade */}
                          <td className="py-2.5 px-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200 font-mono">
                              {g.grade}
                            </span>
                          </td>

                          {/* Rolling Mill */}
                          <td className="py-2.5 px-3 text-right font-mono font-bold bg-blue-50/20 border-x border-blue-100 text-blue-900">
                            {formatCell(g.rolling_mtr, g.rolling_pcs, g.rolling_mt)}
                          </td>

                          {/* Hollow HT */}
                          <td className="py-2.5 px-3 text-right font-mono font-bold bg-amber-50/20 border-r border-amber-100 text-amber-900">
                            {formatCell(g.htc_mtr, g.htc_pcs, g.htc_mt)}
                          </td>

                          {/* Cold Draw */}
                          <td className="py-2.5 px-3 text-right font-mono font-bold bg-indigo-50/20 border-r border-indigo-100 text-indigo-900">
                            {formatCell(g.draw_mtr, g.draw_pcs, g.draw_mt)}
                          </td>

                          {/* Final HT */}
                          <td className="py-2.5 px-3 text-right font-mono font-bold bg-orange-50/20 border-r border-orange-100 text-orange-900">
                            {formatCell(g.ht_mtr, g.ht_pcs, g.ht_mt)}
                          </td>

                          {/* VDI */}
                          <td className="py-2.5 px-3 text-right font-mono font-bold bg-purple-50/20 border-r border-purple-100 text-purple-900">
                            {formatCell(g.vdi_mtr, g.vdi_pcs, g.vdi_mt)}
                          </td>

                          {/* Finishing */}
                          <td className="py-2.5 px-3 text-right font-mono font-bold bg-emerald-50/20 border-r border-emerald-100 text-emerald-900">
                            {formatCell(g.finishing_mtr, g.finishing_pcs, g.finishing_mt)}
                          </td>

                          {/* Total Row WIP */}
                          <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900 bg-slate-100/50 text-[13px]">
                            {formatCell(g.total_mtr, g.total_pcs, g.total_mt)}
                          </td>
                        </tr>

                        {/* Inline Contributing Work Orders Sub-Table */}
                        {isExpanded && (
                          <tr className="bg-slate-50/80">
                            <td colSpan={10} className="py-3 px-6 border-y border-slate-200">
                              <div className="rounded border border-slate-300 bg-white p-3 shadow-2xs space-y-2">
                                <div className="text-xs font-bold text-slate-800 flex items-center justify-between border-b border-slate-100 pb-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <Package className="h-3.5 w-3.5 text-[#0078d4]" />
                                    Contributing Work Orders for {g.od} × {g.wt} mm ({g.grade}):
                                  </div>
                                  <span className="font-mono text-[11px] text-slate-500 font-normal">
                                    {g.contributing.length} Active Lots
                                  </span>
                                </div>

                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs text-left">
                                    <thead className="text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                                      <tr>
                                        <th className="py-1 px-2">Work Order No</th>
                                        <th className="py-1 px-2">Customer</th>
                                        <th className="py-1 px-2">Route</th>
                                        <th className="py-1 px-2">Current Work Center</th>
                                        <th className="py-1 px-2 text-right">Physical WIP ({unit})</th>
                                        <th className="py-1 px-2 text-right">Action</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {g.contributing.map((c, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50">
                                          <td className="py-1.5 px-2 font-mono font-bold text-slate-900">
                                            {c.work_order_no}
                                          </td>
                                          <td className="py-1.5 px-2 text-slate-600 truncate max-w-[200px]">
                                            {c.customer_name || 'Generic Customer'}
                                          </td>
                                          <td className="py-1.5 px-2">
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200 font-mono">
                                              {c.route_code || 'HFS'}
                                            </span>
                                          </td>
                                          <td className="py-1.5 px-2">
                                            <span className="font-semibold text-slate-700">
                                              {c.stage_name}
                                            </span>
                                          </td>
                                          <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-900">
                                            {formatCell(c.wip_mtr, c.wip_pcs, c.wip_mt)}
                                          </td>
                                          <td className="py-1.5 px-2 text-right">
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                router.push(`/reports/tracking?wo=${encodeURIComponent(c.work_order_no)}`);
                                              }}
                                              className="inline-flex items-center gap-1 text-[11px] text-[#0078d4] hover:underline font-semibold"
                                            >
                                              <span>Track</span>
                                              <ArrowRight size={12} />
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
                <tfoot className="bg-slate-100/90 border-t-2 border-slate-300 font-bold text-slate-900 text-xs">
                  <tr>
                    <td colSpan={3} className="py-3 px-3 uppercase tracking-wider text-right font-black">
                      Total Plant Inventory:
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-blue-950 bg-blue-100/50 border-x border-blue-200">
                      {formatCell(kpis.rollingMtr, kpis.rollingPcs, kpis.rollingMt)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-amber-950 bg-amber-100/50 border-r border-amber-200">
                      {formatCell(
                        matrixGroups.reduce((s, g) => s + g.htc_mtr, 0),
                        matrixGroups.reduce((s, g) => s + g.htc_pcs, 0),
                        matrixGroups.reduce((s, g) => s + g.htc_mt, 0)
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-indigo-950 bg-indigo-100/50 border-r border-indigo-200">
                      {formatCell(kpis.drawMtr, kpis.drawPcs, kpis.drawMt)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-orange-950 bg-orange-100/50 border-r border-orange-200">
                      {formatCell(
                        matrixGroups.reduce((s, g) => s + g.ht_mtr, 0),
                        matrixGroups.reduce((s, g) => s + g.ht_pcs, 0),
                        matrixGroups.reduce((s, g) => s + g.ht_mt, 0)
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-purple-950 bg-purple-100/50 border-r border-purple-200">
                      {formatCell(kpis.vdiMtr, kpis.vdiPcs, kpis.vdiMt)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-emerald-950 bg-emerald-100/50 border-r border-emerald-200">
                      {formatCell(kpis.finishingMtr, kpis.finishingPcs, kpis.finishingMt)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-slate-950 bg-slate-200 text-[13px]">
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
        <div className="rounded-lg border border-slate-200 bg-white shadow-2xs overflow-hidden">
          <div className="overflow-auto max-h-[70vh] relative">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-20 bg-slate-100 border-b border-slate-300 text-slate-700 font-bold uppercase tracking-wider text-[11px] shadow-2xs">
                <tr>
                  <th className="py-2.5 px-3">Work Order #</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">Route</th>
                  <th className="py-2.5 px-3">Size (OD × WT)</th>
                  <th className="py-2.5 px-3">Material Grade</th>
                  <th className="py-2.5 px-3">Current Station</th>
                  <th className="py-2.5 px-3 text-right">Physical WIP (Mtrs)</th>
                  <th className="py-2.5 px-3 text-right">WIP (Pcs)</th>
                  <th className="py-2.5 px-3 text-right">WIP (MT)</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredRawRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400">
                      No active work orders matching filters.
                    </td>
                  </tr>
                ) : (
                  filteredRawRows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        {r.work_order_no}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 truncate max-w-[160px]">
                        {r.customer_name || 'Generic Customer'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200 font-mono">
                          {r.route_code || 'HFS'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                        {r.od} × {r.wt} mm
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                          {r.grade}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-700">
                        {r.stage_name || r.stage_code}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {fmt(r.current_wip)} m
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                        {fmt(r.current_wip_pcs, 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                        {fmt(r.available_mt, 3)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => router.push(`/reports/tracking?wo=${encodeURIComponent(r.work_order_no)}`)}
                          className="inline-flex items-center gap-1 text-[11px] text-[#0078d4] hover:underline font-semibold"
                        >
                          <span>Track</span>
                          <ArrowRight size={12} />
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
