'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Printer,
  Search,
  RefreshCw,
  Crown,
  Link2,
  ChevronDown,
  ChevronUp,
  Download,
  Flame,
  X,
  FileText,
  Table as TableIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

export type Plan = {
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
  planned_qty?: number;
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

export interface FactoryPlanRow {
  srNo: number;
  catg: string;
  customer: string;
  woNo: string;
  spec: string;
  grade: string;
  ibr: string;
  rollingMtr: number;
  rmOd: number;
  rmLenMin: number;
  rmLenMax: number;
  planQtyNos: number;
  planQtyMton: number;
  pmOd: number;
  pmWthk: number;
  pmLen: number;
  custOd: number;
  custWt: number;
  rollingWt: number;
  smLen: number;
  feLen: number;
  beLen: number;
  effLen: number;
  reqLenEr: string;
  reqLenMin: number;
  reqLenMax: number;
  mult: string;
  tolOdMin: number;
  tolOdMax: number;
  tolWtMin: number;
  tolWtMax: number;
  processYieldPct: number;
  campaignPlanNo: string;
  millName: string;
  monthStr: string;
  issueDate: string;
  prevPlanNo: string;
  childSubRows: Array<{
    catg: string;
    finishSize: string;
    finalLen: string;
    woNo: string;
    customer: string;
    hollowLen: string;
    htcMtr: number;
  }>;
}

const fmt = (n: number | string | null | undefined, digits = 2) => {
  if (n == null || n === '') return '—';
  const num = Number(n);
  return isNaN(num) ? String(n) : num.toLocaleString(undefined, { maximumFractionDigits: digits });
};

const formatFinalSizeLength = (p: { l1?: number | null; l2?: number | null; avg_length?: number | null }) => {
  const hl1 = Number(p.l1 || 0);
  const hl2 = Number(p.l2 || 0);
  if (hl1 > 0 && hl2 > 0) {
    if (hl1 === hl2) return `L: ${fmt(hl1)} m`;
    return `L: ${fmt(hl1)} - ${fmt(hl2)} m`;
  }
  if (hl1 > 0) return `L: ${fmt(hl1)} m`;
  if (hl2 > 0) return `L: ${fmt(hl2)} m`;
  const avg = Number(p.avg_length || 0);
  if (avg > 0) return `L: ~${fmt(avg)} m (avg)`;
  return null;
};

export default function RollingPlanIssueReportClient() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [routeFilter, setRouteFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [millFilter, setMillFilter] = useState<'ALL' | 'Mill-02' | 'Mill-03'>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [routes, setRoutes] = useState<{ id: string; route_code: string; route_name: string }[]>([]);

  const [expandedMasters, setExpandedMasters] = useState<Record<string, boolean>>({});
  const [selectedPlanForSlip, setSelectedPlanForSlip] = useState<Plan | null>(null);

  // View Mode: Factory Cutting Plan (Mill-02) or Standard Table View
  const [viewMode, setViewMode] = useState<'factory' | 'standard'>('factory');
  const [selectedCampaignPlan, setSelectedCampaignPlan] = useState<string>('ALL');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const s = createClient();
      const [plansRes, routesRes] = await Promise.all([
        s.rpc('get_rolling_plans', {
          p_search: search.trim() || null,
          p_route_code: routeFilter === 'ALL' ? null : routeFilter,
          p_from_date: fromDate || null,
          p_to_date: toDate || null,
          p_limit: 2000,
          p_offset: 0,
        }),
        s.from('process_routes').select('id,route_code,route_name').eq('active', true).order('route_code'),
      ]);

      if (plansRes.error) throw plansRes.error;
      const rawPlans = (plansRes.data ?? []) as Plan[];

      // Fetch actual Mother Hollow specs & status directly from rolling_plans table
      const planIds = rawPlans.map((x) => x.id);
      const woIds = Array.from(new Set(rawPlans.map((x) => x.work_order_id).filter(Boolean)));
      let mhMap: Record<string, any> = {};
      let woMap: Record<string, any> = {};

      const [rpDetailsRes, woDetailsRes] = await Promise.all([
        planIds.length > 0
          ? s.from('rolling_plans').select('id, mh_od, mh_wt, mh_l1, mh_l2, pass_required, multiple, status, planned_qty').in('id', planIds)
          : Promise.resolve({ data: [] }),
        woIds.length > 0
          ? s.from('work_orders').select('id, size_od, size_wt, l1, l2, ordered_qty_pcs, ordered_qty_mtr').in('id', woIds)
          : Promise.resolve({ data: [] }),
      ]);

      if (rpDetailsRes.data) {
        for (const d of rpDetailsRes.data) mhMap[d.id] = d;
      }
      if (woDetailsRes.data) {
        for (const w of woDetailsRes.data) woMap[w.id] = w;
      }

      const enrichedPlans: Plan[] = rawPlans.map((p) => {
        const detail = mhMap[p.id];
        const wo = woMap[p.work_order_id];
        let parsedSt: any = {};
        try {
          parsedSt = typeof detail?.status === 'string'
            ? JSON.parse(detail.status)
            : detail?.status || (typeof p.status === 'string' ? JSON.parse(p.status) : p.status || {});
        } catch { }

        // Final Size Specifications
        const finalOd = wo?.size_od ?? p.od ?? parsedSt?.master_od ?? null;
        const finalWt = wo?.size_wt ?? p.wt ?? parsedSt?.master_wt ?? null;
        const finalL1 = wo?.l1 ?? p.l1 ?? null;
        const finalL2 = wo?.l2 ?? p.l2 ?? null;

        let computedAvgLen: number | null = p.avg_length ?? null;
        if (!computedAvgLen && finalL1 && finalL2) {
          computedAvgLen = (Number(finalL1) + Number(finalL2)) / 2;
        } else if (!computedAvgLen && (finalL1 || finalL2)) {
          computedAvgLen = Number(finalL1 || finalL2);
        } else if (!computedAvgLen && wo && Number(wo.ordered_qty_pcs) > 0 && Number(wo.ordered_qty_mtr) > 0) {
          computedAvgLen = Number((Number(wo.ordered_qty_mtr) / Number(wo.ordered_qty_pcs)).toFixed(2));
        }

        const mhOd = detail?.mh_od ?? p.mh_od ?? null;
        const mhWt = detail?.mh_wt ?? p.mh_wt ?? null;
        const mhL1 = detail?.mh_l1 ?? p.mh_l1 ?? null;
        const mhL2 = detail?.mh_l2 ?? p.mh_l2 ?? null;
        const passReq = detail?.pass_required ?? p.pass_required ?? 1;
        const mult = detail?.multiple ?? p.multiple ?? 1;

        let pcs = 0;
        if (parsedSt?.is_master && Number(parsedSt?.master_planned_pcs) > 0) {
          pcs = Number(parsedSt.master_planned_pcs);
        } else if (Number(parsedSt?.planned_pcs) > 0) {
          pcs = Number(parsedSt.planned_pcs);
        } else if (Number(p.planned_pcs) > 0) {
          pcs = Number(p.planned_pcs);
        }

        const hl1 = Number(mhL1 || 0);
        const hl2 = Number(mhL2 || 0);
        const mhAvgLen = (hl1 > 0 && hl2 > 0)
          ? (hl1 + hl2) / 2
          : (hl1 > 0 ? hl1 : (hl2 > 0 ? hl2 : Number(computedAvgLen || 6.0)));

        const rawMtr = Number(detail?.planned_qty ?? p.planned_qty ?? p.planned_mtr ?? 0);
        if (pcs === 0 && rawMtr > 0 && mhAvgLen > 0) {
          pcs = Math.round(rawMtr / mhAvgLen);
        }

        const mtr = pcs > 0
          ? Number((pcs * mhAvgLen).toFixed(2))
          : (Number(parsedSt?.master_planned_mtr || parsedSt?.planned_mtr || rawMtr) || 0);

        const hod = Number(mhOd || 0) > 0 ? Number(mhOd) : Number(finalOd || 0);
        const hwt = Number(mhWt || 0) > 0 ? Number(mhWt) : Number(finalWt || 0);
        const mt = (hod > 0 && hwt > 0 && hod > hwt)
          ? Number(((hod - hwt) * hwt * 0.0246615 * 0.001 * mtr).toFixed(3))
          : (Number(parsedSt?.master_planned_mt || parsedSt?.planned_mt || p.planned_mt) || 0);

        return {
          ...p,
          od: finalOd,
          wt: finalWt,
          l1: finalL1,
          l2: finalL2,
          avg_length: computedAvgLen,
          mh_od: mhOd,
          mh_wt: mhWt,
          mh_l1: mhL1,
          mh_l2: mhL2,
          pass_required: passReq,
          multiple: mult,
          planned_pcs: pcs,
          planned_mtr: mtr,
          planned_mt: mt,
          status: detail?.status ?? p.status,
        };
      });

      setPlans(enrichedPlans);

      if (routesRes.data) {
        setRoutes(routesRes.data);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load rolling plans.');
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [search, routeFilter, fromDate, toDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter plans based on type (Master, Child, Standard)
  const filteredPlans = useMemo(() => {
    return plans.filter((p) => {
      let parsedStatus: any = {};
      try {
        parsedStatus = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
      } catch { }

      const isMaster = !!parsedStatus?.is_master;
      const isChild = !!parsedStatus?.is_child;

      if (typeFilter === 'MASTER' && !isMaster) return false;
      if (typeFilter === 'CHILD' && !isChild) return false;
      if (typeFilter === 'STANDARD' && (isMaster || isChild)) return false;

      if (millFilter !== 'ALL') {
        const planMill = parsedStatus?.mill_name || 'Production Plan-Hot Mill-02';
        if (!planMill.toLowerCase().includes(millFilter.toLowerCase())) {
          return false;
        }
      }

      return true;
    });
  }, [plans, typeFilter, millFilter]);

  // Distinct Campaign Plan Nos for filtering
  const availableCampaigns = useMemo(() => {
    const set = new Set<string>();
    plans.forEach((p) => {
      let parsedStatus: any = {};
      try {
        parsedStatus = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
      } catch { }
      const camp = parsedStatus?.campaign_plan_no || p.plan_no;
      if (camp) set.add(camp);
    });
    return Array.from(set).sort();
  }, [plans]);

  // Transform filtered plans into Factory Cutting Plan Rows (Mill-02 format)
  const factoryRows = useMemo(() => {
    // In factory view, each row represents a setup group (Master plan or standalone plan)
    // Child plans are represented as sub-rows under their master
    const masterOrStandardPlans = filteredPlans.filter((p) => {
      let parsed: any = {};
      try {
        parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
      } catch { }
      return !parsed?.is_child; // exclude children from being separate master rows
    });

    const targetPlans = selectedCampaignPlan === 'ALL'
      ? masterOrStandardPlans
      : masterOrStandardPlans.filter((p) => {
        let parsed: any = {};
        try {
          parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
        } catch { }
        return (parsed?.campaign_plan_no || p.plan_no) === selectedCampaignPlan;
      });

    return targetPlans.map((p, idx) => {
      let parsed: any = {};
      try {
        parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status || {};
      } catch { }

      const catg = parsed.catg || (p.route_code?.includes('CDS') ? 'CDS' : 'CDS');
      const spec = parsed.spec || 'ASME SA210 Gr.A1';
      const grade = parsed.grade || p.grade || 'SAE 1018';
      const ibr = parsed.ibr_status || 'IBR';

      const childOrders: any[] = parsed.child_work_orders || [];
      let childSubRows = childOrders.map((c: any) => {
        const cFinishSize = c.finish_size || `${fmt(c.size_od ?? p.od, 2)}x${fmt(c.size_wt ?? p.wt, 2)}`;
        const cFinalLen = c.final_len || (c.l1 && c.l2 ? `${fmt(c.l1, 2)}-${fmt(c.l2, 2)}` : `${fmt(c.l1 || 6, 2)}-${fmt(c.l2 || 6, 2)}`);
        const cHollowLen = c.hollow_len || (p.mh_l1 && p.mh_l2 ? `${fmt(p.mh_l1, 2)}-${fmt(p.mh_l2, 2)}` : '7.55-7.55');
        const cMtr = Number(c.htc_mtr ?? c.planned_mtr ?? 0);
        return {
          catg: c.catg || catg,
          finishSize: cFinishSize,
          finalLen: cFinalLen,
          woNo: c.work_order_no || '',
          customer: c.customer_name || p.customer_name || 'Standard Stock',
          hollowLen: cHollowLen,
          htcMtr: cMtr,
        };
      });

      // If no child sub-rows configured, create one for the main WO
      if (childSubRows.length === 0) {
        const finishSize = `${fmt(p.od || 38.1, 2)}x${fmt(p.wt || 4.26, 2)}`;
        const finalLen = p.l1 && p.l2 ? `${fmt(p.l1, 2)}-${fmt(p.l2, 2)}` : '11.8-11.8';
        const hollowLen = p.mh_l1 && p.mh_l2 ? `${fmt(p.mh_l1, 2)}-${fmt(p.mh_l2, 2)}` : '7.55-7.55';
        childSubRows.push({
          catg,
          finishSize,
          finalLen,
          woNo: p.work_order_no,
          customer: p.customer_name || 'Standard Stock',
          hollowLen,
          htcMtr: Number(p.planned_mtr || 0),
        });
      }

      const rollingMtr = parsed.rolling_mtr != null
        ? Number(parsed.rolling_mtr)
        : (childSubRows.length > 0 ? childSubRows.reduce((sum, r) => sum + r.htcMtr, 0) : Number(p.planned_mtr || 0));

      const rmOd = parsed.rm_od != null ? Number(parsed.rm_od) : 63.00;
      const rmLenMin = parsed.rm_len_min != null ? Number(parsed.rm_len_min) : 1.890;
      const rmLenMax = parsed.rm_len_max != null ? Number(parsed.rm_len_max) : 1.895;

      const planQtyNos = parsed.plan_qty_nos != null ? Number(parsed.plan_qty_nos) : Number(p.planned_pcs || 1563);
      const planQtyMton = parsed.plan_qty_mton != null ? Number(parsed.plan_qty_mton) : Number(p.planned_mt || 72.3);

      const pmOd = parsed.pm_od != null ? Number(parsed.pm_od) : Number(p.mh_od || 66.0);
      const pmWthk = parsed.pm_wt != null ? Number(parsed.pm_wt) : 5.50;
      const pmLen = parsed.pm_len != null ? Number(parsed.pm_len) : 5.41;

      const custOd = parsed.cust_od != null ? Number(parsed.cust_od) : Number(p.mh_od || p.od || 47.00);
      const custWt = parsed.cust_wt != null ? Number(parsed.cust_wt) : Number(p.mh_wt || p.wt || 5.75);
      const rollingWt = parsed.rolling_wt != null ? Number(parsed.rolling_wt) : custWt;
      const smLen = parsed.sm_len != null ? Number(parsed.sm_len) : Number(p.mh_l1 || 7.67);

      const feLen = parsed.fe_len != null ? Number(parsed.fe_len) : 0.000;
      const beLen = parsed.be_len != null ? Number(parsed.be_len) : 0.000;
      const effLen = parsed.eff_len != null ? Number(parsed.eff_len) : smLen;

      const reqLenEr = parsed.req_len_er || 'EL';
      const reqLenMin = parsed.req_len_min != null ? Number(parsed.req_len_min) : Number(p.l1 || 7.55);
      const reqLenMax = parsed.req_len_max != null ? Number(parsed.req_len_max) : Number(p.l2 || 7.55);

      const mult = parsed.multiple_str || (p.multiple > 1 ? `${p.multiple}-Multi` : '1');
      const tolOdMin = parsed.tol_od_min != null ? Number(parsed.tol_od_min) : 46.60;
      const tolOdMax = parsed.tol_od_max != null ? Number(parsed.tol_od_max) : 47.40;
      const tolWtMin = parsed.tol_wt_min != null ? Number(parsed.tol_wt_min) : 5.32;
      const tolWtMax = parsed.tol_wt_max != null ? Number(parsed.tol_wt_max) : 6.33;
      const processYieldPct = parsed.process_yield_pct != null ? Number(parsed.process_yield_pct) : 95.50;

      const campaignPlanNo = parsed.campaign_plan_no || p.plan_no;
      const millName = parsed.mill_name || 'Production Plan-Hot Mill-02';
      const monthStr = parsed.month_str || 'Sep-26';
      const issueDate = p.planned_rolling_date || '7-Sep';
      const prevPlanNo = parsed.prev_plan_no || '01';

      return {
        srNo: idx + 1,
        catg,
        customer: p.customer_name || 'Shanta Techno',
        woNo: p.work_order_no,
        spec,
        grade,
        ibr,
        rollingMtr,
        rmOd,
        rmLenMin,
        rmLenMax,
        planQtyNos,
        planQtyMton,
        pmOd,
        pmWthk,
        pmLen,
        custOd,
        custWt,
        rollingWt,
        smLen,
        feLen,
        beLen,
        effLen,
        reqLenEr,
        reqLenMin,
        reqLenMax,
        mult,
        tolOdMin,
        tolOdMax,
        tolWtMin,
        tolWtMax,
        processYieldPct,
        campaignPlanNo,
        millName,
        monthStr,
        issueDate,
        prevPlanNo,
        childSubRows,
      };
    });
  }, [filteredPlans, selectedCampaignPlan]);

  // Primary Metadata for Active Factory Sheet Header
  const activeSheetMeta = useMemo(() => {
    if (factoryRows.length > 0) {
      const first = factoryRows[0];
      return {
        millName: first.millName,
        monthStr: first.monthStr,
        planNo: selectedCampaignPlan !== 'ALL' ? selectedCampaignPlan : (first.campaignPlanNo || '02'),
        issueDate: first.issueDate,
        prevPlanNo: first.prevPlanNo,
      };
    }
    return {
      millName: millFilter !== 'ALL' ? `Production Plan-Hot ${millFilter}` : 'Production Plan-Hot Mill-02',
      monthStr: 'Sep-26',
      planNo: selectedCampaignPlan !== 'ALL' ? selectedCampaignPlan : '02',
      issueDate: '7-Sep',
      prevPlanNo: '01',
    };
  }, [factoryRows, selectedCampaignPlan, millFilter]);

  // Summary Metrics
  const summary = useMemo(() => {
    let totalMtr = 0;
    let totalPcs = 0;
    let totalMt = 0;
    let masterCount = 0;

    filteredPlans.forEach((p) => {
      let parsedStatus: any = {};
      try {
        parsedStatus = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
      } catch { }
      if (parsedStatus?.is_master) masterCount++;

      totalMtr += Number(p.planned_mtr || 0);
      totalPcs += Number(p.planned_pcs || 0);
      totalMt += Number(p.planned_mt || 0);
    });

    return {
      count: filteredPlans.length,
      totalMtr,
      totalPcs,
      totalMt,
      masterCount,
    };
  }, [filteredPlans]);

  const toggleExpand = (id: string) => {
    setExpandedMasters((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const exportCSV = () => {
    if (!filteredPlans.length) {
      toast.error('No data available to export.');
      return;
    }

    const headers = [
      'Plan No',
      'Rolling Date',
      'Work Order No',
      'Customer',
      'Grade',
      'Finished OD (mm)',
      'Finished WT (mm)',
      'MH OD (mm)',
      'MH WT (mm)',
      'Route Code',
      'Pass Req',
      'Multiple',
      'Planned Pcs',
      'Planned Mtr',
      'Planned MT',
    ];

    const rows = filteredPlans.map((p) => [
      p.plan_no,
      p.planned_rolling_date,
      p.work_order_no,
      `"${(p.customer_name || '').replace(/"/g, '""')}"`,
      p.grade || '',
      p.od ?? '',
      p.wt ?? '',
      p.mh_od ?? '',
      p.mh_wt ?? '',
      p.route_code || '',
      p.pass_required ?? '',
      p.multiple ?? '',
      p.planned_pcs ?? 0,
      p.planned_mtr ?? 0,
      p.planned_mt ?? 0,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Rolling_Plan_Schedule_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Rolling plans exported to CSV.');
  };

  return (
    <div className="space-y-6 print:space-y-2 print:p-0 print:m-0 print:w-full">
      {/* Print Stylesheet for A4 Landscape with Factory-Exact Borders */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          @page {
            size: A4 landscape;
            margin: 4mm 5mm 4mm 5mm;
          }
          html, body {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            font-size: 10px !important;
          }
          main {
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .overflow-x-auto {
            overflow: visible !important;
          }
          .factory-print-sheet {
            display: block !important;
            width: 100% !important;
          }
          .standard-screen-sheet {
            display: none !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          th, td {
            border: 1px solid #000000 !important;
            padding: 2px 3px !important;
          }
          tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .break-inside-avoid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}} />

      {/* Screen Toolbar / View Mode Switcher */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 border border-amber-200">
              <Flame className="h-3.5 w-3.5 text-amber-700" />
              HOT MILL-02 PRODUCTION PLANNING
            </span>
            <span className="text-xs font-semibold text-slate-500">Doc: F-PROD-01A (Rev 02)</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 mt-1">
            Round Bar Cutting Plan & Hot Mill Daily Production Plan
          </h1>
          <p className="text-xs text-slate-500">
            Factory shop-floor campaign schedule with Mother Hollow piercing specs, billet dimensions, and child order allocations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Segmented Switcher */}
          <div className="flex items-center rounded-lg bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('factory')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                viewMode === 'factory'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Factory Sheet (Photo Layout)
            </button>
            <button
              type="button"
              onClick={() => setViewMode('standard')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                viewMode === 'standard'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" />
              Standard Table
            </button>
          </div>

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
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-600 transition cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            Print Factory Sheet
          </button>
        </div>
      </div>

      {/* Screen Filters Bar (Hidden on Print) */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs print:hidden">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-6">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Select Mill
            </label>
            <select
              value={millFilter}
              onChange={(e) => setMillFilter(e.target.value as any)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-700 focus:border-indigo-500 focus:outline-hidden cursor-pointer"
            >
              <option value="ALL">All Mills</option>
              <option value="Mill-02">Hot Mill-02</option>
              <option value="Mill-03">Hot Mill-03</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Search Order / Plan / Customer
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="e.g. DOM-SHANTA or 06233"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Select Daily Plan / Campaign
            </label>
            <select
              value={selectedCampaignPlan}
              onChange={(e) => setSelectedCampaignPlan(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="ALL">All Campaign Plans</option>
              {availableCampaigns.map((camp) => (
                <option key={camp} value={camp}>
                  Plan No: {camp}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Process Route
            </label>
            <select
              value={routeFilter}
              onChange={(e) => setRouteFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="ALL">All Process Routes</option>
              {routes.map((r) => (
                <option key={r.id} value={r.route_code}>
                  {r.route_code} — {r.route_name}
                </option>
              ))}
            </select>
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
      </div>

      {/* ========================================================================= */}
      {/* 1. FACTORY CUTTING PLAN VIEW (PHOTO MATCH - MILL 02 FORMAT)               */}
      {/* ========================================================================= */}
      {(viewMode === 'factory' || true) && (
        <div className={`space-y-3 ${viewMode === 'factory' ? 'block' : 'hidden print:block'} factory-print-sheet`}>
          <div className="rounded-xl border-2 border-black bg-white p-3 shadow-md print:border-black print:p-2 print:shadow-none">
            {/* Header: Company Title & Document Name (Exact match from photo) */}
            <div className="flex items-center justify-between border-b-2 border-black pb-2">
              <div className="flex items-center gap-3">
                {/* Rashmi Seamless Logo Representation */}
                <div className="border-2 border-black px-2 py-1 text-center font-black">
                  <div className="text-base tracking-tight text-slate-900 leading-none">RASHMI</div>
                  <div className="text-[8px] tracking-widest text-slate-700 font-bold border-t border-black mt-0.5 pt-0.5">
                    SEAMLESS
                  </div>
                </div>
              </div>

              <div className="text-center flex-1 mx-2">
                <h2 className="text-base sm:text-lg font-black uppercase tracking-wide text-black leading-tight">
                  RASHMI GREEN HYDROGEN STEEL PVT. LTD.
                </h2>
                <div className="text-xs font-bold uppercase tracking-wider text-black">
                  (SEAMLESS DIVISION)
                </div>
                <h3 className="text-xs sm:text-sm font-black uppercase tracking-tight text-black mt-0.5">
                  ROUND BAR CUTTING PLAN & HOT MILL DAILY PRODUCTION PLAN {activeSheetMeta.millName.toLowerCase().includes('03') ? 'MILL - 03' : 'MILL - 02'}
                </h3>
              </div>

              <div className="text-right text-[10px] font-mono text-black">
                <div className="font-bold">{activeSheetMeta.millName.toLowerCase().includes('03') ? 'MILL - 03' : 'MILL - 02'}</div>
                <div>DOC: F-PROD-01A</div>
              </div>
            </div>

            {/* Sub-Header Bar: Production Plan-Hot Mill-02 | Month | Plan No | Issue Date */}
            <div className="grid grid-cols-4 border-b border-black text-xs font-bold text-black py-1 px-1 bg-slate-50 print:bg-white text-center">
              <div className="border-r border-black">{activeSheetMeta.millName}</div>
              <div className="border-r border-black">Month: <span className="font-mono">{activeSheetMeta.monthStr}</span></div>
              <div className="border-r border-black">Plan No :- <span className="font-mono">{activeSheetMeta.planNo}</span></div>
              <div>Issue Date: <span className="font-mono">{activeSheetMeta.issueDate}</span></div>
            </div>

            {/* Note Line: This Plan is Started after Plan No. XX */}
            <div className="border-b border-black py-0.5 px-2 text-xs font-bold italic text-black bg-white">
              This Plan is Started after Plan No. {activeSheetMeta.prevPlanNo}
            </div>

            {/* Main Production Plan Table (17 Column Groups - Exact 2-Tier Header) */}
            <div className="overflow-x-auto mt-1">
              <table className="w-full text-left text-[11px] border-collapse border border-black font-sans">
                <thead>
                  {/* Tier 1 Header */}
                  <tr className="bg-slate-100 print:bg-white text-center font-bold text-black border-b border-black text-[10px]">
                    <th rowSpan={2} className="border border-black px-1 py-1 w-6">Sr No.</th>
                    <th rowSpan={2} className="border border-black px-1 py-1 w-10">Catg</th>
                    <th rowSpan={2} className="border border-black px-1.5 py-1">Customer</th>
                    <th rowSpan={2} className="border border-black px-1.5 py-1 whitespace-nowrap">W.O./S.O. No.</th>
                    <th rowSpan={2} className="border border-black px-1 py-1">Spec</th>
                    <th rowSpan={2} className="border border-black px-1 py-1">Grade</th>
                    <th rowSpan={2} className="border border-black px-1 py-1 w-12">IBR/NIBR</th>
                    <th rowSpan={2} className="border border-black px-1.5 py-1 whitespace-nowrap">Rolling mtr</th>
                    
                    {/* Billet Dimensions (3 cols) */}
                    <th colSpan={3} className="border border-black px-1 py-0.5">Billet Dimensions</th>
                    
                    {/* Plan qty (2 cols) */}
                    <th colSpan={2} className="border border-black px-1 py-0.5">Plan qty</th>
                    
                    {/* Piercer Mill (3 cols) */}
                    <th colSpan={3} className="border border-black px-1 py-0.5">Piercer Mill</th>
                    
                    {/* SM (4 cols) */}
                    <th colSpan={4} className="border border-black px-1 py-0.5">SM</th>
                    
                    {/* Thicken Ends (3 cols) */}
                    <th colSpan={3} className="border border-black px-1 py-0.5">Thicken Ends</th>
                    
                    {/* Final Length Reqd (3 cols) */}
                    <th colSpan={3} className="border border-black px-1 py-0.5">Final Length Reqd</th>
                    
                    <th rowSpan={2} className="border border-black px-1 py-1 w-8">Mult</th>
                    
                    {/* Dimension Tolerances (4 cols) */}
                    <th colSpan={4} className="border border-black px-1 py-0.5">Dimension Tolerances</th>
                    
                    <th rowSpan={2} className="border border-black px-1 py-1 whitespace-nowrap">Process Yld %</th>
                  </tr>

                  {/* Tier 2 Header */}
                  <tr className="bg-slate-100 print:bg-white text-center font-bold text-black border-b border-black text-[9px]">
                    {/* Billet Dimensions */}
                    <th className="border border-black px-1 py-0.5 whitespace-nowrap">RM OD (mm)</th>
                    <th className="border border-black px-1 py-0.5 whitespace-nowrap">RM Len Min</th>
                    <th className="border border-black px-1 py-0.5 whitespace-nowrap">RM Len Max</th>
                    
                    {/* Plan qty */}
                    <th className="border border-black px-1 py-0.5">Nos</th>
                    <th className="border border-black px-1 py-0.5">Mton</th>
                    
                    {/* Piercer Mill */}
                    <th className="border border-black px-1 py-0.5">PM OD</th>
                    <th className="border border-black px-1 py-0.5">PM Wthk</th>
                    <th className="border border-black px-1 py-0.5">PM Length</th>
                    
                    {/* SM */}
                    <th className="border border-black px-1 py-0.5">Cust. OD</th>
                    <th className="border border-black px-1 py-0.5">Cust. WT</th>
                    <th className="border border-black px-1 py-0.5">Rolling WT</th>
                    <th className="border border-black px-1 py-0.5">SM Length</th>
                    
                    {/* Thicken Ends */}
                    <th className="border border-black px-1 py-0.5">FE Lg (Mtr)</th>
                    <th className="border border-black px-1 py-0.5">BE Lg (Mtr)</th>
                    <th className="border border-black px-1 py-0.5">Effective Length</th>
                    
                    {/* Final Length Reqd */}
                    <th className="border border-black px-1 py-0.5">E/R</th>
                    <th className="border border-black px-1 py-0.5">Min</th>
                    <th className="border border-black px-1 py-0.5">Max</th>
                    
                    {/* Dimension Tolerances */}
                    <th className="border border-black px-1 py-0.5">OD Min</th>
                    <th className="border border-black px-1 py-0.5">OD Max</th>
                    <th className="border border-black px-1 py-0.5">Thk Min</th>
                    <th className="border border-black px-1 py-0.5">Thk Max</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-black text-black">
                  {loading ? (
                    <tr>
                      <td colSpan={28} className="p-8 text-center text-slate-500 border border-black">
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                        Loading factory cutting plan schedule...
                      </td>
                    </tr>
                  ) : factoryRows.length === 0 ? (
                    <tr>
                      <td colSpan={28} className="p-8 text-center text-slate-500 border border-black">
                        No active cutting plan records found. Create or select a plan above.
                      </td>
                    </tr>
                  ) : (
                    factoryRows.map((row) => (
                      <React.Fragment key={`setup-${row.srNo}-${row.woNo}`}>
                        {/* Optional Multi Header row (like 2-Multi in photo above rows 5 & 6) */}
                        {row.mult.includes('Multi') && (
                          <tr className="bg-slate-50 print:bg-white text-center font-bold text-xs border border-black">
                            <td colSpan={28} className="py-0.5 text-center font-black border border-black">
                              <span className="inline-block px-3 py-0.5 rounded bg-slate-200 border border-black font-mono">
                                {row.mult}
                              </span>
                            </td>
                          </tr>
                        )}

                        {/* Main Master Setup Row */}
                        <tr className="hover:bg-slate-50/60 print:hover:bg-transparent font-medium border-t border-black text-[10px]">
                          {/* 1. Sr No */}
                          <td className="border border-black px-1 py-1 text-center font-bold">{row.srNo}</td>
                          
                          {/* 2. Catg */}
                          <td className="border border-black px-1 py-1 text-center font-semibold">{row.catg}</td>
                          
                          {/* 3. Customer */}
                          <td className="border border-black px-1.5 py-1 font-semibold max-w-[140px] truncate" title={row.customer}>
                            {row.customer}
                          </td>
                          
                          {/* 4. W.O./S.O. No */}
                          <td className="border border-black px-1.5 py-1 font-bold font-mono whitespace-nowrap">
                            {row.woNo}
                          </td>
                          
                          {/* 5. Spec */}
                          <td className="border border-black px-1 py-1 text-center whitespace-nowrap">{row.spec}</td>
                          
                          {/* 6. Grade */}
                          <td className="border border-black px-1 py-1 text-center font-mono whitespace-nowrap">{row.grade}</td>
                          
                          {/* 7. IBR/NIBR */}
                          <td className="border border-black px-1 py-1 text-center font-bold">{row.ibr}</td>
                          
                          {/* 8. Rolling mtr */}
                          <td className="border border-black px-1.5 py-1 text-right font-mono font-black">
                            {fmt(row.rollingMtr, 0)}
                          </td>
                          
                          {/* 9. Billet Dimensions */}
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.rmOd, 2)}</td>
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.rmLenMin, 3)}</td>
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.rmLenMax, 3)}</td>
                          
                          {/* 10. Plan qty */}
                          <td className="border border-black px-1 py-1 text-right font-mono font-bold">{fmt(row.planQtyNos, 0)}</td>
                          <td className="border border-black px-1 py-1 text-right font-mono font-bold">{fmt(row.planQtyMton, 1)}</td>
                          
                          {/* 11. Piercer Mill */}
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.pmOd, 1)}</td>
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.pmWthk, 2)}</td>
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.pmLen, 2)}</td>
                          
                          {/* 12. SM */}
                          <td className="border border-black px-1 py-1 text-right font-mono font-bold">{fmt(row.custOd, 2)}</td>
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.custWt, 2)}</td>
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.rollingWt, 2)}</td>
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.smLen, 2)}</td>
                          
                          {/* 13. Thicken Ends */}
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.feLen, 3)}</td>
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.beLen, 3)}</td>
                          <td className="border border-black px-1 py-1 text-right font-mono font-semibold">{fmt(row.effLen, 2)}</td>
                          
                          {/* 14. Final Length Reqd */}
                          <td className="border border-black px-1 py-1 text-center font-bold">{row.reqLenEr}</td>
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.reqLenMin, 2)}</td>
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.reqLenMax, 2)}</td>
                          
                          {/* 15. Mult */}
                          <td className="border border-black px-1 py-1 text-center font-mono font-bold">{row.mult}</td>
                          
                          {/* 16. Dimension Tolerances */}
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.tolOdMin, 2)}</td>
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.tolOdMax, 2)}</td>
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.tolWtMin, 2)}</td>
                          <td className="border border-black px-1 py-1 text-right font-mono">{fmt(row.tolWtMax, 2)}</td>
                          
                          {/* 17. Process Yld % */}
                          <td className="border border-black px-1.5 py-1 text-right font-mono font-bold">
                            {fmt(row.processYieldPct, 2)}%
                          </td>
                        </tr>

                        {/* Sub-Rows: Exact child order breakdown lines matching the photo */}
                        {row.childSubRows.map((child, cIdx) => (
                          <tr key={`sub-${row.srNo}-${cIdx}`} className="bg-white text-[9.5px] border-b border-black">
                            <td colSpan={28} className="px-3 py-0.5 border border-black font-mono text-black leading-tight">
                              <span className="font-bold">
                                {child.catg}(finish size-{child.finishSize})(Final len - {child.finalLen})(OA-{child.woNo})(Cust.- {child.customer})(Hollow len-{child.hollowLen})(HTC mtr-{fmt(child.htcMtr, 0)})
                              </span>
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer with Document Control & Official Signature Blocks (From photo) */}
            <div className="mt-3 pt-2 border-t-2 border-black flex flex-col sm:flex-row items-end justify-between text-xs text-black break-inside-avoid">
              <div className="text-[10px] font-mono space-y-0.5">
                <div className="font-bold">F-PROD-01A, EFF. Date: 01.04.2023, Rev.02, Rev Dt. 01.04.2024 / PPC</div>
                <div className="text-slate-600">Confidential Shop Floor Copy · Rashmi Green Hydrogen Steel Pvt. Ltd.</div>
              </div>

              {/* Signatures Area */}
              <div className="flex items-center gap-12 my-2 sm:my-0">
                <div className="text-center">
                  <div className="h-8 border-b border-dashed border-black w-28 mb-1"></div>
                  <span className="text-[10px] font-bold block">Prepared by (PPC)</span>
                </div>
                <div className="text-center">
                  <div className="h-8 border-b border-dashed border-black w-32 mb-1"></div>
                  <span className="text-[10px] font-bold block">Checked by (Hot Mill Incharge)</span>
                </div>
              </div>

              <div className="text-[10px] font-mono font-bold">
                Page 1 of 1
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. STANDARD SCHEDULE TABLE VIEW (ORIGINAL SUMMARY & LIST)                 */}
      {/* ========================================================================= */}
      {viewMode === 'standard' && (
        <div className="space-y-4 standard-screen-sheet">
          {/* Summary Metric KPI Badges */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Total Plans Issued
              </span>
              <span className="text-lg font-black text-slate-900 font-mono">{summary.count}</span>
              <span className="text-[10px] text-indigo-600 block">({summary.masterCount} Master Campaigns)</span>
            </div>

            <div className="rounded-xl bg-indigo-50/50 p-3 border-2 border-indigo-200 shadow-2xs">
              <span className="block text-[10px] font-black uppercase tracking-wider text-indigo-900">
                Total Planned Pieces (PCS) ★
              </span>
              <div className="mt-1">
                <span className="inline-block px-2.5 py-0.5 rounded-md text-base sm:text-lg font-black font-mono bg-indigo-100 text-indigo-950 border border-indigo-300">
                  {fmt(summary.totalPcs, 0)} PCS
                </span>
              </div>
              <span className="text-[10px] text-indigo-700 block font-semibold mt-1">
                Billets / Tubes Allocated
              </span>
            </div>

            <div className="rounded-xl bg-emerald-50/50 p-3 border-2 border-emerald-200 shadow-2xs">
              <span className="block text-[10px] font-black uppercase tracking-wider text-emerald-900">
                Total Billet Tonnage (MT) ★
              </span>
              <div className="mt-1">
                <span className="inline-block px-2.5 py-0.5 rounded-md text-base sm:text-lg font-black font-mono bg-emerald-100 text-emerald-950 border border-emerald-300">
                  {fmt(summary.totalMt)} MT
                </span>
              </div>
              <span className="text-[10px] text-emerald-700 block font-semibold mt-1">
                Gross Rolling Campaign Mass
              </span>
            </div>

            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Total Planned Meters
              </span>
              <span className="text-lg font-black text-blue-700 font-mono">{fmt(summary.totalMtr)} MTR</span>
              <span className="text-[10px] text-slate-500 block mt-1">Linear rolling schedule</span>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100/90 font-bold uppercase tracking-wider text-slate-700">
                    <th className="px-3 py-2.5 whitespace-nowrap">Plan No</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Rolling Date</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Work Order #</th>
                    <th className="px-3 py-2.5">Customer & Grade</th>
                    <th className="px-3 py-2.5 whitespace-nowrap font-bold">Mother Hollow Size</th>
                    <th className="px-3 py-2.5 whitespace-nowrap font-bold">Final Size</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Route</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap font-black text-indigo-950 bg-indigo-100/90">
                      PLANNED PCS ★
                    </th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap font-black text-emerald-950 bg-emerald-100/90">
                      TONNAGE (MT) ★
                    </th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">Meters</th>
                    <th className="px-3 py-2.5 text-center whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredPlans.map((p) => {
                    let parsedStatus: any = {};
                    try {
                      parsedStatus = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
                    } catch { }

                    const isMaster = !!parsedStatus?.is_master;
                    const isChild = !!parsedStatus?.is_child;
                    const childOrders: any[] = parsedStatus?.child_work_orders || [];
                    const isExpanded = expandedMasters[p.id];

                    return (
                      <React.Fragment key={p.id}>
                        <tr className={`transition-colors ${isMaster ? 'bg-indigo-50/30' : isChild ? 'bg-slate-50/40' : 'hover:bg-slate-50/50'}`}>
                          <td className="px-3 py-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {p.plan_no}
                            {isMaster && (
                              <span className="ml-1.5 inline-flex items-center rounded-full bg-indigo-100 text-indigo-800 px-1.5 py-0.2 text-[10px] font-bold">
                                <Crown className="h-2.5 w-2.5 mr-0.5" />
                                Master
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                            {p.planned_rolling_date}
                          </td>
                          <td className="px-3 py-2 font-bold text-slate-900 whitespace-nowrap">
                            {p.work_order_no}
                            {isChild && (
                              <span className="block text-[10px] text-teal-700 font-medium">
                                Child of {parsedStatus.master_wo_no || 'Master'}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 max-w-[170px] truncate">
                            <div className="font-semibold text-slate-800">{p.customer_name || 'Standard Stock'}</div>
                            <div className="text-[11px] font-mono text-slate-500">{p.grade}</div>
                          </td>
                          <td className="px-3 py-2 font-mono font-semibold text-slate-800 whitespace-nowrap">
                            {p.mh_od && p.mh_wt ? (
                              <span>
                                {fmt(p.mh_od)} × {fmt(p.mh_wt)} mm
                                <span className="text-[10px] text-slate-500 block">
                                  L: {fmt(p.mh_l1)} - {fmt(p.mh_l2)} m
                                </span>
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">
                            <div className="font-bold text-slate-800">
                              {p.od && p.wt ? `${fmt(p.od)} × ${fmt(p.wt)} mm` : <span className="text-slate-400">—</span>}
                            </div>
                            {(() => {
                              const lenStr = formatFinalSizeLength(p);
                              return lenStr ? <span className="text-[10px] text-slate-500 block">{lenStr}</span> : null;
                            })()}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-semibold text-slate-700">
                              {p.route_code}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono bg-indigo-50/60 border-l border-indigo-200">
                            <span className="inline-block px-2 py-0.5 rounded-md font-black text-xs sm:text-sm text-indigo-950 bg-indigo-100/90 border border-indigo-300">
                              {fmt(p.planned_pcs, 0)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono bg-emerald-50/60 border-r border-emerald-200">
                            <span className="inline-block px-2 py-0.5 rounded-md font-black text-xs sm:text-sm text-emerald-950 bg-emerald-100/90 border border-emerald-300">
                              {fmt(p.planned_mt)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-blue-700">
                            {fmt(p.planned_mtr)}
                          </td>
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setSelectedPlanForSlip(p)}
                                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                              >
                                Issue Slip
                              </button>
                              {isMaster && childOrders.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(p.id)}
                                  className="rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 transition cursor-pointer inline-flex items-center gap-0.5"
                                >
                                  {childOrders.length} Child
                                  {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expandable Child Work Orders for Master Campaign */}
                        {isMaster && isExpanded && childOrders.length > 0 && (
                          <tr className="bg-indigo-50/40">
                            <td colSpan={11} className="px-6 py-3">
                              <div className="rounded-lg border border-indigo-200 bg-white p-3 shadow-2xs">
                                <div className="text-xs font-bold text-indigo-900 mb-2 flex items-center gap-1.5">
                                  <Link2 className="h-3.5 w-3.5 text-indigo-600" />
                                  Linked Child Work Orders in Campaign
                                </div>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-slate-500 font-semibold border-b border-indigo-100">
                                      <th className="py-1 text-left">Child WO #</th>
                                      <th className="py-1 text-left">Customer</th>
                                      <th className="py-1 text-left">Grade</th>
                                      <th className="py-1 text-left">Final Size</th>
                                      <th className="py-1 text-right font-black text-indigo-900">Planned Pcs ★</th>
                                      <th className="py-1 text-right font-black text-emerald-900">Planned MT ★</th>
                                      <th className="py-1 text-right">Planned Mtr</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-indigo-50 font-mono">
                                    {childOrders.map((c: any, idx: number) => (
                                      <tr key={idx} className="hover:bg-indigo-50/30">
                                        <td className="py-1 text-slate-800 font-bold">{c.work_order_no}</td>
                                        <td className="py-1 text-slate-600 font-sans">{c.customer_name || '—'}</td>
                                        <td className="py-1 text-slate-600">{c.grade || p.grade}</td>
                                        <td className="py-1 text-slate-700">
                                          {fmt(c.size_od ?? p.od)} × {fmt(c.size_wt ?? p.wt)} mm
                                        </td>
                                        <td className="py-1 text-right font-black text-indigo-950">
                                          {fmt(c.planned_pcs ?? 0, 0)}
                                        </td>
                                        <td className="py-1 text-right font-black text-emerald-950">
                                          {fmt(c.planned_mt ?? 0)}
                                        </td>
                                        <td className="py-1 text-right font-bold text-slate-700">
                                          {fmt(c.planned_mtr ?? 0)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Individual Plan Issue Slip Modal */}
      {selectedPlanForSlip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 print:hidden">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-bold">
                  HOT ROLLING SLIP
                </span>
                <span className="font-mono font-bold text-slate-900">{selectedPlanForSlip.plan_no}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlanForSlip(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div className="flex items-start justify-between border-b border-slate-200 pb-3">
                <div>
                  <h4 className="font-black text-sm uppercase text-slate-900">HOT ROLLING MILL ISSUE SLIP</h4>
                  <div className="text-slate-500">Rashmi Green Hydrogen Steel Pvt. Ltd. · Seamless Division</div>
                </div>
                <div className="text-right font-mono">
                  <div className="font-bold text-slate-900">PLAN: {selectedPlanForSlip.plan_no}</div>
                  <div className="text-slate-500">Date: {selectedPlanForSlip.planned_rolling_date}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border border-slate-200 rounded-lg p-3 bg-slate-50">
                <div>
                  <span className="text-slate-500 block">Work Order Number:</span>
                  <span className="font-bold text-slate-900 text-sm font-mono">{selectedPlanForSlip.work_order_no}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Customer Name:</span>
                  <span className="font-bold text-slate-800">{selectedPlanForSlip.customer_name || 'Standard Stock'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Material Grade / Spec:</span>
                  <span className="font-bold text-slate-900 font-mono">{selectedPlanForSlip.grade || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Target Process Route:</span>
                  <span className="font-bold text-slate-900 font-mono">{selectedPlanForSlip.route_code}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 rounded-lg border border-slate-200 p-3 bg-slate-50 font-mono text-center">
                <div className="rounded-md bg-indigo-50 border border-indigo-200 p-2">
                  <span className="text-indigo-900 text-[10px] block uppercase font-bold">Planned Pcs ★</span>
                  <span className="text-lg font-black text-indigo-950">{fmt(selectedPlanForSlip.planned_pcs, 0)} PCS</span>
                </div>
                <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2">
                  <span className="text-emerald-900 text-[10px] block uppercase font-bold">Planned Weight (MT) ★</span>
                  <span className="text-lg font-black text-emerald-950">{fmt(selectedPlanForSlip.planned_mt)} MT</span>
                </div>
                <div className="rounded-md bg-white border border-slate-200 p-2">
                  <span className="text-slate-500 text-[10px] block uppercase font-bold">Planned Length</span>
                  <span className="text-base font-black text-blue-700">{fmt(selectedPlanForSlip.planned_mtr)} M</span>
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setSelectedPlanForSlip(null)}
                className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-500 transition cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5" />
                Print Slip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
