'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fmt, n, mtFromMtr } from '@/lib/productionUtils';
import { getCurrentAppUser } from '@/lib/users/client';
import { isUserAuthorizedForQc } from '@/lib/permissions';
import type { AppUserProfile } from '@/lib/users/types';
import type { QcInspection, SalvageReasonItem, QcQueueItem, QcSalvageQueueItem, WorkOrder, ProductionLog } from '@/types';
import {
  ClipboardCheck, Search, Plus, Trash2, Edit2, AlertCircle, CheckCircle2,
  ShieldCheck, Lock, RefreshCw, X, Filter, Layers, ArrowRight, Info, Check,
  Wrench, ArrowRightLeft, GitFork, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';

const DEFAULT_SALVAGE_REASONS = [
  'Bend / Straightening Required',
  'Surface Scratch / Dent / Mark',
  'OD / WT Dimensional Variation',
  'End Cut / Trimming Required',
  'Crack / Seam Flaw Detected',
  'Ovality / Out of Round',
  'Rust / Scale Deposit',
  'Other / Custom Defect'
];

export default function QcInspectionClient() {
  const supabase = createClient();

  // Current user & permissions
  const [currentUser, setCurrentUser] = useState<AppUserProfile | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Data states
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [productionLogs, setProductionLogs] = useState<ProductionLog[]>([]);
  const [qcInspections, setQcInspections] = useState<QcInspection[]>([]);
  const [stages, setStages] = useState<{ id: string; stage_code: string; stage_name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [queueSearch, setQueueSearch] = useState('');
  const [salvageSearch, setSalvageSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [activeTab, setActiveTab] = useState<'queue' | 'salvage' | 'history'>('queue');
  const [historyFromDate, setHistoryFromDate] = useState('');
  const [historyToDate, setHistoryToDate] = useState('');

  // Modal / Drawer state for recording or editing an inspection
  const [modalOpen, setModalOpen] = useState(false);
  const [editingInspection, setEditingInspection] = useState<QcInspection | null>(null);
  const [selectedQueueItem, setSelectedQueueItem] = useState<QcQueueItem | null>(null);

  // Form inputs
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [inspectedPcs, setInspectedPcs] = useState('');
  const [vdiOkPcs, setVdiOkPcs] = useState('');
  const [vdiSalvagePcs, setVdiSalvagePcs] = useState('');
  const [vdiRejectionPcs, setVdiRejectionPcs] = useState('');
  const [salvageReasons, setSalvageReasons] = useState<SalvageReasonItem[]>([]);
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<QcInspection | null>(null);
  const [deleting, setDeleting] = useState(false);

  // --- Post-Rework Processing Modal State ---
  const [reworkModalOpen, setReworkModalOpen] = useState(false);
  const [reworkTargetWo, setReworkTargetWo] = useState<QcSalvageQueueItem | null>(null);
  const [reworkTargetInspection, setReworkTargetInspection] = useState<QcInspection | null>(null);
  const [reworkDate, setReworkDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reworkVdiOkPcs, setReworkVdiOkPcs] = useState('');
  const [reworkDivertedPcs, setReworkDivertedPcs] = useState('');
  const [reworkTargetWoId, setReworkTargetWoId] = useState('');
  const [reworkDiversionReason, setReworkDiversionReason] = useState('');
  const [reworkRejectionPcs, setReworkRejectionPcs] = useState('');
  const [reworkRemarks, setReworkRemarks] = useState('');
  const [reworkSaving, setReworkSaving] = useState(false);

  // Load current user profile
  useEffect(() => {
    async function loadUser() {
      try {
        const u = await getCurrentAppUser();
        setCurrentUser(u);
      } catch (err) {
        console.error('Failed to load user in QC client', err);
      } finally {
        setLoadingUser(false);
      }
    }
    loadUser();
  }, []);

  const canModify = useMemo(() => isUserAuthorizedForQc(currentUser), [currentUser]);

  // Load all required dataset
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [woRes, logsRes, qcRes, stagesRes] = await Promise.all([
        supabase.from('work_orders').select('*').order('created_at', { ascending: false }),
        supabase.from('production_logs').select('*'),
        supabase.from('qc_inspections').select('*').order('created_at', { ascending: false }),
        supabase.from('process_stages').select('*'),
      ]);

      if (woRes.data) setWorkOrders(woRes.data as WorkOrder[]);
      if (logsRes.data) setProductionLogs(logsRes.data as ProductionLog[]);
      if (stagesRes.data) setStages(stagesRes.data);

      // Handle qc_inspections gracefully even if table was just created
      if (qcRes.data) {
        setQcInspections(qcRes.data as QcInspection[]);
      } else if (qcRes.error && qcRes.error.code !== 'PGRST116') {
        console.warn('qc_inspections notice:', qcRes.error.message);
        setQcInspections([]);
      }
    } catch (err: any) {
      console.error('Error fetching QC data:', err);
      toast.error('Failed to load data for QC Inspection.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Build QC Queue Items: Work orders with available Heat Treatment OK WIP
  const queueItems = useMemo(() => {
    const htStage = stages.find((s) => s.stage_code === 'HEAT_TREATMENT');
    const hollowHtStage = stages.find((s) => s.stage_code === 'HOLLOW_HEAT_TREATMENT');
    const drawStage = stages.find((s) => s.stage_code === 'DRAW');
    // HFS route: ROLLING → VDI (no separate HT stage). htc_ok is recorded at ROLLING.
    const rollingStage = stages.find((s) => s.stage_code === 'ROLLING');

    const items: QcQueueItem[] = [];

    workOrders.forEach((wo) => {
      // Work order dimensions & average length
      const od = Number(wo.size_od || 0);
      const wt = Number(wo.size_wt || 0);
      const l1 = Number(wo.l1 || 0);
      const l2 = Number(wo.l2 || 0);
      const avgLen = l1 > 0 && l2 > 0 ? (l1 + l2) / 2 : (l1 || l2 || 6.0);

      // Logs for this work order
      const woLogs = productionLogs.filter((l) => l.work_order_id === wo.id);

      // Priority order: HEAT_TREATMENT → HOLLOW_HEAT_TREATMENT → DRAW → ROLLING (HFS fallback)
      let relevantLogs = woLogs.filter((l) => htStage && l.stage_id === htStage.id);
      if (relevantLogs.length === 0 && hollowHtStage) {
        relevantLogs = woLogs.filter((l) => l.stage_id === hollowHtStage.id);
      }
      if (relevantLogs.length === 0 && drawStage) {
        relevantLogs = woLogs.filter((l) => l.stage_id === drawStage.id);
      }
      // HFS fallback: use ROLLING logs only when they have htc_ok > 0 logged
      // (htc_ok at ROLLING stage is the "HFS OK after sizing" quantity)
      if (relevantLogs.length === 0 && rollingStage) {
        const rollingLogs = woLogs.filter(
          (l) => l.stage_id === rollingStage.id && Number(l.htc_ok || 0) > 0
        );
        if (rollingLogs.length > 0) relevantLogs = rollingLogs;
      }

      if (relevantLogs.length === 0) return;

      const outMtr = relevantLogs.reduce((sum, l) => sum + Number(l.output_qty || 0), 0);
      const rejMtr = relevantLogs.reduce((sum, l) => sum + Number(l.rejection_qty || 0), 0);
      const htcOkMtr = relevantLogs.reduce((sum, l) => sum + Number(l.htc_ok || 0), 0);

      // Effective HT OK Mtr: uses htc_ok if logged, otherwise net output (output - rejection)
      const effectiveHtOkMtr = htcOkMtr > 0 ? htcOkMtr : Math.max(0, outMtr - rejMtr);
      if (effectiveHtOkMtr <= 0) return;

      const effectiveHtOkPcs = avgLen > 0 ? Math.round(effectiveHtOkMtr / avgLen) : 0;
      const effectiveHtOkMt = mtFromMtr(effectiveHtOkMtr, od, wt);

      // Total already inspected at QC for this order
      const woInspections = qcInspections.filter((q) => q.work_order_id === wo.id);
      const alreadyInspectedPcs = woInspections.reduce((sum, q) => sum + Number(q.inspected_pcs || 0), 0);
      const alreadyInspectedMtr = woInspections.reduce((sum, q) => sum + Number(q.inspected_mtr || 0), 0);

      const availablePcs = Math.max(0, effectiveHtOkPcs - alreadyInspectedPcs);
      const availableMtr = Math.max(0, effectiveHtOkMtr - alreadyInspectedMtr);
      const availableMt = mtFromMtr(availableMtr, od, wt);

      // Include in queue if there is available stock or if it was partially inspected
      if (availablePcs > 0 || availableMtr > 0) {
        items.push({
          work_order_id: wo.id,
          work_order_no: wo.work_order_no,
          customer_name: wo.customer_name || null,
          specification: wo.specification || wo.grade || null,
          size_od: od,
          size_wt: wt,
          l1,
          l2,
          avg_length: avgLen,
          process_route_id: wo.process_route_id || null,
          ht_ok_pcs: effectiveHtOkPcs,
          ht_ok_mtr: effectiveHtOkMtr,
          ht_ok_mt: effectiveHtOkMt,
          already_inspected_pcs: alreadyInspectedPcs,
          available_ht_ok_pcs: availablePcs,
          available_ht_ok_mtr: availableMtr,
          available_ht_ok_mt: availableMt,
        });
      }
    });

    return items;
  }, [workOrders, productionLogs, qcInspections, stages]);

  // Filtered Queue
  const filteredQueue = useMemo(() => {
    if (!queueSearch.trim()) return queueItems;
    const q = queueSearch.toLowerCase();
    return queueItems.filter(
      (item) =>
        item.work_order_no.toLowerCase().includes(q) ||
        (item.customer_name || '').toLowerCase().includes(q) ||
        (item.specification || '').toLowerCase().includes(q)
    );
  }, [queueItems, queueSearch]);

  // Enriched History with Work Order Details
  const enrichedHistory = useMemo(() => {
    const woMap = new Map<string, WorkOrder>();
    workOrders.forEach((w) => woMap.set(w.id, w));

    return qcInspections.map((q) => {
      const wo = woMap.get(q.work_order_id);
      return {
        ...q,
        work_order_no: wo?.work_order_no || q.work_order_no || '—',
        customer_name: wo?.customer_name || q.customer_name || null,
        specification: wo?.specification || wo?.grade || q.specification || null,
        size_od: wo?.size_od || q.size_od,
        size_wt: wo?.size_wt || q.size_wt,
      };
    });
  }, [qcInspections, workOrders]);

  // Filtered History
  const filteredHistory = useMemo(() => {
    return enrichedHistory.filter((item) => {
      if (historyFromDate && item.inspection_date < historyFromDate) return false;
      if (historyToDate && item.inspection_date > historyToDate) return false;
      if (!historySearch.trim()) return true;

      const q = historySearch.toLowerCase();
      return (
        item.work_order_no.toLowerCase().includes(q) ||
        (item.customer_name || '').toLowerCase().includes(q) ||
        (item.specification || '').toLowerCase().includes(q) ||
        (item.remarks || '').toLowerCase().includes(q)
      );
    });
  }, [enrichedHistory, historySearch, historyFromDate, historyToDate]);

  // Build Salvage Queue Items: Work orders with active VDI Salvage pieces pending rework
  const salvageQueueItems = useMemo(() => {
    const items: QcSalvageQueueItem[] = [];

    workOrders.forEach((wo) => {
      const woInspections = qcInspections.filter(
        (q) => q.work_order_id === wo.id && Number(q.vdi_salvage_pcs || 0) > 0
      );
      if (woInspections.length === 0) return;

      const od = Number(wo.size_od || 0);
      const wt = Number(wo.size_wt || 0);
      const l1 = Number(wo.l1 || 0);
      const l2 = Number(wo.l2 || 0);
      const avgLen = l1 > 0 && l2 > 0 ? (l1 + l2) / 2 : (l1 || l2 || 6.0);

      const totalSalvagePcs = woInspections.reduce((sum, q) => sum + Number(q.vdi_salvage_pcs || 0), 0);
      const totalSalvageMtr = Number(woInspections.reduce((sum, q) => sum + Number(q.vdi_salvage_mtr || 0), 0).toFixed(2));
      const totalSalvageMt = Number(woInspections.reduce((sum, q) => sum + Number(q.vdi_salvage_mt || 0), 0).toFixed(3));

      // Collect all salvage reasons across inspections
      const allReasons: SalvageReasonItem[] = [];
      woInspections.forEach((q) => {
        if (Array.isArray(q.salvage_reasons)) {
          allReasons.push(...q.salvage_reasons);
        }
      });

      items.push({
        work_order_id: wo.id,
        work_order_no: wo.work_order_no,
        customer_name: wo.customer_name || null,
        specification: wo.specification || wo.grade || null,
        size_od: od,
        size_wt: wt,
        avg_length: avgLen,
        process_route_id: wo.process_route_id || null,
        total_salvage_pcs: totalSalvagePcs,
        total_salvage_mtr: totalSalvageMtr,
        total_salvage_mt: totalSalvageMt,
        salvage_reasons: allReasons,
        inspections: woInspections,
      });
    });

    return items;
  }, [workOrders, qcInspections]);

  // Filtered Salvage Queue
  const filteredSalvageQueue = useMemo(() => {
    if (!salvageSearch.trim()) return salvageQueueItems;
    const q = salvageSearch.toLowerCase();
    return salvageQueueItems.filter(
      (item) =>
        item.work_order_no.toLowerCase().includes(q) ||
        (item.customer_name || '').toLowerCase().includes(q) ||
        (item.specification || '').toLowerCase().includes(q)
    );
  }, [salvageQueueItems, salvageSearch]);

  // Top KPI Metrics
  const kpis = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayLogs = qcInspections.filter((q) => q.inspection_date === today);

    const pendingPcs = queueItems.reduce((sum, item) => sum + item.available_ht_ok_pcs, 0);
    const pendingMt = queueItems.reduce((sum, item) => sum + item.available_ht_ok_mt, 0);

    const inspectedTodayPcs = todayLogs.reduce((sum, q) => sum + Number(q.inspected_pcs || 0), 0);
    const inspectedTodayMt = todayLogs.reduce((sum, q) => sum + Number(q.inspected_mt || 0), 0);

    const vdiOkTodayPcs = todayLogs.reduce((sum, q) => sum + Number(q.vdi_ok_pcs || 0), 0);
    const vdiOkTodayMt = todayLogs.reduce((sum, q) => sum + Number(q.vdi_ok_mt || 0), 0);

    const salvageTodayPcs = todayLogs.reduce((sum, q) => sum + Number(q.vdi_salvage_pcs || 0), 0);
    const salvageTodayMt = todayLogs.reduce((sum, q) => sum + Number(q.vdi_salvage_mt || 0), 0);

    const rejTodayPcs = todayLogs.reduce((sum, q) => sum + Number(q.vdi_rejection_pcs || 0), 0);
    const rejTodayMt = todayLogs.reduce((sum, q) => sum + Number(q.vdi_rejection_mt || 0), 0);

    const totalPendingSalvagePcs = salvageQueueItems.reduce((sum, item) => sum + item.total_salvage_pcs, 0);
    const totalPendingSalvageMt = salvageQueueItems.reduce((sum, item) => sum + item.total_salvage_mt, 0);

    return {
      pendingPcs,
      pendingMt,
      inspectedTodayPcs,
      inspectedTodayMt,
      vdiOkTodayPcs,
      vdiOkTodayMt,
      salvageTodayPcs,
      salvageTodayMt,
      rejTodayPcs,
      rejTodayMt,
      totalPendingSalvagePcs,
      totalPendingSalvageMt,
    };
  }, [queueItems, qcInspections, salvageQueueItems]);

  // Open modal to record inspection for a queue item
  const openRecordModal = (item: QcQueueItem) => {
    if (!canModify) {
      toast.error('Permission Denied: Only PPC and QC personnel can record QC inspections.');
      return;
    }
    setSelectedQueueItem(item);
    setEditingInspection(null);
    setFormDate(new Date().toISOString().slice(0, 10));
    setInspectedPcs(String(item.available_ht_ok_pcs));
    setVdiOkPcs(String(item.available_ht_ok_pcs));
    setVdiSalvagePcs('0');
    setVdiRejectionPcs('0');
    setSalvageReasons([]);
    setRemarks('');
    setModalOpen(true);
  };

  // Open modal to edit an existing inspection
  const openEditModal = (inspection: QcInspection) => {
    if (!canModify) {
      toast.error('Permission Denied: Only PPC and QC personnel can edit QC inspections.');
      return;
    }
    const wo = workOrders.find((w) => w.id === inspection.work_order_id);
    const od = Number(wo?.size_od || inspection.size_od || 0);
    const wt = Number(wo?.size_wt || inspection.size_wt || 0);
    const l1 = Number(wo?.l1 || 0);
    const l2 = Number(wo?.l2 || 0);
    const avgLen = l1 > 0 && l2 > 0 ? (l1 + l2) / 2 : (l1 || l2 || 6.0);

    // Reconstruct queue item context
    const queueItem: QcQueueItem = {
      work_order_id: inspection.work_order_id,
      work_order_no: wo?.work_order_no || inspection.work_order_no || '—',
      customer_name: wo?.customer_name || null,
      specification: wo?.specification || wo?.grade || null,
      size_od: od,
      size_wt: wt,
      l1,
      l2,
      avg_length: avgLen,
      ht_ok_pcs: Number(inspection.inspected_pcs),
      ht_ok_mtr: Number(inspection.inspected_mtr),
      ht_ok_mt: Number(inspection.inspected_mt),
      already_inspected_pcs: 0,
      available_ht_ok_pcs: Number(inspection.inspected_pcs),
      available_ht_ok_mtr: Number(inspection.inspected_mtr),
      available_ht_ok_mt: Number(inspection.inspected_mt),
    };

    setSelectedQueueItem(queueItem);
    setEditingInspection(inspection);
    setFormDate(inspection.inspection_date.slice(0, 10));
    setInspectedPcs(String(inspection.inspected_pcs));
    setVdiOkPcs(String(inspection.vdi_ok_pcs));
    setVdiSalvagePcs(String(inspection.vdi_salvage_pcs));
    setVdiRejectionPcs(String(inspection.vdi_rejection_pcs));
    setSalvageReasons(Array.isArray(inspection.salvage_reasons) ? inspection.salvage_reasons : []);
    setRemarks(inspection.remarks || '');
    setModalOpen(true);
  };

  // Add salvage reason line
  const addSalvageReason = () => {
    const newItem: SalvageReasonItem = {
      id: Math.random().toString(36).slice(2, 9),
      reason: DEFAULT_SALVAGE_REASONS[0],
      pcs: 0,
      remarks: '',
    };
    setSalvageReasons((prev) => [...prev, newItem]);
  };

  // Update salvage reason line
  const updateSalvageReason = (id: string, field: keyof SalvageReasonItem, val: any) => {
    setSalvageReasons((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: val } : item))
    );
  };

  // Remove salvage reason line
  const removeSalvageReason = (id: string) => {
    setSalvageReasons((prev) => prev.filter((item) => item.id !== id));
  };

  // Computed live metrics for the form
  const formMetrics = useMemo(() => {
    if (!selectedQueueItem) return { inspMtr: 0, inspMt: 0, okMtr: 0, okMt: 0, salMtr: 0, salMt: 0, rejMtr: 0, rejMt: 0, totalSalvageReasonPcs: 0, isSalvageBalanced: true, isPcsBalanced: true };

    const avg = selectedQueueItem.avg_length || 6.0;
    const od = selectedQueueItem.size_od || 0;
    const wt = selectedQueueItem.size_wt || 0;

    const inspP = n(inspectedPcs);
    const okP = n(vdiOkPcs);
    const salP = n(vdiSalvagePcs);
    const rejP = n(vdiRejectionPcs);

    const inspMtr = Number((inspP * avg).toFixed(2));
    const okMtr = Number((okP * avg).toFixed(2));
    const salMtr = Number((salP * avg).toFixed(2));
    const rejMtr = Number((rejP * avg).toFixed(2));

    const inspMt = Number(mtFromMtr(inspMtr, od, wt).toFixed(3));
    const okMt = Number(mtFromMtr(okMtr, od, wt).toFixed(3));
    const salMt = Number(mtFromMtr(salMtr, od, wt).toFixed(3));
    const rejMt = Number(mtFromMtr(rejMtr, od, wt).toFixed(3));

    const totalSalvageReasonPcs = salvageReasons.reduce((sum, r) => sum + n(r.pcs), 0);
    const isSalvageBalanced = salP === 0 || totalSalvageReasonPcs === salP;
    const isPcsBalanced = inspP > 0 && okP + salP + rejP === inspP;

    return {
      inspMtr,
      inspMt,
      okMtr,
      okMt,
      salMtr,
      salMt,
      rejMtr,
      rejMt,
      totalSalvageReasonPcs,
      isSalvageBalanced,
      isPcsBalanced,
    };
  }, [selectedQueueItem, inspectedPcs, vdiOkPcs, vdiSalvagePcs, vdiRejectionPcs, salvageReasons]);

  // Save QC Inspection Entry
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canModify) {
      toast.error('Permission Denied: Only PPC and QC personnel can save QC inspections.');
      return;
    }
    if (!selectedQueueItem) return;

    const inspP = n(inspectedPcs);
    const okP = n(vdiOkPcs);
    const salP = n(vdiSalvagePcs);
    const rejP = n(vdiRejectionPcs);

    if (inspP <= 0) {
      toast.error('Inspected Nos must be greater than 0.');
      return;
    }

    if (!editingInspection && inspP > selectedQueueItem.available_ht_ok_pcs) {
      toast.error(`Cannot inspect more than Available HT OK pieces (${selectedQueueItem.available_ht_ok_pcs} Nos).`);
      return;
    }

    if (okP + salP + rejP !== inspP) {
      toast.error(`Sum of VDI OK (${okP}) + Salvage (${salP}) + Rejection (${rejP}) must equal Inspected pieces (${inspP}).`);
      return;
    }

    if (salP > 0 && formMetrics.totalSalvageReasonPcs !== salP) {
      toast.error(`Salvage defect lines total (${formMetrics.totalSalvageReasonPcs} Nos) does not match VDI Salvage Nos (${salP} Nos). Please adjust defect quantities.`);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        work_order_id: selectedQueueItem.work_order_id,
        process_route_id: selectedQueueItem.process_route_id || null,
        inspection_date: formDate,
        inspected_pcs: inspP,
        inspected_mtr: formMetrics.inspMtr,
        inspected_mt: formMetrics.inspMt,
        vdi_ok_pcs: okP,
        vdi_ok_mtr: formMetrics.okMtr,
        vdi_ok_mt: formMetrics.okMt,
        vdi_salvage_pcs: salP,
        vdi_salvage_mtr: formMetrics.salMtr,
        vdi_salvage_mt: formMetrics.salMt,
        vdi_rejection_pcs: rejP,
        vdi_rejection_mtr: formMetrics.rejMtr,
        vdi_rejection_mt: formMetrics.rejMt,
        salvage_reasons: salvageReasons,
        remarks: remarks.trim() || null,
        created_by: currentUser?.name || currentUser?.email || 'QC Inspector',
        updated_at: new Date().toISOString(),
      };

      if (editingInspection) {
        const { error } = await supabase
          .from('qc_inspections')
          .update(payload)
          .eq('id', editingInspection.id);
        if (error) throw error;
        toast.success(`Updated QC Inspection for WO ${selectedQueueItem.work_order_no}`);
      } else {
        const { error } = await supabase.from('qc_inspections').insert([payload]);
        if (error) throw error;
        toast.success(`Recorded QC Inspection for WO ${selectedQueueItem.work_order_no}: ${okP} OK, ${salP} Salvage`);
      }

      setModalOpen(false);
      loadData();
    } catch (err: any) {
      console.error('Error saving QC inspection:', err);
      toast.error(`Failed to save QC inspection: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  // Delete an inspection entry
  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (!canModify) {
      toast.error('Permission Denied: Only PPC and QC personnel can delete QC inspections.');
      return;
    }

    setDeleting(true);
    try {
      const { error } = await supabase.from('qc_inspections').delete().eq('id', deleteTarget.id);
      if (error) throw error;

      toast.success(`Deleted QC Inspection record.`);
      setDeleteTarget(null);
      loadData();
    } catch (err: any) {
      console.error('Error deleting QC inspection:', err);
      toast.error(`Failed to delete record: ${err.message || err}`);
    } finally {
      setDeleting(false);
    }
  };

  // --- Post-Rework Handlers & Form Calculations ---
  const availableTargetWos = useMemo(() => {
    if (!reworkTargetWo) return workOrders;
    return workOrders.filter((w) => w.id !== reworkTargetWo.work_order_id);
  }, [workOrders, reworkTargetWo]);

  const openReworkModal = (item: QcSalvageQueueItem, inspection?: QcInspection) => {
    if (!canModify) {
      toast.error('Permission Denied: Only PPC and QC personnel can process rework.');
      return;
    }
    setReworkTargetWo(item);
    setReworkTargetInspection(inspection || null);
    setReworkDate(new Date().toISOString().slice(0, 10));

    const availPcs = inspection
      ? Number(inspection.vdi_salvage_pcs || 0)
      : item.total_salvage_pcs;

    setReworkVdiOkPcs(String(availPcs));
    setReworkDivertedPcs('0');
    setReworkTargetWoId('');
    setReworkDiversionReason('');
    setReworkRejectionPcs('0');
    setReworkRemarks('');
    setReworkModalOpen(true);
  };

  const reworkFormMetrics = useMemo(() => {
    if (!reworkTargetWo) {
      return {
        availPcs: 0,
        availMtr: 0,
        availMt: 0,
        okPcs: 0,
        okMtr: 0,
        okMt: 0,
        divPcs: 0,
        divMtr: 0,
        divMt: 0,
        rejPcs: 0,
        rejMtr: 0,
        rejMt: 0,
        totalProcessed: 0,
        remainingSalvage: 0,
        isValid: false,
      };
    }

    const avg = reworkTargetWo.avg_length || 6.0;
    const od = reworkTargetWo.size_od || 0;
    const wt = reworkTargetWo.size_wt || 0;

    const availPcs = reworkTargetInspection
      ? Number(reworkTargetInspection.vdi_salvage_pcs || 0)
      : reworkTargetWo.total_salvage_pcs;
    const availMtr = Number((availPcs * avg).toFixed(2));
    const availMt = Number(mtFromMtr(availMtr, od, wt).toFixed(3));

    const okPcs = Math.max(0, n(reworkVdiOkPcs));
    const divPcs = Math.max(0, n(reworkDivertedPcs));
    const rejPcs = Math.max(0, n(reworkRejectionPcs));

    const okMtr = Number((okPcs * avg).toFixed(2));
    const okMt = Number(mtFromMtr(okMtr, od, wt).toFixed(3));

    const divMtr = Number((divPcs * avg).toFixed(2));
    const divMt = Number(mtFromMtr(divMtr, od, wt).toFixed(3));

    const rejMtr = Number((rejPcs * avg).toFixed(2));
    const rejMt = Number(mtFromMtr(rejMtr, od, wt).toFixed(3));

    const totalProcessed = okPcs + divPcs + rejPcs;
    const remainingSalvage = Math.max(0, availPcs - totalProcessed);
    const isValid = totalProcessed > 0 && totalProcessed <= availPcs && (divPcs === 0 || reworkTargetWoId !== '');

    return {
      availPcs,
      availMtr,
      availMt,
      okPcs,
      okMtr,
      okMt,
      divPcs,
      divMtr,
      divMt,
      rejPcs,
      rejMtr,
      rejMt,
      totalProcessed,
      remainingSalvage,
      isValid,
    };
  }, [reworkTargetWo, reworkTargetInspection, reworkVdiOkPcs, reworkDivertedPcs, reworkRejectionPcs, reworkTargetWoId]);

  const handleReworkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canModify) {
      toast.error('Permission Denied: Only PPC and QC personnel can process rework.');
      return;
    }
    if (!reworkTargetWo) return;

    if (!reworkFormMetrics.isValid) {
      if (reworkFormMetrics.totalProcessed <= 0) {
        toast.error('Please enter at least 1 piece to process into VDI OK, Diverted, or Rejection.');
        return;
      }
      if (reworkFormMetrics.totalProcessed > reworkFormMetrics.availPcs) {
        toast.error(`Total processed (${reworkFormMetrics.totalProcessed} Nos) exceeds available salvage (${reworkFormMetrics.availPcs} Nos).`);
        return;
      }
      if (reworkFormMetrics.divPcs > 0 && !reworkTargetWoId) {
        toast.error('Please select a Target Work Order for the diverted quantity.');
        return;
      }
    }

    setReworkSaving(true);
    try {
      const res = await fetch('/api/qc/rework', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_order_id: reworkTargetWo.work_order_id,
          inspection_id: reworkTargetInspection?.id || null,
          rework_date: reworkDate,
          vdi_ok_pcs: reworkFormMetrics.okPcs,
          diverted_pcs: reworkFormMetrics.divPcs,
          target_work_order_id: reworkTargetWoId || null,
          diversion_reason: reworkDiversionReason || null,
          rejection_pcs: reworkFormMetrics.rejPcs,
          remarks: reworkRemarks,
          processed_by: currentUser?.name || currentUser?.email || 'QC Inspector',
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || 'Failed to process VDI Salvage rework.');
      }

      const summaryParts = [
        reworkFormMetrics.okPcs > 0 ? `${reworkFormMetrics.okPcs} Nos -> VDI OK` : null,
        reworkFormMetrics.divPcs > 0 ? `${reworkFormMetrics.divPcs} Nos -> Diverted` : null,
        reworkFormMetrics.rejPcs > 0 ? `${reworkFormMetrics.rejPcs} Nos -> Scrapped` : null,
      ].filter(Boolean);

      toast.success(
        `Successfully processed rework for WO ${reworkTargetWo.work_order_no}: ${summaryParts.join(', ')}`
      );

      setReworkModalOpen(false);
      setReworkTargetWo(null);
      setReworkTargetInspection(null);
      await loadData();
    } catch (err: any) {
      console.error('Error submitting rework disposition:', err);
      toast.error(err.message || 'Failed to record rework disposition.');
    } finally {
      setReworkSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <ClipboardCheck size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                QC & VDI Inspection Form
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Quality gate verifying Heat Treatment OK output before releasing WIP to Finishing Line
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {canModify ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-800">
              <ShieldCheck size={14} className="text-emerald-600" />
              Full QC & PPC Authority
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-800" title="PPC and QC departments have create/edit permission">
              <Lock size={13} className="text-amber-600" />
              Read-Only Access
            </span>
          )}

          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 active:scale-95 transition-all"
            title="Refresh Inspection Queue and History"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Permission Callout if Read-Only */}
      {!canModify && !loadingUser && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 flex items-start gap-3 text-xs text-amber-900">
          <Info size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Viewing in Read-Only Mode:</span> You can explore pending orders in the QC Inspection queue and review historical inspection logs. Recording new inspections and modifying entries is restricted to the <strong>PPC and QC</strong> departments (or System Administrators).
          </div>
        </div>
      )}

      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {/* Pending HT OK WIP */}
        <div className="rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50/80 to-white p-4 shadow-sm">
          <div className="text-xs font-bold text-orange-800 uppercase tracking-wider">Pending QC Inspection</div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-black text-orange-950">{fmt(kpis.pendingPcs)}</span>
            <span className="text-xs font-semibold text-orange-700">Nos</span>
          </div>
          <div className="mt-1 text-xs text-orange-700/80 font-mono">
            {fmt(kpis.pendingMt, ' MT')} from Heat Treatment
          </div>
        </div>

        {/* Inspected Today */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">Inspected Today</div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-black text-slate-900">{fmt(kpis.inspectedTodayPcs)}</span>
            <span className="text-xs font-semibold text-slate-600">Nos</span>
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono">
            {fmt(kpis.inspectedTodayMt, ' MT')} total checked
          </div>
        </div>

        {/* VDI OK Today */}
        <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/70 to-white p-4 shadow-sm">
          <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider">VDI OK Today</div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-black text-emerald-950">{fmt(kpis.vdiOkTodayPcs)}</span>
            <span className="text-xs font-semibold text-emerald-700">Nos</span>
          </div>
          <div className="mt-1 text-xs text-emerald-700 font-mono">
            {fmt(kpis.vdiOkTodayMt, ' MT')} passed to Finishing
          </div>
        </div>

        {/* VDI Salvage Pending Rework */}
        <div
          onClick={() => setActiveTab('salvage')}
          className="rounded-xl border border-amber-300 bg-gradient-to-br from-amber-50/80 to-white p-4 shadow-sm cursor-pointer hover:border-amber-400 hover:shadow-md transition-all group"
          title="Click to view VDI Salvage & Rework Queue"
        >
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-amber-800 uppercase tracking-wider">VDI Salvage Pending</div>
            <span className="text-[10px] font-semibold bg-amber-200/80 text-amber-900 px-1.5 py-0.5 rounded group-hover:bg-amber-300 transition-colors">
              Queue →
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-black text-amber-950">{fmt(kpis.totalPendingSalvagePcs)}</span>
            <span className="text-xs font-semibold text-amber-700">Nos</span>
          </div>
          <div className="mt-1 text-xs text-amber-700 font-mono">
            {fmt(kpis.totalPendingSalvageMt, ' MT')} reworkable ({fmt(kpis.salvageTodayPcs)} logged today)
          </div>
        </div>

        {/* VDI Rejection Today */}
        <div className="rounded-xl border border-rose-200 bg-gradient-to-br from-rose-50/70 to-white p-4 shadow-sm">
          <div className="text-xs font-bold text-rose-800 uppercase tracking-wider">VDI Rejection Today</div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-black text-rose-950">{fmt(kpis.rejTodayPcs)}</span>
            <span className="text-xs font-semibold text-rose-700">Nos</span>
          </div>
          <div className="mt-1 text-xs text-rose-700 font-mono">
            {fmt(kpis.rejTodayMt, ' MT')} scrapped
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 space-x-6 text-sm font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab('queue')}
          className={`pb-3.5 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'queue'
              ? 'border-blue-600 text-blue-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers size={16} />
          Pending Inspection Queue
          <span className="rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-xs font-bold font-mono">
            {queueItems.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('salvage')}
          className={`pb-3.5 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'salvage'
              ? 'border-amber-600 text-amber-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Wrench size={16} />
          VDI Salvage & Rework
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold font-mono ${
              salvageQueueItems.length > 0
                ? 'bg-amber-100 text-amber-900 font-black'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            {salvageQueueItems.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`pb-3.5 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-blue-600 text-blue-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ClipboardCheck size={16} />
          Inspection History Logs
          <span className="rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-xs font-bold font-mono">
            {qcInspections.length}
          </span>
        </button>
      </div>

      {/* TAB 1: PENDING INSPECTION QUEUE */}
      {activeTab === 'queue' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
            <div className="relative flex-1 max-w-md">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={queueSearch}
                onChange={(e) => setQueueSearch(e.target.value)}
                placeholder="Search by WO#, customer, specification..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Showing <span className="font-bold text-slate-800">{filteredQueue.length}</span> work orders awaiting QC inspection
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-sm text-slate-500">
                <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-blue-600" />
                Loading Heat Treatment WIP inspection queue...
              </div>
            ) : filteredQueue.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-500 space-y-1">
                <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-1" />
                <div className="font-bold text-slate-800">Inspection Queue is Clear</div>
                <div className="text-xs text-slate-400">
                  {queueSearch ? 'No orders match your search criteria.' : 'All Heat Treatment OK material has been inspected.'}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-700 font-semibold">
                    <tr>
                      <th className="py-3 px-3.5">Work Order #</th>
                      <th className="py-3 px-3">Customer</th>
                      <th className="py-3 px-3">Specification</th>
                      <th className="py-3 px-3 text-right">OD x WT</th>
                      <th className="py-3 px-3 text-right">Length</th>
                      <th className="py-3 px-3 text-right bg-orange-50/50">Total HT OK</th>
                      <th className="py-3 px-3 text-right">Already Inspected</th>
                      <th className="py-3 px-3 text-right bg-blue-50/50 font-bold text-blue-950">
                        Available for Inspection
                      </th>
                      <th className="py-3 px-3.5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredQueue.map((item) => (
                      <tr key={item.work_order_id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-3.5 font-bold font-mono text-slate-900 text-sm">
                          {item.work_order_no}
                        </td>
                        <td className="py-3 px-3 text-slate-700 max-w-[150px] truncate">
                          {item.customer_name || '—'}
                        </td>
                        <td className="py-3 px-3 text-slate-600 max-w-[140px] truncate" title={item.specification || '—'}>
                          {item.specification || '—'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-800">
                          {item.size_od} × {item.size_wt} mm
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-600">
                          {item.l1 && item.l2 ? `${item.l1} - ${item.l2}m` : `${item.avg_length}m`}
                        </td>
                        <td className="py-3 px-3 text-right font-mono bg-orange-50/30 text-orange-950">
                          <div className="font-bold">{fmt(item.ht_ok_pcs)} Nos</div>
                          <div className="text-[10px] text-orange-700">{fmt(item.ht_ok_mt, ' MT')}</div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-600">
                          {fmt(item.already_inspected_pcs)} Nos
                        </td>
                        <td className="py-3 px-3 text-right font-mono bg-blue-50/40 text-blue-950">
                          <div className="font-black text-sm text-blue-900">{fmt(item.available_ht_ok_pcs)} Nos</div>
                          <div className="text-[10px] text-blue-700 font-semibold">{fmt(item.available_ht_ok_mt, ' MT')} · {item.available_ht_ok_mtr}m</div>
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => openRecordModal(item)}
                            disabled={!canModify}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-blue-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                          >
                            <ClipboardCheck size={13} />
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: VDI SALVAGE & REWORK QUEUE */}
      {activeTab === 'salvage' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
            <div className="relative flex-1 max-w-md">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={salvageSearch}
                onChange={(e) => setSalvageSearch(e.target.value)}
                placeholder="Search salvage by WO#, customer, defect..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Showing <span className="font-bold text-amber-900">{filteredSalvageQueue.length}</span> orders with active VDI Salvage
            </div>
          </div>

          <div className="rounded-xl border border-amber-200/90 bg-white shadow-sm overflow-hidden">
            {filteredSalvageQueue.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-500 space-y-1">
                <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-1" />
                <div className="font-bold text-slate-800">No VDI Salvage Material Pending Rework</div>
                <div className="text-xs text-slate-400">
                  {salvageSearch ? 'No orders match your search criteria.' : 'All inspected tubes have been released as VDI OK, diverted, or scrapped.'}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-amber-50/70 border-b border-amber-200 text-amber-950 font-semibold">
                    <tr>
                      <th className="py-3 px-3.5">Work Order #</th>
                      <th className="py-3 px-3">Customer</th>
                      <th className="py-3 px-3">Specification</th>
                      <th className="py-3 px-3 text-right">OD x WT</th>
                      <th className="py-3 px-3 text-right">Length</th>
                      <th className="py-3 px-3 text-right bg-amber-100/60 font-black text-amber-950">
                        Pending Salvage
                      </th>
                      <th className="py-3 px-3">Defects Requiring Rework</th>
                      <th className="py-3 px-3">Inspections</th>
                      <th className="py-3 px-3.5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSalvageQueue.map((item) => (
                      <tr key={item.work_order_id} className="hover:bg-amber-50/40 transition-colors">
                        <td className="py-3 px-3.5 font-bold font-mono text-slate-900 text-sm">
                          {item.work_order_no}
                        </td>
                        <td className="py-3 px-3 text-slate-700 font-medium">
                          {item.customer_name || '—'}
                        </td>
                        <td className="py-3 px-3 text-slate-600">
                          {item.specification || '—'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-700">
                          {item.size_od} × {item.size_wt} mm
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-600">
                          {item.avg_length} m
                        </td>
                        <td className="py-3 px-3 text-right font-mono bg-amber-50/50 text-amber-950">
                          <div className="font-black text-sm text-amber-900">{fmt(item.total_salvage_pcs)} Nos</div>
                          <div className="text-[10px] text-amber-700 font-semibold">{fmt(item.total_salvage_mt, ' MT')} · {item.total_salvage_mtr}m</div>
                        </td>
                        <td className="py-3 px-3 max-w-[220px]">
                          {item.salvage_reasons && item.salvage_reasons.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {item.salvage_reasons.map((r, i) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center rounded bg-amber-100/90 border border-amber-300 px-1.5 py-0.5 text-[10px] text-amber-950 font-medium font-mono"
                                  title={`${r.reason}: ${r.pcs} Nos ${r.remarks ? `(${r.remarks})` : ''}`}
                                >
                                  {r.reason}: {r.pcs} Nos
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Salvage recorded without specific lines</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600 text-[11px] font-mono">
                          {item.inspections.length} log(s) · latest {item.inspections[0]?.inspection_date}
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => openReworkModal(item)}
                            disabled={!canModify}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-amber-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            title="Process Rework for this order"
                          >
                            <Wrench size={13} />
                            Process Rework
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: INSPECTION HISTORY LOGS */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-xs">
            <div className="relative md:col-span-2">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search history by WO#, customer, remarks..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <input
                type="date"
                value={historyFromDate}
                onChange={(e) => setHistoryFromDate(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700"
                title="From Date"
              />
            </div>
            <div>
              <input
                type="date"
                value={historyToDate}
                onChange={(e) => setHistoryToDate(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700"
                title="To Date"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
            {filteredHistory.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-500">
                No QC inspections logged matching your search filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-700 font-semibold">
                    <tr>
                      <th className="py-3 px-3.5">Date</th>
                      <th className="py-3 px-3">Work Order #</th>
                      <th className="py-3 px-3">Customer / Specs</th>
                      <th className="py-3 px-3 text-right">Inspected</th>
                      <th className="py-3 px-3 text-right text-emerald-700 bg-emerald-50/40">VDI OK</th>
                      <th className="py-3 px-3 text-right text-amber-700 bg-amber-50/40">VDI Salvage</th>
                      <th className="py-3 px-3 text-right text-rose-700 bg-rose-50/40">VDI Rejection</th>
                      <th className="py-3 px-3">Salvage Reasons</th>
                      <th className="py-3 px-3">Inspector</th>
                      <th className="py-3 px-3.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredHistory.map((item) => {
                      const reasons = Array.isArray(item.salvage_reasons) ? item.salvage_reasons : [];

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-3.5 font-mono text-slate-700 whitespace-nowrap">
                            {item.inspection_date}
                          </td>
                          <td className="py-3 px-3 font-bold font-mono text-slate-900 text-sm">
                            {item.work_order_no}
                          </td>
                          <td className="py-3 px-3 text-slate-700 max-w-[160px] truncate">
                            <div className="font-medium text-slate-900 truncate">{item.customer_name || '—'}</div>
                            <div className="text-[10px] text-slate-500 truncate">{item.specification || '—'}</div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                            <div>{fmt(item.inspected_pcs)} Nos</div>
                            <div className="text-[10px] text-slate-500 font-normal">{fmt(item.inspected_mt, ' MT')}</div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-emerald-800 bg-emerald-50/30">
                            <div>{fmt(item.vdi_ok_pcs)} Nos</div>
                            <div className="text-[10px] text-emerald-600 font-normal">{fmt(item.vdi_ok_mt, ' MT')}</div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-amber-800 bg-amber-50/30">
                            <div>{fmt(item.vdi_salvage_pcs)} Nos</div>
                            <div className="text-[10px] text-amber-600 font-normal">{fmt(item.vdi_salvage_mt, ' MT')}</div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-rose-800 bg-rose-50/30">
                            <div>{fmt(item.vdi_rejection_pcs)} Nos</div>
                            <div className="text-[10px] text-rose-600 font-normal">{fmt(item.vdi_rejection_mt, ' MT')}</div>
                          </td>
                          <td className="py-3 px-3 max-w-[200px]">
                            {reasons.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {reasons.map((r, i) => (
                                  <span
                                    key={i}
                                    className="inline-flex items-center rounded bg-amber-100/80 border border-amber-200 px-1.5 py-0.5 text-[10px] text-amber-900 font-medium font-mono"
                                    title={`${r.reason}: ${r.pcs} Nos ${r.remarks ? `(${r.remarks})` : ''}`}
                                  >
                                    {r.reason}: {r.pcs} Nos
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-600 truncate max-w-[120px]">
                            {item.created_by || '—'}
                          </td>
                          <td className="py-3 px-3.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {Number(item.vdi_salvage_pcs || 0) > 0 && (
                                <button
                                  type="button"
                                  disabled={!canModify}
                                  onClick={() => {
                                    const matchedWo = workOrders.find((w) => w.id === item.work_order_id);
                                    const avgLen = matchedWo?.l1 && matchedWo?.l2 ? (Number(matchedWo.l1) + Number(matchedWo.l2)) / 2 : 6.0;
                                    const sqItem: QcSalvageQueueItem = {
                                      work_order_id: item.work_order_id,
                                      work_order_no: item.work_order_no || matchedWo?.work_order_no || '—',
                                      customer_name: item.customer_name || matchedWo?.customer_name || null,
                                      specification: item.specification || matchedWo?.specification || null,
                                      size_od: Number(item.size_od || matchedWo?.size_od || 0),
                                      size_wt: Number(item.size_wt || matchedWo?.size_wt || 0),
                                      avg_length: avgLen,
                                      process_route_id: item.process_route_id || matchedWo?.process_route_id || null,
                                      total_salvage_pcs: Number(item.vdi_salvage_pcs || 0),
                                      total_salvage_mtr: Number(item.vdi_salvage_mtr || 0),
                                      total_salvage_mt: Number(item.vdi_salvage_mt || 0),
                                      salvage_reasons: Array.isArray(item.salvage_reasons) ? item.salvage_reasons : [],
                                      inspections: [item],
                                    };
                                    openReworkModal(sqItem, item);
                                  }}
                                  className="inline-flex items-center rounded border border-amber-300 bg-amber-50 p-1.5 text-amber-800 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                  title="Process Rework for this inspection"
                                >
                                  <Wrench size={12} />
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={!canModify}
                                onClick={() => openEditModal(item)}
                                className="inline-flex items-center rounded border border-slate-200 bg-slate-50 p-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                title="Edit Inspection"
                              >
                                <Edit2 size={12} />
                              </button>
                              <button
                                type="button"
                                disabled={!canModify}
                                onClick={() => setDeleteTarget(item)}
                                className="inline-flex items-center rounded border border-red-200 bg-red-50 p-1.5 text-red-700 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                title="Delete Inspection Record"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RECORD / EDIT QC INSPECTION MODAL */}
      {modalOpen && selectedQueueItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow">
                  <ClipboardCheck size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {editingInspection ? 'Edit QC / VDI Inspection' : 'Record QC / VDI Inspection'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Work Order #{selectedQueueItem.work_order_no} · {selectedQueueItem.customer_name || 'Commercial Tube'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSave} className="p-6 space-y-5">
              {/* Order Info Badge */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 rounded-xl bg-blue-50/50 border border-blue-100 p-3 text-xs">
                <div>
                  <span className="text-slate-500 block">Specification:</span>
                  <span className="font-bold text-slate-800">{selectedQueueItem.specification || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Dimensions:</span>
                  <span className="font-bold font-mono text-slate-800">
                    {selectedQueueItem.size_od} × {selectedQueueItem.size_wt} mm
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Length:</span>
                  <span className="font-bold font-mono text-slate-800">{selectedQueueItem.avg_length} m</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Available HT OK:</span>
                  <span className="font-black font-mono text-blue-900 text-sm">
                    {selectedQueueItem.available_ht_ok_pcs} Nos
                  </span>
                </div>
              </div>

              {/* Date Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Inspection Date *</label>
                <input
                  type="date"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Inspection Breakdown Inputs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* 1. Inspected Nos */}
                <div className="rounded-xl border border-slate-300 bg-slate-50/50 p-3 space-y-1">
                  <label className="block text-xs font-bold text-slate-800">1. Inspected Nos *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={inspectedPcs}
                    onChange={(e) => setInspectedPcs(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-sm font-black text-slate-900 focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="text-[11px] font-mono text-slate-500">
                    {formMetrics.inspMt} MT · {formMetrics.inspMtr}m
                  </div>
                </div>

                {/* 2. VDI OK Nos */}
                <div className="rounded-xl border border-emerald-300 bg-emerald-50/40 p-3 space-y-1">
                  <label className="block text-xs font-bold text-emerald-900">2. VDI OK Nos *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={vdiOkPcs}
                    onChange={(e) => setVdiOkPcs(e.target.value)}
                    className="w-full rounded-lg border border-emerald-300 px-3 py-1.5 font-mono text-sm font-black text-emerald-900 focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="text-[11px] font-mono text-emerald-700">
                    {formMetrics.okMt} MT · {formMetrics.okMtr}m
                  </div>
                </div>

                {/* 3. VDI Salvage Nos */}
                <div className="rounded-xl border border-amber-300 bg-amber-50/40 p-3 space-y-1">
                  <label className="block text-xs font-bold text-amber-900">3. VDI Salvage Nos</label>
                  <input
                    type="number"
                    min="0"
                    value={vdiSalvagePcs}
                    onChange={(e) => setVdiSalvagePcs(e.target.value)}
                    className="w-full rounded-lg border border-amber-300 px-3 py-1.5 font-mono text-sm font-black text-amber-900 focus:ring-2 focus:ring-amber-500"
                  />
                  <div className="text-[11px] font-mono text-amber-700">
                    {formMetrics.salMt} MT · {formMetrics.salMtr}m
                  </div>
                </div>

                {/* 4. VDI Rejection Nos */}
                <div className="rounded-xl border border-rose-300 bg-rose-50/40 p-3 space-y-1">
                  <label className="block text-xs font-bold text-rose-900">4. VDI Rejection Nos</label>
                  <input
                    type="number"
                    min="0"
                    value={vdiRejectionPcs}
                    onChange={(e) => setVdiRejectionPcs(e.target.value)}
                    className="w-full rounded-lg border border-rose-300 px-3 py-1.5 font-mono text-sm font-black text-rose-900 focus:ring-2 focus:ring-rose-500"
                  />
                  <div className="text-[11px] font-mono text-rose-700">
                    {formMetrics.rejMt} MT · {formMetrics.rejMtr}m
                  </div>
                </div>
              </div>

              {/* Live Piece Balance Verification Indicator */}
              <div className={`p-2.5 rounded-lg text-xs flex items-center justify-between font-mono font-medium ${
                formMetrics.isPcsBalanced
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200 font-bold'
              }`}>
                <span>OK ({n(vdiOkPcs)}) + Salvage ({n(vdiSalvagePcs)}) + Rejection ({n(vdiRejectionPcs)}) = {n(vdiOkPcs) + n(vdiSalvagePcs) + n(vdiRejectionPcs)} Nos</span>
                <span>{formMetrics.isPcsBalanced ? '✓ Balanced with Inspected' : `⚠️ Must equal ${n(inspectedPcs)} Nos`}</span>
              </div>

              {/* Multi-Line Salvage Reasons Section */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                      Salvage Defect Breakdown Lines
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Specify defect categories and pieces for all salvage material
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addSalvageReason}
                    className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-200 border border-amber-300 transition-colors"
                  >
                    <Plus size={13} />
                    Add Salvage Reason
                  </button>
                </div>

                {salvageReasons.length === 0 ? (
                  <div className="text-center py-3 text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                    {n(vdiSalvagePcs) > 0
                      ? '⚠️ Please click "+ Add Salvage Reason" above to allocate the salvage pieces to defect causes.'
                      : 'No salvage pieces recorded. Add lines if any material needs rework.'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {salvageReasons.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200 text-xs">
                        <select
                          value={item.reason}
                          onChange={(e) => updateSalvageReason(item.id, 'reason', e.target.value)}
                          className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-800 font-medium"
                        >
                          {DEFAULT_SALVAGE_REASONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>

                        <div className="flex items-center gap-1 w-24">
                          <input
                            type="number"
                            min="1"
                            value={item.pcs || ''}
                            placeholder="Pieces"
                            onChange={(e) => updateSalvageReason(item.id, 'pcs', n(e.target.value))}
                            className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono font-bold text-amber-900"
                          />
                          <span className="text-slate-400 text-[10px]">Nos</span>
                        </div>

                        <input
                          type="text"
                          value={item.remarks || ''}
                          placeholder="Notes (optional)"
                          onChange={(e) => updateSalvageReason(item.id, 'remarks', e.target.value)}
                          className="w-36 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
                        />

                        <button
                          type="button"
                          onClick={() => removeSalvageReason(item.id)}
                          className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded"
                          title="Remove reason line"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}

                    <div className="flex items-center justify-between text-xs font-mono pt-1 text-slate-600">
                      <span>Reason lines allocated: <strong>{formMetrics.totalSalvageReasonPcs} Nos</strong></span>
                      <span className={formMetrics.isSalvageBalanced ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold'}>
                        {formMetrics.isSalvageBalanced ? '✓ Salvage reasons match' : `⚠️ Must match VDI Salvage (${n(vdiSalvagePcs)} Nos)`}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks / QA Clearance Notes</label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. Cleared for Finishing line, surface visual pass"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !formMetrics.isPcsBalanced || !formMetrics.isSalvageBalanced}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {saving ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Check size={14} /> Save QC Inspection
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Delete QC Inspection</h3>
                <p className="text-xs text-slate-500">WO #{deleteTarget.work_order_no}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete this inspection record? The inspected pieces will return to the available Heat Treatment WIP pool, and downstream Finishing Line WIP will be recalculated.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 active:scale-95"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* POST-REWORK DISPOSITION MODAL */}
      {reworkModalOpen && reworkTargetWo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50/70 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-600 text-white shadow">
                  <Wrench size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    Process VDI Salvage Rework
                  </h3>
                  <p className="text-xs text-slate-600">
                    Work Order #{reworkTargetWo.work_order_no} · {reworkTargetWo.customer_name || 'Commercial Tube'}
                    {reworkTargetInspection ? ` (Inspection from ${reworkTargetInspection.inspection_date})` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReworkModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleReworkSubmit} className="p-6 space-y-5">
              {/* Order & Salvage Info Badge */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 rounded-xl bg-amber-50/50 border border-amber-200 p-3 text-xs">
                <div>
                  <span className="text-slate-500 block">Specification:</span>
                  <span className="font-bold text-slate-800">{reworkTargetWo.specification || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Dimensions:</span>
                  <span className="font-bold font-mono text-slate-800">
                    {reworkTargetWo.size_od} × {reworkTargetWo.size_wt} mm
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Avg Length:</span>
                  <span className="font-bold font-mono text-slate-800">{reworkTargetWo.avg_length} m</span>
                </div>
                <div>
                  <span className="text-amber-800 font-semibold block">Available Salvage:</span>
                  <span className="font-black font-mono text-amber-950 text-sm">
                    {reworkFormMetrics.availPcs} Nos
                  </span>
                  <span className="text-[10px] text-amber-700 block font-mono">
                    {reworkFormMetrics.availMt} MT · {reworkFormMetrics.availMtr}m
                  </span>
                </div>
              </div>

              {/* Active Defects List */}
              {reworkTargetWo.salvage_reasons && reworkTargetWo.salvage_reasons.length > 0 && (
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-xs">
                  <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Original Defects Identified at QC
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {reworkTargetWo.salvage_reasons.map((r, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center rounded-md bg-white border border-amber-200 px-2 py-0.5 text-xs font-mono font-medium text-amber-900 shadow-sm"
                      >
                        {r.reason}: <strong className="ml-1 text-amber-950">{r.pcs} Nos</strong>
                        {r.remarks && <span className="ml-1 text-slate-400 font-normal italic">({r.remarks})</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Rework Processing Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Rework Disposition Date *
                </label>
                <input
                  type="date"
                  required
                  value={reworkDate}
                  onChange={(e) => setReworkDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>

              {/* Disposition Breakdown Cards */}
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Post-Rework Disposition Breakdown
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Option 1: VDI OK */}
                  <div className="rounded-xl border border-emerald-300 bg-emerald-50/40 p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-emerald-950">
                        1. Passed: VDI OK
                      </label>
                      <span className="text-[10px] font-semibold bg-emerald-200/80 text-emerald-900 px-1.5 py-0.5 rounded">
                        Finishing WIP
                      </span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      max={reworkFormMetrics.availPcs}
                      value={reworkVdiOkPcs}
                      onChange={(e) => setReworkVdiOkPcs(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-lg border border-emerald-300 px-3 py-1.5 font-mono text-sm font-black text-emerald-900 focus:ring-2 focus:ring-emerald-500"
                    />
                    <div className="text-[11px] font-mono text-emerald-700">
                      {reworkFormMetrics.okMt} MT · {reworkFormMetrics.okMtr}m
                    </div>
                    <p className="text-[10px] text-emerald-800 leading-tight">
                      Releases directly to Finishing Queue for Work Order #{reworkTargetWo.work_order_no}.
                    </p>
                  </div>

                  {/* Option 2: Diverted */}
                  <div className="rounded-xl border border-blue-300 bg-blue-50/40 p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-blue-950">
                        2. Diverted
                      </label>
                      <span className="text-[10px] font-semibold bg-blue-200/80 text-blue-900 px-1.5 py-0.5 rounded">
                        Other WO
                      </span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      max={reworkFormMetrics.availPcs}
                      value={reworkDivertedPcs}
                      onChange={(e) => setReworkDivertedPcs(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-lg border border-blue-300 px-3 py-1.5 font-mono text-sm font-black text-blue-900 focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="text-[11px] font-mono text-blue-700">
                      {reworkFormMetrics.divMt} MT · {reworkFormMetrics.divMtr}m
                    </div>
                    <p className="text-[10px] text-blue-800 leading-tight">
                      Diverts reworked tubes to another Work Order.
                    </p>
                  </div>

                  {/* Option 3: Scrapped */}
                  <div className="rounded-xl border border-rose-300 bg-rose-50/40 p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-rose-950">
                        3. Rejection / Scrap
                      </label>
                      <span className="text-[10px] font-semibold bg-rose-200/80 text-rose-900 px-1.5 py-0.5 rounded">
                        Scrapped
                      </span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      max={reworkFormMetrics.availPcs}
                      value={reworkRejectionPcs}
                      onChange={(e) => setReworkRejectionPcs(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-lg border border-rose-300 px-3 py-1.5 font-mono text-sm font-black text-rose-900 focus:ring-2 focus:ring-rose-500"
                    />
                    <div className="text-[11px] font-mono text-rose-700">
                      {reworkFormMetrics.rejMt} MT · {reworkFormMetrics.rejMtr}m
                    </div>
                    <p className="text-[10px] text-rose-800 leading-tight">
                      Material unrecoverable after rework attempt.
                    </p>
                  </div>
                </div>
              </div>

              {/* Conditional Target Work Order Selection if Diverted > 0 */}
              {reworkFormMetrics.divPcs > 0 && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center gap-2 text-blue-900 font-bold text-xs">
                    <GitFork size={15} />
                    Target Work Order for Diversion ({reworkFormMetrics.divPcs} Nos / {reworkFormMetrics.divMtr}m)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Select Target Work Order *
                      </label>
                      <select
                        required
                        value={reworkTargetWoId}
                        onChange={(e) => setReworkTargetWoId(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">-- Choose Target WO --</option>
                        {availableTargetWos.map((w) => (
                          <option key={w.id} value={w.id}>
                            WO #{w.work_order_no} ({w.customer_name || 'Commercial'} · {w.size_od}×{w.size_wt}mm · {w.specification || w.grade})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Diversion Reason / Justification
                      </label>
                      <input
                        type="text"
                        value={reworkDiversionReason}
                        onChange={(e) => setReworkDiversionReason(e.target.value)}
                        placeholder="e.g. Diverted after straightening/cutting to size"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Live Processing Balance Bar */}
              <div
                className={`p-3 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1 font-mono font-medium ${
                  reworkFormMetrics.isValid
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                    : 'bg-rose-50 text-rose-900 border border-rose-300 font-bold'
                }`}
              >
                <span>
                  Processed: <strong>{reworkFormMetrics.totalProcessed}</strong> / {reworkFormMetrics.availPcs} Nos
                  (OK: {reworkFormMetrics.okPcs}, Diverted: {reworkFormMetrics.divPcs}, Scrap: {reworkFormMetrics.rejPcs})
                </span>
                <span>
                  {reworkFormMetrics.totalProcessed === 0 ? (
                    '⚠️ Enter at least 1 Nos to process'
                  ) : reworkFormMetrics.totalProcessed > reworkFormMetrics.availPcs ? (
                    `⚠️ Exceeds available salvage by ${reworkFormMetrics.totalProcessed - reworkFormMetrics.availPcs} Nos`
                  ) : reworkFormMetrics.divPcs > 0 && !reworkTargetWoId ? (
                    '⚠️ Select a Target Work Order for diversion'
                  ) : (
                    `✓ Valid (${reworkFormMetrics.remainingSalvage} Nos salvage will remain)`
                  )}
                </span>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Rework Clearance Remarks / Notes
                </label>
                <input
                  type="text"
                  value={reworkRemarks}
                  onChange={(e) => setReworkRemarks(e.target.value)}
                  placeholder="e.g. Straightened on Bigwood machine, surface re-inspected 100% OK"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReworkModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reworkSaving || !reworkFormMetrics.isValid}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-amber-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {reworkSaving ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" /> Processing Rework...
                    </>
                  ) : (
                    <>
                      <Check size={14} /> Confirm & Process Rework
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
