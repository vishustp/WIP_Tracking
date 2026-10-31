import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const { id, cancellation_reason, user_id } = await req.json();
    if (!id || !cancellation_reason?.trim()) {
      return NextResponse.json({ error: 'Stock generation ID and cancellation reason are required.' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('ppc_stock_generations')
      .update({
        status: 'CANCELLED',
        cancelled_by: user_id || null,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: cancellation_reason.trim(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('[API /api/stock-generation/cancel] error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
