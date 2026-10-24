import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateQueueCache } from "@/lib/cache/queueCache";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const woId = searchParams.get("work_order_id") || searchParams.get("id");
    const woNo = searchParams.get("work_order_no");

    if (!woId && !woNo) {
      return NextResponse.json({ error: "work_order_id or work_order_no is required" }, { status: 400 });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Failed to initialize database client" }, { status: 500 });
    }

    let query = admin.from("work_orders").select("*");
    if (woId) query = query.eq("id", woId);
    else if (woNo) query = query.eq("work_order_no", woNo);

    const { data: wo, error: woErr } = await query.single();
    if (woErr || !wo) {
      return NextResponse.json({ error: "Work order not found" }, { status: 404 });
    }

    // Retrieve active rolling plans to check existing custom capping
    const { data: plans } = await admin
      .from("rolling_plans")
      .select("*")
      .eq("work_order_id", wo.id);

    const plan = plans?.[0];
    let parsedPlanStatus: any = {};
    if (plan?.status) {
      try {
        parsedPlanStatus = typeof plan.status === "string" ? JSON.parse(plan.status) : plan.status;
      } catch {
        parsedPlanStatus = {};
      }
    }

    // Also check if this work order is a child in any master campaign plan
    const { data: masterPlans } = await admin
      .from("rolling_plans")
      .select("*")
      .ilike("status", `%"work_order_id":"${wo.id}"%`);

    let campaignChildCappingPcs: number | null = null;
    let campaignChildCappingMtr: number | null = null;
    let masterPlanNo: string | null = null;

    if (masterPlans && masterPlans.length > 0) {
      for (const mp of masterPlans) {
        try {
          const mpStatus = typeof mp.status === "string" ? JSON.parse(mp.status) : mp.status;
          const matchedChild = (mpStatus.child_work_orders || []).find((c: any) => c.work_order_id === wo.id);
          if (matchedChild) {
            masterPlanNo = mp.plan_no;
            if (matchedChild.order_capping_pcs || matchedChild.capping_pcs) {
              campaignChildCappingPcs = Number(matchedChild.order_capping_pcs || matchedChild.capping_pcs);
            }
            if (matchedChild.order_capping_mtr || matchedChild.capping_mtr) {
              campaignChildCappingMtr = Number(matchedChild.order_capping_mtr || matchedChild.capping_mtr);
            }
            break;
          }
        } catch {}
      }
    }

    const avg = wo.l1 && wo.l2 ? (Number(wo.l1) + Number(wo.l2)) / 2 : Number(wo.l1 || wo.l2 || 6.0);
    const orderMtr = Number(wo.ordered_qty_mtr || (wo.uom === "Mtrs" ? wo.ordered_qty : (avg > 0 ? wo.ordered_qty * avg : 0)));
    const orderPcs = Math.round(Number(wo.ordered_qty_pcs || (wo.uom === "Pcs" ? wo.ordered_qty : (avg > 0 && orderMtr > 0 ? orderMtr / avg : 0))));

    // Calculate finished quantity so far
    const finishingStageIdRes = await admin
      .from("process_stages")
      .select("id")
      .eq("stage_code", "FINISHING")
      .single();

    let finishedMtr = 0;
    let finishedPcs = 0;
    if (finishingStageIdRes.data?.id) {
      const { data: finLogs } = await admin
        .from("production_logs")
        .select("output_qty, remarks")
        .eq("work_order_id", wo.id)
        .eq("stage_id", finishingStageIdRes.data.id);

      (finLogs || []).forEach((l) => {
        finishedMtr += Number(l.output_qty || 0);
      });
      finishedPcs = avg > 0 ? Math.round(finishedMtr / avg) : 0;
    }

    const defaultCappingPcs = Math.round(orderPcs * 1.10);
    const defaultCappingMtr = Number((orderMtr * 1.10).toFixed(2));

    const customCappingPcs = Number(
      campaignChildCappingPcs ||
      parsedPlanStatus?.order_capping_pcs ||
      parsedPlanStatus?.capping_pcs ||
      0
    );
    const customCappingMtr = Number(
      campaignChildCappingMtr ||
      parsedPlanStatus?.order_capping_mtr ||
      parsedPlanStatus?.capping_mtr ||
      0
    );

    const effectiveCappingPcs = customCappingPcs > 0 ? customCappingPcs : defaultCappingPcs;
    const effectiveCappingMtr = customCappingMtr > 0 ? customCappingMtr : defaultCappingMtr;

    return NextResponse.json({
      success: true,
      work_order_id: wo.id,
      work_order_no: wo.work_order_no,
      customer_name: wo.customer_name,
      specification: wo.specification || wo.grade,
      size_od: wo.size_od,
      size_wt: wo.size_wt,
      avg_length: avg,
      ordered_qty_pcs: orderPcs,
      ordered_qty_mtr: orderMtr,
      finished_output_pcs: finishedPcs,
      finished_output_mtr: finishedMtr,
      default_capping_pcs: defaultCappingPcs,
      default_capping_mtr: defaultCappingMtr,
      custom_capping_pcs: customCappingPcs > 0 ? customCappingPcs : null,
      custom_capping_mtr: customCappingMtr > 0 ? customCappingMtr : null,
      effective_capping_pcs: effectiveCappingPcs,
      effective_capping_mtr: effectiveCappingMtr,
      is_custom: customCappingPcs > 0,
      master_plan_no: masterPlanNo,
      updated_by: parsedPlanStatus?.capping_updated_by || null,
      updated_at: parsedPlanStatus?.capping_updated_at || null,
    });
  } catch (err: any) {
    console.error("GET /api/work-orders/capping error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { work_order_id, work_order_no, capping_pcs, capping_mtr, notes, reset_default } = body;

    if (!work_order_id && !work_order_no) {
      return NextResponse.json({ error: "work_order_id or work_order_no is required" }, { status: 400 });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Failed to initialize database client" }, { status: 500 });
    }

    let query = admin.from("work_orders").select("*");
    if (work_order_id) query = query.eq("id", work_order_id);
    else if (work_order_no) query = query.eq("work_order_no", work_order_no);

    const { data: wo, error: woErr } = await query.single();
    if (woErr || !wo) {
      return NextResponse.json({ error: "Work order not found" }, { status: 404 });
    }

    const avg = wo.l1 && wo.l2 ? (Number(wo.l1) + Number(wo.l2)) / 2 : Number(wo.l1 || wo.l2 || 6.0);
    const orderMtr = Number(wo.ordered_qty_mtr || (wo.uom === "Mtrs" ? wo.ordered_qty : (avg > 0 ? wo.ordered_qty * avg : 0)));
    const orderPcs = Math.round(Number(wo.ordered_qty_pcs || (wo.uom === "Pcs" ? wo.ordered_qty : (avg > 0 && orderMtr > 0 ? orderMtr / avg : 0))));

    let newCapPcs: number | null = null;
    let newCapMtr: number | null = null;

    if (!reset_default) {
      newCapPcs = Number(capping_pcs);
      if (isNaN(newCapPcs) || newCapPcs <= 0) {
        return NextResponse.json({ error: "capping_pcs must be a positive number" }, { status: 400 });
      }
      newCapMtr = capping_mtr ? Number(capping_mtr) : (avg > 0 ? Number((newCapPcs * avg).toFixed(2)) : null);
    }

    // 1. Update rolling_plans for this work order
    const { data: plans } = await admin
      .from("rolling_plans")
      .select("*")
      .eq("work_order_id", wo.id);

    const nowIso = new Date().toISOString();

    if (plans && plans.length > 0) {
      for (const p of plans) {
        let statusObj: any = {};
        try {
          statusObj = typeof p.status === "string" ? JSON.parse(p.status) : p.status || {};
        } catch {
          statusObj = {};
        }

        if (reset_default) {
          delete statusObj.order_capping_pcs;
          delete statusObj.capping_pcs;
          delete statusObj.order_capping_mtr;
          delete statusObj.capping_mtr;
          statusObj.capping_reset_at = nowIso;
        } else {
          statusObj.order_capping_pcs = newCapPcs;
          statusObj.capping_pcs = newCapPcs;
          statusObj.order_capping_mtr = newCapMtr;
          statusObj.capping_mtr = newCapMtr;
          statusObj.capping_updated_at = nowIso;
          statusObj.capping_notes = notes || null;
        }

        await admin
          .from("rolling_plans")
          .update({
            status: JSON.stringify(statusObj),
            updated_at: nowIso,
          })
          .eq("id", p.id);
      }
    } else if (!reset_default && newCapPcs) {
      // Create a plan entry with the custom capping status
      const { data: defaultRoute } = await admin
        .from("process_routes")
        .select("id")
        .eq("active", true)
        .limit(1)
        .single();

      if (defaultRoute?.id) {
        await admin.from("rolling_plans").insert({
          work_order_id: wo.id,
          process_route_id: defaultRoute.id,
          planned_rolling_date: new Date().toISOString().slice(0, 10),
          planned_qty: newCapMtr || (avg > 0 ? newCapPcs * avg : 100),
          multiple: 1,
          status: JSON.stringify({
            lifecycle_status: "ISSUED",
            order_capping_pcs: newCapPcs,
            capping_pcs: newCapPcs,
            order_capping_mtr: newCapMtr,
            capping_mtr: newCapMtr,
            capping_updated_at: nowIso,
            capping_notes: notes || null,
          }),
        });
      }
    }

    // 2. Also check if this work order is a child in any master campaign plan
    const { data: masterPlans } = await admin
      .from("rolling_plans")
      .select("*")
      .ilike("status", `%"work_order_id":"${wo.id}"%`);

    if (masterPlans && masterPlans.length > 0) {
      for (const mp of masterPlans) {
        try {
          const mpStatus = typeof mp.status === "string" ? JSON.parse(mp.status) : mp.status;
          let modified = false;
          const updatedChildren = (mpStatus.child_work_orders || []).map((c: any) => {
            if (c.work_order_id === wo.id) {
              modified = true;
              if (reset_default) {
                const copy = { ...c };
                delete copy.order_capping_pcs;
                delete copy.capping_pcs;
                delete copy.order_capping_mtr;
                delete copy.capping_mtr;
                return copy;
              } else {
                return {
                  ...c,
                  order_capping_pcs: newCapPcs,
                  capping_pcs: newCapPcs,
                  order_capping_mtr: newCapMtr,
                  capping_mtr: newCapMtr,
                };
              }
            }
            return c;
          });

          if (modified) {
            mpStatus.child_work_orders = updatedChildren;
            await admin
              .from("rolling_plans")
              .update({
                status: JSON.stringify(mpStatus),
                updated_at: nowIso,
              })
              .eq("id", mp.id);
          }
        } catch {}
      }
    }

    // 3. Invalidate queue cache so queue immediately reflects the updated capping
    invalidateQueueCache();

    return NextResponse.json({
      success: true,
      work_order_id: wo.id,
      work_order_no: wo.work_order_no,
      capping_pcs: reset_default ? Math.round(orderPcs * 1.10) : newCapPcs,
      capping_mtr: reset_default ? Number((orderMtr * 1.10).toFixed(2)) : newCapMtr,
      is_custom: !reset_default,
    });
  } catch (err: any) {
    console.error("POST /api/work-orders/capping error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
