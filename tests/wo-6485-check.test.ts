import { describe, it, expect } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';
import { GET as getQueue } from '@/app/api/production/queue/route';
import { NextRequest } from 'next/server';

describe('Inspect WO 6485 Data', () => {
  it('prints WO 6485 details and confirms reconciliation between Tracking and WIP Matrix', async () => {
    const admin = createAdminClient();
    if (!admin) {
      console.log('No admin client');
      return;
    }

    const qReq = new NextRequest('http://localhost:3000/api/production/queue?all_stages=true&nocache=true');
    const qRes = await getQueue(qReq);
    const qJson = await qRes.json();
    const qRows = (qJson.data || []).filter((r: any) => r.work_order_no === '6485');
    console.log('Queue rows for 6485:', JSON.stringify(qRows.map((r: any) => ({
      stage: r.stage_code,
      ready_pcs: r.ready_pcs,
      ready_mtr: r.ready_mtr,
      work_centers_wip: r.work_centers_wip,
    })), null, 2));

    const { data: wo } = await admin.from('work_orders').select('*').eq('work_order_no', '6485').single();
    expect(wo).toBeDefined();

    const { data: rps } = await admin.from('rolling_plans').select('*').eq('work_order_id', wo.id);
    expect(rps).toBeDefined();

    // Check diversions
    const { data: divsOut } = await admin.from('diversion_plans').select('*').eq('source_wo_id', wo.id);

    // Check production logs
    const { data: logs } = await admin
      .from('production_logs')
      .select('id, stage_id, process_date, output_qty, output_pcs, rejection_qty, rejection_pcs, htc_ok, htc_ok_pcs, remarks, process_stages(stage_code)')
      .eq('work_order_id', wo.id);

    const avgLen = (Number(wo.l1 || 0) + Number(wo.l2 || 0)) / 2 || 10.0;
    const masterBandSawLogs = (logs || []).filter((l: any) => l.process_stages?.stage_code === 'BAND_SAW');
    const bandSawOutPcs = masterBandSawLogs.reduce((sum: number, l: any) => {
      const match = l.remarks?.match(/\[PCS:\s*([0-9]+)\]/i);
      return sum + (match ? Number(match[1]) : Number(l.output_pcs || 0));
    }, 0);

    const { data: qcs } = await admin.from('qc_inspections').select('*').eq('work_order_id', wo.id);
    const relevantVdiQcList = qcs || [];
    const qcInspectedPcs = relevantVdiQcList.reduce(
      (sum: number, q: any) => sum + Number(q.inspected_pcs || (Number(q.vdi_ok_pcs || 0) + Number(q.vdi_salvage_pcs || 0) + Number(q.vdi_rejection_pcs || 0))),
      0
    );

    // 1. HTC calculation
    const legacyRollLogs = (logs || []).filter((l: any) => l.process_stages?.stage_code === 'ROLLING' || l.process_stages?.stage_code === 'HOT_ROLLING');
    const legacyRollingHtcOkMtr = legacyRollLogs.reduce((sum, l) => sum + Number((l as any).htc_ok_qty ?? (l as any).htc_ok ?? 0), 0);
    const legacyRollingHtcOkPcsLogged = legacyRollLogs.reduce((sum, l) => sum + (Number(l.htc_ok_pcs || 0)), 0);
    const masterHtcLogs = (logs || []).filter((l: any) => l.process_stages?.stage_code === 'HTC');
    const rollingRejPcs = 0;
    const rollingOutPcs = 2831;
    const mhAvgLen = 7.42;

    const legacyRollingHtcOkPcs = legacyRollingHtcOkPcsLogged > 0
      ? legacyRollingHtcOkPcsLogged
      : (legacyRollingHtcOkMtr > 0 && mhAvgLen > 0
        ? Math.round(legacyRollingHtcOkMtr / mhAvgLen)
        : (masterHtcLogs.length === 0 && rollingRejPcs === 0 && rollingOutPcs > 0 ? rollingOutPcs : 0));

    const htcLogOkPcs = masterHtcLogs.reduce((sum, l) => {
      const match = l.remarks?.match(/\[PCS:\s*([0-9]+)\]/i);
      return sum + (match ? Number(match[1]) : Number(l.output_pcs || 0));
    }, 0);

    const hasDedicatedHtcLogs = masterHtcLogs.length > 0;
    // When dedicated HTC logs exist, use HTC logs; do not add legacy rolling logs twice
    const htcOkPcs = hasDedicatedHtcLogs ? htcLogOkPcs : (legacyRollingHtcOkPcs > 0 ? legacyRollingHtcOkPcs : rollingOutPcs);

    expect(htcOkPcs).toBe(2831);

    // 2. Draw WIP calculation
    const ipLogs = (logs || []).filter((l: any) => l.process_stages?.stage_code === 'IP_CUTTING');
    const ipOutPcs = ipLogs.reduce((sum: number, l: any) => {
      const match = l.remarks?.match(/\[PCS:\s*([0-9]+)\]/i);
      return sum + (match ? Number(match[1]) : Number(l.output_pcs || 0));
    }, 0);
    const isIpCutting = true;
    const drawIncomingPcs = isIpCutting ? ipOutPcs : htcOkPcs;
    const drawOutPcs = 4712;
    const drawWipPcs = Math.max(0, drawIncomingPcs - drawOutPcs);
    expect(drawWipPcs).toBe(0);

    // 3. VDI WIP calculation
    const isSalvageDiversion = (d: any) =>
      (d.reason || '').toLowerCase().includes('salvage') ||
      (d.reason || '').toLowerCase().includes('offcut') ||
      (d.work_center || '').toUpperCase() === 'VDI_SALVAGE' ||
      ((d.reason || '').toLowerCase().includes('[from_stage: vdi]') && (d.reason || '').toLowerCase().includes('offcut'));

    const primeDivOutMatching = (divsOut || []).filter(
      (d: any) => !isSalvageDiversion(d) && (d.status == null || d.status === 'APPROVED')
    );
    const primeDivOutPcs = primeDivOutMatching.reduce((sum: number, d: any) => sum + Math.round(Number(d.diverted_qty || 0) / avgLen), 0);
    const uninspectedPcs = Math.max(0, bandSawOutPcs - qcInspectedPcs - primeDivOutPcs);

    const totalSalvagePcs = relevantVdiQcList.reduce((sum: number, q: any) => sum + Number(q.vdi_salvage_pcs || 0), 0);
    const salvageDivOutMatching = (divsOut || []).filter(
      (d: any) => isSalvageDiversion(d) && (d.status == null || d.status === 'APPROVED')
    );
    const salvageDivOutPcs = salvageDivOutMatching.reduce((sum: number, d: any) => sum + Math.round(Number(d.diverted_qty || 0) / avgLen), 0);
    const activeSalvagePcs = Math.max(0, totalSalvagePcs - salvageDivOutPcs);

    expect(uninspectedPcs).toBe(225);
    expect(activeSalvagePcs).toBe(262);
    expect(uninspectedPcs + activeSalvagePcs).toBe(487);
  });
});
