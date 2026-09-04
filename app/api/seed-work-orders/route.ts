import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST() {
  try {
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: 'Database service is temporarily unavailable.' }, { status: 500 });
    }

    // Check existing work orders
    const { count } = await admin.from('work_orders').select('*', { count: 'exact', head: true });

    const sampleOrders = [
      {
        work_order_no: 'WO-2026-101',
        customer_name: 'Apex Energy Systems',
        grade: 'ASTM A106 Gr.B',
        specification: 'ASTM A106 Gr.B',
        size_od: 48.3,
        size_wt: 3.68,
        l1: 6.0,
        l2: 6.5,
        ordered_qty: 1200,
        ordered_qty_mtr: 1200,
        balance_qty_mtr: 1200,
        uom: 'Mtrs',
        status: 'Pending Plan',
      },
      {
        work_order_no: 'WO-2026-102',
        customer_name: 'Bharat Heavy Engineering',
        grade: 'ASTM A106 Gr.B',
        specification: 'ASTM A106 Gr.B',
        size_od: 48.3,
        size_wt: 3.68,
        l1: 6.0,
        l2: 6.5,
        ordered_qty: 800,
        ordered_qty_mtr: 800,
        balance_qty_mtr: 800,
        uom: 'Mtrs',
        status: 'Pending Plan',
      },
      {
        work_order_no: 'WO-2026-103',
        customer_name: 'Gujarat Petrochem Corp',
        grade: 'ASTM A106 Gr.B',
        specification: 'ASTM A106 Gr.B',
        size_od: 48.3,
        size_wt: 3.68,
        l1: 6.0,
        l2: 6.5,
        ordered_qty: 600,
        ordered_qty_mtr: 600,
        balance_qty_mtr: 600,
        uom: 'Mtrs',
        status: 'Pending Plan',
      },
      {
        work_order_no: 'WO-2026-201',
        customer_name: 'Reliance Industries Limited',
        grade: 'ASTM A335 P11',
        specification: 'ASTM A335 P11',
        size_od: 60.3,
        size_wt: 4.5,
        l1: 6.0,
        l2: 6.0,
        ordered_qty: 1500,
        ordered_qty_mtr: 1500,
        balance_qty_mtr: 1500,
        uom: 'Mtrs',
        status: 'Pending Plan',
      },
      {
        work_order_no: 'WO-2026-202',
        customer_name: 'Tata Power Technologies',
        grade: 'ASTM A335 P11',
        specification: 'ASTM A335 P11',
        size_od: 60.3,
        size_wt: 4.5,
        l1: 6.0,
        l2: 6.0,
        ordered_qty: 900,
        ordered_qty_mtr: 900,
        balance_qty_mtr: 900,
        uom: 'Mtrs',
        status: 'Pending Plan',
      },
    ];

    const inserted: string[] = [];
    for (const order of sampleOrders) {
      const { data: existing } = await admin
        .from('work_orders')
        .select('id')
        .eq('work_order_no', order.work_order_no)
        .maybeSingle();

      if (!existing) {
        const { data: ins, error } = await admin.from('work_orders').insert(order).select('id').single();
        if (ins && !error) inserted.push(order.work_order_no);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Seeded ${inserted.length} work orders.`,
      inserted,
      totalExisting: count ?? 0,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
