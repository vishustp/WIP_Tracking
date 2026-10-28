import { createClient } from '@/lib/supabase/client';
import {
  HollowBankLot,
  HollowBankAllocation,
  HollowBankFilters,
  CreateHollowBankEntryPayload,
  AllocateHollowLotPayload,
  calculatePipeWeightMt,
} from './types';

export async function fetchHollowBankLots(filters?: HollowBankFilters): Promise<HollowBankLot[]> {
  const supabase = createClient();

  let query = supabase
    .from('vw_hollow_bank_inventory')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.status && filters.status !== 'ALL') {
    if (filters.status === 'AVAILABLE') {
      query = query.in('status', ['AVAILABLE', 'PARTIALLY_ALLOCATED']);
    } else if (filters.status === 'FULLY_ALLOCATED') {
      query = query.eq('status', 'FULLY_ALLOCATED');
    } else {
      query = query.eq('status', filters.status);
    }
  }

  if (filters?.stageCode && filters.stageCode !== 'ALL') {
    query = query.eq('source_stage_code', filters.stageCode);
  }

  if (filters?.grade) {
    query = query.ilike('grade', `%${filters.grade}%`);
  }

  if (filters?.od && filters.od > 0) {
    query = query.eq('od', filters.od);
  }

  if (filters?.wt && filters.wt > 0) {
    query = query.eq('wt', filters.wt);
  }

  if (filters?.heatNo) {
    query = query.ilike('heat_no', `%${filters.heatNo}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[fetchHollowBankLots] Error:', error.message);
    throw error;
  }

  let rows = (data || []) as HollowBankLot[];

  if (filters?.searchQuery?.trim()) {
    const q = filters.searchQuery.trim().toLowerCase();
    rows = rows.filter((r) =>
      r.lot_no?.toLowerCase().includes(q) ||
      r.source_wo_no?.toLowerCase().includes(q) ||
      r.source_customer?.toLowerCase().includes(q) ||
      r.grade?.toLowerCase().includes(q) ||
      r.heat_no?.toLowerCase().includes(q) ||
      r.source_stage_code?.toLowerCase().includes(q)
    );
  }

  return rows;
}

export async function fetchHollowBankAllocations(): Promise<HollowBankAllocation[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('vw_hollow_bank_allocations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[fetchHollowBankAllocations] Error:', error.message);
    throw error;
  }
  return (data || []) as HollowBankAllocation[];
}

export async function createHollowBankEntry(payload: CreateHollowBankEntryPayload): Promise<HollowBankLot> {
  const supabase = createClient();

  const od = Number(payload.od);
  const wt = Number(payload.wt);
  const totalMtr = Number(payload.total_meters);
  const weightMt = payload.weight_mt !== undefined && payload.weight_mt > 0
    ? Number(payload.weight_mt)
    : calculatePipeWeightMt(od, wt, totalMtr);

  const { data: { user } } = await supabase.auth.getUser();

  const recordToInsert = {
    source_wo_id: payload.source_wo_id,
    source_stage_code: payload.source_stage_code,
    heat_no: payload.heat_no?.trim() || null,
    od,
    wt,
    grade: payload.grade.trim(),
    pcs: Number(payload.pcs),
    avg_length: Number(payload.avg_length),
    total_meters: totalMtr,
    weight_mt: weightMt,
    available_pcs: Number(payload.pcs),
    available_meters: totalMtr,
    available_mt: weightMt,
    banked_date: payload.banked_date || new Date().toISOString().split('T')[0],
    banked_by: user?.id || null,
    remarks: payload.remarks?.trim() || null,
  };

  const { data, error } = await supabase
    .from('hollow_bank_inventory')
    .insert(recordToInsert)
    .select()
    .single();

  if (error) {
    console.error('[createHollowBankEntry] Error:', error.message);
    throw error;
  }

  // If this entry was created from a salvage or rejection declaration, update it so it is dispositioned and deducted
  if (payload.rejection_id && data?.id) {
    const lotNo = data.lot_no || 'HB';
    const updatedRemarks = `${payload.remarks || ''} [DIVERTED_TO_HOLLOW_BANK: ${lotNo}]`.trim();
    try {
      await supabase
        .from('rejection_declarations')
        .update({
          status: 'APPROVED',
          ppc_approved_pcs: Number(payload.pcs),
          ppc_approved_mtr: totalMtr,
          ppc_approved_mt: weightMt,
          ppc_remarks: updatedRemarks,
          ppc_approved_by: user?.email || 'PPC',
          ppc_approved_by_user_id: user?.id || null,
          ppc_approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', payload.rejection_id);
    } catch (rejErr: any) {
      console.warn('[createHollowBankEntry] Failed to update rejection declaration status:', rejErr?.message || rejErr);
    }
  }

  return data as HollowBankLot;
}

export async function allocateHollowBankLot(payload: AllocateHollowLotPayload): Promise<HollowBankAllocation> {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const recordToInsert = {
    hollow_bank_id: payload.hollow_bank_id,
    target_wo_id: payload.target_wo_id,
    target_stage_code: payload.target_stage_code,
    allocated_pcs: Number(payload.allocated_pcs),
    allocated_meters: Number(payload.allocated_meters),
    allocated_mt: Number(payload.allocated_mt || 0),
    allocated_date: payload.allocated_date || new Date().toISOString().split('T')[0],
    allocated_by: user?.id || null,
    remarks: payload.remarks?.trim() || null,
  };

  const { data, error } = await supabase
    .from('hollow_bank_allocations')
    .insert(recordToInsert)
    .select()
    .single();

  if (error) {
    console.error('[allocateHollowBankLot] Error:', error.message);
    throw error;
  }
  return data as HollowBankAllocation;
}

export async function fetchEligibleSourceWorkOrders(): Promise<Array<{
  id: string;
  work_order_no: string;
  customer_name: string;
  od: number;
  wt: number;
  grade: string;
  l1?: number;
  l2?: number;
}>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('work_orders')
    .select('id, work_order_no, customer_name, size_od, size_wt, grade, specification, l1, l2')
    .neq('status', 'Completed')
    .neq('id', '00000000-0000-0000-0000-00000000000b')
    .order('work_order_no');

  if (error) {
    console.error('[fetchEligibleSourceWorkOrders] Error:', error.message);
    throw error;
  }

  return (data || []).map((w: any) => ({
    id: w.id,
    work_order_no: w.work_order_no,
    customer_name: w.customer_name,
    od: Number(w.size_od || 0),
    wt: Number(w.size_wt || 0),
    grade: w.grade || w.specification || '',
    l1: Number(w.l1 || 6),
    l2: Number(w.l2 || 6.5),
  }));
}
