'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUserSession } from '@/contexts/UserSessionContext';
import { isPpcOrAdminUser } from '@/lib/permissions';
import { calculatePipeWeightMt } from '@/lib/productionUtils';
import type { StockPlacementType, StockGenerationReason } from '@/types';
import {
  PackagePlus,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Layers,
  FileSpreadsheet,
  Info,
  Scale,
  Hash,
  Ruler,
  Clock,
  Search,
  Check,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';

interface StockGenerationFormClientProps {
  workOrders: any[];
  processStages: any[];
  routeStages: any[];
}

const STOCK_REASONS: StockGenerationReason[] = [
  'Opening Balance Induction',
  'Physical Stock Audit',
  'External Yard / Buffer Inbound',
  'Salvaged Stock Conversion',
  'Customer Return / Re-induction',
  'Other',
];

export default function StockGenerationFormClient({
  workOrders,
  processStages,
  routeStages,
}: StockGenerationFormClientProps) {
  const router = useRouter();
  const { user, profile, group } = useUserSession();
  const isAuthorized = isPpcOrAdminUser(profile, group);

  // Form State
  const [searchWo, setSearchWo] = useState('');
  const [isWoDropdownOpen, setIsWoDropdownOpen] = useState(false);
  const [selectedWoId, setSelectedWoId] = useState<string>('');
  const [selectedStageId, setSelectedStageId] = useState<string>('');
  const [stockType, setStockType] = useState<StockPlacementType>('INCOMING_QUEUE');
  const [pcs, setPcs] = useState<string>('');
  const [meters, setMeters] = useState<string>('');
  const [manualMeters, setManualMeters] = useState(false);
  const [weightMt, setWeightMt] = useState<string>('');
  const [reason, setReason] = useState<StockGenerationReason>('Opening Balance Induction');
  const [heatNo, setHeatNo] = useState('');
  const [lotNo, setLotNo] = useState('');
  const [remarks, setRemarks] = useState('');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Selected work order
  const selectedWo = useMemo(() => {
    return workOrders.find((w) => w.id === selectedWoId) || null;
  }, [workOrders, selectedWoId]);

  // Filtered work orders for dropdown
  const filteredWorkOrders = useMemo(() => {
    if (!searchWo.trim()) return workOrders.slice(0, 50);
    const q = searchWo.trim().toLowerCase();
    return workOrders
      .filter((w) => {
        const woNo = String(w.work_order_no || '').toLowerCase();
        const cust = String(w.customer_name || '').toLowerCase();
        const grade = String(w.grade || '').toLowerCase();
        const size = `${w.size_od || ''}x${w.size_wt || ''}`.toLowerCase();
        return woNo.includes(q) || cust.includes(q) || grade.includes(q) || size.includes(q);
      })
      .slice(0, 50);
  }, [workOrders, searchWo]);

  // Stages available for the selected work order's route
  const availableStages = useMemo(() => {
    if (!selectedWo || !selectedWo.route_id) return processStages;
    const stagesInRoute = routeStages
      .filter((rs) => rs.route_id === selectedWo.route_id)
      .map((rs) => rs.stage_id);

    if (stagesInRoute.length === 0) return processStages;

    return processStages
      .filter((s) => stagesInRoute.includes(s.id))
      .sort((a, b) => {
        const seqA = routeStages.find((rs) => rs.stage_id === a.id)?.sequence_no || 0;
        const seqB = routeStages.find((rs) => rs.stage_id === b.id)?.sequence_no || 0;
        return seqA - seqB;
      });
  }, [selectedWo, processStages, routeStages]);

  // Set default stage when WO changes
  useEffect(() => {
    if (availableStages.length > 0 && (!selectedStageId || !availableStages.some((s) => s.id === selectedStageId))) {
      setSelectedStageId(availableStages[0].id);
    }
  }, [availableStages, selectedStageId]);

  // Selected stage object
  const selectedStage = useMemo(() => {
    return processStages.find((s) => s.id === selectedStageId) || null;
  }, [processStages, selectedStageId]);

  // Determine if stage is upstream of Band Saw (Draw, HT, HTC) -> Mother Pipes vs Cut Pieces
  const isUpstreamMotherPipe = useMemo(() => {
    if (!selectedStage) return false;
    const code = (selectedStage.stage_code || '').toUpperCase();
    return ['HOT_ROLLING', 'ROLLING', 'HTC', 'HOLLOW_HEAT_TREATMENT', 'DRAW', 'IP_CUTTING', 'PILGER', 'HEAT_TREATMENT'].includes(code);
  }, [selectedStage]);

  // Average length of pipe for the work order
  const avgPipeLength = useMemo(() => {
    if (!selectedWo) return 6.0;
    const l1 = Number(selectedWo.l1 || 0);
    const l2 = Number(selectedWo.l2 || 0);
    if (l1 > 0 && l2 > 0) return (l1 + l2) / 2;
    if (l1 > 0) return l1;
    return 6.0;
  }, [selectedWo]);

  // Auto-calculate meters when pieces change (unless user manually edited meters)
  const handlePcsChange = (val: string) => {
    setPcs(val);
    const numPcs = Number(val);
    if (!manualMeters && numPcs > 0) {
      const calcMtr = Number((numPcs * avgPipeLength).toFixed(2));
      setMeters(String(calcMtr));
      updateWeight(numPcs, calcMtr);
    } else {
      updateWeight(numPcs, Number(meters || 0));
    }
  };

  const handleMetersChange = (val: string) => {
    setMeters(val);
    setManualMeters(true);
    updateWeight(Number(pcs || 0), Number(val));
  };

  const updateWeight = (p: number, m: number) => {
    if (!selectedWo || m <= 0) {
      setWeightMt('');
      return;
    }
    const od = Number(selectedWo.size_od || 0);
    const wt = Number(selectedWo.size_wt || 0);
    if (od > 0 && wt > 0) {
      const calcMt = calculatePipeWeightMt(od, wt, m);
      setWeightMt(calcMt > 0 ? String(calcMt) : '');
    }
  };

  const handleSubmit = async () => {
    if (!isAuthorized) {
      toast.error('Unauthorized', { description: 'Only PPC and Admin users can generate stock.' });
      return;
    }

    if (!selectedWoId || !selectedStageId) {
      toast.error('Validation Error', { description: 'Please select both a Work Order and a Stage.' });
      return;
    }

    const numPcs = Number(pcs);
    const numMtr = Number(meters);
    if (!numPcs || numPcs <= 0 || !numMtr || numMtr <= 0) {
      toast.error('Validation Error', { description: 'Pieces and meters must be positive numbers.' });
      return;
    }

    setShowConfirmModal(true);
  };

  const confirmAndSave = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/stock-generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_order_id: selectedWoId,
          stage_id: selectedStageId,
          stage_code: selectedStage?.stage_code,
          stock_type: stockType,
          pcs: Number(pcs),
          meters: Number(meters),
          weight_mt: Number(weightMt || 0),
          reason,
          heat_no: heatNo.trim() || null,
          lot_no: lotNo.trim() || null,
          remarks: remarks.trim() || null,
          user_id: user?.id || profile?.id,
          user_name: profile?.name || user?.email || 'PPC Planner',
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Failed to generate stock');
      }

      toast.success('Stock Successfully Generated', {
        description: `Inducted ${pcs} pieces (${meters}m / ${weightMt} MT) into ${selectedStage?.stage_name}.`,
      });

      // Reset form
      setPcs('');
      setMeters('');
      setWeightMt('');
      setManualMeters(false);
      setHeatNo('');
      setLotNo('');
      setRemarks('');
      setShowConfirmModal(false);

      // Offer quick navigation to report
      router.refresh();
    } catch (err: any) {
      console.error('[StockGenerationForm] Submission failed:', err);
      toast.error('Stock Generation Failed', { description: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-lg">
              <PackagePlus className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                PPC Stock Generation Console
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Authorized stock induction into work order stage queues and stage outputs
              </p>
            </div>
          </div>
        </div>

        <Link
          href="/reports/stock-generation"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-2xs transition-colors"
        >
          <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span>View Stock Generation Report</span>
        </Link>
      </div>

      {/* Role Restriction Banner if non-PPC */}
      {!isAuthorized && (
        <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              PPC Administrator Access Required
            </h2>
            <p className="text-xs text-amber-800 dark:text-amber-300/90 mt-0.5">
              Stock generation directly impacts active mill stage queues and WIP balances. Only authorized PPC Planners and System Administrators can execute stock inductions. View-only mode active.
            </p>
          </div>
        </div>
      )}

      {/* Main Induction Form */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="p-5 sm:p-6 space-y-6">
          {/* Section 1: Target Work Order & Stage */}
          <div>
            <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
              1. Work Order & Target Processing Stage
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Work Order Searchable Selector */}
              <div className="relative">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Select Work Order <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={selectedWo ? `${selectedWo.work_order_no} — ${selectedWo.customer_name || 'Generic'} (${selectedWo.size_od}×${selectedWo.size_wt})` : searchWo}
                    onChange={(e) => {
                      setSearchWo(e.target.value);
                      setSelectedWoId('');
                      setIsWoDropdownOpen(true);
                    }}
                    onFocus={() => setIsWoDropdownOpen(true)}
                    placeholder="Search WO No, Customer, Size, or Grade..."
                    disabled={!isAuthorized}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none pr-9"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                </div>

                {/* Dropdown Menu */}
                {isWoDropdownOpen && isAuthorized && (
                  <div className="absolute z-30 mt-1 w-full max-h-60 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg">
                    {filteredWorkOrders.length === 0 ? (
                      <div className="p-3 text-xs text-slate-500 text-center">No active work orders found.</div>
                    ) : (
                      filteredWorkOrders.map((w) => (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => {
                            setSelectedWoId(w.id);
                            setSearchWo(w.work_order_no);
                            setIsWoDropdownOpen(false);
                            // recalculate weight if meters present
                            if (meters) updateWeight(Number(pcs || 0), Number(meters));
                          }}
                          className={`w-full text-left px-3.5 py-2.5 text-xs hover:bg-blue-50 dark:hover:bg-slate-700/60 border-b border-slate-100 dark:border-slate-700/40 flex items-center justify-between ${
                            selectedWoId === w.id ? 'bg-blue-50 dark:bg-slate-700/80 font-semibold' : ''
                          }`}
                        >
                          <div>
                            <span className="font-bold text-slate-900 dark:text-slate-100">{w.work_order_no}</span>
                            <span className="text-slate-500 dark:text-slate-400 ml-2">({w.customer_name || 'Generic'})</span>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {w.size_od} × {w.size_wt} mm | Grade: {w.grade || '—'}
                            </div>
                          </div>
                          {selectedWoId === w.id && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Stage Selector */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Target Stage in Route <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedStageId}
                  onChange={(e) => setSelectedStageId(e.target.value)}
                  disabled={!isAuthorized || !selectedWoId}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {availableStages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.stage_name} ({s.stage_code})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  {selectedWo ? 'Showing stages configured in this work order\'s production route.' : 'Select a work order first.'}
                </p>
              </div>
            </div>

            {/* Selected Work Order Specs Card */}
            {selectedWo && (
              <div className="mt-3.5 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Customer</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedWo.customer_name || 'Generic'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Dimensions</span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{selectedWo.size_od} × {selectedWo.size_wt} mm</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Grade</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedWo.grade || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Std Length</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">{avgPipeLength.toFixed(2)} m</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Target Qty</span>
                  <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">{selectedWo.ordered_qty_mt || 0} MT</span>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Stock Placement Mode */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
              2. Stock Placement Mode
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Option 1: Incoming Queue */}
              <div
                onClick={() => isAuthorized && setStockType('INCOMING_QUEUE')}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  stockType === 'INCOMING_QUEUE'
                    ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-500'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                    Incoming Queue (Waiting for Stage)
                  </div>
                  {stockType === 'INCOMING_QUEUE' && <CheckCircle2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                  Adds directly to <strong className="text-slate-800 dark:text-slate-200">{selectedStage?.stage_name || 'Stage'}</strong> incoming queue. Machine operators at this stage will see these pipes ready for processing.
                </p>
              </div>

              {/* Option 2: Stage Output */}
              <div
                onClick={() => isAuthorized && setStockType('STAGE_OUTPUT')}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  stockType === 'STAGE_OUTPUT'
                    ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-500'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                    Stage Output (Already Completed)
                  </div>
                  {stockType === 'STAGE_OUTPUT' && <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                  Counts as completed output from <strong className="text-slate-800 dark:text-slate-200">{selectedStage?.stage_name || 'Stage'}</strong>. Bypasses this station and feeds directly to the next downstream stage.
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Quantity & Dimensions */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
              3. Quantity & Mass Conservation
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Pieces */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>
                    {isUpstreamMotherPipe ? 'Mother Pipes' : 'Cut Pieces'} (Nos) <span className="text-red-500">*</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {isUpstreamMotherPipe ? 'Long pipes' : 'Cut pipes'}
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={pcs}
                    onChange={(e) => handlePcsChange(e.target.value)}
                    placeholder="e.g. 50"
                    disabled={!isAuthorized || !selectedWoId}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <Hash className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                </div>
              </div>

              {/* Total Meters */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Total Length (Meters) <span className="text-red-500">*</span></span>
                  {manualMeters && (
                    <button
                      type="button"
                      onClick={() => {
                        setManualMeters(false);
                        if (pcs) handlePcsChange(pcs);
                      }}
                      className="text-[10px] text-blue-600 hover:underline"
                    >
                      Reset to Auto
                    </button>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0.1"
                    step="0.01"
                    value={meters}
                    onChange={(e) => handleMetersChange(e.target.value)}
                    placeholder="e.g. 300.5"
                    disabled={!isAuthorized || !selectedWoId}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <Ruler className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                </div>
              </div>

              {/* Calculated Weight MT */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Calculated Mass (MT)</span>
                  <span className="text-[10px] text-slate-400">OD × WT formula</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.001"
                    value={weightMt}
                    onChange={(e) => setWeightMt(e.target.value)}
                    placeholder="0.000"
                    disabled={!isAuthorized || !selectedWoId}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 font-mono font-bold text-blue-600 dark:text-blue-400 focus:outline-none"
                  />
                  <Scale className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Audit Reason & Identification */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
              4. Audit Trail & Identification
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Induction Reason <span className="text-red-500">*</span>
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as StockGenerationReason)}
                  disabled={!isAuthorized}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {STOCK_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Heat / Cast No (Optional)
                </label>
                <input
                  type="text"
                  value={heatNo}
                  onChange={(e) => setHeatNo(e.target.value)}
                  placeholder="e.g. H-88231"
                  disabled={!isAuthorized}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Lot / Bundle No (Optional)
                </label>
                <input
                  type="text"
                  value={lotNo}
                  onChange={(e) => setLotNo(e.target.value)}
                  placeholder="e.g. LOT-42"
                  disabled={!isAuthorized}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-3.5">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Detailed Remarks & Justification
              </label>
              <textarea
                rows={2}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Provide justification for this stock induction (e.g. physical stock count reconciliation, external inbound yard stock, etc.)..."
                disabled={!isAuthorized}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Authorized by: <span className="font-semibold text-slate-700 dark:text-slate-300">{profile?.name || user?.email || 'PPC'}</span>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isAuthorized || !selectedWoId || !pcs || Number(pcs) <= 0 || isSubmitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <PackagePlus className="w-4 h-4" />
            <span>Generate & Induct Stock</span>
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-lg w-full overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-blue-600" />
                Confirm Stock Generation & Induction
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Please verify the quantities and target stage before updating the live WIP queue.
              </p>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700/60">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Work Order</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{selectedWo?.work_order_no}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Stage</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{selectedStage?.stage_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Placement</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                    {stockType === 'INCOMING_QUEUE' ? 'Incoming Queue' : 'Stage Output'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Reason</span>
                  <span className="text-slate-700 dark:text-slate-300">{reason}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 bg-blue-50/60 dark:bg-blue-950/30 p-3 rounded-lg border border-blue-200 dark:border-blue-900/40 text-center font-mono">
                <div>
                  <span className="text-blue-500 dark:text-blue-400 block text-[10px] uppercase font-sans">Pieces</span>
                  <span className="text-base font-bold text-blue-900 dark:text-blue-200">{pcs}</span>
                </div>
                <div>
                  <span className="text-blue-500 dark:text-blue-400 block text-[10px] uppercase font-sans">Meters</span>
                  <span className="text-base font-bold text-blue-900 dark:text-blue-200">{meters} m</span>
                </div>
                <div>
                  <span className="text-blue-500 dark:text-blue-400 block text-[10px] uppercase font-sans">Weight</span>
                  <span className="text-base font-bold text-blue-900 dark:text-blue-200">{weightMt || '0.000'} MT</span>
                </div>
              </div>

              {remarks && (
                <div className="text-[11px] text-slate-500 italic bg-slate-50 dark:bg-slate-800/40 p-2 rounded">
                  Remarks: &ldquo;{remarks}&rdquo;
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Back & Edit
              </button>
              <button
                type="button"
                onClick={confirmAndSave}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirm & Induct</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
