// lib/mill-rejections/client.ts

import { createClient } from '@/lib/supabase/client';
import {
  MillRejectionEntry,
  MillRejectionSummaryKpis,
  MillRejectionFilterOptions,
  MillRejectionCategory,
} from './types';

function computePipeWeight(mtr: number, od: number, wt: number): number {
  if (!mtr || !od || !wt || od <= wt) return 0;
  const factor = (od - wt) * wt * 0.0246615 * 0.001;
  return Number((mtr * factor).toFixed(3));
}

function mapStageToCategory(stageCode: string): { category: MillRejectionCategory; name: string } {
  const code = (stageCode || '').toUpperCase();
  if (code === 'ROLLING') {
    return { category: 'ROLLING', name: 'Hot Rolling Mill' };
  }
  if (code === 'DRAW' || code === 'PILGER') {
    return { category: 'DRAW', name: code === 'PILGER' ? 'Pilger Mill' : 'Cold Draw Bench' };
  }
  if (code === 'HOLLOW_HEAT_TREATMENT' || code === 'HEAT_TREATMENT') {
    return {
      category: 'HEAT_TREATMENT',
      name: code === 'HOLLOW_HEAT_TREATMENT' ? 'Hollow Heat Treatment' : 'Final Heat Treatment',
    };
  }
  if (code === 'BAND_SAW') {
    return { category: 'BAND_SAW', name: 'Band Saw Cutting' };
  }
  if (code === 'FINISHING') {
    return { category: 'FINISHING', name: 'Finishing Line' };
  }
  return { category: 'OTHER', name: stageCode || 'Production Station' };
}

/**
 * Fetches all shop floor rejections logged in production_logs
 * and QC inspections (VDI Salvage & VDI Rejection)
 */
