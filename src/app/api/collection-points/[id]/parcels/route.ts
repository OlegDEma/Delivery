import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff } from '@/lib/auth/guards';

// GET /api/collection-points/[id]/parcels — parcels linked to this point
// Query params:
//   status: filter by parcel status (default: "at_collection_point")
//   includeAccepted=1: also include accepted_for_transport_to_ua parcels
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get('status');
  const includeAccepted = searchParams.get('includeAccepted') === '1';

  const statuses: string[] = [];
  if (statusFilter) {
    statuses.push(statusFilter);
  } else {
    statuses.push('draft', 'at_collection_point');
    if (includeAccepted) statuses.push('accepted_for_transport_to_ua');
  }

  const parcels = await prisma.parcel.findMany({
    where: {
      deletedAt: null,
      collectionPointId: id,
      status: { in: statuses as ('draft' | 'at_collection_point' | 'accepted_for_transport_to_ua')[] },
    },
    include: {
      sender: { select: { firstName: true, lastName: true, phone: true } },
      receiver: { select: { firstName: true, lastName: true, phone: true } },
      trip: { select: { id: true, departureDate: true, country: true } },
      collectedBy: { select: { fullName: true } },
    },
    orderBy: [{ collectedAt: 'desc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json(parcels);
}
