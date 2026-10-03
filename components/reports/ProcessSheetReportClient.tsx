// components/reports/ProcessSheetReportClient.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Printer,
  Search,
  CheckCircle2,
  FileSpreadsheet,
  AlertCircle,
  Layers,
  FileText,
  Sliders,
  Award,
  PackageCheck,
  Eye,
  Edit3,
  RefreshCw,
  Save,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

import type { SpecMasterRecord } from '@/lib/specMasterDefaults';
import { DEFAULT_SPEC_MASTER_RECORDS } from '@/lib/specMasterDefaults';
import {
  autoPopulateProcessSheet,
  type ProcessSheetFormData,
} from '@/lib/metallurgy/processSheetSpecHelper';

import ProcessSheetOrderDetails from './process-sheet/ProcessSheetOrderDetails';
import ProcessSheetHotMillSection from './process-sheet/ProcessSheetHotMillSection';
import ProcessSheetDimensionsSection from './process-sheet/ProcessSheetDimensionsSection';
import ProcessSheetMetallurgySection from './process-sheet/ProcessSheetMetallurgySection';
import ProcessSheetTestingSection from './process-sheet/ProcessSheetTestingSection';
import ProcessSheetFinishingSection from './process-sheet/ProcessSheetFinishingSection';
import ProcessSheetPrintDocument from './process-sheet/ProcessSheetPrintDocument';
import type { ProcessSheetFormActions } from './process-sheet/types';

interface RollingPlanRecord {
  id: string;
  plan_no: string;
  work_order_id: string;
  planned_rolling_date: string;
  planned_qty: number;
  process_route_id: string | null;
  target_mother_size: string | null;
  multiple: number;
  status: any;
  mh_od: number | null;
  mh_wt: number | null;
  mh_l1: number | null;
  mh_l2: number | null;
  pass_required: number | null;
  work_order_no: string;
  customer_name: string | null;
  grade: string | null;
  specification: string | null;
  size_od: number | null;
  size_wt: number | null;
  l1: number | null;
  l2: number | null;
  ordered_qty: number | null;
  ordered_qty_pcs: number | null;
  ordered_qty_mtr: number | null;
  route_code: string;
  route_name: string;
  po_no?: string | null;
  po_date?: string | null;
  material_code?: string | null;
  destination?: string | null;
  is_diversion?: boolean;
  display_label?: string;
}

const EMPTY_FORM_DATA: ProcessSheetFormData = {
  sheetNo: '',
  revNo: '0',
  orderType: 'HFS',
  routeType: 'HFS',
  sheetDate: '',
  customer: '',
  destination: '',
  poNo: '',
  poDate: '',
  woNo: '',
  woDate: '',
  orderQty: '',
  deliveryDate: '',
  materialCode: '',
  heatNo: '',
  steelGrade: '',
  materialSpec: '',
  inspection: 'IBR',
  custOd: '',
  custWt: '',
  processWt: '',
  isMinWall: false,
  finalOrderLen1: '',
  finalOrderLen2: '',
  finalLength: '',
  finalLenTol: '',
  finalPipeWeight: '',
  bundleQtyPcs: '',
  bundleWeightMt: '',
  motherHollowOd: '',
  motherHollowWt: '',
  rollingWt: '',
  motherHollowKgMtr: '',
  smLength: '',
  hfsFinalLength: '',
  piercerOd: '',
  piercerWt: '',
  piercerShellLen: '',
  shellWeight: '',
  billetDia: '',
  billetSectWt: '',
  billetLength: '',
  totalWeightMt: '',
  multiple: '1',
  planQtyMtrs: '',
  planQtyNos: '',
  planQtyMt: '',
  finalTolOdMin: '',
  finalTolOdMax: '',
  finalTolWtMin: '',
  finalTolWtMax: '',
  whfTemp: '',
  inductionTemp: '',
  sizingOutletTemp: '',
  htCycle: '',
  htCondition: '',
  holdingTime: '',
  ystMin: '',
  ystMax: '',
  utsMin: '',
  utsMax: '',
  elongationMin: '',
  hardness: '',
  straightness: '',
  ndt: '',
  hydroPressurePsi: '',
  coating: '',
  endCondition: '',
  bundling: '',
  endCap: '',
  pipeColorCode: '',
  rmColorCode: '',
  markingType: 'single',
  markingText: '',
  specialInstructions: '',
};

type FormTab = 'all' | 'order' | 'hotmill' | 'dimensions' | 'metallurgy' | 'testing' | 'finishing';

