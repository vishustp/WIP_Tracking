import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

try {
  const envContent = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8');
  envContent.split('\n').forEach((line) => {
    const idx = line.indexOf('=');
    if (idx > 0) {
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  });
} catch {}

import { createClient } from '@supabase/supabase-js';
import { GET as getQueue } from '@/app/api/production/queue/route';
import { NextRequest } from 'next/server';
import { extractPcsFromRemarks, extractBandSawCutsFromRemarks, mtFromMtr } from '@/lib/productionUtils';

describe('Detailed audit of WIP mismatch between Production Entry, Matrix, and Tracking', () => {
  it('compares each stage WIP across Production Entry, Matrix, and Tracking', async () => {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // 1. Production Entry & Queue API
    const req = new NextRequest('http://localhost:3000/api/production/queue?all_stages=true&_t=' + Date.now());
    const res = await getQueue(req);
    const json = await res.json();

    // Production Entry Summary Cards:
    const prodEntryCards: Record<string, { pcs: number; mtr: number; mt: number }> = {};
    (json.summary || []).forEach((s: any) => {
      prodEntryCards[s.stage_code] = {
        pcs: Math.round(Number(s.availPcs || 0)),
        mtr: Number(Number(s.availMtr || 0).toFixed(2)),
        mt: Number(Number(s.availMt || 0).toFixed(2)),
      };
    });

    // 2. Matrix totals by stage
    // Matrix maps queueJson.data:
    const matrixStageTotals: Record<string, { pcs: number; mtr: number; mt: number }> = {};
    const validQueueRows = (json.data || []).filter((r: any) => {
      const id = String(r.work_order_id || r.id || '').toLowerCase();
      const no = String(r.work_order_no || '').trim().toUpperCase();
      return id !== '00000000-0000-0000-0000-00000000000b' && no !== 'HB-BUFFER' && no !== 'HOLLOW BANK';
    });

    const filteredMatrixRows = validQueueRows.filter((r: any) => {
      const stCode = (r.stage_code || '').toUpperCase();
      const isRolling = stCode === 'HOT_ROLLING' || stCode === 'ROLLING';
      const rawPcs = isRolling ? Math.round(Number(r.balance_to_make_pcs ?? r.ready_pcs ?? r.rolled_pcs ?? 0)) : Math.round(Number(r.ready_pcs ?? r.current_wip_pcs ?? 0));
      const rawMtr = isRolling ? Number(r.balance_to_make_mtr ?? r.ready_mtr ?? r.rolled_mtr ?? 0) : Number(r.ready_mtr ?? r.current_wip ?? 0);
      if (rawPcs <= 0 && rawMtr <= 0) return false;
      if ((r.order_status || '').toLowerCase() === 'completed' && Number(r.balance_qty_pcs ?? 0) === 0 && stCode !== 'FINISHING') return false;
      return true;
    });

    filteredMatrixRows.forEach((r: any) => {
      const stCode = (r.stage_code || '').toUpperCase();
      const isRolling = stCode === 'HOT_ROLLING' || stCode === 'ROLLING';
      const pcs = isRolling ? Math.round(Number(r.balance_to_make_pcs ?? r.ready_pcs ?? r.rolled_pcs ?? 0)) : Math.round(Number(r.ready_pcs ?? r.current_wip_pcs ?? 0));
      const mtr = isRolling ? Number(r.balance_to_make_mtr ?? r.ready_mtr ?? r.rolled_mtr ?? 0) : Number(r.ready_mtr ?? r.current_wip ?? 0);
      const mt = isRolling ? Number(r.balance_to_make_mt ?? r.ready_mt ?? r.rolled_mt ?? 0) : Number(r.ready_mt ?? r.available_mt ?? 0);

      // In Matrix, IP_CUTTING and PILGER also add to draw column in the matrix view
      if (!matrixStageTotals[stCode]) matrixStageTotals[stCode] = { pcs: 0, mtr: 0, mt: 0 };
      matrixStageTotals[stCode].pcs += pcs;
      matrixStageTotals[stCode].mtr += mtr;
      matrixStageTotals[stCode].mt += mt;

      if (stCode === 'IP_CUTTING' || stCode === 'PILGER') {
        if (!matrixStageTotals['DRAW']) matrixStageTotals['DRAW'] = { pcs: 0, mtr: 0, mt: 0 };
        matrixStageTotals['DRAW'].pcs += pcs;
        matrixStageTotals['DRAW'].mtr += mtr;
        matrixStageTotals['DRAW'].mt += mt;
      }
    });

    // Helper to fetch all logs with pagination
    async function fetchAllLogs() {
      const PAGE_SIZE = 1000;
      const all: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await sb
          .from('production_logs')
          .select('*, process_stages(stage_code, stage_name)')
          .order('created_at', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (error || !data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return all;
    }

    // 3. Tracking Report totals across all work orders
    const [woRes, allLogs, plansRes, qcRes, divRes, stageWipRes] = await Promise.all([
      sb.from('work_orders').select('*').limit(5000),
      fetchAllLogs(),
      sb.from('rolling_plans').select('*').not('status', 'is', null).limit(5000),
      sb.from('qc_inspections').select('*').limit(5000),
      sb.from('diversion_plans').select('*').limit(5000),
      sb.from('vw_route_stage_wip').select('*').limit(5000),
    ]);

    const wos = woRes.data || [];
    const logs = allLogs || [];
    const plans = plansRes.data || [];
    const qcs = qcRes.data || [];
    const divs = divRes.data || [];

    const wo6614 = wos.find(w => w.work_order_no === '6614');
    const qc6614 = qcs.filter(q => q.work_order_id === wo6614?.id);
    const logs6614 = logs.filter(l => l.work_order_id === wo6614?.id);
    console.log('WO 6614:', {
      status: wo6614?.status,
      ordered_pcs: wo6614?.ordered_qty_pcs,
      qc: qc6614.map(q => ({ ok_pcs: q.vdi_ok_pcs, rej_pcs: q.vdi_rejection_pcs })),
      finLogs: logs6614.filter(l => (l.process_stages?.stage_code || l.stage_code) === 'FINISHING').map(l => ({ qty: l.output_qty, remarks: l.remarks }))
    });

    // Build tracking calculation exactly as WorkOrderTrackingClient
    const masterMap = new Map<string, any>();
    const childMap = new Map<string, any>();
    for (const p of plans) {
      try {
        const parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
        if (parsed?.is_master && Array.isArray(parsed?.child_work_orders)) {
          masterMap.set(p.work_order_id, { ...p, parsed, child_work_orders: parsed.child_work_orders });
          for (const c of parsed.child_work_orders) {
            const cId = c.work_order_id || c.id;
            if (cId) childMap.set(cId, { master_wo_id: p.work_order_id, ...c });
          }
        } else if (parsed?.is_child) {
          childMap.set(p.work_order_id, { master_wo_id: parsed.master_wo_id, ...parsed });
        }
      } catch {}
    }

    const trackingStageTotals: Record<string, { pcs: number; mtr: number; mt: number }> = {
      ROLLING: { pcs: 0, mtr: 0, mt: 0 },
      HTC: { pcs: 0, mtr: 0, mt: 0 },
      HOLLOW_HEAT_TREATMENT: { pcs: 0, mtr: 0, mt: 0 },
      DRAW: { pcs: 0, mtr: 0, mt: 0 },
      PILGER: { pcs: 0, mtr: 0, mt: 0 },
      HEAT_TREATMENT: { pcs: 0, mtr: 0, mt: 0 },
      BAND_SAW: { pcs: 0, mtr: 0, mt: 0 },
      VDI: { pcs: 0, mtr: 0, mt: 0 },
      FINISHING: { pcs: 0, mtr: 0, mt: 0 },
    };

    // Tracking computes stage WIP for each work order
    for (const wo of wos) {
      if (String(wo.work_order_no || '').toUpperCase().includes('HOLLOW BANK') || String(wo.work_order_no || '').toUpperCase() === 'HB-BUFFER') continue;

      const isMaster = masterMap.has(wo.id);
      const masterInfo = masterMap.get(wo.id);
      const childInfo = isMaster ? null : childMap.get(wo.id);
      const effectiveMasterWoId = childInfo ? childInfo.master_wo_id : wo.id;
      const plan = masterInfo || plans.find((p) => p.work_order_id === wo.id);
      const avgLen = wo.l1 && wo.l2 ? (Number(wo.l1) + Number(wo.l2)) / 2 : Number(wo.l1 || wo.l2 || 6.0);
      const mhAvgLen = Number(plan?.mh_avg_length || plan?.mh_l1 || avgLen);

      const isOrderCompletedRaw = String(wo.status || '').toLowerCase() === 'completed' || String(wo.status || '').toLowerCase() === 'closed';
      const campaignChildWoIds: string[] = isMaster && masterInfo?.child_work_orders
        ? masterInfo.child_work_orders.map((c: any) => c.work_order_id || c.id).filter(Boolean)
        : [];
      const hasActiveChildOrders = isMaster && campaignChildWoIds.some((cId: string) => {
        const cWo = wos.find((w) => w.id === cId);
        if (!cWo) return false;
        const st = String(cWo.status || '').toLowerCase();
        return st === 'in progress' || st === 'in_progress' || st === 'scheduled';
      });
      const isOrderCompleted = isOrderCompletedRaw && !hasActiveChildOrders;

      // If child order in campaign, pre-finishing stages are pooled under master
      if (childInfo) {
        // Child order only has finishing in tracking
        const woLogs = logs.filter((l) => l.work_order_id === wo.id);
        const finLogs = woLogs.filter((l) => (l.process_stages?.stage_code || l.stage_code) === 'FINISHING');
        const finOutPcs = finLogs.reduce((sum, l) => {
          const { pcs } = extractPcsFromRemarks(l.remarks);
          const p = Number(l.output_pcs || 0) > 0 ? Number(l.output_pcs) : (pcs || 0);
          return sum + p;
        }, 0);
        const thisWoQcList = qcs.filter((q) => q.work_order_id === wo.id);
        const qcPassedPcs = thisWoQcList.reduce((sum, q) => sum + Number(q.vdi_ok_pcs || 0), 0);
        const targetPcs = Number(wo.ordered_qty_pcs || Math.round(Number(wo.ordered_qty || 0) / avgLen));
        if (!isOrderCompleted) {
          const wipPcs = Math.max(0, Math.min(targetPcs, qcPassedPcs) - finOutPcs);
          if (wipPcs > 0) {
            console.log(`[Diagnostic] Child WO ${wo.work_order_no} (${wo.id}) status=${wo.status}: qcPassedPcs=${qcPassedPcs}, finOutPcs=${finOutPcs}, targetPcs=${targetPcs}, wipPcs=${wipPcs}`);
          }
          const wipMtr = wipPcs * avgLen;
          const wipMt = mtFromMtr(wipMtr, Number(wo.size_od || 0), Number(wo.size_wt || 0));
          trackingStageTotals.FINISHING.pcs += wipPcs;
          trackingStageTotals.FINISHING.mtr += wipMtr;
          trackingStageTotals.FINISHING.mt += wipMt;
        }
        continue;
      }

      // Standalone or Master:
      // Let's check production logs for this master/wo
      const campaignWoIdSet = new Set<string>([wo.id, ...campaignChildWoIds]);
      const masterLogs = logs.filter((l) => campaignWoIdSet.has(l.work_order_id));
      const getLogs = (stg: string) => masterLogs.filter((l) => (l.process_stages?.stage_code || l.stage_code) === stg);

      const rollLogs = getLogs('ROLLING');
      const htcLogs = getLogs('HTC');
      const hhtLogs = getLogs('HOLLOW_HEAT_TREATMENT');
      const drawLogs = getLogs('DRAW');
      const pilgerLogs = getLogs('PILGER');
      const htLogs = getLogs('HEAT_TREATMENT');
      const bsLogs = getLogs('BAND_SAW');
      const vdiLogs = getLogs('VDI');
      const finLogs = logs.filter((l) => l.work_order_id === wo.id && (l.process_stages?.stage_code || l.stage_code) === 'FINISHING');

      const sumPcs = (arr: any[]) => arr.reduce((sum, l) => {
        const { pcs } = extractPcsFromRemarks(l.remarks);
        return sum + (Number(l.output_pcs || 0) > 0 ? Number(l.output_pcs) : (pcs || 0));
      }, 0);
      const sumRejPcs = (arr: any[]) => arr.reduce((sum, l) => {
        const { rejPcs } = extractPcsFromRemarks(l.remarks);
        return sum + (Number(l.rejection_pcs || 0) > 0 ? Number(l.rejection_pcs) : (rejPcs || 0));
      }, 0);

      const rollPcs = sumPcs(rollLogs);
      const rollRej = sumRejPcs(rollLogs);
      const htcOkPcs = rollLogs.reduce((sum, l) => sum + (l.htc_ok_pcs != null ? Number(l.htc_ok_pcs) : Number(l.htc_ok ? sumPcs([l]) : 0)), 0);
      const hhtPcs = sumPcs(hhtLogs);
      const hhtRej = sumRejPcs(hhtLogs);
      const drawPcs = sumPcs(drawLogs);
      const drawRej = sumRejPcs(drawLogs);
      const htPcs = sumPcs(htLogs);
      const htRej = sumRejPcs(htLogs);
      const bsCutPcs = sumPcs(bsLogs);
      const bsRej = sumRejPcs(bsLogs);
      const bsMotherPcs = bsLogs.reduce((sum, l) => {
        const { motherPcs } = extractBandSawCutsFromRemarks(l.remarks);
        return sum + (motherPcs || 0);
      }, 0);
      const qcList = qcs.filter((q) => campaignWoIdSet.has(q.work_order_id));
      const qcInspectedPcs = qcList.reduce((sum, q) => sum + Number(q.vdi_ok_pcs || 0) + Number(q.vdi_salvage_pcs || 0) + Number(q.vdi_rejection_pcs || 0), 0);
      const finPcs = sumPcs(finLogs);

      if (!isOrderCompleted) {
        // DRAW WIP:
        const drawIncoming = htcOkPcs;
        const drawConsumed = drawPcs + drawRej;
        const drawWipPcs = Math.max(0, drawIncoming - drawConsumed);
        if (drawWipPcs > 0 && (wo.route_code || '').includes('CDS')) {
          trackingStageTotals.DRAW.pcs += drawWipPcs;
          trackingStageTotals.DRAW.mtr += drawWipPcs * mhAvgLen;
          trackingStageTotals.DRAW.mt += mtFromMtr(drawWipPcs * mhAvgLen, Number(plan?.mh_od || wo.size_od || 0), Number(plan?.mh_wt || wo.size_wt || 0));
        }

        // BAND SAW WIP:
        const bsIncoming = htPcs > 0 ? (htPcs - htRej) : (drawPcs > 0 ? (drawPcs - drawRej) : htcOkPcs);
        const bsConsumed = bsMotherPcs > 0 ? bsMotherPcs : bsCutPcs;
        const bsWipPcs = Math.max(0, bsIncoming - bsConsumed);
        if (bsWipPcs > 0) {
          trackingStageTotals.BAND_SAW.pcs += bsWipPcs;
          trackingStageTotals.BAND_SAW.mtr += bsWipPcs * mhAvgLen;
          trackingStageTotals.BAND_SAW.mt += mtFromMtr(bsWipPcs * mhAvgLen, Number(plan?.mh_od || wo.size_od || 0), Number(plan?.mh_wt || wo.size_wt || 0));
        }

        // VDI WIP:
        const vdiIncoming = bsCutPcs;
        const vdiWipPcs = Math.max(0, vdiIncoming - qcInspectedPcs);
        if (vdiWipPcs > 0) {
          trackingStageTotals.VDI.pcs += vdiWipPcs;
          trackingStageTotals.VDI.mtr += vdiWipPcs * avgLen;
          trackingStageTotals.VDI.mt += mtFromMtr(vdiWipPcs * avgLen, Number(wo.size_od || 0), Number(wo.size_wt || 0));
        }

        // FINISHING WIP:
        const thisWoQcList = qcs.filter((q) => q.work_order_id === wo.id);
        const qcPassedPcs = thisWoQcList.reduce((sum, q) => sum + Number(q.vdi_ok_pcs || 0), 0);
        const targetPcs = Number(wo.ordered_qty_pcs || Math.round(Number(wo.ordered_qty || 0) / avgLen));
        if (thisWoQcList.length > 0) {
          const finWipPcs = Math.max(0, Math.min(targetPcs, qcPassedPcs) - finPcs);
          if (finWipPcs > 0) {
            console.log(`Standalone WO ${wo.work_order_no} finWip: qcPassed=${qcPassedPcs}, finPcs=${finPcs}, finWipPcs=${finWipPcs}`);
            trackingStageTotals.FINISHING.pcs += finWipPcs;
            trackingStageTotals.FINISHING.mtr += finWipPcs * avgLen;
            trackingStageTotals.FINISHING.mt += mtFromMtr(finWipPcs * avgLen, Number(wo.size_od || 0), Number(wo.size_wt || 0));
          }
        }
      }
    }

    console.log('\n======================================================');
    console.log('COMPARISON TABLE (PCS):');
    console.log('Stage                  | Prod Entry Cards | Matrix Report | Tracking Report');
    console.log('-----------------------|------------------|---------------|----------------');
    const stages = ['HOT_ROLLING', 'HTC', 'HOLLOW_HEAT_TREATMENT', 'DRAW', 'PILGER', 'HEAT_TREATMENT', 'BAND_SAW', 'VDI', 'VDI_SALVAGE', 'FINISHING'];
    for (const st of stages) {
      const pe = prodEntryCards[st]?.pcs ?? 0;
      const mx = matrixStageTotals[st]?.pcs ?? 0;
      const tr = trackingStageTotals[st]?.pcs ?? 0;
      console.log(`${st.padEnd(22)} | ${String(pe).padStart(16)} | ${String(mx).padStart(13)} | ${String(tr).padStart(15)}`);
    }

    // Assert 100% exact parity between Production Entry Cards and Size-Grade WIP Matrix
    expect(prodEntryCards['HOT_ROLLING']?.pcs ?? 0).toBe(matrixStageTotals['HOT_ROLLING']?.pcs ?? 0);
    expect(prodEntryCards['HTC']?.pcs ?? 0).toBe(matrixStageTotals['HTC']?.pcs ?? 0);
    expect(prodEntryCards['DRAW']?.pcs ?? 0).toBe(matrixStageTotals['DRAW']?.pcs ?? 0);
    expect(prodEntryCards['BAND_SAW']?.pcs ?? 0).toBe(matrixStageTotals['BAND_SAW']?.pcs ?? 0);
    expect(prodEntryCards['VDI']?.pcs ?? 0).toBe(matrixStageTotals['VDI']?.pcs ?? 0);
    expect(prodEntryCards['FINISHING']?.pcs ?? 0).toBe(matrixStageTotals['FINISHING']?.pcs ?? 0);
  });
});
