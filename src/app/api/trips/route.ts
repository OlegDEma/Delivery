import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

// GET /api/trips
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

// POST /api/trips
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { direction, country, departureDate, arrivalDate, assignedCourierId, secondCourierId, notes } = body;

  if (!direction || !country || !departureDate) {
    return NextResponse.json({ error: 'Напрямок, країна та дата обов\'язкові' }, { status: 400 });
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
      createdById: user.id,
    },
    include: {
      assignedCourier: { select: { fullName: true } },
      _count: { select: { parcels: true } },
    },
  });

  return NextResponse.json(trip, { status: 201 });
}
