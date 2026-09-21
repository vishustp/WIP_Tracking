import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/authGuard';
import { attachPcsToRemarks } from '@/lib/productionUtils';
import { computeFeederBalanceForWorkOrder, FeederBalance } from '@/lib/feederValidation';

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
      .select('id, work_order_no, size_od, size_wt, l1, l2, balance_qty_mtr, balance_qty_pcs, customer_name, specification')
      .in('work_order_no', workOrderNos);

    if (woErr) {
      return NextResponse.json({ error: `Failed to query work orders: ${woErr.message}` }, { status: 500 });
    }

    const woMap = new Map<string, any>();
    const woIds: string[] = [];
    (workOrders || []).forEach((wo) => {
      woMap.set(wo.work_order_no.toLowerCase().trim(), wo);
      woIds.push(wo.id);
    });

    // Default route in case route_id is missing
    const { data: routes } = await admin.from('process_routes').select('id, route_code');
    const defaultRouteId = routes?.find((r) => r.route_code === 'CDS')?.id || routes?.[0]?.id;

    // Resolve process_route_id from rolling_plans if available
    const planRouteMap = new Map<string, string>();
    if (woIds.length > 0) {
      const { data: plans } = await admin
        .from('rolling_plans')
        .select('work_order_id, process_route_id')
        .in('work_order_id', woIds);

      (plans || []).forEach((p) => {
        if (p.work_order_id && p.process_route_id) {
          planRouteMap.set(p.work_order_id, p.process_route_id);
        }
      });
    }

    // Load data for upstream feeder balance calculations across all work centers
    const [allLogsRes, allPlansRes, allQcRes] = await Promise.all([
      admin
        .from('production_logs')
        .select('id, work_order_id, stage_id, process_date, input_qty, output_qty, rejection_qty, htc_ok, remarks, heat_lot_no')
        .in('work_order_id', woIds),
      admin
        .from('rolling_plans')
        .select('id, work_order_id, planned_qty, status, process_route_id')
        .in('work_order_id', woIds),
      admin
        .from('qc_inspections')
        .select('id, work_order_id, inspected_pcs, inspected_mtr, vdi_ok_pcs, vdi_ok_mtr, vdi_salvage_pcs, vdi_rejection_pcs')
        .in('work_order_id', woIds),
    ]);

    const stageCodeToId = new Map<string, string>();
    stages.forEach((s) => stageCodeToId.set(s.stage_code, s.id));

    // Initialize running feeder balance per work order
    const feederBalanceMap = new Map<string, FeederBalance>();
    (workOrders || []).forEach((wo) => {
      let routeId = planRouteMap.get(wo.id) || defaultRouteId;
      let routeObj = routes?.find((r) => r.id === routeId);
      let routeCode = routeObj?.route_code || 'CDS';

      // For Hollow Heat Treatment, ensure alloy route handling is active
      if (work_center === 'HOLLOW_HEAT_TREATMENT' && !routeCode.includes('ALLOY')) {
        const alloyRoute = routes?.find((r) => r.route_code === 'ALLOY_CDS');
        if (alloyRoute) {
          routeId = alloyRoute.id;
          routeCode = alloyRoute.route_code;
        }
      }

      const bal = computeFeederBalanceForWorkOrder({
        workOrder: {
          id: wo.id,
          work_order_no: wo.work_order_no,
          l1: wo.l1,
          l2: wo.l2,
        },
        targetStage: work_center,
        routeCode,
        logs: allLogsRes.data || [],
        stageCodeToId,
        rollingPlans: allPlansRes.data || [],
        qcInspections: allQcRes.data || [],
      });
      feederBalanceMap.set(wo.id, { ...bal });
    });

    const errors: string[] = [];
    let importedCount = 0;
    let skippedDuplicatesCount = 0;

    if (work_center === 'VDI') {
      // --- VDI QC Inspection Batch Import ---
      const { data: existingQc } = await admin
        .from('qc_inspections')
        .select('work_order_id, inspection_date, inspected_pcs, vdi_ok_pcs')
        .in('work_order_id', woIds);

      const existingQcCountMap = new Map<string, number>();
      (existingQc || []).forEach((q: any) => {
        const key = `${q.work_order_id}_${q.inspection_date}_${Number(q.inspected_pcs || 0)}_${Number(q.vdi_ok_pcs || 0)}`;
        existingQcCountMap.set(key, (existingQcCountMap.get(key) || 0) + 1);
      });

      for (const [index, row] of rows.entries()) {
        const woNo = String(row.work_order_no || '').trim();
        const wo = woMap.get(woNo.toLowerCase());
        if (!wo) {
          errors.push(`Row ${index + 1}: Work Order "${woNo}" does not exist in the database.`);
          continue;
        }

        const dateStr = row.process_date || new Date().toISOString().slice(0, 10);
        const inspPcs = Number(row.inspected_pcs || 0);
        const okPcs = Number(row.vdi_ok_pcs || 0);

        const qcSig = `${wo.id}_${dateStr}_${inspPcs}_${okPcs}`;
        const existingCount = existingQcCountMap.get(qcSig) || 0;
        if (existingCount > 0) {
          existingQcCountMap.set(qcSig, existingCount - 1);
          skippedDuplicatesCount++;
          continue;
        }

        const inspMtr = Number(row.inspected_mtr || 0);
        const inspMt = Number(row.inspected_mt || 0);
        const okMtr = Number(row.vdi_ok_mtr || 0);
        const okMt = Number(row.vdi_ok_mt || 0);

        // Feeder WIP capping check for VDI
        const feederBal = feederBalanceMap.get(wo.id);
        if (feederBal) {
          if (feederBal.availPcs <= 0 && feederBal.availMtr <= 0) {
            errors.push(`Row ${index + 1} (${woNo}): No available feeder WIP for VDI Inspection. Please record and pass ${feederBal.feederLabel} first.`);
            continue;
          }
          if (inspPcs > 0 && feederBal.availPcs > 0 && inspPcs > feederBal.availPcs) {
            errors.push(`Row ${index + 1} (${woNo}): VDI Inspected (${inspPcs} PCS) exceeds available ${feederBal.feederLabel} feeder balance (${feederBal.availPcs} PCS).`);
            continue;
          }
          if (inspPcs <= 0 && inspMtr > feederBal.availMtr + 0.5) {
            errors.push(`Row ${index + 1} (${woNo}): VDI Inspected (${inspMtr.toFixed(2)} MTR) exceeds available ${feederBal.feederLabel} feeder balance (${feederBal.availMtr.toFixed(2)} MTR).`);
            continue;
          }
          feederBal.availPcs = Math.max(0, feederBal.availPcs - inspPcs);
          feederBal.availMtr = Math.max(0, Number((feederBal.availMtr - inspMtr).toFixed(2)));
        }

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
        const { error: qcErr } = await admin.from('qc_inspections').insert({
          work_order_id: wo.id,
          inspection_date: dateStr,
          inspector_name: row.operator_name || 'QC Inspector (Excel Import)',
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
          disposition: salPcs > 0 ? 'SALVAGE_REQUIRED' : rejPcs > 0 ? 'REJECTED' : 'ACCEPTED',
          notes: row.remarks || null,
        });

        if (qcErr) {
          errors.push(`Row ${index + 1} (${woNo}): QC insert failed: ${qcErr.message}`);
          continue;
        }

        const rowL1 = row.l1 ?? row.input_l1 ?? null;
        const rowL2 = row.l2 ?? row.input_l2 ?? null;

        // Also record in production_logs for unified ledger visibility if stageId exists
        if (stageId) {
          const opPrefix = row.operator_name ? `[Op: ${String(row.operator_name).trim()}]` : '';
          const userRemarks = row.remarks ? String(row.remarks).trim() : '';
          const combinedRemarks = [opPrefix, userRemarks].filter(Boolean).join(' ');

          await admin.from('production_logs').insert({
            work_order_id: wo.id,
            stage_id: stageId,
            process_route_id: planRouteMap.get(wo.id) || defaultRouteId,
            process_date: dateStr,
            input_qty: inspMtr,
            output_qty: okMtr,
            rejection_qty: rejMtr + salMtr,
            htc_ok: 0,
            heat_lot_no: row.heat_lot_no || row.heat_no || row.lot_no || null,
            remarks: attachPcsToRemarks(
              combinedRemarks,
              okPcs,
              rejPcs + salPcs,
              rowL1 ? String(rowL1) : undefined,
              rowL2 ? String(rowL2) : undefined
            ) || null,
          });
        }

        importedCount++;
      }
    } else {
      // --- Standard Work Center Batch Import (ROLLING, HTC, DRAW, HT, BAND_SAW, FINISHING) ---
      if (!stageId) {
        return NextResponse.json({ error: `Stage ${work_center} is not registered in process_stages.` }, { status: 400 });
      }

      // Pre-load existing logs for candidate work orders at this stage
      const existingLogsRes = await admin
        .from('production_logs')
        .select('work_order_id, stage_id, remarks, process_date, output_qty, heat_lot_no')
        .eq('stage_id', stageId)
        .in('work_order_id', woIds);

      const existingBundleSet = new Set<string>();
      const existingLogCountMap = new Map<string, number>();

      (existingLogsRes.data || []).forEach((el: any) => {
        const bMatch = (el.remarks || '').match(/(?:Bundle:\s*|\[Bundle:\s*)([^\s,\]]+)/i);
        if (bMatch) {
          const bCode = bMatch[1].trim().toUpperCase();
          existingBundleSet.add(`${el.work_order_id}_${bCode}`);
        }
        const heatStr = (el.heat_lot_no || '').trim().toUpperCase();
        const sig = `${el.work_order_id}_${el.process_date}_${Number(el.output_qty || 0).toFixed(2)}_${heatStr}`;
        existingLogCountMap.set(sig, (existingLogCountMap.get(sig) || 0) + 1);
      });

      for (const [index, row] of rows.entries()) {
        const woNo = String(row.work_order_no || '').trim();
        const wo = woMap.get(woNo.toLowerCase());
        if (!wo) {
          errors.push(`Row ${index + 1}: Work Order "${woNo}" does not exist in the database.`);
          continue;
        }

        const dateStr = row.process_date || new Date().toISOString().slice(0, 10);
        const inMtr = Number(row.input_mtr || row.input_qty || row.output_mtr || row.output_qty || 0);
        let outMtr = Number(row.output_mtr || row.output_qty || 0);
        const rejMtr = Number(row.rejection_mtr || row.rejection_qty || 0);
        let outPcs = Number(row.output_pcs || 0) || null;
        const rejPcs = Number(row.rejection_pcs || 0) || null;
        const inPcs = Number(row.input_pcs || 0) || null;

        // Auto-derive output from input if output wasn't separately entered
        if (!outPcs && !outMtr && (inPcs || inMtr)) {
          if (inPcs) outPcs = Math.max(0, inPcs - (rejPcs || 0));
          if (inMtr) outMtr = Math.max(0, Number((inMtr - rejMtr).toFixed(2)));
        }

        const htcOkMtr = work_center === 'ROLLING' ? Number(row.htc_ok_mtr || row.htc_ok || (outMtr - rejMtr)) : 0;
        const htcOkPcs = work_center === 'ROLLING' ? Number(row.htc_ok_pcs || (outPcs ? Math.max(0, outPcs - (rejPcs || 0)) : null)) : null;

        // Check if unique bundle already exists
        const incomingBundle = (row.bundle_no || '').trim().toUpperCase() ||
          ((row.remarks || '').match(/(?:Bundle:\s*|\[Bundle:\s*)([^\s,\]]+)/i)?.[1] || '').trim().toUpperCase();

        if (incomingBundle) {
          const bKey = `${wo.id}_${incomingBundle}`;
          if (existingBundleSet.has(bKey)) {
            skippedDuplicatesCount++;
            continue;
          }
          existingBundleSet.add(bKey);
        } else {
          // If no bundle, match 1:1 against pre-existing database logs
          const heatStr = (row.heat_lot_no || row.heat_no || row.lot_no || '').trim().toUpperCase();
          const sig = `${wo.id}_${dateStr}_${outMtr.toFixed(2)}_${heatStr}`;
          const countInDb = existingLogCountMap.get(sig) || 0;
          if (countInDb > 0) {
            existingLogCountMap.set(sig, countInDb - 1);
            skippedDuplicatesCount++;
            continue;
          }
        }

        const rowL1 = row.l1 ?? row.input_l1 ?? null;
        const rowL2 = row.l2 ?? row.input_l2 ?? null;

        const effectiveOutPcs = outPcs || htcOkPcs || null;

        // Feeder WIP capping check across all manufacturing stages
        const feederBal = feederBalanceMap.get(wo.id);
        if (feederBal) {
          const avgLen = rowL1 && rowL2 ? (rowL1 + rowL2) / 2 : rowL1 || rowL2 || (wo.l1 && wo.l2 ? (wo.l1 + wo.l2) / 2 : 6.0);
          const reqPcs = effectiveOutPcs || (avgLen > 0 && outMtr > 0 ? Math.round(outMtr / avgLen) : 0);
          const reqMtr = outMtr;

          if (feederBal.availPcs <= 0 && feederBal.availMtr <= 0) {
            errors.push(`Row ${index + 1} (${woNo}): No available feeder WIP for ${stageObj?.stage_name || work_center}. Please record and pass ${feederBal.feederLabel} first.`);
            continue;
          }
          if (reqPcs > 0 && feederBal.availPcs > 0 && reqPcs > feederBal.availPcs) {
            errors.push(`Row ${index + 1} (${woNo}): ${stageObj?.stage_name || work_center} (${reqPcs} PCS) exceeds available ${feederBal.feederLabel} feeder balance (${feederBal.availPcs} PCS).`);
            continue;
          }
          if (reqPcs <= 0 && reqMtr > feederBal.availMtr + 0.5) {
            errors.push(`Row ${index + 1} (${woNo}): ${stageObj?.stage_name || work_center} (${reqMtr.toFixed(2)} MTR) exceeds available ${feederBal.feederLabel} feeder balance (${feederBal.availMtr.toFixed(2)} MTR).`);
            continue;
          }
          feederBal.availPcs = Math.max(0, feederBal.availPcs - reqPcs);
          feederBal.availMtr = Math.max(0, Number((feederBal.availMtr - reqMtr).toFixed(2)));
        }

        const opPrefix = row.operator_name ? `[Op: ${String(row.operator_name).trim()}]` : '';
        const userRemarks = row.remarks ? String(row.remarks).trim() : '';
        const combinedRemarks = [opPrefix, userRemarks].filter(Boolean).join(' ');

        const finalRemarks = attachPcsToRemarks(
          combinedRemarks,
          effectiveOutPcs,
          rejPcs,
          rowL1 ? String(rowL1) : undefined,
          rowL2 ? String(rowL2) : undefined
        );

        const logPayload = {
          work_order_id: wo.id,
          stage_id: stageId,
          process_route_id: planRouteMap.get(wo.id) || defaultRouteId,
          process_date: dateStr,
          input_qty: inMtr,
          output_qty: outMtr,
          rejection_qty: rejMtr,
          htc_ok: htcOkMtr,
          heat_lot_no: row.heat_lot_no || row.heat_no || row.lot_no || null,
          remarks: finalRemarks || null,
        };

        const { error: insertErr } = await admin.from('production_logs').insert(logPayload);
        if (insertErr) {
          errors.push(`Row ${index + 1} (${woNo}): Log insert failed: ${insertErr.message}`);
          continue;
        }

        importedCount++;

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
      }
    }

    if (importedCount === 0 && skippedDuplicatesCount === 0 && errors.length > 0) {
      return NextResponse.json({ error: errors.join('; ') }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      importedCount,
      skippedDuplicatesCount,
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
