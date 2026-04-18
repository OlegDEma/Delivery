import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff } from '@/lib/auth/guards';

// GET /api/warehouse/aging?status=at_lviv_warehouse&minDays=0&limit=200
//
// Returns parcels currently in a warehouse status, each annotated with
// "warehouseSince" — the timestamp of the most recent transition INTO that
// warehouse status — and "daysAtWarehouse" computed from that.
//
// Two queries: (1) the parcel list, (2) a groupBy on status_history per
// parcelId picking the MAX changedAt where status = the warehouse status.
// Then merge in memory. Keeps it single-round-trip-ish for up to 200 rows
// without an N+1.
export async function GET(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const status = (searchParams.get('status') || 'at_lviv_warehouse') as
    | 'at_lviv_warehouse'
    | 'at_eu_warehouse';
  const minDays = Math.max(0, Number(searchParams.get('minDays')) || 0);
  const limit = Math.min(Number(searchParams.get('limit')) || 200, 500);

  if (status !== 'at_lviv_warehouse' && status !== 'at_eu_warehouse') {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const parcels = await prisma.parcel.findMany({
    where: { deletedAt: null, status },
    take: limit,
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      internalNumber: true,
      itn: true,
      status: true,
      totalWeight: true,
      totalPlacesCount: true,
      needsPackaging: true,
      createdAt: true,
      sender: { select: { firstName: true, lastName: true, phone: true } },
      receiver: { select: { firstName: true, lastName: true, phone: true } },
      receiverAddress: { select: { city: true } },
    },
  });

  // Pull the latest transition-into-status timestamp per parcel in one query.
  const ids = parcels.map((p) => p.id);
  const histories = ids.length
    ? await prisma.parcelStatusHistory.groupBy({
        by: ['parcelId'],
        where: { parcelId: { in: ids }, status },
        _max: { changedAt: true },
      })
    : [];
  const sinceMap = new Map(histories.map((h) => [h.parcelId, h._max.changedAt]));

  const now = Date.now();
  const enriched = parcels.map((p) => {
    const since = sinceMap.get(p.id) ?? p.createdAt;
    const days = Math.floor((now - new Date(since).getTime()) / 86_400_000);
    return {
      ...p,
      warehouseSince: since,
      daysAtWarehouse: days,
    };
  });

  const filtered = minDays > 0 ? enriched.filter((p) => p.daysAtWarehouse >= minDays) : enriched;
  // Sort oldest-first so stale parcels float to the top.
  filtered.sort((a, b) => b.daysAtWarehouse - a.daysAtWarehouse);

  const summary = {
    total: filtered.length,
    over7: filtered.filter((p) => p.daysAtWarehouse >= 7).length,
    over14: filtered.filter((p) => p.daysAtWarehouse >= 14).length,
    over30: filtered.filter((p) => p.daysAtWarehouse >= 30).length,
  };

  return NextResponse.json({ parcels: filtered, summary });
}
