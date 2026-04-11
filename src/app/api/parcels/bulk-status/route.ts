import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import type { ParcelStatus } from '@/generated/prisma/client';

// POST /api/parcels/bulk-status — change status for multiple parcels
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { parcelIds, status, notes } = body;

  if (!parcelIds?.length || !status) {
    return NextResponse.json({ error: 'Вкажіть посилки та статус' }, { status: 400 });
  }

  // Update all parcels and create status history entries
  const results = await prisma.$transaction(
    parcelIds.map((id: string) =>
      prisma.parcel.update({
        where: { id },
        data: {
          status: status as ParcelStatus,
          statusHistory: {
            create: {
              status: status as ParcelStatus,
              changedById: user.id,
              notes: notes || 'Масова зміна статусу',
            },
          },
        },
      })
    )
  );

  return NextResponse.json({ updated: results.length });
}
