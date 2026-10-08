// lib/mill-rejections/client.ts

import { createClient } from '@/lib/supabase/client';
import { cleanRemarksFromSystemTags } from '@/lib/productionUtils';
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
 * Fetches all shop floor rejections logged in production_logs (via get_production_entries RPC)
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

    // 1. Call get_production_entries RPC (security definer with full route, stage, and WO joins)
    // 2. Query qc_inspections for VDI Salvage & VDI Rejection
    // 3. Query vw_route_stage_wip to attach work order metadata to QC inspections
    const [prodRes, qcRes, wipRes] = await Promise.all([
      supabase.rpc('get_production_entries', {
        p_search: null,
        p_stage_code: null,
        p_route_code: null,
        p_from_date: filters.fromDate || null,
        p_to_date: filters.toDate || null,
        p_limit: 5000,
        p_offset: 0,
      }),
      supabase
        .from('qc_inspections')
        .select('*')
        .or('vdi_salvage_pcs.gt.0,vdi_rejection_pcs.gt.0')
        .order('inspection_date', { ascending: false }),
      supabase
        .from('vw_route_stage_wip')
        .select('work_order_id, work_order_no, customer_name, size_od, size_wt'),
    ]);

    if (prodRes.error && qcRes.error) {
      return {
        data: [],
        kpis: getEmptyKpis(),
        error: `Production: ${prodRes.error.message}; QC: ${qcRes.error.message}`,
      };
    }

    // Work order lookup map for QC inspections
    const woMap = new Map<string, { work_order_no: string; customer_name: string; size_od: number; size_wt: number }>();
    (wipRes.data || []).forEach((w: any) => {
      if (w.work_order_id && !woMap.has(w.work_order_id)) {
        woMap.set(w.work_order_id, {
          work_order_no: w.work_order_no || '—',
          customer_name: w.customer_name || '—',
          size_od: Number(w.size_od || 0),
          size_wt: Number(w.size_wt || 0),
        });
      }
    });

    const entries: MillRejectionEntry[] = [];

    // Parse Production Logs from get_production_entries
    const rawProd = (prodRes.data || []) as any[];
    rawProd.forEach((pl) => {
      const rejMtr = Number(pl.rejection_mtr || 0);
      const rejPcs = Math.round(Number(pl.rejection_pcs || 0));

      // Only process entries where rejection was logged
      if (rejMtr <= 0 && rejPcs <= 0) return;

      const stageCode = pl.stage_code || '';
      const { category, name } = mapStageToCategory(stageCode);

      const l1 = Number(pl.l1 || 0);
      const l2 = Number(pl.l2 || 0);
      const avgLen = Number(pl.avg_length || (l1 && l2 ? (l1 + l2) / 2 : l1 || 6.0));

      const od = Number(pl.od || 0);
      const wt = Number(pl.wl || 0);

      const finalPcs = rejPcs > 0 ? rejPcs : (avgLen > 0 ? Math.round(rejMtr / avgLen) : 1);
      const finalMtr = rejMtr > 0 ? rejMtr : (finalPcs * avgLen);
      const finalMt = Number(pl.rejection_mt || computePipeWeight(finalMtr, od, wt));

      const cleanRemarks = cleanRemarksFromSystemTags(pl.remarks);

      entries.push({
        id: `pl-${pl.id}`,
        source: 'PRODUCTION_LOG',
        date: pl.process_date,
        category,
        workCenterName: name,
        stageCode,
        dispositionType: 'REJECTION',
        workOrderId: pl.id, // entry reference
        workOrderNo: pl.work_order_no || '—',
        customerName: pl.customer_name || '—',
        grade: '—',
        sizeOd: od,
        sizeWt: wt,
        avgLength: avgLen,
        heatLotNo: pl.heat_lot_no || '',
        pcs: finalPcs,
        mtr: finalMtr,
        mt: finalMt,
        remarks: cleanRemarks || 'Production scrap logged by operator',
        loggedBy: 'Production Operator',
        createdAt: pl.created_at,
      });
    });

    // Parse QC Inspections (split into VDI Salvage and VDI Rejection lines)
    const rawQc = (qcRes.data || []) as any[];
    rawQc.forEach((qc) => {
      // Date filter check for QC
      if (filters.fromDate && qc.inspection_date < filters.fromDate) return;
      if (filters.toDate && qc.inspection_date > filters.toDate) return;

      const woMeta = woMap.get(qc.work_order_id) || {
        work_order_no: '—',
        customer_name: '—',
        size_od: 0,
        size_wt: 0,
      };

      const od = woMeta.size_od;
      const wt = woMeta.size_wt;
      const avgLen = 6.0; // default estimated pipe length for QC if unjoined

      // VDI Salvage Line
      const salPcs = Math.round(Number(qc.vdi_salvage_pcs || 0));
      const salMtr = Number(qc.vdi_salvage_mtr || (salPcs * avgLen));
      const salMt = Number(qc.vdi_salvage_mt || computePipeWeight(salMtr, od, wt));

      if (salPcs > 0 || salMtr > 0) {
        let reasonsTxt = '';
        if (Array.isArray(qc.salvage_reasons)) {
          reasonsTxt = qc.salvage_reasons
            .map((r: any) => (typeof r === 'string' ? r : r.reason || r.label))
            .filter(Boolean)
            .join(', ');
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
          workOrderNo: woMeta.work_order_no,
          customerName: woMeta.customer_name,
          grade: '—',
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
          workOrderNo: woMeta.work_order_no,
          customerName: woMeta.customer_name,
          grade: '—',
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
      const cmpDate = (b.date || '').localeCompare(a.date || '');
      if (cmpDate !== 0) return cmpDate;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
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
      filtered = filtered.filter(
        (e) =>
          e.workOrderNo.toLowerCase().includes(q) ||
          e.customerName.toLowerCase().includes(q) ||
          e.remarks.toLowerCase().includes(q) ||
          (e.heatLotNo && e.heatLotNo.toLowerCase().includes(q))
      );
    }

    // Compute KPIs across all retrieved entries
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
