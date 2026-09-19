import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/authGuard';
import { attachPcsToRemarks } from '@/lib/productionUtils';

export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireAuth(req);
    if ('errorResponse' in authCheck && authCheck.errorResponse) {
      return authCheck.errorResponse;
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: 'Database service is temporarily unavailable.' }, { status: 500 });
    }

    const body = await req.json();
    const { work_center, rows = [] } = body;

    if (!work_center) {
      return NextResponse.json({ error: 'Work center stage is required.' }, { status: 400 });
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No data rows provided for import.' }, { status: 400 });
    }

    // 1. Fetch process stages to resolve stage_id
    const { data: stages, error: stagesErr } = await admin
      .from('process_stages')
      .select('id, stage_code, stage_name');

    if (stagesErr || !stages) {
      return NextResponse.json({ error: 'Failed to load process stages.' }, { status: 500 });
    }

    const stageObj = stages.find((s) => s.stage_code === work_center);
    const stageId = stageObj?.id;

    // 2. Fetch all Work Orders to map by work_order_no
    const workOrderNos = Array.from(
      new Set(rows.map((r: any) => String(r.work_order_no || '').trim()).filter(Boolean))
    );

    const { data: workOrders, error: woErr } = await admin
      .from('work_orders')
      .select('id, work_order_no, process_route_id, size_od, size_wt, l1, l2, balance_qty_mtr, balance_qty_pcs, customer_name, specification')
      .in('work_order_no', workOrderNos);

    if (woErr) {
      return NextResponse.json({ error: `Failed to query work orders: ${woErr.message}` }, { status: 500 });
    }

    const woMap = new Map<string, any>();
    (workOrders || []).forEach((wo) => {
      woMap.set(wo.work_order_no.toLowerCase().trim(), wo);
    });

    // Default route in case route_id is missing
    const { data: routes } = await admin.from('process_routes').select('id, route_code');
    const defaultRouteId = routes?.find((r) => r.route_code === 'CDS')?.id || routes?.[0]?.id;

    const errors: string[] = [];
    let importedCount = 0;

    if (work_center === 'VDI') {
      // --- VDI QC Inspection Batch Import ---
      for (const [index, row] of rows.entries()) {
        const woNo = String(row.work_order_no || '').trim();
        const wo = woMap.get(woNo.toLowerCase());
        if (!wo) {
          errors.push(`Row ${index + 1}: Work Order "${woNo}" does not exist in the database.`);
          continue;
        }

        const dateStr = row.process_date || new Date().toISOString().slice(0, 10);
        const inspPcs = Number(row.inspected_pcs || 0);
        const inspMtr = Number(row.inspected_mtr || 0);
        const inspMt = Number(row.inspected_mt || 0);

        const okPcs = Number(row.vdi_ok_pcs || 0);
        const okMtr = Number(row.vdi_ok_mtr || 0);
        const okMt = Number(row.vdi_ok_mt || 0);

        const salPcs = Number(row.vdi_salvage_pcs || 0);
        const salMtr = Number(row.vdi_salvage_mtr || 0);
        const salMt = Number(row.vdi_salvage_mt || 0);

        const rejPcs = Number(row.vdi_rejection_pcs || 0);
        const rejMtr = Number(row.vdi_rejection_mtr || 0);
        const rejMt = Number(row.vdi_rejection_mt || 0);

        let salvageReasons = Array.isArray(row.salvage_reasons) ? row.salvage_reasons : [];
        if (salvageReasons.length === 0 && salPcs > 0) {
          salvageReasons = [
            {
              id: `sal_${Date.now()}_${index}`,
              reason: row.salvage_reason || row.remarks || 'VDI Salvage / Conditioning Required',
              pcs: salPcs,
              mtr: salMtr,
              mt: salMt,
              remarks: row.remarks || '',
            },
          ];
        }

        // Insert into qc_inspections
        const qcPayload = {
          work_order_id: wo.id,
          inspection_date: dateStr,
          inspected_pcs: inspPcs,
          inspected_mtr: inspMtr,
          inspected_mt: inspMt,
          vdi_ok_pcs: okPcs,
          vdi_ok_mtr: okMtr,
          vdi_ok_mt: okMt,
          vdi_salvage_pcs: salPcs,
          vdi_salvage_mtr: salMtr,
          vdi_salvage_mt: salMt,
          vdi_rejection_pcs: rejPcs,
          vdi_rejection_mtr: rejMtr,
          vdi_rejection_mt: rejMt,
          salvage_reasons: salvageReasons,
          remarks: row.remarks || null,
          created_by: row.operator_name || 'Excel Importer',
        };

        const { error: qcErr } = await admin.from('qc_inspections').insert(qcPayload);
        if (qcErr) {
          errors.push(`Row ${index + 1} (${woNo}): QC Inspection failed: ${qcErr.message}`);
          continue;
        }

        const rowL1 = row.l1 ?? row.input_l1 ?? null;
        const rowL2 = row.l2 ?? row.input_l2 ?? null;

        // Also record in production_logs for unified ledger visibility if stageId exists
        if (stageId) {
          await admin.from('production_logs').insert({
            work_order_id: wo.id,
            stage_id: stageId,
            process_route_id: wo.process_route_id || defaultRouteId,
            process_date: dateStr,
            input_qty: inspMtr,
            output_qty: okMtr,
            rejection_qty: rejMtr + salMtr,
            output_pcs: okPcs || null,
            rejection_pcs: (rejPcs + salPcs) || null,
            remarks: attachPcsToRemarks(
              row.remarks,
              okPcs,
              rejPcs + salPcs,
              rowL1 ? String(rowL1) : undefined,
              rowL2 ? String(rowL2) : undefined
            ) || null,
            operator_name: row.operator_name || null,
          });
        }

        importedCount++;
      }
    } else {
      // --- Standard Work Center Batch Import (ROLLING, HTC, DRAW, HT, BAND_SAW, FINISHING) ---
      if (!stageId) {
        return NextResponse.json({ error: `Stage ${work_center} is not registered in process_stages.` }, { status: 400 });
      }

      for (const [index, row] of rows.entries()) {
        const woNo = String(row.work_order_no || '').trim();
        const wo = woMap.get(woNo.toLowerCase());
        if (!wo) {
          errors.push(`Row ${index + 1}: Work Order "${woNo}" does not exist in the database.`);
          continue;
        }

        const dateStr = row.process_date || new Date().toISOString().slice(0, 10);
        const inMtr = Number(row.input_mtr || row.input_qty || row.output_mtr || row.output_qty || 0);
        const outMtr = Number(row.output_mtr || row.output_qty || 0);
        const rejMtr = Number(row.rejection_mtr || row.rejection_qty || 0);
        const outPcs = Number(row.output_pcs || 0) || null;
        const rejPcs = Number(row.rejection_pcs || 0) || null;
        const htcOkMtr = work_center === 'ROLLING' ? Number(row.htc_ok_mtr || row.htc_ok || (outMtr - rejMtr)) : 0;
        const htcOkPcs = work_center === 'ROLLING' ? Number(row.htc_ok_pcs || (outPcs ? Math.max(0, outPcs - (rejPcs || 0)) : null)) : null;

        const rowL1 = row.l1 ?? row.input_l1 ?? null;
        const rowL2 = row.l2 ?? row.input_l2 ?? null;

        const finalRemarks = attachPcsToRemarks(
          row.remarks,
          outPcs,
          rejPcs,
          rowL1 ? String(rowL1) : undefined,
          rowL2 ? String(rowL2) : undefined
        );

        const logPayload = {
          work_order_id: wo.id,
          stage_id: stageId,
          process_route_id: wo.process_route_id || defaultRouteId,
          process_date: dateStr,
          input_qty: inMtr,
          output_qty: outMtr,
          rejection_qty: rejMtr,
          htc_ok: htcOkMtr,
          output_pcs: outPcs,
          rejection_pcs: rejPcs,
          htc_ok_pcs: htcOkPcs,
          heat_lot_no: row.heat_lot_no || row.heat_no || row.lot_no || null,
          operator_name: row.operator_name || null,
          remarks: finalRemarks || null,
        };

        const { error: insertErr } = await admin.from('production_logs').insert(logPayload);
        if (insertErr) {
          errors.push(`Row ${index + 1} (${woNo}): Log insert failed: ${insertErr.message}`);
          continue;
        }

        // Update Work Order lifecycle status if required
        if (work_center === 'FINISHING') {
          const { data: finishingLogs } = await admin
            .from('production_logs')
            .select('output_qty')
            .eq('work_order_id', wo.id)
            .eq('stage_id', stageId);

          const totalFinished = (finishingLogs ?? []).reduce(
            (sum, l) => sum + Number(l.output_qty || 0),
            0
          );
          const targetMtr = Number(wo.balance_qty_mtr || 0);
          const newStatus = targetMtr > 0 && totalFinished >= targetMtr ? 'Completed' : 'In Progress';

          await admin
            .from('work_orders')
            .update({ status: newStatus })
            .eq('id', wo.id);
        } else {
          await admin
            .from('work_orders')
            .update({ status: 'In Progress' })
            .eq('id', wo.id)
            .in('status', ['Pending Plan', 'Scheduled', 'Pending']);
        }

        importedCount++;
      }
    }

    if (importedCount === 0 && errors.length > 0) {
      return NextResponse.json({ error: errors.join('; ') }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      importedCount,
      totalRows: rows.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Work center Excel import API error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to import work center Excel data.' },
      { status: 500 }
    );
  }
}
