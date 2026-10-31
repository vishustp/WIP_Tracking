// lib/mill-rejections/client.ts

import { createClient } from '@/lib/supabase/client';
import { cleanRemarksFromSystemTags, isHollowBankOrder, HOLLOW_BANK_WO_ID } from '@/lib/productionUtils';
import { parseDivStages } from '@/lib/reports/agingReportHelper';
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
 * Reconciles and deducts outbound diversions (to Hollow Bank or Target Work Orders)
 * from mill rejection and salvage items.
 */
export function applyDiversionsToMillRejections(
  entries: MillRejectionEntry[],
  diversions: any[] = [],
  hollowBankEntries: any[] = []
): MillRejectionEntry[] {
  // Track remaining allocated pools per (woId + '_' + stageCode)
  const stagePools = new Map<string, { pcs: number; mtr: number }>();
  // Also track exact lot matches
  const lotPools = new Map<string, { pcs: number; mtr: number }>();

  // Populate diversion pools from diversion_plans
  (diversions || []).forEach((d) => {
    const woId = d.source_wo_id || d.source_work_order_id;
    if (!woId) return;
    const reasonStr = String(d.reason || d.remarks || '');
    const { sourceStage } = parseDivStages(d);
    const key = `${woId}_${sourceStage.toUpperCase()}`;
    const dQty = Number(d.diverted_qty ?? d.diverted_mtr ?? 0);

    let pcs = 0;
    if (d.diverted_pcs != null && Number(d.diverted_pcs) > 0) {
      pcs = Number(d.diverted_pcs);
    } else {
      const pcsMatch = reasonStr.match(/\[PCS:\s*([0-9]+)\]/i);
      if (pcsMatch) {
        pcs = Number(pcsMatch[1]);
      }
    }

    // Check if reason has a lot tag, e.g. [LOT: 426100249]
    const lotMatch = reasonStr.match(/\[LOT:\s*([^\]]+)\]/i);
    if (lotMatch) {
      const lotKey = `${woId}_${lotMatch[1].trim()}`;
      const curLot = lotPools.get(lotKey) || { pcs: 0, mtr: 0 };
      lotPools.set(lotKey, {
        pcs: curLot.pcs + (pcs || (dQty > 0 ? Math.round(dQty / 6.0) : 0)),
        mtr: curLot.mtr + dQty,
      });
    }

    const cur = stagePools.get(key) || { pcs: 0, mtr: 0 };
    stagePools.set(key, {
      pcs: cur.pcs + pcs,
      mtr: cur.mtr + dQty,
    });
  });

  // Also factor in hollow bank entries to deduct banked material from salvage/rejections
  (hollowBankEntries || []).forEach((hb) => {
    const woId = hb.source_wo_id;
    if (!woId) return;
    const stageCode = (hb.source_stage_code || 'VDI').toUpperCase();
    const hbPcs = Number(hb.pcs || 0);
    const hbMtr = Number(hb.total_meters || 0);
    if (hbPcs <= 0 && hbMtr <= 0) return;

    const remarks = String(hb.remarks || '');
    const lotMatch = remarks.match(/\[LOT:\s*([^\]]+)\]/i);
    const effectiveLot = hb.lot_no || (lotMatch ? lotMatch[1].trim() : null);

    // 1. If lot number is present in lot_no or remarks, register in lotPools
    if (effectiveLot) {
      const lotKey = `${woId}_${effectiveLot.trim()}`;
      const curLot = lotPools.get(lotKey) || { pcs: 0, mtr: 0 };
      lotPools.set(lotKey, {
        pcs: curLot.pcs + hbPcs,
        mtr: curLot.mtr + hbMtr,
      });
    }

    // 2. Add to stagePools for general stage deduction
    const key = `${woId}_${stageCode}`;
    const cur = stagePools.get(key) || { pcs: 0, mtr: 0 };
    stagePools.set(key, {
      pcs: cur.pcs + hbPcs,
      mtr: cur.mtr + hbMtr,
    });

    // Also add to VDI / VDI_SALVAGE pool if banked from VDI
    if (stageCode === 'VDI' || stageCode === 'VDI_SALVAGE') {
      const vdiKey = `${woId}_VDI`;
      const curVdi = stagePools.get(vdiKey) || { pcs: 0, mtr: 0 };
      stagePools.set(vdiKey, {
        pcs: curVdi.pcs + hbPcs,
        mtr: curVdi.mtr + hbMtr,
      });

      const salKey = `${woId}_VDI_SALVAGE`;
      const curSal = stagePools.get(salKey) || { pcs: 0, mtr: 0 };
      stagePools.set(salKey, {
        pcs: curSal.pcs + hbPcs,
        mtr: curSal.mtr + hbMtr,
      });
    }
  });

  // Process entries chronologically (oldest first) so diversions consume oldest salvage first
  const sorted = [...entries].sort((a, b) => {
    const cmp = (a.date || '').localeCompare(b.date || '');
    if (cmp !== 0) return cmp;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });

  return sorted.map((e) => {
    const woId = e.workOrderId;
    const sc = (e.stageCode || (e.category === 'VDI_SALVAGE' || e.category === 'VDI_REJECTION' ? 'VDI' : e.category)).toUpperCase();
    const stageKey = `${woId}_${sc}`;
    const vdiKey = `${woId}_VDI`;
    const lotKey = e.heatLotNo ? `${woId}_${e.heatLotNo.trim()}` : null;
    const remarksLotMatch = e.remarks.match(/\[LOT:\s*([^\]]+)\]/i);
    const effectiveLotKey = lotKey || (remarksLotMatch ? `${woId}_${remarksLotMatch[1].trim()}` : null);

    let divPcs = 0;
    let divMtr = 0;

    // 1. Try exact lot match first
    if (effectiveLotKey && lotPools.has(effectiveLotKey)) {
      const lotPool = lotPools.get(effectiveLotKey)!;
      if (lotPool.mtr > 0 || lotPool.pcs > 0) {
        divMtr = Math.min(e.mtr, lotPool.mtr);
        divPcs = Math.min(e.pcs, lotPool.pcs > 0 ? lotPool.pcs : (e.avgLength > 0 ? Math.round(divMtr / e.avgLength) : e.pcs));
        lotPool.mtr = Math.max(0, Number((lotPool.mtr - divMtr).toFixed(3)));
        lotPool.pcs = Math.max(0, lotPool.pcs - divPcs);
      }
    }

    // 2. If not covered by lot, check stage pool (or VDI pool for VDI salvage)
    const activeStageKey = stagePools.has(stageKey) ? stageKey : (e.category === 'VDI_SALVAGE' && stagePools.has(vdiKey) ? vdiKey : null);
    if ((divMtr < e.mtr || divPcs < e.pcs) && activeStageKey) {
      const pool = stagePools.get(activeStageKey)!;
      if (pool.mtr > 0 || pool.pcs > 0) {
        const neededMtr = Math.max(0, e.mtr - divMtr);
        const neededPcs = Math.max(0, e.pcs - divPcs);
        const applyMtr = Math.min(neededMtr, pool.mtr);
        const applyPcs = Math.min(neededPcs, pool.pcs > 0 ? pool.pcs : (e.avgLength > 0 ? Math.round(applyMtr / e.avgLength) : neededPcs));
        divMtr += applyMtr;
        divPcs += applyPcs;
        pool.mtr = Math.max(0, Number((pool.mtr - applyMtr).toFixed(3)));
        pool.pcs = Math.max(0, pool.pcs - applyPcs);
      }
    }

    const remainingPcs = Math.max(0, e.pcs - divPcs);
    const remainingMtr = Math.max(0, Number((e.mtr - divMtr).toFixed(3)));
    const isDiverted = (divPcs > 0 || divMtr > 0) && remainingPcs <= 0 && remainingMtr <= 0;
    const isPartiallyDiverted = (divPcs > 0 || divMtr > 0) && (remainingPcs > 0 || remainingMtr > 0);

    return {
      ...e,
      divertedPcs: divPcs,
      divertedMtr: divMtr,
      remainingPcs,
      remainingMtr,
      isDiverted,
      isPartiallyDiverted,
    };
  });
}