export async function fetchMillRejectionsAndSalvage(
  filters: MillRejectionFilterOptions = {}
): Promise<{
  data: MillRejectionEntry[];
  kpis: MillRejectionSummaryKpis;
  error: string | null;
}> {
  try {
    const supabase = createClient();

    // 1. Production Logs Query (rejection_qty > 0 or rejection_pcs > 0)
    let prodQuery = supabase
      .from('production_logs')
      .select(`
        id,
        work_order_id,
        stage_id,
        process_date,
        input_qty,
        output_qty,
        rejection_qty,
        rejection_pcs,
        heat_lot_no,
        remarks,
        created_by,
        created_at,
        process_stages:stage_id (
          id,
          stage_code,
          stage_name
        ),
        work_orders:work_order_id (
          id,
          work_order_no,
          customer_name,
          grade,
          specification,
          size_od,
          size_wt,
          l1,
          l2
        )
      `)
      .or('rejection_qty.gt.0,rejection_pcs.gt.0')
      .order('process_date', { ascending: false });

    if (filters.fromDate) {
      prodQuery = prodQuery.gte('process_date', filters.fromDate);
    }
    if (filters.toDate) {
      prodQuery = prodQuery.lte('process_date', filters.toDate);
    }

    // 2. QC Inspections Query (vdi_salvage_pcs > 0 or vdi_rejection_pcs > 0)
    let qcQuery = supabase
      .from('qc_inspections')
      .select(`
        id,
        work_order_id,
        inspection_date,
        inspected_pcs,
        inspected_mtr,
        vdi_ok_pcs,
        vdi_ok_mtr,
        vdi_salvage_pcs,
        vdi_salvage_mtr,
        vdi_salvage_mt,
        vdi_rejection_pcs,
        vdi_rejection_mtr,
        vdi_rejection_mt,
        salvage_reasons,
        remarks,
        created_by,
        created_at,
        work_orders:work_order_id (
          id,
          work_order_no,
          customer_name,
          grade,
          specification,
          size_od,
          size_wt,
          l1,
          l2
        )
      `)
      .or('vdi_salvage_pcs.gt.0,vdi_rejection_pcs.gt.0,vdi_salvage_mtr.gt.0,vdi_rejection_mtr.gt.0')
      .order('inspection_date', { ascending: false });

    if (filters.fromDate) {
      qcQuery = qcQuery.gte('inspection_date', filters.fromDate);
    }
    if (filters.toDate) {
      qcQuery = qcQuery.lte('inspection_date', filters.toDate);
    }

    const [{ data: prodLogs, error: prodErr }, { data: qcLogs, error: qcErr }] =
      await Promise.all([prodQuery, qcQuery]);

    if (prodErr && qcErr) {
      return { data: [], kpis: getEmptyKpis(), error: `${prodErr.message}; ${qcErr.message}` };
    }

    const entries: MillRejectionEntry[] = [];

    // Parse Production Logs
    (prodLogs || []).forEach((pl: any) => {
      const wo = pl.work_orders;
      const ps = pl.process_stages;
      const stageCode = ps?.stage_code || '';
      const { category, name } = mapStageToCategory(stageCode);

      const l1 = Number(wo?.l1 || 0);
      const l2 = Number(wo?.l2 || 0);
      const avgLen = l1 && l2 ? (l1 + l2) / 2 : l1 || 6.0;

      const od = Number(wo?.size_od || 0);
      const wt = Number(wo?.size_wt || 0);

      const rejPcs = Math.round(Number(pl.rejection_pcs || 0));
      const rejMtr = Number(pl.rejection_qty || 0);

      const finalPcs = rejPcs > 0 ? rejPcs : (avgLen > 0 ? Math.round(rejMtr / avgLen) : 0);
      const finalMtr = rejMtr > 0 ? rejMtr : (finalPcs * avgLen);
      const finalMt = computePipeWeight(finalMtr, od, wt);

      entries.push({
        id: `pl-${pl.id}`,
        source: 'PRODUCTION_LOG',
        date: pl.process_date,
        category,
        workCenterName: name,
        stageCode,
        dispositionType: 'REJECTION',
        workOrderId: pl.work_order_id,
        workOrderNo: wo?.work_order_no || '—',
        customerName: wo?.customer_name || '—',
        grade: wo?.grade || '—',
        sizeOd: od,
        sizeWt: wt,
        avgLength: avgLen,
        heatLotNo: pl.heat_lot_no || '',
        pcs: finalPcs,
        mtr: finalMtr,
        mt: finalMt,
        remarks: pl.remarks || '',
        loggedBy: pl.created_by || 'Production Operator',
        createdAt: pl.created_at,
      });
    });

    // Parse QC Inspections (split into Salvage and Rejection lines)
    (qcLogs || []).forEach((qc: any) => {
      const wo = qc.work_orders;
      const l1 = Number(wo?.l1 || 0);
      const l2 = Number(wo?.l2 || 0);
      const avgLen = l1 && l2 ? (l1 + l2) / 2 : l1 || 6.0;

      const od = Number(wo?.size_od || 0);
      const wt = Number(wo?.size_wt || 0);

      // VDI Salvage Line
      const salPcs = Math.round(Number(qc.vdi_salvage_pcs || 0));
      const salMtr = Number(qc.vdi_salvage_mtr || (salPcs * avgLen));
      const salMt = Number(qc.vdi_salvage_mt || computePipeWeight(salMtr, od, wt));

      if (salPcs > 0 || salMtr > 0) {
        let reasonsTxt = '';
        if (Array.isArray(qc.salvage_reasons)) {
          reasonsTxt = qc.salvage_reasons.map((r: any) => typeof r === 'string' ? r : r.reason || r.label).filter(Boolean).join(', ');
        }
        const fullRemarks = [reasonsTxt, qc.remarks].filter(Boolean).join(' | ');

        entries.push({
          id: `qc-sal-${qc.id}`,
          source: 'QC_INSPECTION',
          date: qc.inspection_date,
          category: 'VDI_SALVAGE',
          workCenterName: 'VDI Inspection',
          stageCode: 'VDI',
          dispositionType: 'SALVAGE',
          workOrderId: qc.work_order_id,
          workOrderNo: wo?.work_order_no || '—',
          customerName: wo?.customer_name || '—',
          grade: wo?.grade || '—',
          sizeOd: od,
          sizeWt: wt,
          avgLength: avgLen,
          heatLotNo: '',
          pcs: salPcs,
          mtr: salMtr,
          mt: salMt,
          remarks: fullRemarks || 'Salvage material held for disposition',
          loggedBy: qc.created_by || 'QC Inspector',
          createdAt: qc.created_at,
        });
      }

      // VDI Condemned Rejection Line
      const rejPcs = Math.round(Number(qc.vdi_rejection_pcs || 0));
      const rejMtr = Number(qc.vdi_rejection_mtr || (rejPcs * avgLen));
      const rejMt = Number(qc.vdi_rejection_mt || computePipeWeight(rejMtr, od, wt));

      if (rejPcs > 0 || rejMtr > 0) {
        entries.push({
          id: `qc-rej-${qc.id}`,
          source: 'QC_INSPECTION',
          date: qc.inspection_date,
          category: 'VDI_REJECTION',
          workCenterName: 'VDI Inspection',
          stageCode: 'VDI',
          dispositionType: 'REJECTION',
          workOrderId: qc.work_order_id,
          workOrderNo: wo?.work_order_no || '—',
          customerName: wo?.customer_name || '—',
          grade: wo?.grade || '—',
          sizeOd: od,
          sizeWt: wt,
          avgLength: avgLen,
          heatLotNo: '',
          pcs: rejPcs,
          mtr: rejMtr,
          mt: rejMt,
          remarks: qc.remarks || 'Condemned QC rejection',
          loggedBy: qc.created_by || 'QC Inspector',
          createdAt: qc.created_at,
        });
      }
    });

    // Sort by Date descending, then created_at descending
    entries.sort((a, b) => {
      const cmpDate = b.date.localeCompare(a.date);
      if (cmpDate !== 0) return cmpDate;
      return b.createdAt.localeCompare(a.createdAt);
    });

    // In-memory filters for category, dispositionType, search
    let filtered = entries;
    if (filters.category && filters.category !== 'ALL') {
      filtered = filtered.filter((e) => e.category === filters.category);
    }
    if (filters.dispositionType && filters.dispositionType !== 'ALL') {
      filtered = filtered.filter((e) => e.dispositionType === filters.dispositionType);
    }
    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      filtered = filtered.filter((e) =>
        e.workOrderNo.toLowerCase().includes(q) ||
        e.customerName.toLowerCase().includes(q) ||
        e.grade.toLowerCase().includes(q) ||
        e.remarks.toLowerCase().includes(q) ||
        (e.heatLotNo && e.heatLotNo.toLowerCase().includes(q))
      );
    }

    // Compute KPIs across all retrieved entries (or filtered)
    const kpis: MillRejectionSummaryKpis = {
      totalRollingPcs: 0,
      totalRollingMt: 0,
      totalDrawPcs: 0,
      totalDrawMt: 0,
      totalHtPcs: 0,
      totalHtMt: 0,
      totalVdiSalvagePcs: 0,
      totalVdiSalvageMt: 0,
      totalVdiRejPcs: 0,
      totalVdiRejMt: 0,
      grandTotalPcs: 0,
      grandTotalMtr: 0,
      grandTotalMt: 0,
    };

    filtered.forEach((e) => {
      kpis.grandTotalPcs += e.pcs;
      kpis.grandTotalMtr += e.mtr;
      kpis.grandTotalMt += e.mt;

      if (e.category === 'ROLLING') {
        kpis.totalRollingPcs += e.pcs;
        kpis.totalRollingMt += e.mt;
      } else if (e.category === 'DRAW') {
        kpis.totalDrawPcs += e.pcs;
        kpis.totalDrawMt += e.mt;
      } else if (e.category === 'HEAT_TREATMENT') {
        kpis.totalHtPcs += e.pcs;
        kpis.totalHtMt += e.mt;
      } else if (e.category === 'VDI_SALVAGE') {
        kpis.totalVdiSalvagePcs += e.pcs;
        kpis.totalVdiSalvageMt += e.mt;
      } else if (e.category === 'VDI_REJECTION') {
        kpis.totalVdiRejPcs += e.pcs;
        kpis.totalVdiRejMt += e.mt;
      }
    });

    return { data: filtered, kpis, error: null };
  } catch (err: any) {
    return { data: [], kpis: getEmptyKpis(), error: err.message || 'Failed to load mill rejection data' };
  }
}

function getEmptyKpis(): MillRejectionSummaryKpis {
  return {
    totalRollingPcs: 0,
    totalRollingMt: 0,
    totalDrawPcs: 0,
    totalDrawMt: 0,
    totalHtPcs: 0,
    totalHtMt: 0,
    totalVdiSalvagePcs: 0,
    totalVdiSalvageMt: 0,
    totalVdiRejPcs: 0,
    totalVdiRejMt: 0,
    grandTotalPcs: 0,
    grandTotalMtr: 0,
    grandTotalMt: 0,
  };
}