export default function ProcessSheetReportClient() {
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [plans, setPlans] = useState<RollingPlanRecord[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'form' | 'preview'>('form');
  const [formTab, setFormTab] = useState<FormTab>('all');
  const [specMasterList, setSpecMasterList] = useState<SpecMasterRecord[]>(DEFAULT_SPEC_MASTER_RECORDS);

  const [formData, setFormData] = useState<ProcessSheetFormData>(EMPTY_FORM_DATA);

  // Form actions
  const actions: ProcessSheetFormActions = useMemo(
    () => ({
      updateField: (field, value) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
      },
      updateFields: (updates) => {
        setFormData((prev) => ({ ...prev, ...updates }));
      },
    }),
    []
  );

  // 1. Load active Spec Master records from Supabase
  useEffect(() => {
    (async () => {
      try {
        const s = createClient();
        const { data, error } = await s
          .from('material_spec_master')
          .select('*')
          .eq('is_active', true)
          .order('spec_full', { ascending: true });
        if (!error && data && data.length > 0) {
          setSpecMasterList(data as SpecMasterRecord[]);
        }
      } catch (e) {
        console.warn('Using default spec master records due to fetch warning:', e);
      }
    })();
  }, []);

  // Helper to load or populate a plan's process sheet
  const loadPlanSheet = useCallback(
    async (plan: RollingPlanRecord, currentSpecs: SpecMasterRecord[]) => {
      try {
        const s = createClient();
        const yr2 = String(new Date().getFullYear()).slice(-2);
        const cleanWo = String(plan.work_order_no || '').trim();
        const effectiveWoNo = plan.is_diversion ? `${cleanWo}-Div` : cleanWo;
        const expectedSheetNo = `${yr2}D${effectiveWoNo}`;

        // Try to fetch existing saved sheet
        const { data: savedSheet } = await s
          .from('process_sheets')
          .select('sheet_data')
          .eq('sheet_no', expectedSheetNo)
          .maybeSingle();

        if (savedSheet && savedSheet.sheet_data) {
          setFormData(savedSheet.sheet_data as ProcessSheetFormData);
          return;
        }

        // Fallback by work order no
        if (cleanWo) {
          const { data: savedByWo } = await s
            .from('process_sheets')
            .select('sheet_data')
            .eq('work_order_no', cleanWo)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (savedByWo && savedByWo.sheet_data) {
            setFormData(savedByWo.sheet_data as ProcessSheetFormData);
            return;
          }
        }

        // Auto-populate fresh data
        const autoData = autoPopulateProcessSheet(plan, currentSpecs);
        setFormData(autoData);
      } catch (err) {
        console.error('Error checking saved process sheet:', err);
        const autoData = autoPopulateProcessSheet(plan, currentSpecs);
        setFormData(autoData);
      }
    },
    []
  );

  // 2. Load Work Orders & Rolling Plans
  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const s = createClient();

      const [woRes, rPlanRes, routesRes] = await Promise.all([
        s
          .from('work_orders')
          .select(
            'id,work_order_no,customer_name,grade,specification,size_od,size_wt,l1,l2,ordered_qty,ordered_qty_pcs,ordered_qty_mtr,status,target_date,destination,po_no,po_date,material_code'
          )
          .order('created_at', { ascending: false })
          .limit(1000),
        s
          .from('rolling_plans')
          .select(
            'id,plan_no,work_order_id,planned_rolling_date,planned_qty,process_route_id,target_mother_size,multiple,status,mh_od,mh_wt,mh_l1,mh_l2,pass_required'
          )
          .order('created_at', { ascending: false })
          .limit(1000),
        s.from('process_routes').select('id,route_code,route_name'),
      ]);

      if (woRes.error) {
        console.error('Failed to load work_orders:', woRes.error);
        toast.error('Failed to load work orders: ' + woRes.error.message);
      }
      if (rPlanRes.error) {
        console.error('Failed to load rolling_plans:', rPlanRes.error);
      }

      const wos = woRes.data || [];
      const rPlans = rPlanRes.data || [];
      const routes = routesRes.data || [];

      const routeMap = new Map<string, any>(routes.map((r: any) => [r.id, r]));

      // Group rolling plans by work order
      const rpByWo = new Map<string, any[]>();
      rPlans.forEach((rp: any) => {
        if (!rpByWo.has(rp.work_order_id)) rpByWo.set(rp.work_order_id, []);
        rpByWo.get(rp.work_order_id)!.push(rp);
      });

      const mappedList: RollingPlanRecord[] = [];

      wos.forEach((wo: any) => {
        const associatedRps = rpByWo.get(wo.id) || [];
        const finalOd = Number(wo.size_od) || 0;
        const finalWt = Number(wo.size_wt) || 0;
        const finalL1 = Number(wo.l1) || 0;
        const finalL2 = Number(wo.l2) || 0;

        if (associatedRps.length > 0) {
          associatedRps.forEach((r: any) => {
            const route = routeMap.get(r.process_route_id) || {};
            let parsedSt: any = {};
            try {
              parsedSt = typeof r.status === 'string' ? JSON.parse(r.status) : r.status || {};
            } catch {}

            mappedList.push({
              id: `rp-${r.id}-wo-${wo.id}`,
              plan_no: parsedSt.master_plan_no || r.plan_no || 'Plan',
              work_order_id: wo.id,
              planned_rolling_date:
                r.planned_rolling_date || wo.target_date || new Date().toISOString().split('T')[0],
              planned_qty: Number(r.planned_qty ?? wo.ordered_qty_mtr ?? wo.ordered_qty ?? 0),
              process_route_id: r.process_route_id,
              target_mother_size: r.target_mother_size || null,
              multiple: Number(r.multiple ?? 1),
              status: parsedSt,
              mh_od: Number(r.mh_od ?? finalOd) || null,
              mh_wt: Number(r.mh_wt ?? finalWt) || null,
              mh_l1: Number(r.mh_l1 ?? finalL1) || null,
              mh_l2: Number(r.mh_l2 ?? finalL2) || null,
              pass_required: Number(r.pass_required ?? 1),
              work_order_no: wo.work_order_no || '',
              customer_name: wo.customer_name || '',
              grade: parsedSt.grade || parsedSt.steel_grade || wo.grade || '',
              specification:
                parsedSt.spec || parsedSt.specification || wo.specification || parsedSt.grade || wo.grade || '',
              size_od: finalOd || null,
              size_wt: finalWt || null,
              l1: finalL1 || null,
              l2: finalL2 || null,
              ordered_qty: Number(wo.ordered_qty || 0),
              ordered_qty_pcs: Number(wo.ordered_qty_pcs || 0),
              ordered_qty_mtr: Number(wo.ordered_qty_mtr || 0),
              route_code: route.route_code || 'HFS',
              route_name: route.route_name || route.route_code || 'HFS',
              po_no: wo.po_no || parsedSt.po_no || null,
              po_date: wo.po_date || parsedSt.po_date || null,
              material_code: wo.material_code || parsedSt.material_code || null,
              destination: wo.destination || parsedSt.destination || null,
              is_diversion: false,
              display_label: wo.work_order_no || '',
            });
          });
        } else {
          mappedList.push({
            id: `wo-${wo.id}`,
            plan_no: 'Work Order',
            work_order_id: wo.id,
            planned_rolling_date: wo.target_date || new Date().toISOString().split('T')[0],
            planned_qty: Number(wo.ordered_qty_mtr || wo.ordered_qty || 0),
            process_route_id: null,
            target_mother_size: null,
            multiple: 1,
            status: { work_order_status: wo.status },
            mh_od: finalOd || null,
            mh_wt: finalWt || null,
            mh_l1: finalL1 || null,
            mh_l2: finalL2 || null,
            pass_required: 1,
            work_order_no: wo.work_order_no || '',
            customer_name: wo.customer_name || '',
            grade: wo.grade || '',
            specification: wo.specification || wo.grade || '',
            size_od: finalOd || null,
            size_wt: finalWt || null,
            l1: finalL1 || null,
            l2: finalL2 || null,
            ordered_qty: Number(wo.ordered_qty || 0),
            ordered_qty_pcs: Number(wo.ordered_qty_pcs || 0),
            ordered_qty_mtr: Number(wo.ordered_qty_mtr || 0),
            route_code: 'HFS',
            route_name: 'HFS',
            po_no: wo.po_no || null,
            po_date: wo.po_date || null,
            material_code: wo.material_code || null,
            destination: wo.destination || null,
            is_diversion: false,
            display_label: wo.work_order_no || '',
          });
        }
      });

      // Sort by work order number descending
      mappedList.sort((a, b) => {
        const woA = String(a.work_order_no || '');
        const woB = String(b.work_order_no || '');
        const numA = parseInt(woA.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(woB.replace(/\D/g, ''), 10) || 0;
        if (numA !== numB) return numB - numA;
        return woB.localeCompare(woA);
      });

      setPlans(mappedList);

      if (mappedList.length > 0) {
        setSelectedPlanId(mappedList[0].id);
        await loadPlanSheet(mappedList[0], specMasterList);
      }
    } catch (err: any) {
      console.error('Error loading work orders for process sheet:', err);
      toast.error('Failed to load work orders.');
    } finally {
      setLoading(false);
    }
  }, [specMasterList, loadPlanSheet]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  // Handle plan selection
  const handleSelectPlan = async (planId: string) => {
    setSelectedPlanId(planId);
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;

    await loadPlanSheet(plan, specMasterList);
    toast.success(`Loaded Process Sheet for WO ${plan.work_order_no}`);
  };

  // Filter plans based on search input
  const filteredPlans = useMemo(() => {
    if (!searchQuery.trim()) return plans;
    const q = searchQuery.toLowerCase().trim();
    return plans.filter(
      (p) =>
        p.work_order_no.toLowerCase().includes(q) ||
        (p.customer_name && p.customer_name.toLowerCase().includes(q)) ||
        (p.grade && p.grade.toLowerCase().includes(q)) ||
        (p.specification && p.specification.toLowerCase().includes(q))
    );
  }, [plans, searchQuery]);

  // Save / Update process sheet with automatic revision incrementing
  const handleSaveProcessSheet = async () => {
    if (!formData.sheetNo || !formData.woNo) {
      toast.error('Sheet No and Work Order No are required to save.');
      return;
    }

    setIsSaving(true);
    try {
      const s = createClient();

      // Check if this sheet was previously saved in the database
      const { data: existing } = await s
        .from('process_sheets')
        .select('id, sheet_no, sheet_data')
        .eq('sheet_no', formData.sheetNo)
        .maybeSingle();

      let nextRev = '0';
      if (existing) {
        // Existing sheet edited -> increment revision number
        const currentRevNum = parseInt(String(formData.revNo || '0').replace(/\D/g, ''), 10) || 0;
        nextRev = String(currentRevNum + 1);
      } else {
        // Fresh initial save -> starts with 0
        nextRev = formData.revNo || '0';
      }

      const updatedFormData: ProcessSheetFormData = {
        ...formData,
        revNo: nextRev,
      };

      const { error } = await s.from('process_sheets').upsert(
        {
          plan_id: selectedPlanId || `wo-${formData.woNo}`,
          work_order_no: formData.woNo,
          sheet_no: formData.sheetNo,
          sheet_data: updatedFormData,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'sheet_no' }
      );

      if (error) {
        console.error('Failed to save process sheet:', error);
        toast.error('Failed to save process sheet: ' + error.message);
        return;
      }

      setFormData(updatedFormData);
      toast.success(
        existing
          ? `Process Sheet updated successfully (Saved as REV ${nextRev})`
          : `Process Sheet saved successfully (Initial REV 0)`
      );
    } catch (err: any) {
      console.error('Error saving process sheet:', err);
      toast.error('Failed to save process sheet.');
    } finally {
      setIsSaving(false);
    }
  };

  // Apply spec master record manually
  const handleApplySpecMaster = (spec: SpecMasterRecord) => {
    actions.updateFields({
      materialSpec: spec.spec_full || spec.spec_key,
      steelGrade: spec.steel_grade || formData.steelGrade,
      isMinWall: Boolean(spec.is_min_wall),
      ystMin: spec.smys_mpa ? String(spec.smys_mpa) : formData.ystMin,
      utsMin: spec.uts_mpa ? String(spec.uts_mpa) : formData.utsMin,
      elongationMin: spec.elongation_pct ? String(spec.elongation_pct) : formData.elongationMin,
      hardness: spec.hardness || formData.hardness,
      straightness: spec.straightness || formData.straightness,
      whfTemp: spec.whf_temp || formData.whfTemp,
      inductionTemp: spec.induction_temp || formData.inductionTemp,
      sizingOutletTemp: spec.sizing_outlet_temp || formData.sizingOutletTemp,
      htCycle: spec.ht_cycle || formData.htCycle,
      htCondition: spec.ht_condition || formData.htCondition,
      holdingTime: spec.holding_time_sec ? `${spec.holding_time_sec} SEC` : formData.holdingTime,
      ndt: spec.ndt || formData.ndt,
      coating: spec.coating || formData.coating,
      endCondition: spec.end_condition || formData.endCondition,
      bundling: spec.bundling || formData.bundling,
      endCap: spec.end_cap || formData.endCap,
      pipeColorCode: spec.color_spec || formData.pipeColorCode,
      rmColorCode: spec.rm_color || formData.rmColorCode,
    });
    toast.success(`Applied spec: ${spec.spec_full || spec.spec_key}`);
  };

  return (
    <div className="w-full space-y-4">
      {/* Top Header Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs print:hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-blue-900 text-white rounded">
                Format F-PROD-11
              </span>
              <h1 className="text-lg font-black text-slate-900 tracking-tight">
                Process Sheet (Seamless Pipe Mill)
              </h1>
              <span className="px-2 py-0.5 text-[11px] font-mono font-bold bg-slate-100 text-slate-700 rounded border border-slate-300">
                REV {formData.revNo || '0'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Production routing parameters, metallurgical specifications, and Barlow test pressure.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Save Button */}
            <button
              type="button"
              onClick={handleSaveProcessSheet}
              disabled={isSaving || loading}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg transition-colors shadow-xs cursor-pointer"
            >
              {isSaving ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{isSaving ? 'Saving...' : 'Save Process Sheet'}</span>
            </button>

            {/* View Mode Toggle */}
            <div className="inline-flex rounded-lg border border-slate-300 p-0.5 bg-slate-100 text-xs font-bold shadow-xs">
              <button
                type="button"
                onClick={() => setViewMode('form')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                  viewMode === 'form' ? 'bg-white text-blue-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Form Entry</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                  viewMode === 'preview' ? 'bg-white text-blue-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Print Preview</span>
              </button>
            </div>

            {/* Print Button */}
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print F-PROD-11</span>
            </button>
          </div>
        </div>

        {/* Plan / Work Order Selection Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 pt-3 border-t border-slate-100">
          <div className="md:col-span-1 relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search WO No, Customer, Grade..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="md:col-span-2">
            <select
              value={selectedPlanId}
              onChange={(e) => handleSelectPlan(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-1.5 text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs cursor-pointer"
            >
              {filteredPlans.length === 0 ? (
                <option value="">No matching work orders found</option>
              ) : (
                filteredPlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.work_order_no} · {p.customer_name || 'Generic'} · {p.size_od}×{p.size_wt} mm ·{' '}
                    {p.grade || p.specification} · Route: {p.route_code} ({p.ordered_qty_mtr || p.planned_qty} M)
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Tab Filters (in form mode) */}
        {viewMode === 'form' && (
          <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-slate-100">
            {[
              { id: 'all', label: 'All Sections' },
              { id: 'order', label: '1. Order Details' },
              { id: 'hotmill', label: '2. Hot Mill & Piercing' },
              { id: 'dimensions', label: '3. Pipe Dimensions' },
              { id: 'metallurgy', label: '4. Metallurgy & Mechanical' },
              { id: 'testing', label: '5. Testing & Temperatures' },
              { id: 'finishing', label: '6. Marking & Dispatch' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFormTab(tab.id as FormTab)}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  formTab === tab.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex h-64 items-center justify-center bg-white border border-slate-200 rounded-xl p-8 text-xs font-bold text-slate-500 gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
          <span>Loading Process Sheet parameters...</span>
        </div>
      ) : viewMode === 'preview' ? (
        <ProcessSheetPrintDocument data={formData} />
      ) : (
        <div className="space-y-5">
          {(formTab === 'all' || formTab === 'order') && (
            <ProcessSheetOrderDetails data={formData} actions={actions} />
          )}

          {(formTab === 'all' || formTab === 'hotmill') && (
            <ProcessSheetHotMillSection data={formData} actions={actions} />
          )}

          {(formTab === 'all' || formTab === 'dimensions') && (
            <ProcessSheetDimensionsSection data={formData} actions={actions} />
          )}

          {(formTab === 'all' || formTab === 'metallurgy') && (
            <ProcessSheetMetallurgySection
              data={formData}
              actions={actions}
              specMasterList={specMasterList}
              onApplySpecMaster={handleApplySpecMaster}
            />
          )}

          {(formTab === 'all' || formTab === 'testing') && (
            <ProcessSheetTestingSection data={formData} actions={actions} />
          )}

          {(formTab === 'all' || formTab === 'finishing') && (
            <ProcessSheetFinishingSection data={formData} actions={actions} />
          )}
        </div>
      )}
    </div>
  );
}
