// lib/diversions/client.ts
import { createClient } from '@/lib/supabase/client';
import { DiversionPlan, DiversionStatus } from '@/types';

export interface ApproveDiversionPayload {
  id: string;
  remarks?: string;
}

export interface RejectDiversionPayload {
  id: string;
  reason: string;
}

/**
 * Approve a pending Draw Bench diversion
 */
export async function approveDiversion(
  payload: ApproveDiversionPayload,
  client?: any
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = client || createClient();
    const { data: { user } } = await (supabase.auth?.getUser?.() || Promise.resolve({ data: { user: null } }));

    // 1. Try server-side API endpoint first when running in browser (uses service role client on server, avoiding client RLS)
    if (typeof window !== 'undefined') {
      try {
        const res = await fetch('/api/diversions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: payload.id,
            action: 'APPROVE',
            remarks: payload.remarks?.trim() || null,
            user_id: user?.id || null,
          }),
        });
        const resJson = await res.json();
        if (res.ok && resJson.success) {
          fetch('/api/production/queue?refresh=true').catch(() => {});
          return { success: true, error: null };
        }
      } catch (apiErr) {
        console.warn('API /api/diversions PUT failed, attempting stored procedure fallback:', apiErr);
      }
    }

    // 2. Try stored procedure
    const { error: rpcError } = await supabase.rpc('approve_diversion', {
      p_id: payload.id,
      p_remarks: payload.remarks?.trim() || null,
    });

    if (!rpcError) {
      if (typeof window !== 'undefined') fetch('/api/production/queue?refresh=true').catch(() => {});
      return { success: true, error: null };
    }

    // Fallback direct update
    const { error: updateError } = await supabase
      .from('diversion_plans')
      .update({
        status: 'APPROVED',
        ppc_approved_by: user?.id || null,
        ppc_approved_at: new Date().toISOString(),
        ppc_remarks: payload.remarks?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payload.id);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    if (typeof window !== 'undefined') fetch('/api/production/queue?refresh=true').catch(() => {});
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to approve diversion' };
  }
}

/**
 * Reject a pending Draw Bench diversion
 */
export async function rejectDiversion(
  payload: RejectDiversionPayload,
  client?: any
): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!payload.reason || !payload.reason.trim()) {
      return { success: false, error: 'Rejection reason is required' };
    }

    const supabase = client || createClient();

    // 1. Try server-side API endpoint first when running in browser (uses service role client on server, avoiding client RLS)
    if (typeof window !== 'undefined') {
      try {
        const res = await fetch('/api/diversions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: payload.id,
            action: 'REJECT',
            reason: payload.reason.trim(),
          }),
        });
        const resJson = await res.json();
        if (res.ok && resJson.success) {
          fetch('/api/production/queue?refresh=true').catch(() => {});
          return { success: true, error: null };
        }
      } catch (apiErr) {
        console.warn('API /api/diversions PUT failed, attempting stored procedure fallback:', apiErr);
      }
    }

    // 2. Try stored procedure
    const { error: rpcError } = await supabase.rpc('reject_diversion', {
      p_id: payload.id,
      p_reason: payload.reason.trim(),
    });

    if (!rpcError) {
      if (typeof window !== 'undefined') fetch('/api/production/queue?refresh=true').catch(() => {});
      return { success: true, error: null };
    }

    // Fallback direct update
    const { error: updateError } = await supabase
      .from('diversion_plans')
      .update({
        status: 'REJECTED_BY_PPC',
        ppc_rejection_reason: payload.reason.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', payload.id);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    if (typeof window !== 'undefined') fetch('/api/production/queue?refresh=true').catch(() => {});
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to reject diversion' };
  }
}
