import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth/guards';
import { FINANCE_ROLES } from '@/lib/constants/roles';

// POST /api/parcels/bulk-paid — mark multiple parcels as paid/unpaid (finance roles)
export async function POST(request: NextRequest) {
  const guard = await requireRole(FINANCE_ROLES);
  if (!guard.ok) return guard.response;

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
