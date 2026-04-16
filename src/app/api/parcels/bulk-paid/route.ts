import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth/guards';
import { FINANCE_ROLES } from '@/lib/constants/roles';
import { parseBody, bulkPaidSchema } from '@/lib/validators';
import { logger } from '@/lib/logger';

// POST /api/parcels/bulk-paid — mark multiple parcels as paid/unpaid (finance roles)
export async function POST(request: NextRequest) {
  const guard = await requireRole(FINANCE_ROLES);
  if (!guard.ok) return guard.response;
  const userId = guard.user.userId;

  const parsed = await parseBody(request, bulkPaidSchema);
  if (parsed instanceof NextResponse) return parsed;
  const { parcelIds, isPaid } = parsed;

  // Respect soft-delete — never touch deleted parcels.
  const result = await prisma.parcel.updateMany({
    where: { id: { in: parcelIds }, deletedAt: null },
    data: {
      isPaid,
      paidAt: isPaid ? new Date() : null,
    },
  });

  logger.audit('payment.bulk_updated', {
    userId, isPaid, requested: parcelIds.length, updated: result.count,
  });

  return NextResponse.json({ updated: result.count });
}
