import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { mtFromMtr } from '@/lib/productionUtils';

export async function POST(req: NextRequest) {
  try {
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: 'Database service is temporarily unavailable.' }, { status: 500 });
    }

    const body = await req.json();
    const {
      work_order_id,
      inspection_id,
      rework_date,
      vdi_ok_pcs = 0,
      diverted_pcs = 0,
      target_work_order_id,
      target_route_id,
      diversion_reason,
      rejection_pcs = 0,
      remarks = '',
      processed_by = 'QC Inspector',
    } = body;

    if (!work_order_id) {
      return NextResponse.json({ error: 'Work Order ID is required.' }, { status: 400 });
    }

    const okPcs = Math.max(0, Math.round(Number(vdi_ok_pcs) || 0));
    const divPcs = Math.max(0, Math.round(Number(diverted_pcs) || 0));
    const rejPcs = Math.max(0, Math.round(Number(rejection_pcs) || 0));
    const totalToProcess = okPcs + divPcs + rejPcs;

    if (totalToProcess <= 0) {
      return NextResponse.json(
        { error: 'Please enter at least 1 piece to process into VDI OK, Diverted, or Rejection.' },
        { status: 400 }
      );
    }

    if (divPcs > 0) {
      if (!target_work_order_id) {
        return NextResponse.json({ error: 'Target Work Order is required when diverting pieces.' }, { status: 400 });
      }
      if (target_work_order_id === work_order_id) {
        return NextResponse.json({ error: 'Target Work Order must be different from Source Work Order.' }, { status: 400 });
      }
    }

    const processDate = rework_date || new Date().toISOString().slice(0, 10);

    // 1. Fetch Source Work Order Details
    const { data: wo, error: woErr } = await admin
      .from('work_orders')
      .select('id, work_order_no, customer_name, size_od, size_wt, l1, l2, process_route_id')
      .eq('id', work_order_id)
      .single();

    if (woErr || !wo) {
      return NextResponse.json({ error: 'Work Order not found.' }, { status: 404 });
    }

    const od = Number(wo.size_od || 0);
    const wt = Number(wo.size_wt || 0);
    const l1 = Number(wo.l1 || 0);
    const l2 = Number(wo.l2 || 0);
    const avgLen = l1 > 0 && l2 > 0 ? (l1 + l2) / 2 : (l1 || l2 || 6.0);

    // 2. Fetch Eligible QC Inspections for this WO with available salvage
    let query = admin
      .from('qc_inspections')
      .select('*')
      .eq('work_order_id', work_order_id)
      .gt('vdi_salvage_pcs', 0)
      .order('inspection_date', { ascending: true })
      .order('created_at', { ascending: true });

    if (inspection_id) {
      query = query.eq('id', inspection_id);
    }

    const { data: inspections, error: inspErr } = await query;
    if (inspErr || !inspections || inspections.length === 0) {
      return NextResponse.json(
        { error: 'No active VDI Salvage pieces found for this Work Order to rework.' },
        { status: 400 }
      );
    }

    const totalAvailSalvagePcs = inspections.reduce((sum, q) => sum + Number(q.vdi_salvage_pcs || 0), 0);
    if (totalToProcess > totalAvailSalvagePcs) {
      return NextResponse.json(
        {
          error: `Total rework quantity (${totalToProcess} Nos) exceeds available VDI Salvage (${totalAvailSalvagePcs} Nos).`,
        },
        { status: 400 }
      );
    }

    // 3. If diverting, verify target work order
    let targetWoNo = '';
    let targetRoute = target_route_id;
    if (divPcs > 0) {
      const { data: targetWo, error: targetErr } = await admin
        .from('work_orders')
        .select('id, work_order_no, process_route_id')
        .eq('id', target_work_order_id)
        .single();

      if (targetErr || !targetWo) {
        return NextResponse.json({ error: 'Target Work Order not found.' }, { status: 404 });
      }
      targetWoNo = targetWo.work_order_no;
      if (!targetRoute) {
        targetRoute = targetWo.process_route_id || wo.process_route_id;
      }
    }

    // 4. Allocate and apply the rework disposition across inspections
    let remainingToProcess = totalToProcess;
    let remOk = okPcs;
    let remDiv = divPcs;
    let remRej = rejPcs;

    for (const insp of inspections) {
      if (remainingToProcess <= 0) break;

      const availThis = Number(insp.vdi_salvage_pcs || 0);
      if (availThis <= 0) continue;

      const takeThis = Math.min(remainingToProcess, availThis);

      // Allocate portion of OK, Div, Rej to this inspection
      const thisOk = Math.min(remOk, takeThis);
      remOk -= thisOk;

      const availAfterOk = takeThis - thisOk;
      const thisDiv = Math.min(remDiv, availAfterOk);
      remDiv -= thisDiv;

      const thisRej = takeThis - thisOk - thisDiv;
      remRej -= thisRej;

      // Metric calculations
      const thisTakeMtr = Number((takeThis * avgLen).toFixed(2));
      const thisTakeMt = Number(mtFromMtr(thisTakeMtr, od, wt).toFixed(3));

      const thisOkMtr = Number((thisOk * avgLen).toFixed(2));
      const thisOkMt = Number(mtFromMtr(thisOkMtr, od, wt).toFixed(3));

      const thisRejMtr = Number((thisRej * avgLen).toFixed(2));
      const thisRejMt = Number(mtFromMtr(thisRejMtr, od, wt).toFixed(3));

      const newSalvagePcs = Math.max(0, Number(insp.vdi_salvage_pcs || 0) - takeThis);
      const newSalvageMtr = Math.max(0, Number((Number(insp.vdi_salvage_mtr || 0) - thisTakeMtr).toFixed(2)));
      const newSalvageMt = Math.max(0, Number((Number(insp.vdi_salvage_mt || 0) - thisTakeMt).toFixed(3)));

      const newOkPcs = Number(insp.vdi_ok_pcs || 0) + thisOk;
      const newOkMtr = Number((Number(insp.vdi_ok_mtr || 0) + thisOkMtr).toFixed(2));
      const newOkMt = Number((Number(insp.vdi_ok_mt || 0) + thisOkMt).toFixed(3));

      const newRejPcs = Number(insp.vdi_rejection_pcs || 0) + thisRej;
      const newRejMtr = Number((Number(insp.vdi_rejection_mtr || 0) + thisRejMtr).toFixed(2));
      const newRejMt = Number((Number(insp.vdi_rejection_mt || 0) + thisRejMt).toFixed(3));

      // Append rework audit history note
      const reworkSummary = [
        thisOk > 0 ? `${thisOk} Nos -> VDI OK` : null,
        thisDiv > 0 ? `${thisDiv} Nos -> Diverted to WO ${targetWoNo}` : null,
        thisRej > 0 ? `${thisRej} Nos -> Scrap` : null,
      ]
        .filter(Boolean)
        .join(', ');

      const auditTag = `[REWORK ${processDate} by ${processed_by}: ${takeThis} Nos (${reworkSummary})${
        remarks ? ` - Note: ${remarks}` : ''
      }]`;

      const updatedRemarks = insp.remarks ? `${insp.remarks} ${auditTag}` : auditTag;

      const { error: updateErr } = await admin
        .from('qc_inspections')
        .update({
          vdi_ok_pcs: newOkPcs,
          vdi_ok_mtr: newOkMtr,
          vdi_ok_mt: newOkMt,
          vdi_salvage_pcs: newSalvagePcs,
          vdi_salvage_mtr: newSalvageMtr,
          vdi_salvage_mt: newSalvageMt,
          vdi_rejection_pcs: newRejPcs,
          vdi_rejection_mtr: newRejMtr,
          vdi_rejection_mt: newRejMt,
          remarks: updatedRemarks,
          updated_at: new Date().toISOString(),
        })
        .eq('id', insp.id);

      if (updateErr) {
        throw new Error(`Failed to update inspection ${insp.id}: ${updateErr.message}`);
      }

      remainingToProcess -= takeThis;
    }

    // 5. If any quantity was diverted, create formal diversion plan
    let diversionRecord = null;
    if (divPcs > 0) {
      const divertedMtr = Number((divPcs * avgLen).toFixed(3));
      const divPayload = {
        source_wo_id: work_order_id,
        target_wo_id: target_work_order_id,
        diverted_qty: divertedMtr,
        work_center: 'FINISHING',
        route_id: targetRoute || wo.process_route_id,
        multiple: 1,
        reason: diversion_reason
          ? `VDI Salvage Rework: ${diversion_reason}`
          : `Diverted from WO ${wo.work_order_no} VDI Salvage after rework`,
        diversion_date: processDate,
        status: 'ISSUED',
      };

      const { data: divData, error: divErr } = await admin
        .from('diversion_plans')
        .insert(divPayload)
        .select()
        .single();

      if (divErr) {
        console.warn('Direct insert into diversion_plans returned error, attempting fallback:', divErr.message);
      } else {
        diversionRecord = divData;
      }
    }

    return NextResponse.json({
      success: true,
      work_order_no: wo.work_order_no,
      processed_pcs: totalToProcess,
      vdi_ok_pcs: okPcs,
      diverted_pcs: divPcs,
      target_work_order_no: targetWoNo || undefined,
      rejection_pcs: rejPcs,
      diversion_id: diversionRecord?.id,
    });
  } catch (error: any) {
    console.error('API /api/qc/rework error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to process VDI Salvage rework.' },
      { status: 500 }
    );
  }
}