/**
 * Fetches all shop floor rejections logged in production_logs (via get_production_entries RPC)
 * and QC inspections (VDI Salvage & VDI Rejection), reconciling outbound diversions.
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
    // 3. Query work_orders to attach steel grade, specification, and customer metadata
    // 4. Query diversion_plans and hollow_bank_inventory to deduct dispositioned material
    const [prodRes, qcRes, woRes, divRes, hbRes] = await Promise.all([
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
        .from('work_orders')
        .select('id, work_order_no, customer_name, grade, specification, size_od, size_wt, l1, l2')
        .limit(10000),
      supabase
        .from('diversion_plans')
        .select('id, source_wo_id, target_wo_id, diverted_qty, work_center, reason, diversion_date, created_at')
        .limit(10000),
      supabase
        .from('hollow_bank_inventory')
        .select('id, lot_no, source_wo_id, source_stage_code, pcs, total_meters, remarks, created_at')
        .limit(10000),
    ]);

    if (prodRes.error && qcRes.error) {
      return {
        data: [],
        kpis: getEmptyKpis(),
        error: `Production: ${prodRes.error.message}; QC: ${qcRes.error.message}`,
      };
    }

    // Work order lookup maps by ID and by Work Order Number
    const woById = new Map<string, any>();
    const woByNo = new Map<string, any>();
    (woRes.data || []).forEach((w: any) => {
      if (w.id) woById.set(w.id, w);
      if (w.work_order_no) {
        woByNo.set(w.work_order_no.trim().toUpperCase(), w);
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

      const matchedWo = woByNo.get((pl.work_order_no || '').trim().toUpperCase());
      const grade = matchedWo?.grade || matchedWo?.specification || '—';
      const actualWoId = matchedWo?.id || pl.id;

      // Hollow bank is yard buffer inventory, never a mill rejection or active salvage
      if (
        isHollowBankOrder(matchedWo) ||
        isHollowBankOrder({
          id: actualWoId,
          work_order_no: pl.work_order_no,
          customer_name: pl.customer_name || matchedWo?.customer_name,
        })
      ) {
        return;
      }

      entries.push({
        id: `pl-${pl.id}`,
        source: 'PRODUCTION_LOG',
        date: pl.process_date,
        category,
        workCenterName: name,
        stageCode,
        dispositionType: 'REJECTION',
        workOrderId: actualWoId, // actual work order reference for hollow bank diversion
        workOrderNo: pl.work_order_no || '—',
        customerName: pl.customer_name || matchedWo?.customer_name || '—',
        grade,
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

      const woMeta = woById.get(qc.work_order_id) || woByNo.get((qc.work_order_no || '').trim().toUpperCase());

      const workOrderId = woMeta?.id || qc.work_order_id;
      const workOrderNo = woMeta?.work_order_no || qc.work_order_no || '—';
      const customerName = woMeta?.customer_name || '—';

      // Hollow bank is yard buffer inventory, never a mill rejection or active salvage
      if (
        isHollowBankOrder(woMeta) ||
        isHollowBankOrder({
          id: workOrderId,
          work_order_no: workOrderNo,
          customer_name: customerName,
        })
      ) {
        return;
      }
      const grade = woMeta?.grade || woMeta?.specification || '—';
      const od = Number(woMeta?.size_od || 0);
      const wt = Number(woMeta?.size_wt || 0);
      const avgLen = Number(woMeta?.l1 && woMeta?.l2 ? (woMeta.l1 + woMeta.l2) / 2 : woMeta?.l1 || 6.0);

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
          workOrderId,
          workOrderNo,
          customerName,
          grade,
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
          workOrderId,
          workOrderNo,
          customerName,
          grade,
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

    // Reconcile and deduct outbound diversions
    const reconciledEntries = applyDiversionsToMillRejections(
      entries,
      (divRes.data || []) as any[],
      (hbRes.data || []) as any[]
    );

    // Sort by Date descending, then created_at descending
    reconciledEntries.sort((a, b) => {
      const cmpDate = (b.date || '').localeCompare(a.date || '');
      if (cmpDate !== 0) return cmpDate;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    // In-memory filters for category, dispositionType, search, hideDiverted
    let filtered = reconciledEntries;
    if (filters.hideDiverted !== false) {
      filtered = filtered.filter((e) => !e.isDiverted);
    }
    if (filters.category && filters.category !== 'ALL') {
      filtered = filtered.filter((e) => e.category === filters.category);
    }
    if (filters.dispositionType && filters.dispositionType !== 'ALL') {
      filtered = filtered.filter((e) => e.dispositionType === filters.dispositionType);
    }
    if (filters.grade && filters.grade !== 'ALL') {
      const g = filters.grade.trim().toLowerCase();
      filtered = filtered.filter((e) => e.grade && e.grade.toLowerCase().includes(g));
    }
    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.workOrderNo.toLowerCase().includes(q) ||
          e.customerName.toLowerCase().includes(q) ||
          (e.grade && e.grade.toLowerCase().includes(q)) ||
          e.remarks.toLowerCase().includes(q) ||
          (e.heatLotNo && e.heatLotNo.toLowerCase().includes(q))
      );
    }

    // Compute KPIs across active/filtered entries
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
      const activePcs = e.remainingPcs != null ? e.remainingPcs : (e.isDiverted ? 0 : e.pcs);
      const activeMtr = e.remainingMtr != null ? e.remainingMtr : (e.isDiverted ? 0 : e.mtr);
      const activeMt = (e.pcs > 0 && activePcs !== e.pcs)
        ? computePipeWeight(activeMtr, e.sizeOd, e.sizeWt)
        : (e.isDiverted ? 0 : e.mt);

      kpis.grandTotalPcs += activePcs;
      kpis.grandTotalMtr += activeMtr;
      kpis.grandTotalMt += activeMt;

      if (e.category === 'ROLLING') {
        kpis.totalRollingPcs += activePcs;
        kpis.totalRollingMt += activeMt;
      } else if (e.category === 'DRAW') {
        kpis.totalDrawPcs += activePcs;
        kpis.totalDrawMt += activeMt;
      } else if (e.category === 'HEAT_TREATMENT') {
        kpis.totalHtPcs += activePcs;
        kpis.totalHtMt += activeMt;
      } else if (e.category === 'VDI_SALVAGE') {
        kpis.totalVdiSalvagePcs += activePcs;
        kpis.totalVdiSalvageMt += activeMt;
      } else if (e.category === 'VDI_REJECTION') {
        kpis.totalVdiRejPcs += activePcs;
        kpis.totalVdiRejMt += activeMt;
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
