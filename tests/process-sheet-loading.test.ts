import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const envVars = Object.fromEntries(
  env.split(/\r?\n/)
    .filter(l => l.includes('='))
    .map(l => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')];
    })
);

describe('Process Sheet Query & Loading', () => {
  const url = envVars.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  it('queries work_orders with valid existing schema columns without error', async () => {
    // Valid columns on work_orders
    const validCols = 'id,work_order_no,customer_name,grade,specification,size_od,size_wt,l1,l2,ordered_qty,ordered_qty_pcs,ordered_qty_mtr,status,target_date,destination,po_no,po_date,material_code';
    const res = await fetch(`${url}/rest/v1/work_orders?select=${validCols}&order=created_at.desc&limit=10`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });

    if (res.status !== 200) {
      console.log('Error res status:', res.status, await res.text());
    }
    expect(res.status).toBe(200);
    const data = await res.json();
    console.log('work_orders count:', data.length);
  });

  it('queries rolling_plans with columns used by ProcessSheetReportClient', async () => {
    const validPlanCols = 'id,plan_no,work_order_id,planned_rolling_date,planned_qty,process_route_id,multiple,status,mh_od,mh_wt,mh_l1,mh_l2,pass_required';
    const res = await fetch(`${url}/rest/v1/rolling_plans?select=${validPlanCols}&order=created_at.desc&limit=10`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    if (res.status !== 200) {
      console.log('Error res status:', res.status, await res.text());
    }
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty('plan_no');
    expect(data[0]).toHaveProperty('mh_od');
  });
});
