// app/api/daily-plans/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DailyPlanItemWithWorkOrder } from '@/types/dailyPlanning';
import { calculatePlanCompliance } from '@/lib/planning/dailyPlanningHelper';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);
    const shift = searchParams.get('shift');
    const workCenter = searchParams.get('work_center');

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database service is temporarily unavailable.', plans: [] }, { status: 500 });
    }

    // Query daily production plans
    let query = supabase
      .from('daily_production_plans')
      .select(`
        id,
        plan_date,
        shift,
        work_center,
        work_order_id,
        target_pcs,
        target_mtr,
        target_mt,
        machine_id,
        charge_no,
        pass_no,
        priority_rank,
        notes,
        status,
        created_by,
        created_at,
        updated_at,
        work_orders (
          id,
          work_order_no,
          customer_name,
          grade,
          specification,
          size_od,
          size_wt,
          l1,
          l2,
          ordered_qty,
          ordered_qty_mtr
        )
      `)
      .eq('plan_date', date)
      .order('priority_rank', { ascending: true });

    if (shift && shift !== 'ALL_DAY') {
      query = query.eq('shift', shift);
    }
    if (workCenter && workCenter !== 'ALL') {
      query = query.eq('work_center', workCenter);
    }

    const { data: plansData, error: plansError } = await query;

    if (plansError) {
      console.warn('daily_production_plans table query warning (table may require migration):', plansError.message);
      return NextResponse.json({ plans: [], error: plansError.message }, { status: 200 });
    }

    const plans = plansData || [];
    const workOrderIds = plans.map((p: any) => p.work_order_id).filter(Boolean);

    // Fetch mother hollow specs from rolling plans if available
    let rollingPlanMap = new Map<string, { mh_wt?: number | null; mh_od?: number | null; mh_l1?: number | null; mh_l2?: number | null }>();
    if (workOrderIds.length > 0) {
      const { data: rPlans } = await supabase
        .from('rolling_plans')
        .select('work_order_id, mh_wt, mh_od, mh_l1, mh_l2')
        .in('work_order_id', workOrderIds);

      (rPlans || []).forEach((rp: any) => {
        if (rp.work_order_id && !rollingPlanMap.has(rp.work_order_id)) {
          rollingPlanMap.set(rp.work_order_id, {
            mh_wt: rp.mh_wt ? Number(rp.mh_wt) : null,
            mh_od: rp.mh_od ? Number(rp.mh_od) : null,
            mh_l1: rp.mh_l1 ? Number(rp.mh_l1) : null,
            mh_l2: rp.mh_l2 ? Number(rp.mh_l2) : null,
          });
        }
      });
    }

    // Fetch live actual production entries logged on this date
    let actualsMap = new Map<string, { actual_pcs: number; actual_mtr: number; actual_mt: number }>();

    if (workOrderIds.length > 0) {
      const { data: entries } = await supabase
        .from('production_entries')
        .select('work_order_id, stage_code, output_pcs, output_mtr, output_mt, htc_ok_pcs, htc_ok_mtr')
        .in('work_order_id', workOrderIds)
        .eq('process_date', date);

      (entries || []).forEach((e: any) => {
        const key = `${e.work_order_id}_${(e.stage_code || '').toUpperCase()}`;
        const prev = actualsMap.get(key) || { actual_pcs: 0, actual_mtr: 0, actual_mt: 0 };
        const pcs = Number(e.htc_ok_pcs || e.output_pcs || 0);
        const mtr = Number(e.htc_ok_mtr || e.output_mtr || 0);
        const mt = Number(e.output_mt || 0);
        actualsMap.set(key, {
          actual_pcs: prev.actual_pcs + pcs,
          actual_mtr: prev.actual_mtr + mtr,
          actual_mt: prev.actual_mt + mt,
        });
      });
    }

    // Combine plans with live actual progress and technical mill specs
    const enrichedPlans: DailyPlanItemWithWorkOrder[] = plans.map((p: any) => {
      const wo = p.work_orders || {};
      const rp = rollingPlanMap.get(p.work_order_id);
      const key = `${p.work_order_id}_${p.work_center}`;
      const actuals = actualsMap.get(key) || { actual_pcs: 0, actual_mtr: 0, actual_mt: 0 };
      const targetPcs = Number(p.target_pcs || 0);
      const actualPcs = actuals.actual_pcs;

      const od = Number(wo.size_od || 0);
      const wt = Number(wo.size_wt || 0);
      const factor = (od > 0 && wt > 0) ? Number(((od - wt) * wt).toFixed(4)) : null;
      const kgPerMtr = factor ? Number((factor * 0.0246615).toFixed(3)) : null;
      const procWall = rp?.mh_wt ?? (wt > 0 ? wt : null);
      const l1 = Number(wo.l1 || rp?.mh_l1 || 0) || null;
      const l2 = Number(wo.l2 || rp?.mh_l2 || 0) || null;
      const avgLength = (l1 && l2) 
        ? Number(((l1 + l2) / 2).toFixed(2)) 
        : (l1 || l2 || (targetPcs > 0 && Number(p.target_mtr || 0) > 0 ? Number((Number(p.target_mtr) / targetPcs).toFixed(2)) : null));

      let targetMt = Number(p.target_mt || 0);
      if (targetMt <= 0 && targetPcs > 0 && avgLength && kgPerMtr) {
        targetMt = Number(((targetPcs * avgLength * kgPerMtr) / 1000).toFixed(3));
      }

      return {
        id: p.id,
        plan_date: p.plan_date,
        shift: p.shift,
        work_center: p.work_center,
        work_order_id: p.work_order_id,
        target_pcs: targetPcs,
        target_mtr: Number(p.target_mtr || 0),
        target_mt: targetMt,
        machine_id: p.machine_id,
        charge_no: p.charge_no,
        pass_no: p.pass_no,
        priority_rank: p.priority_rank || 1,
        notes: p.notes,
        status: p.status || 'PLANNED',
        created_by: p.created_by,
        created_at: p.created_at,
        updated_at: p.updated_at,
        work_order_no: wo.work_order_no || '—',
        customer_name: wo.customer_name,
        grade: wo.grade,
        specification: wo.specification,
        size_od: wo.size_od,
        size_wt: wo.size_wt,
        ordered_qty_pcs: wo.ordered_qty,
        ordered_qty_mtr: wo.ordered_qty_mtr,
        l1,
        l2,
        avg_length: avgLength,
        proc_wall: procWall,
        factor,
        kg_per_mtr: kgPerMtr,
        actual_pcs: actualPcs,
        actual_mtr: Number(actuals.actual_mtr.toFixed(2)),
        actual_mt: Number(actuals.actual_mt.toFixed(3)),
        compliance_pct: calculatePlanCompliance(targetPcs, actualPcs),
      };
    });

    return NextResponse.json({ plans: enrichedPlans });
  } catch (err: any) {
    console.error('Failed to get daily plans:', err);
    return NextResponse.json({ error: err?.message || 'Failed to fetch daily plans', plans: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id,
      plan_date,
      shift = 'ALL_DAY',
      work_center,
      work_order_id,
      target_pcs,
      target_mtr = 0,
      target_mt = 0,
      machine_id,
      charge_no,
      pass_no,
      priority_rank = 1,
      notes,
      status = 'PLANNED',
    } = body;

    if (!plan_date || !work_center || !work_order_id) {
      return NextResponse.json(
        { error: 'Missing required fields: plan_date, work_center, work_order_id' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database service is temporarily unavailable.' }, { status: 500 });
    }

    const planPayload = {
      plan_date,
      shift,
      work_center,
      work_order_id,
      target_pcs: Number(target_pcs || 0),
      target_mtr: Number(target_mtr || 0),
      target_mt: Number(target_mt || 0),
      machine_id: machine_id || null,
      charge_no: charge_no || null,
      pass_no: pass_no || null,
      priority_rank: Number(priority_rank || 1),
      notes: notes || null,
      status,
      updated_at: new Date().toISOString(),
    };

    // Enforce: A work order cannot be planned multiple times for the same work center on the same date
    if (!id) {
      const { data: existingPlan } = await supabase
        .from('daily_production_plans')
        .select('id, target_pcs, shift, machine_id')
        .eq('work_order_id', work_order_id)
        .eq('work_center', work_center)
        .eq('plan_date', plan_date)
        .maybeSingle();

      if (existingPlan) {
        return NextResponse.json(
          {
            error: `This work order is already planned for ${work_center} on ${plan_date} (Target: ${existingPlan.target_pcs} PCS). Cannot plan the same work order multiple times. Please edit the existing target instead.`,
          },
          { status: 409 }
        );
      }
    } else {
      const { data: collision } = await supabase
        .from('daily_production_plans')
        .select('id, target_pcs')
        .eq('work_order_id', work_order_id)
        .eq('work_center', work_center)
        .eq('plan_date', plan_date)
        .neq('id', id)
        .maybeSingle();

      if (collision) {
        return NextResponse.json(
          {
            error: `Another daily plan target already exists for this work order at ${work_center} on ${plan_date}.`,
          },
          { status: 409 }
        );
      }
    }

    let result;
    if (id) {
      result = await supabase
        .from('daily_production_plans')
        .update(planPayload)
        .eq('id', id)
        .select()
        .single();
    } else {
      result = await supabase
        .from('daily_production_plans')
        .insert({ ...planPayload, created_at: new Date().toISOString() })
        .select()
        .single();
    }

    if (result.error) {
      throw new Error(result.error.message);
    }

    return NextResponse.json({ success: true, plan: result.data });
  } catch (err: any) {
    console.error('Failed to save daily plan:', err);
    return NextResponse.json({ error: err?.message || 'Failed to save daily plan' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing plan id' }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database service is temporarily unavailable.' }, { status: 500 });
    }
    const { error } = await supabase.from('daily_production_plans').delete().eq('id', id);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, message: 'Plan deleted successfully' });
  } catch (err: any) {
    console.error('Failed to delete daily plan:', err);
    return NextResponse.json({ error: err?.message || 'Failed to delete daily plan' }, { status: 500 });
  }
}
