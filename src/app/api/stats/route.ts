import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { startOfKyivToday } from '@/lib/utils/tz';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // "Today" in operational TZ (Europe/Kyiv), not server-local midnight — on Vercel
  // the server runs in UTC, so without this a parcel created at 01:30 Kyiv time
  // would not count as "today" until 02:00/03:00 UTC rolled over.
  const today = startOfKyivToday();

  const [
    totalParcels,
    todayParcels,
    atWarehouse,
    inTransit,
    delivered,
    totalClients,
    activeTrips,
    unpaidCount,
    pendingOrders,
    upcomingTrip,
  ] = await Promise.all([
    prisma.parcel.count({ where: { deletedAt: null } }),
    prisma.parcel.count({ where: { deletedAt: null, createdAt: { gte: today } } }),
    prisma.parcel.count({ where: { deletedAt: null, status: { in: ['at_lviv_warehouse', 'at_eu_warehouse'] } } }),
    prisma.parcel.count({ where: { deletedAt: null, status: { in: ['in_transit_to_ua', 'in_transit_to_eu'] } } }),
    prisma.parcel.count({ where: { deletedAt: null, status: { in: ['delivered_ua', 'delivered_eu'] } } }),
    prisma.client.count({ where: { deletedAt: null } }),
    prisma.trip.count({ where: { status: { in: ['planned', 'in_progress'] } } }),
    prisma.parcel.count({ where: { deletedAt: null, isPaid: false, totalCost: { gt: 0 }, status: { notIn: ['draft', 'returned'] } } }),
    prisma.parcel.count({ where: { deletedAt: null, status: 'draft', createdSource: { in: ['client_web', 'client_telegram'] } } }),
    prisma.trip.findFirst({
      where: { status: 'planned', departureDate: { gte: today } },
      orderBy: { departureDate: 'asc' },
      select: { id: true, departureDate: true, country: true, direction: true, _count: { select: { parcels: true } } },
    }),
  ]);

  // Unpaid total
  const unpaidTotal = await prisma.parcel.aggregate({
    where: { deletedAt: null, isPaid: false, totalCost: { gt: 0 }, status: { notIn: ['draft', 'returned'] } },
    _sum: { totalCost: true },
  });

  // Recent activity (status changes)
  const recentActivity = await prisma.parcelStatusHistory.findMany({
    take: 10,
    orderBy: { changedAt: 'desc' },
    include: {
      parcel: { select: { internalNumber: true, id: true } },
      changedBy: { select: { fullName: true } },
    },
  });

  // Recent parcels
  const recentParcels = await prisma.parcel.findMany({
    where: { deletedAt: null },
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      internalNumber: true,
      status: true,
      createdAt: true,
      receiver: { select: { lastName: true, firstName: true } },
    },
  });

  return NextResponse.json({
    totalParcels,
    todayParcels,
    atWarehouse,
    inTransit,
    delivered,
    totalClients,
    activeTrips,
    unpaidCount,
    unpaidTotal: Number(unpaidTotal._sum.totalCost) || 0,
    pendingOrders,
    upcomingTrip,
    recentParcels,
    recentActivity: recentActivity.map(a => ({
      id: a.id,
      parcelId: a.parcel.id,
      parcelNumber: a.parcel.internalNumber,
      status: a.status,
      changedBy: a.changedBy?.fullName || 'Система',
      changedAt: a.changedAt,
      notes: a.notes,
    })),
  });
}
