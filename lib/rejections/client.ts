// lib/rejections/client.ts
import { createClient } from '@/lib/supabase/client';
import {
  RejectionDeclaration,
  RejectionReasonCategory,
  RejectionFilterOptions,
  RejectionSummaryKpis,
} from './types';

export interface CreateRejectionPayload {
  work_order_id: string;
  process_route_id?: string | null;
  stage_id?: string | null;
  work_center: string;
  rejected_pcs: number;
  rejected_mtr: number;
  rejected_mt: number;
  heat_lot_no?: string | null;
  reason_category: RejectionReasonCategory;
  production_remarks: string;
  declared_by: string;
  declared_by_user_id?: string | null;
}

export interface VerifyRejectionPayload {
  id: string;
  qc_verified_pcs: number;
  qc_verified_mtr: number;
  qc_verified_mt: number;
  qc_remarks: string;
  qc_verified_by: string;
  qc_verified_by_user_id?: string | null;
}

export interface ApproveRejectionPayload {
  id: string;
  ppc_approved_pcs: number;
  ppc_approved_mtr: number;
  ppc_approved_mt: number;
  ppc_remarks: string;
  ppc_approved_by: string;
  ppc_approved_by_user_id?: string | null;
}

/**
 * Fetch all rejection declarations with optional filters and joined work order details
 */
export async function fetchRejections(
  filters: RejectionFilterOptions = {}
): Promise<{ data: RejectionDeclaration[]; error: string | null }> {
  try {
    const supabase = createClient();
    let query = supabase
      .from('rejection_declarations')
      .select(`
        *,
        work_orders:work_order_id (
          id,
          work_order_no,
          customer_name,
          grade,
          size_od,
          size_wt,
          l1,
          l2
        )
      `)
      .order('declared_at', { ascending: false });

    if (filters.status && filters.status !== 'ALL') {
      query = query.eq('status', filters.status);
    }

    if (filters.workCenter && filters.workCenter !== 'ALL') {
      query = query.eq('work_center', filters.workCenter);
    }

    if (filters.reasonCategory && filters.reasonCategory !== 'ALL') {
      query = query.eq('reason_category', filters.reasonCategory);
    }

    if (filters.fromDate) {
      query = query.gte('declared_at', `${filters.fromDate}T00:00:00Z`);
    }

    if (filters.toDate) {
      query = query.lte('declared_at', `${filters.toDate}T23:59:59Z`);
    }

    const { data, error } = await query;
    if (error) {
      return { data: [], error: error.message };
    }

    let results = ((data || []) as any[]).map((r) => {
      if (r.work_orders) {
        const wo = r.work_orders;
        const avgLen = wo.l1 && wo.l2 ? (Number(wo.l1) + Number(wo.l2)) / 2 : Number(wo.l1 || 6.0);
        wo.avg_length = avgLen;
      }
      return r as RejectionDeclaration;
    });

    // In-memory search filter for WO#, Customer, Grade, or Declaration#
    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      results = results.filter((r) => {
        const woNo = r.work_orders?.work_order_no?.toLowerCase() || '';
        const cust = r.work_orders?.customer_name?.toLowerCase() || '';
        const grade = r.work_orders?.grade?.toLowerCase() || '';
        const declNo = r.declaration_no?.toLowerCase() || '';
        const heat = r.heat_lot_no?.toLowerCase() || '';
        return (
          woNo.includes(q) ||
          cust.includes(q) ||
          grade.includes(q) ||
          declNo.includes(q) ||
          heat.includes(q)
        );
      });
    }

    return { data: results, error: null };
  } catch (err: any) {
    return { data: [], error: err.message || 'Failed to fetch rejection declarations' };
  }
}

/**
 * Fetch KPI metrics for dashboard / header cards
 */
