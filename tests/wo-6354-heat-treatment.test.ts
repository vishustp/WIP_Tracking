import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Load .env.local
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

import { createAdminClient } from '@/lib/supabase/admin';

describe('WO 6354 Heat Treatment Tracking', () => {
  it('confirms WO 6354 Draw output was processed into Heat Treatment with 40 pieces (520m)', async () => {
    const admin = createAdminClient();
    const { data: wo } = await admin!.from('work_orders').select('*').eq('work_order_no', '6354').single();
    expect(wo).toBeDefined();

    const { data: logs } = await admin!.from('production_logs').select('*').eq('work_order_id', wo.id);
    const htStageId = 'fd75b606-26a8-4cbd-bb73-2e32083f5674';
    const htLog = logs?.find((l) => l.stage_id === htStageId);
    expect(htLog).toBeDefined();
    expect(Number(htLog?.output_qty)).toBe(520);

    const { data: wip } = await admin!.from('vw_route_stage_wip').select('*').eq('work_order_id', wo.id);
    const htWip = wip?.find((w) => w.stage_code === 'HEAT_TREATMENT');
    expect(htWip).toBeDefined();
    expect(Number(htWip?.net_output_mtr)).toBe(520);
    expect(Number(htWip?.net_output_pcs)).toBe(40);
  });
});
