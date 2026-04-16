import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, requireStaff } from '@/lib/auth/guards';
import { LOGISTICS_ROLES } from '@/lib/constants/roles';

// GET /api/trips — staff can view
export async function GET(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const country = searchParams.get('country');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (status) where.status = status;
  if (country) where.country = country;

  const trips = await prisma.trip.findMany({
    where,
    include: {
      assignedCourier: { select: { id: true, fullName: true } },
      secondCourier: { select: { id: true, fullName: true } },
      _count: { select: { parcels: true, routeTasks: true } },
    },
    orderBy: { departureDate: 'desc' },
    take: 50,
  });

  return NextResponse.json(trips);
}

// POST /api/trips — admins and drivers (logistics roles)
export async function POST(request: NextRequest) {
  const guard = await requireRole(LOGISTICS_ROLES);
  if (!guard.ok) return guard.response;
  const userId = guard.user.userId;

  const body = await request.json();
  const { direction, country, departureDate, arrivalDate, assignedCourierId, secondCourierId, notes } = body;

  if (!direction || !country || !departureDate) {
    return NextResponse.json({ error: 'Напрямок, країна та дата обовʼязкові' }, { status: 400 });
  }

  const trip = await prisma.trip.create({
    data: {
      direction,
      country,
      departureDate: new Date(departureDate),
      arrivalDate: arrivalDate ? new Date(arrivalDate) : null,
      assignedCourierId: assignedCourierId || null,
      secondCourierId: secondCourierId || null,
      notes: notes || null,
      createdById: userId,
    },
    include: {
      assignedCourier: { select: { fullName: true } },
      _count: { select: { parcels: true } },
    },
  });

  return NextResponse.json(trip, { status: 201 });
}
