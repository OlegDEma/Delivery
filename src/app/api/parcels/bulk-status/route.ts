import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { ParcelStatus } from '@/generated/prisma/client';
import { requireStaff } from '@/lib/auth/guards';

// POST /api/parcels/bulk-status — change status for multiple parcels (staff only)
export async function POST(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const user = { id: guard.user.userId };

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
