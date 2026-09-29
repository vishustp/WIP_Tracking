// lib/reports/scrapReportHelper.ts
import { ProductionEntry, StageCode, STAGES } from '@/types';
import { mtFromMtr, extractBandSawCutsFromRemarks, extractPcsFromRemarks } from '@/lib/productionUtils';

export type ScrapSourceType =
  | 'BAND_SAW_CUTTING'
  | 'REMNANT_UNDER_3M'
  | 'STAGE_REJECTION'
  | 'QC_REJECTION';

export interface ScrapRecord {
  id: string;
  entry_id: string;
  process_date: string;
  stage_code: StageCode;
  stage_name: string;
  work_order_id?: string;
  work_order_no: string;
  customer_name: string;
  grade: string;
  size_od: number;
  size_wt: number;
  size_display: string;
  plan_no?: string;
  heat_lot_no: string;
  input_mtr: number;
  input_mt: number;
  prime_mtr: number;
  prime_mt: number;
  scrap_mtr: number;
  scrap_mt: number;
  scrap_pcs: number;
  scrap_pct: number;
  scrap_type: ScrapSourceType;
  scrap_type_label: string;
  scrap_reason: string;
  remarks: string;
  usable_offcut_mtr: number; // Remnants >= 3.0m kept for diversion/secondary
  usable_offcut_mt: number;
}

export interface ScrapSummaryKpis {
  total_scrap_mtr: number;
  total_scrap_mt: number;
  total_input_mtr: number;
  total_input_mt: number;
  overall_scrap_pct: number;
  band_saw_scrap_mtr: number;
  band_saw_scrap_mt: number;
  process_rejection_scrap_mtr: number;
  process_rejection_scrap_mt: number;
  qc_rejection_scrap_mtr: number;
  qc_rejection_scrap_mt: number;
  remnants_under_3m_mtr: number;
  remnants_under_3m_mt: number;
  usable_offcuts_mtr: number;
  usable_offcuts_mt: number;
  total_records_count: number;
}

export interface StageScrapSummary {
  stage_code: StageCode;
  stage_name: string;
  total_input_mt: number;
  total_prime_mt: number;
  total_scrap_mtr: number;
  total_scrap_mt: number;
  scrap_rate_pct: number;
  entry_count: number;
}

export interface ScrapFilterOptions {
  stage?: string;
  grade?: string;
  scrapType?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
}

const STAGE_NAME_MAP: Record<string, string> = {
  ROLLING: 'Hot Rolling Mill',
  HOLLOW_HEAT_TREATMENT: 'Hollow Heat Treatment',
  DRAW: 'Cold Draw Bench',
  HEAT_TREATMENT: 'Final Heat Treatment',
  BAND_SAW: 'Band Saw Cutting',
  VDI: 'VDI / QC Inspection',
  FINISHING: 'Finishing & Inspection',
};

export const SCRAP_TYPE_LABELS: Record<ScrapSourceType, string> = {
  BAND_SAW_CUTTING: 'Band Saw Cutting Scrap',
  REMNANT_UNDER_3M: 'Off-cut Remnant (<3.0m)',
  STAGE_REJECTION: 'Stage Process Rejection',
  QC_REJECTION: 'QC Inspection Rejection',
};

/**
 * Extracts defect/rejection reason from remarks string (e.g., "[REJ:reason]" or general text)
 */
export function extractRejectionReason(remarks: string | null | undefined): string {
  if (!remarks) return 'Unspecified';
  const rejMatch = remarks.match(/\[REJ:([^\]]+)\]/i);
  if (rejMatch && rejMatch[1]) {
    return rejMatch[1].trim();
  }
  const clean = remarks
    .replace(/\[CUTS:[^\]]*\]/gi, '')
    .replace(/\[PCS:[^\]]*\]/gi, '')
    .replace(/\[AVG:[^\]]*\]/gi, '')
    .replace(/\[L1:[^\]]*\]/gi, '')
    .replace(/\[L2:[^\]]*\]/gi, '')
    .trim();
  return clean || 'Process Non-Conformance';
}

