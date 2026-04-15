import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

// POST /api/parcels/bulk-paid — mark multiple parcels as paid/unpaid
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { parcelIds, isPaid } = body;

  if (!parcelIds?.length || typeof isPaid !== 'boolean') {
    return NextResponse.json({ error: 'Вкажіть посилки та статус оплати' }, { status: 400 });
  }

  const result = await prisma.parcel.updateMany({
    where: { id: { in: parcelIds } },
    data: {
      isPaid,
      paidAt: isPaid ? new Date() : null,
    },
  });

  return NextResponse.json({ updated: result.count });
}
