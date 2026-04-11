import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  // This month vs last month
  const [thisMonthParcels, lastMonthParcels, thisMonthRevenue, lastMonthRevenue, thisMonthClients, lastMonthClients, thisMonthWeight, lastMonthWeight] = await Promise.all([
    prisma.parcel.count({ where: { createdAt: { gte: thisMonthStart } } }),
    prisma.parcel.count({ where: { createdAt: { gte: lastMonthStart, lte: lastMonthEnd } } }),
    prisma.parcel.aggregate({ where: { createdAt: { gte: thisMonthStart }, isPaid: true }, _sum: { totalCost: true } }),
    prisma.parcel.aggregate({ where: { createdAt: { gte: lastMonthStart, lte: lastMonthEnd }, isPaid: true }, _sum: { totalCost: true } }),
    prisma.client.count({ where: { createdAt: { gte: thisMonthStart } } }),
    prisma.client.count({ where: { createdAt: { gte: lastMonthStart, lte: lastMonthEnd } } }),
    prisma.parcel.aggregate({ where: { createdAt: { gte: thisMonthStart } }, _sum: { totalWeight: true } }),
    prisma.parcel.aggregate({ where: { createdAt: { gte: lastMonthStart, lte: lastMonthEnd } }, _sum: { totalWeight: true } }),
  ]);

  // Top clients (by number of parcels, all time)
  const allParcels = await prisma.parcel.findMany({
    select: { senderId: true, receiverId: true, totalCost: true, totalWeight: true },
  });

  const clientStats = new Map<string, { count: number; totalCost: number; totalWeight: number }>();
  for (const p of allParcels) {
    for (const cid of [p.senderId, p.receiverId]) {
      const existing = clientStats.get(cid) || { count: 0, totalCost: 0, totalWeight: 0 };
      existing.count++;
      existing.totalCost += Number(p.totalCost) || 0;
      existing.totalWeight += Number(p.totalWeight) || 0;
      clientStats.set(cid, existing);
    }
  }

  const topClientIds = Array.from(clientStats.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([id]) => id);

  const topClientsData = await prisma.client.findMany({
    where: { id: { in: topClientIds } },
    select: { id: true, firstName: true, lastName: true, phone: true },
  });

  const topClients = topClientIds.map(id => {
    const client = topClientsData.find(c => c.id === id);
    const stats = clientStats.get(id)!;
    return {
      id,
      name: client ? `${client.lastName} ${client.firstName}` : 'Невідомий',
      phone: client?.phone || '',
      parcelsCount: stats.count,
      totalCost: Math.round(stats.totalCost * 100) / 100,
      totalWeight: Math.round(stats.totalWeight * 100) / 100,
    };
  });

  // Trip capacity
  const activeTrips = await prisma.trip.findMany({
    where: { status: { in: ['planned', 'in_progress'] } },
    include: {
      assignedCourier: { select: { fullName: true } },
      parcels: { select: { totalWeight: true, totalPlacesCount: true } },
    },
    orderBy: { departureDate: 'asc' },
  });

  const tripCapacity = activeTrips.map(t => {
    const currentWeight = t.parcels.reduce((s, p) => s + (Number(p.totalWeight) || 0), 0);
    const currentPlaces = t.parcels.reduce((s, p) => s + p.totalPlacesCount, 0);
    const maxWeight = Number(t.maxWeight) || 1500; // default 1500 kg
    return {
      id: t.id,
      country: t.country,
      direction: t.direction,
      departureDate: t.departureDate,
      status: t.status,
      courier: t.assignedCourier?.fullName || null,
      parcelsCount: t.parcels.length,
      currentWeight: Math.round(currentWeight * 10) / 10,
      currentPlaces,
      maxWeight,
      usagePercent: Math.round((currentWeight / maxWeight) * 100),
    };
  });

  return NextResponse.json({
    comparison: {
      thisMonth: {
        parcels: thisMonthParcels,
        revenue: Number(thisMonthRevenue._sum.totalCost) || 0,
        clients: thisMonthClients,
        weight: Number(thisMonthWeight._sum.totalWeight) || 0,
      },
      lastMonth: {
        parcels: lastMonthParcels,
        revenue: Number(lastMonthRevenue._sum.totalCost) || 0,
        clients: lastMonthClients,
        weight: Number(lastMonthWeight._sum.totalWeight) || 0,
      },
    },
    topClients,
    tripCapacity,
  });
}
