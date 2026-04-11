import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalParcels,
    todayParcels,
    atWarehouse,
    inTransit,
    delivered,
    totalClients,
    activeTrips,
  ] = await Promise.all([
    prisma.parcel.count(),
    prisma.parcel.count({ where: { createdAt: { gte: today } } }),
    prisma.parcel.count({ where: { status: 'at_lviv_warehouse' } }),
    prisma.parcel.count({
      where: { status: { in: ['in_transit_to_ua', 'in_transit_to_eu'] } },
    }),
    prisma.parcel.count({
      where: { status: { in: ['delivered_ua', 'delivered_eu'] } },
    }),
    prisma.client.count(),
    prisma.trip.count({ where: { status: { in: ['planned', 'in_progress'] } } }),
  ]);

  // Recent parcels
  const recentParcels = await prisma.parcel.findMany({
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
    recentParcels,
  });
}
