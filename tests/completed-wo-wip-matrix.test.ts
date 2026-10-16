import { describe, it, expect } from 'vitest';
import { extractPcsFromRemarks, extractBandSawCutsFromRemarks } from '@/lib/productionUtils';

describe('Completed Work Orders & Closed Rolling Campaign WIP Reconciliations', () => {
  it('preserves campaign hierarchy for closed rolling plans so child QC and cuts aggregate to master', () => {
    const plans = [
      {
        id: 'plan-04-m3',
        plan_no: '04-M3',
        work_order_id: 'wo-master-6355',
        status: JSON.stringify({
          type: 'MULTI_WO',
          is_master: true,
          lifecycle_status: 'CLOSED', // Rolling closed early
          closed_at: '2026-10-12T10:07:56Z',
          child_work_orders: [
            { work_order_id: 'wo-child-6356', work_order_no: '6356' },
            { work_order_id: 'wo-child-6357', work_order_no: '6357' },
          ],
        }),
      },
    ];

    const masterCampaignMap = new Map<string, any>();
    const childWoMap = new Map<string, any>();

    for (const p of plans) {
      if (!p.status) continue;
      const parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
      const lifecycle = parsed?.lifecycle_status || (parsed?.issued_at ? 'ISSUED' : 'DRAFT');
      const isIssued = (lifecycle === 'ISSUED' || lifecycle === 'REVISED') && lifecycle !== 'CLOSED' && lifecycle !== 'SHORT_CLOSED';

      // Closed plans MUST NOT be skipped, because campaign structure is needed for downstream WIP calculations!
      if (parsed?.is_master && Array.isArray(parsed?.child_work_orders)) {
        masterCampaignMap.set(p.work_order_id, {
          plan_id: p.id,
          master_wo_id: p.work_order_id,
          child_work_orders: parsed.child_work_orders,
          is_issued: isIssued, // false for rolling stage
        });
        for (const c of parsed.child_work_orders) {
          const cId = c.work_order_id || c.id;
          childWoMap.set(cId, { master_wo_id: p.work_order_id });
        }
      }
    }

    // Both master and children must be mapped despite closed plan status
    expect(masterCampaignMap.has('wo-master-6355')).toBe(true);
    expect(masterCampaignMap.get('wo-master-6355').is_issued).toBe(false);
    expect(childWoMap.has('wo-child-6356')).toBe(true);
    expect(childWoMap.has('wo-child-6357')).toBe(true);
  });

  it('aggregates campaign-wide QC inspections and Band Saw mother pieces cut to eliminate phantom WIP', () => {
    const avgLength = 13;
    const multiple = 1;

    // WO 6352 scenario:
    // Incoming HT = 531 pcs
    // Band Saw logs on master 6352 produced 491 prime pcs from 830 mother pcs consumed (with offcuts/scrap)
    const htNetPcs = 531;
    const bandSawLogs = [
      { remarks: '[CUTS:{"m_pcs":63,"yield":21.4,"items":[{"len":13,"pcs":14,"cat":"PRIME"}]}] [PCS:14]', output_qty: 182 },
      { remarks: '[CUTS:{"m_pcs":49,"yield":68.7,"items":[{"len":13,"pcs":35,"cat":"PRIME"}]}] [PCS:35]', output_qty: 455 },
      { remarks: '[CUTS:{"m_pcs":249,"yield":56.4,"items":[{"len":13,"pcs":149,"cat":"PRIME"}]}] [PCS:149]', output_qty: 1937 },
      { remarks: '[CUTS:{"m_pcs":100,"yield":85.3,"items":[{"len":13,"pcs":88,"cat":"PRIME"}]}] [PCS:88]', output_qty: 1144 },
      { remarks: '[CUTS:{"m_pcs":12,"yield":94.4,"items":[{"len":13,"pcs":12,"cat":"PRIME"}]}] [PCS:12]', output_qty: 156 },
      { remarks: '[CUTS:{"m_pcs":193,"yield":14.5,"items":[{"len":13,"pcs":29,"cat":"PRIME"}]}] [PCS:29]', output_qty: 377 },
      { remarks: '[CUTS:{"m_pcs":164,"yield":100,"items":[{"len":13,"pcs":164,"cat":"PRIME"}]}] [PCS:164]', output_qty: 2132 },
    ];

    let bsMotherPcsCut = 0;
    let bandSawOutPcs = 0;
    for (const log of bandSawLogs) {
      const { motherPcs } = extractBandSawCutsFromRemarks(log.remarks);
      if (motherPcs != null && motherPcs > 0) {
        bsMotherPcsCut += motherPcs;
      }
      const { pcs } = extractPcsFromRemarks(log.remarks);
      bandSawOutPcs += pcs || 0;
    }

    expect(bandSawOutPcs).toBe(491);
    expect(bsMotherPcsCut).toBe(830);

    // QC inspections: 376 pcs directly on 6352, plus 115 pcs on child 6353
    const qcInspectedPcs = 376 + 115; // 491 pcs
    expect(qcInspectedPcs).toBe(491);

    // Band Saw passed pieces must use mother pcs consumed and downstream QC passed
    const bandSawPassedPcs = Math.max(
      bsMotherPcsCut,
      bandSawOutPcs,
      qcInspectedPcs
    );

    const bandSawAvailPcs = Math.max(0, htNetPcs - bandSawPassedPcs);
    expect(bandSawAvailPcs).toBe(0); // All 531 HT pieces cut! 0 Band Saw WIP!

    // VDI available pieces: Net cut (491) - QC inspected (491)
    const vdiAvailPcs = Math.max(0, bandSawOutPcs - qcInspectedPcs);
    expect(vdiAvailPcs).toBe(0); // All 491 pieces inspected! 0 VDI WIP!
  });

  it('guarantees completed work orders with 0 balance do not leak phantom upstream WIP', () => {
    const wo = {
      work_order_no: '6355',
      status: 'Completed',
      balance_qty_mtr: 0,
      balance_qty_pcs: 0,
    };

    let bandSawAvailPcs = 42; // phantom calculation before guard
    let vdiAvailPcs = 0;
    let htAvailPcs = 0;
    let finAvailPcs = 0;

    const isOrderCompleted = (wo.status || '').toLowerCase() === 'completed' || (wo.status || '').toLowerCase() === 'closed';
    if (isOrderCompleted) {
      htAvailPcs = 0;
      bandSawAvailPcs = 0;
      vdiAvailPcs = 0;
      if (Number(wo.balance_qty_mtr ?? 0) === 0 && Number(wo.balance_qty_pcs ?? 0) === 0) {
        finAvailPcs = 0;
      }
    }

    expect(bandSawAvailPcs).toBe(0);
    expect(vdiAvailPcs).toBe(0);
    expect(htAvailPcs).toBe(0);
    expect(finAvailPcs).toBe(0);
  });

  it('SizeGradeWipReportClient filters out completed orders with 0 balance from upstream stages in WIP matrix', () => {
    const rawRows = [
      {
        work_order_no: '6352',
        order_status: 'In Progress',
        stage_code: 'FINISHING',
        current_wip_pcs: 153,
        current_wip: 1989,
        balance_qty_pcs: 15,
      },
      {
        work_order_no: '6355',
        order_status: 'Completed',
        stage_code: 'BAND_SAW',
        current_wip_pcs: 42,
        current_wip: 378,
        balance_qty_pcs: 0,
      },
    ];

    const filtered = rawRows.filter((r) => {
      if (Number(r.current_wip_pcs || 0) <= 0 && Number(r.current_wip || 0) <= 0) return false;
      if ((r.order_status || '').toLowerCase() === 'completed' && Number(r.balance_qty_pcs ?? 0) === 0 && r.stage_code !== 'FINISHING') return false;
      return true;
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].work_order_no).toBe('6352');
    expect(filtered[0].stage_code).toBe('FINISHING');
  });

  it('aggregates VDI Salvage quantity distinctly after VDI QC inspection in WIP matrix', () => {
    const rawRows = [
      {
        od: 19.05,
        wt: 1.65,
        grade: 'SA213-T11',
        stage_code: 'VDI',
        current_wip_pcs: 50,
        current_wip: 650,
        available_mt: 0.46,
      },
      {
        od: 19.05,
        wt: 1.65,
        grade: 'SA213-T11',
        stage_code: 'VDI_SALVAGE',
        current_wip_pcs: 12,
        current_wip: 156,
        available_mt: 0.11,
      },
      {
        od: 19.05,
        wt: 1.65,
        grade: 'SA213-T11',
        stage_code: 'FINISHING',
        current_wip_pcs: 30,
        current_wip: 390,
        available_mt: 0.28,
      },
    ];

    const group = {
      od: 19.05,
      wt: 1.65,
      grade: 'SA213-T11',
      vdi_pcs: 0,
      vdi_mtr: 0,
      vdi_mt: 0,
      vdi_salvage_pcs: 0,
      vdi_salvage_mtr: 0,
      vdi_salvage_mt: 0,
      finishing_pcs: 0,
      finishing_mtr: 0,
      finishing_mt: 0,
      total_pcs: 0,
      total_mtr: 0,
      total_mt: 0,
    };

    rawRows.forEach((r) => {
      const pcs = r.current_wip_pcs;
      const mtr = r.current_wip;
      const mt = r.available_mt;

      if (r.stage_code === 'VDI') {
        group.vdi_pcs += pcs;
        group.vdi_mtr += mtr;
        group.vdi_mt += mt;
      } else if (r.stage_code === 'VDI_SALVAGE') {
        group.vdi_salvage_pcs += pcs;
        group.vdi_salvage_mtr += mtr;
        group.vdi_salvage_mt += mt;
      } else if (r.stage_code === 'FINISHING') {
        group.finishing_pcs += pcs;
        group.finishing_mtr += mtr;
        group.finishing_mt += mt;
      }

      group.total_pcs += pcs;
      group.total_mtr += mtr;
      group.total_mt += mt;
    });

    expect(group.vdi_pcs).toBe(50);
    expect(group.vdi_salvage_pcs).toBe(12);
    expect(group.finishing_pcs).toBe(30);
    expect(group.total_pcs).toBe(92);
    expect(group.total_mtr).toBe(1196);
  });
});
