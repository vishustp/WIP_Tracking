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
import { buildCampaignHierarchyMaps, reconcileCampaignWorkOrderWip } from '@/lib/campaignWipUtils';

describe('Verify WO 6524 WIP in Tracking and Diversion Form', () => {
  it('correctly calculates 0 prime WIP and strictly 14 VDI Salvage pieces for WO 6524', async () => {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const id = '0a40d1f4-9b7e-4ba7-bcf4-bc9c68cd36d8';

    const [woRes, logsRes, divRes, plansRes, qcRes, stageWipRes, stagesRes] = await Promise.all([
      sb.from('work_orders').select('*').eq('id', id).single(),
      sb.from('production_logs').select('*, process_stages(stage_code, stage_name)').eq('work_order_id', id),
      sb.from('diversion_plans').select('*').or(`source_wo_id.eq.${id},target_wo_id.eq.${id}`),
      sb.from('rolling_plans').select('*').not('status', 'is', null),
      sb.from('qc_inspections').select('*').eq('work_order_id', id),
      sb.from('vw_route_stage_wip').select('*').eq('work_order_id', id).order('sequence_no', { ascending: true }),
      sb.from('process_stages').select('*'),
    ]);

    const wo = woRes.data;
    const logs = logsRes.data || [];
    const divs = divRes.data || [];
    const plans = plansRes.data || [];
    const qcList = qcRes.data || [];
    const stageRows = stageWipRes.data || [];
    const stagesList = stagesRes.data || [];

    const stageCodeById = new Map<string, string>();
    stagesList.forEach((s: any) => {
      if (s.id && s.stage_code) stageCodeById.set(s.id, s.stage_code.toUpperCase());
    });
    const finishingStageId = stagesList.find((s: any) => (s.stage_code || '').toUpperCase() === 'FINISHING')?.id;

    const hierarchyMaps = buildCampaignHierarchyMaps(plans);
    const isOrderCompleted = (wo.status || '').toLowerCase() === 'completed';

    // 1. Reconcile campaign WIP
    const reconciled = reconcileCampaignWorkOrderWip({
      woId: id,
      wo,
      rows: stageRows,
      qcInspections: qcList,
      productionLogs: logs,
      hierarchyMaps,
      routeCode: 'HFS',
      stageCodeById,
      finishingStageId,
      isOrderCompleted,
    });

    // Since WO 6524 is completed, all prime WIP queues must be 0
    reconciled.summary.stages.forEach((s: any) => {
      expect(s.capped_wip_pcs).toBe(0);
      expect(s.capped_wip_mtr).toBe(0);
    });

    // 2. DiversionForm breakdown:
    const avgLength = 6;
    const mtPerMtr = 0.00864;
    const stageBreakdown = stageRows.map((stg: any) => {
      const sc = stg.stage_code;
      const recStage = reconciled.summary.stages.find((s: any) => s.stage_code === sc);
      let curWipPcs = Number(recStage?.capped_wip_pcs ?? recStage?.reconciled_wip_pcs ?? 0);
      let curWipMtr = Number(recStage?.capped_wip_mtr ?? recStage?.reconciled_wip_mtr ?? 0);
      let curWipMt = Number(recStage?.capped_wip_mt ?? recStage?.reconciled_wip_mt ?? (curWipMtr * mtPerMtr));

      if (isOrderCompleted && sc !== 'VDI') {
        curWipPcs = 0;
        curWipMtr = 0;
        curWipMt = 0;
      }

      if (sc === 'VDI') {
        const totalVdiRejMtr = qcList.reduce((sum: number, q: any) => sum + Number(q.vdi_rejection_mtr || 0) + Number(q.vdi_salvage_mtr || 0), 0);
        const totalVdiRejPcs = qcList.reduce((sum: number, q: any) => sum + Number(q.vdi_rejection_pcs || 0) + Number(q.vdi_salvage_pcs || 0), 0);
        const vdiDivOutMtr = Number(stg.diversion_out || 0);

        const vdiSalvageDivOutMtr = divs
          .filter((d: any) => {
            if (d.source_wo_id !== id) return false;
            const fromMatch = d.reason?.match(/\[FROM_STAGE:\s*([A-Z_]+)\]/i);
            const fromStage = fromMatch ? fromMatch[1].toUpperCase() : (d.work_center || '').toUpperCase();
            if (fromStage !== 'VDI') return false;
            const r = (d.reason || '').toLowerCase();
            return r.includes('salvage') || r.includes('rejection') || r.includes('second') || r.includes('scrap');
          })
          .reduce((sum: number, d: any) => sum + Number(d.diverted_qty || 0), 0);

        const availableVdiRejMtr = Math.max(0, totalVdiRejMtr - vdiSalvageDivOutMtr);
        const availableVdiRejPcs = totalVdiRejMtr > 0
          ? Math.max(0, Math.round(totalVdiRejPcs * (availableVdiRejMtr / totalVdiRejMtr)))
          : 0;

        if (isOrderCompleted) {
          curWipPcs = availableVdiRejPcs;
          curWipMtr = availableVdiRejMtr > 0 ? availableVdiRejMtr : (avgLength > 0 ? Number((availableVdiRejPcs * avgLength).toFixed(2)) : 0);
          curWipMt = curWipMtr * mtPerMtr;
        }
      }

      return {
        stage_code: sc,
        available_pcs: curWipPcs,
        available_mtr: curWipMtr,
      };
    });

    const bsStage = stageBreakdown.find((s) => s.stage_code === 'BAND_SAW');
    const vdiStage = stageBreakdown.find((s) => s.stage_code === 'VDI');
    const finStage = stageBreakdown.find((s) => s.stage_code === 'FINISHING');
    const rollStage = stageBreakdown.find((s) => s.stage_code === 'ROLLING');

    expect(rollStage?.available_pcs).toBe(0);
    expect(bsStage?.available_pcs).toBe(0);
    expect(finStage?.available_pcs).toBe(0);
    // VDI strictly holds the 14 Salvage pieces (77 MTR)
    expect(vdiStage?.available_pcs).toBe(14);
    expect(vdiStage?.available_mtr).toBe(77);

    const totalActiveWipPcs = stageBreakdown.reduce((sum: number, s: any) => sum + Number(s.available_pcs || 0), 0);
    const totalActiveWipMtr = stageBreakdown.reduce((sum: number, s: any) => sum + Number(s.available_mtr || 0), 0);

    expect(totalActiveWipPcs).toBe(14);
    expect(totalActiveWipMtr).toBe(77);
  });
});