/**
 * Parses and extracts all scrap events from production entries and work orders
 */
export function extractScrapRecordsFromEntries(
  entries: ProductionEntry[],
  workOrderMap: Map<string, any>,
  qcMap?: Map<string, any[]>
): ScrapRecord[] {
  const records: ScrapRecord[] = [];

  for (const entry of entries) {
    const wo = workOrderMap.get(entry.work_order_no) ||
      (entry.work_order_id ? workOrderMap.get(entry.work_order_id) : null) || {};

    const grade = String(wo.grade || entry.grade || 'Carbon Steel').trim();
    const customer = String(wo.customer_name || entry.customer_name || 'Standard Production').trim();
    const od = Number(entry.od || wo.size_od || 0);
    const wt = Number(entry.wl || wo.size_wt || 0);
    const sizeDisplay = od > 0 && wt > 0 ? `${od} × ${wt} mm` : '—';
    const stageName = STAGE_NAME_MAP[entry.stage_code] || entry.stage_code;

    // --- CASE 1: BAND SAW CUTTING SCRAP ---
    if (entry.stage_code === 'BAND_SAW') {
      const cutsParsed = extractBandSawCutsFromRemarks(entry.remarks);
      let bsScrapMtr = cutsParsed.scrapMtr != null ? Number(cutsParsed.scrapMtr) : 0;
      let bsScrapMt = cutsParsed.scrapMt != null ? Number(cutsParsed.scrapMt) : 0;
      let offcutMtr = cutsParsed.offcutMtr != null ? Number(cutsParsed.offcutMtr) : 0;

      let scrapPcs = 0;
      let remnantUnder3mMtr = 0;

      // Inspect individual cuts if present
      if (cutsParsed.cuts && Array.isArray(cutsParsed.cuts)) {
        for (const cut of cutsParsed.cuts) {
          const cutLen = Number(cut.len || 0);
          const pcs = Number(cut.pcs || 0);
          const cat = String(cut.cat || 'PRIME').toUpperCase();

          if (cat === 'SCRAP_TRIM' || cat === 'SCRAP_NOT_REQUIRED') {
            scrapPcs += pcs;
            // If scrap_m was 0 in JSON header, sum from cuts
            if (bsScrapMtr === 0) {
              bsScrapMtr += cutLen * pcs;
            }
          } else if (cat === 'OFFCUT') {
            // Rule 5B check: Remnant < 3.0m is automatically scrap melt loss
            if (cutLen < 3.0 && cutLen > 0) {
              remnantUnder3mMtr += cutLen * pcs;
              scrapPcs += pcs;
            }
          }
        }
      }

      // If cuts parsed yielded 0 but input > output, calculate kerf/crop loss per Rule 4
      if (bsScrapMtr === 0 && entry.input_mtr > entry.output_mtr) {
        bsScrapMtr = Number((entry.input_mtr - entry.output_mtr).toFixed(2));
      }

      const totalScrapMtr = Number((bsScrapMtr + remnantUnder3mMtr).toFixed(2));

      if (totalScrapMtr > 0.05) {
        if (bsScrapMt === 0 && od > 0 && wt > 0) {
          bsScrapMt = mtFromMtr(totalScrapMtr, od, wt);
        }

        const usableOffcutMt = offcutMtr > 0 && od > 0 && wt > 0 ? mtFromMtr(offcutMtr, od, wt) : 0;
        const inputMtr = Number(entry.input_mtr || 0);
        const inputMt = Number(entry.input_mt || (inputMtr > 0 ? mtFromMtr(inputMtr, od, wt) : 0));
        const primeMtr = Number(entry.output_mtr || 0);
        const primeMt = Number(entry.output_mt || (primeMtr > 0 ? mtFromMtr(primeMtr, od, wt) : 0));
        const scrapPct = inputMtr > 0 ? Number(((totalScrapMtr / inputMtr) * 100).toFixed(1)) : 0;

        const scrapType: ScrapSourceType = remnantUnder3mMtr > 0 ? 'REMNANT_UNDER_3M' : 'BAND_SAW_CUTTING';
        const reason = remnantUnder3mMtr > 0
          ? `End Trim (${bsScrapMtr.toFixed(1)}m) + Remnant <3.0m (${remnantUnder3mMtr.toFixed(1)}m - Rule 5B)`
          : `Band Saw Cutting Trim & Kerf Loss (${bsScrapMtr.toFixed(1)}m)`;

        records.push({
          id: `scrap-${entry.id}-bs`,
          entry_id: entry.id,
          process_date: entry.process_date || new Date().toISOString().slice(0, 10),
          stage_code: 'BAND_SAW',
          stage_name: stageName,
          work_order_id: entry.work_order_id || wo.id,
          work_order_no: entry.work_order_no,
          customer_name: customer,
          grade,
          size_od: od,
          size_wt: wt,
          size_display: sizeDisplay,
          plan_no: entry.plan_no,
          heat_lot_no: entry.heat_lot_no || '—',
          input_mtr: inputMtr,
          input_mt: inputMt,
          prime_mtr: primeMtr,
          prime_mt: primeMt,
          scrap_mtr: totalScrapMtr,
          scrap_mt: bsScrapMt,
          scrap_pcs: scrapPcs || 1,
          scrap_pct: scrapPct,
          scrap_type: scrapType,
          scrap_type_label: SCRAP_TYPE_LABELS[scrapType],
          scrap_reason: reason,
          remarks: entry.remarks || '',
          usable_offcut_mtr: offcutMtr,
          usable_offcut_mt: usableOffcutMt,
        });
      }
      continue;
    }

    // --- CASE 2: PROCESS STAGE REJECTIONS (Rolling, Hollow HT, Draw, Final HT, Finishing, VDI) ---
    const rejMtr = Number(entry.rejection_mtr || 0);
    const rejPcs = Number(entry.rejection_pcs || 0);

    if (rejMtr > 0.05 || rejPcs > 0) {
      let rejMt = Number(entry.rejection_mt || 0);
      if (rejMt === 0 && od > 0 && wt > 0) {
        rejMt = mtFromMtr(rejMtr, od, wt);
      }

      const inputMtr = Number(entry.input_mtr || 0);
      const inputMt = Number(entry.input_mt || (inputMtr > 0 ? mtFromMtr(inputMtr, od, wt) : 0));
      const primeMtr = Number(entry.output_mtr || 0);
      const primeMt = Number(entry.output_mt || (primeMtr > 0 ? mtFromMtr(primeMtr, od, wt) : 0));
      const scrapPct = inputMtr > 0 ? Number(((rejMtr / inputMtr) * 100).toFixed(1)) : 0;
      const reason = extractRejectionReason(entry.remarks);

      records.push({
        id: `scrap-${entry.id}-rej`,
        entry_id: entry.id,
        process_date: entry.process_date || new Date().toISOString().slice(0, 10),
        stage_code: entry.stage_code,
        stage_name: stageName,
        work_order_id: entry.work_order_id || wo.id,
        work_order_no: entry.work_order_no,
        customer_name: customer,
        grade,
        size_od: od,
        size_wt: wt,
        size_display: sizeDisplay,
        plan_no: entry.plan_no,
        heat_lot_no: entry.heat_lot_no || '—',
        input_mtr: inputMtr,
        input_mt: inputMt,
        prime_mtr: primeMtr,
        prime_mt: primeMt,
        scrap_mtr: rejMtr,
        scrap_mt: rejMt,
        scrap_pcs: rejPcs,
        scrap_pct: scrapPct,
        scrap_type: 'STAGE_REJECTION',
        scrap_type_label: SCRAP_TYPE_LABELS['STAGE_REJECTION'],
        scrap_reason: reason,
        remarks: entry.remarks || '',
        usable_offcut_mtr: 0,
        usable_offcut_mt: 0,
      });
    }
  }

  // --- CASE 3: QC INSPECTIONS REJECTIONS ---
  if (qcMap && qcMap.size > 0) {
    qcMap.forEach((inspections, woId) => {
      for (const qc of inspections) {
        const rejMtr = Number(qc.vdi_rejection_mtr || 0);
        const rejPcs = Number(qc.vdi_rejection_pcs || 0);
        if (rejMtr > 0.05 || rejPcs > 0) {
          const wo = workOrderMap.get(woId) || {};
          const od = Number(qc.size_od || wo.size_od || 0);
          const wt = Number(qc.size_wt || wo.size_wt || 0);
          let rejMt = Number(qc.vdi_rejection_mt || 0);
          if (rejMt === 0 && od > 0 && wt > 0) {
            rejMt = mtFromMtr(rejMtr, od, wt);
          }
          const inspMtr = Number(qc.inspected_mtr || 0);
          const inspMt = Number(qc.inspected_mt || (inspMtr > 0 ? mtFromMtr(inspMtr, od, wt) : 0));
          const okMtr = Number(qc.vdi_ok_mtr || 0);
          const okMt = Number(qc.vdi_ok_mt || (okMtr > 0 ? mtFromMtr(okMtr, od, wt) : 0));
          const scrapPct = inspMtr > 0 ? Number(((rejMtr / inspMtr) * 100).toFixed(1)) : 0;

          // Build reasons from salvage_reasons if present
          let reasons = 'QC Rejected';
          if (Array.isArray(qc.salvage_reasons) && qc.salvage_reasons.length > 0) {
            reasons = qc.salvage_reasons.map((r: any) => `${r.reason_name || r.name} (${r.rejected_pcs || r.pcs || ''} pcs)`).join(', ');
          } else if (qc.remarks) {
            reasons = qc.remarks;
          }

          records.push({
            id: `scrap-qc-${qc.id}`,
            entry_id: qc.id,
            process_date: qc.inspection_date || new Date().toISOString().slice(0, 10),
            stage_code: 'VDI',
            stage_name: 'VDI / QC Inspection',
            work_order_id: woId,
            work_order_no: qc.work_order_no || wo.work_order_no || '—',
            customer_name: String(qc.customer_name || wo.customer_name || 'Standard Production').trim(),
            grade: String(wo.grade || 'Carbon Steel').trim(),
            size_od: od,
            size_wt: wt,
            size_display: od > 0 && wt > 0 ? `${od} × ${wt} mm` : '—',
            heat_lot_no: '—',
            input_mtr: inspMtr,
            input_mt: inspMt,
            prime_mtr: okMtr,
            prime_mt: okMt,
            scrap_mtr: rejMtr,
            scrap_mt: rejMt,
            scrap_pcs: rejPcs,
            scrap_pct: scrapPct,
            scrap_type: 'QC_REJECTION',
            scrap_type_label: SCRAP_TYPE_LABELS['QC_REJECTION'],
            scrap_reason: reasons,
            remarks: qc.remarks || '',
            usable_offcut_mtr: 0,
            usable_offcut_mt: 0,
          });
        }
      }
    });
  }

  // Sort descending by process date
  return records.sort((a, b) => b.process_date.localeCompare(a.process_date));
}