export async function fetchRejectionSummaryKpis(): Promise<{
  data: RejectionSummaryKpis;
  error: string | null;
}> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('rejection_declarations')
      .select('status, rejected_pcs, rejected_mtr, rejected_mt, ppc_approved_pcs, ppc_approved_mt, declared_at');

    if (error) {
      return {
        data: {
          pendingQcCount: 0,
          pendingPpcCount: 0,
          approvedCount: 0,
          approvedTotalMt: 0,
          approvedTotalPcs: 0,
          totalPendingHoldMtr: 0,
        },
        error: error.message,
      };
    }

    const rows = data || [];
    let pendingQcCount = 0;
    let pendingPpcCount = 0;
    let approvedCount = 0;
    let approvedTotalMt = 0;
    let approvedTotalPcs = 0;
    let totalPendingHoldMtr = 0;

    for (const r of rows) {
      if (r.status === 'PENDING_QC') {
        pendingQcCount++;
        totalPendingHoldMtr += Number(r.rejected_mtr || 0);
      } else if (r.status === 'PENDING_PPC') {
        pendingPpcCount++;
        totalPendingHoldMtr += Number(r.rejected_mtr || 0);
      } else if (r.status === 'APPROVED') {
        approvedCount++;
        approvedTotalMt += Number(r.ppc_approved_mt || r.rejected_mt || 0);
        approvedTotalPcs += Number(r.ppc_approved_pcs || r.rejected_pcs || 0);
      }
    }

    return {
      data: {
        pendingQcCount,
        pendingPpcCount,
        approvedCount,
        approvedTotalMt: Number(approvedTotalMt.toFixed(3)),
        approvedTotalPcs,
        totalPendingHoldMtr: Number(totalPendingHoldMtr.toFixed(1)),
      },
      error: null,
    };
  } catch (err: any) {
    return {
      data: {
        pendingQcCount: 0,
        pendingPpcCount: 0,
        approvedCount: 0,
        approvedTotalMt: 0,
        approvedTotalPcs: 0,
        totalPendingHoldMtr: 0,
      },
      error: err.message,
    };
  }
}

/**
 * Step 1: Production declares rejection
 */
export async function createRejectionDeclaration(
  payload: CreateRejectionPayload
): Promise<{ data: RejectionDeclaration | null; error: string | null }> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('rejection_declarations')
      .insert({
        work_order_id: payload.work_order_id,
        process_route_id: payload.process_route_id || null,
        stage_id: payload.stage_id || null,
        work_center: payload.work_center,
        rejected_pcs: payload.rejected_pcs,
        rejected_mtr: payload.rejected_mtr,
        rejected_mt: payload.rejected_mt,
        heat_lot_no: payload.heat_lot_no || null,
        reason_category: payload.reason_category,
        production_remarks: payload.production_remarks,
        declared_by: payload.declared_by,
        declared_by_user_id: payload.declared_by_user_id || null,
        status: 'PENDING_QC',
      })
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }
    return { data: data as RejectionDeclaration, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Failed to create rejection declaration' };
  }
}

/**
 * Step 2: QC verifies rejection
 */
export async function verifyRejectionDeclaration(
  payload: VerifyRejectionPayload
): Promise<{ error: string | null }> {
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from('rejection_declarations')
      .update({
        status: 'PENDING_PPC',
        qc_verified_pcs: payload.qc_verified_pcs,
        qc_verified_mtr: payload.qc_verified_mtr,
        qc_verified_mt: payload.qc_verified_mt,
        qc_remarks: payload.qc_remarks,
        qc_verified_by: payload.qc_verified_by,
        qc_verified_by_user_id: payload.qc_verified_by_user_id || null,
        qc_verified_at: new Date().toISOString(),
      })
      .eq('id', payload.id);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err: any) {
    return { error: err.message || 'Failed to verify rejection' };
  }
}

/**
 * Step 3: PPC authorizes and approves rejection (triggers WIP deduction)
 */
export async function approveRejectionDeclaration(
  payload: ApproveRejectionPayload
): Promise<{ error: string | null }> {
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from('rejection_declarations')
      .update({
        status: 'APPROVED',
        ppc_approved_pcs: payload.ppc_approved_pcs,
        ppc_approved_mtr: payload.ppc_approved_mtr,
        ppc_approved_mt: payload.ppc_approved_mt,
        ppc_remarks: payload.ppc_remarks,
        ppc_approved_by: payload.ppc_approved_by,
        ppc_approved_by_user_id: payload.ppc_approved_by_user_id || null,
        ppc_approved_at: new Date().toISOString(),
      })
      .eq('id', payload.id);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err: any) {
    return { error: err.message || 'Failed to approve rejection' };
  }
}

/**
 * Rejection by QC or PPC
 */
export async function rejectDeclaration(
  id: string,
  stage: 'QC' | 'PPC',
  remarks: string,
  actorName: string,
  actorUserId?: string | null
): Promise<{ error: string | null }> {
  try {
    const supabase = createClient();
    const updates: Record<string, any> = {
      status: stage === 'QC' ? 'REJECTED_BY_QC' : 'REJECTED_BY_PPC',
    };

    if (stage === 'QC') {
      updates.qc_remarks = remarks;
      updates.qc_verified_by = actorName;
      updates.qc_verified_by_user_id = actorUserId || null;
      updates.qc_verified_at = new Date().toISOString();
    } else {
      updates.ppc_remarks = remarks;
      updates.ppc_approved_by = actorName;
      updates.ppc_approved_by_user_id = actorUserId || null;
      updates.ppc_approved_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('rejection_declarations')
      .update(updates)
      .eq('id', id);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err: any) {
    return { error: err.message || 'Failed to reject declaration' };
  }
}