/**
 * Filter scrap records
 */
export function filterScrapRecords(records: ScrapRecord[], filters: ScrapFilterOptions): ScrapRecord[] {
  return records.filter((r) => {
    if (filters.stage && filters.stage !== 'ALL' && r.stage_code !== filters.stage) {
      return false;
    }
    if (filters.scrapType && filters.scrapType !== 'ALL' && r.scrap_type !== filters.scrapType) {
      return false;
    }
    if (filters.grade && filters.grade !== 'ALL' && !r.grade.toLowerCase().includes(filters.grade.toLowerCase())) {
      return false;
    }
    if (filters.fromDate && r.process_date < filters.fromDate) {
      return false;
    }
    if (filters.toDate && r.process_date > filters.toDate) {
      return false;
    }
    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      const match =
        r.work_order_no.toLowerCase().includes(q) ||
        r.customer_name.toLowerCase().includes(q) ||
        r.grade.toLowerCase().includes(q) ||
        r.heat_lot_no.toLowerCase().includes(q) ||
        r.scrap_reason.toLowerCase().includes(q) ||
        r.remarks.toLowerCase().includes(q) ||
        (r.plan_no && r.plan_no.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });
}

/**
 * Computes consolidated plant KPIs for scrap generation
 */
export function calculateScrapKpis(records: ScrapRecord[]): ScrapSummaryKpis {
  let totalScrapMtr = 0;
  let totalScrapMt = 0;
  let totalInputMtr = 0;
  let totalInputMt = 0;
  let bandSawMtr = 0;
  let bandSawMt = 0;
  let procRejMtr = 0;
  let procRejMt = 0;
  let qcRejMtr = 0;
  let qcRejMt = 0;
  let under3mMtr = 0;
  let under3mMt = 0;
  let usableOffcutsMtr = 0;
  let usableOffcutsMt = 0;

  for (const r of records) {
    totalScrapMtr += r.scrap_mtr;
    totalScrapMt += r.scrap_mt;
    totalInputMtr += r.input_mtr;
    totalInputMt += r.input_mt;
    usableOffcutsMtr += r.usable_offcut_mtr || 0;
    usableOffcutsMt += r.usable_offcut_mt || 0;

    if (r.scrap_type === 'BAND_SAW_CUTTING') {
      bandSawMtr += r.scrap_mtr;
      bandSawMt += r.scrap_mt;
    } else if (r.scrap_type === 'REMNANT_UNDER_3M') {
      under3mMtr += r.scrap_mtr;
      under3mMt += r.scrap_mt;
      bandSawMtr += r.scrap_mtr;
      bandSawMt += r.scrap_mt;
    } else if (r.scrap_type === 'STAGE_REJECTION') {
      procRejMtr += r.scrap_mtr;
      procRejMt += r.scrap_mt;
    } else if (r.scrap_type === 'QC_REJECTION') {
      qcRejMtr += r.scrap_mtr;
      qcRejMt += r.scrap_mt;
    }
  }

  const overallScrapPct = totalInputMt > 0 ? (totalScrapMt / totalInputMt) * 100 : 0;

  return {
    total_scrap_mtr: Number(totalScrapMtr.toFixed(2)),
    total_scrap_mt: Number(totalScrapMt.toFixed(3)),
    total_input_mtr: Number(totalInputMtr.toFixed(2)),
    total_input_mt: Number(totalInputMt.toFixed(3)),
    overall_scrap_pct: Number(overallScrapPct.toFixed(1)),
    band_saw_scrap_mtr: Number(bandSawMtr.toFixed(2)),
    band_saw_scrap_mt: Number(bandSawMt.toFixed(3)),
    process_rejection_scrap_mtr: Number(procRejMtr.toFixed(2)),
    process_rejection_scrap_mt: Number(procRejMt.toFixed(3)),
    qc_rejection_scrap_mtr: Number(qcRejMtr.toFixed(2)),
    qc_rejection_scrap_mt: Number(qcRejMt.toFixed(3)),
    remnants_under_3m_mtr: Number(under3mMtr.toFixed(2)),
    remnants_under_3m_mt: Number(under3mMt.toFixed(3)),
    usable_offcuts_mtr: Number(usableOffcutsMtr.toFixed(2)),
    usable_offcuts_mt: Number(usableOffcutsMt.toFixed(3)),
    total_records_count: records.length,
  };
}

/**
 * Computes stage-wise breakdown of scrap generation
 */
export function calculateStageScrapSummary(records: ScrapRecord[]): StageScrapSummary[] {
  const map = new Map<StageCode, {
    stage_name: string;
    input_mt: number;
    prime_mt: number;
    scrap_mtr: number;
    scrap_mt: number;
    count: number;
  }>();

  for (const r of records) {
    const code = r.stage_code;
    const curr = map.get(code) || {
      stage_name: r.stage_name,
      input_mt: 0,
      prime_mt: 0,
      scrap_mtr: 0,
      scrap_mt: 0,
      count: 0,
    };
    curr.input_mt += r.input_mt;
    curr.prime_mt += r.prime_mt;
    curr.scrap_mtr += r.scrap_mtr;
    curr.scrap_mt += r.scrap_mt;
    curr.count += 1;
    map.set(code, curr);
  }

  const summaries: StageScrapSummary[] = [];
  map.forEach((val, key) => {
    const rate = val.input_mt > 0 ? (val.scrap_mt / val.input_mt) * 100 : 0;
    summaries.push({
      stage_code: key,
      stage_name: val.stage_name,
      total_input_mt: Number(val.input_mt.toFixed(3)),
      total_prime_mt: Number(val.prime_mt.toFixed(3)),
      total_scrap_mtr: Number(val.scrap_mtr.toFixed(2)),
      total_scrap_mt: Number(val.scrap_mt.toFixed(3)),
      scrap_rate_pct: Number(rate.toFixed(1)),
      entry_count: val.count,
    });
  });

  return summaries.sort((a, b) => b.total_scrap_mt - a.total_scrap_mt);
}

/**
 * Generates CSV export content for the Scrap Report
 */
export function generateScrapReportCsv(records: ScrapRecord[], kpis: ScrapSummaryKpis): string {
  const headers = [
    'Date',
    'Work Center',
    'Work Order No',
    'Customer',
    'Grade',
    'OD (mm)',
    'WT (mm)',
    'Heat/Lot No',
    'Plan No',
    'Input (Mtr)',
    'Input (MT)',
    'Prime (Mtr)',
    'Prime (MT)',
    'Scrap (Mtr)',
    'Scrap (MT)',
    'Scrap (Pcs)',
    'Scrap %',
    'Scrap Classification',
    'Defect / Reason',
    'Usable Offcuts >=3m (Mtr)',
    'Remarks',
  ];

  const rows = records.map((r) => [
    `"${r.process_date}"`,
    `"${r.stage_name}"`,
    `"${r.work_order_no}"`,
    `"${(r.customer_name || '').replace(/"/g, '""')}"`,
    `"${r.grade}"`,
    r.size_od || '',
    r.size_wt || '',
    `"${r.heat_lot_no}"`,
    `"${r.plan_no || ''}"`,
    r.input_mtr.toFixed(2),
    r.input_mt.toFixed(3),
    r.prime_mtr.toFixed(2),
    r.prime_mt.toFixed(3),
    r.scrap_mtr.toFixed(2),
    r.scrap_mt.toFixed(3),
    r.scrap_pcs,
    `${r.scrap_pct.toFixed(1)}%`,
    `"${r.scrap_type_label}"`,
    `"${(r.scrap_reason || '').replace(/"/g, '""')}"`,
    r.usable_offcut_mtr.toFixed(2),
    `"${(r.remarks || '').replace(/"/g, '""')}"`,
  ]);

  const summaryRow = [
    '"SUMMARY / TOTALS"',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    kpis.total_input_mtr.toFixed(2),
    kpis.total_input_mt.toFixed(3),
    '""',
    '""',
    kpis.total_scrap_mtr.toFixed(2),
    kpis.total_scrap_mt.toFixed(3),
    '""',
    `${kpis.overall_scrap_pct.toFixed(1)}%`,
    '""',
    '""',
    kpis.usable_offcuts_mtr.toFixed(2),
    '""',
  ];

  return [headers.join(','), ...rows.map((r) => r.join(',')), summaryRow.join(',')].join('\n');
}
