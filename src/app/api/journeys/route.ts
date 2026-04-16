import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import type { Country, TripStatus } from '@/generated/prisma/client';

// GET /api/journeys
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const journeys = await prisma.journey.findMany({
    include: {
      assignedCourier: { select: { id: true, fullName: true } },
      secondCourier: { select: { id: true, fullName: true } },
      trips: {
        select: {
          id: true, direction: true, status: true, departureDate: true,
          _count: { select: { parcels: true } },
        },
      },
      _count: { select: { trips: true } },
    },
    orderBy: { departureDate: 'desc' },
    take: 50,
  });

  return NextResponse.json(journeys);
}

// POST /api/journeys — create journey + auto-create 2 trips
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const {
    country, departureDate, euArrivalDate, euReturnDate, endDate,
    assignedCourierId, secondCourierId, vehicleInfo, notes,
  } = body;

  if (!country || !departureDate) {
    return NextResponse.json({ error: 'Країна та дата виїзду обов\'язкові' }, { status: 400 });
  }

  // Create journey
  const journey = await prisma.journey.create({
    data: {
      country: country as Country,
      departureDate: new Date(departureDate),
      euArrivalDate: euArrivalDate ? new Date(euArrivalDate) : null,
      euReturnDate: euReturnDate ? new Date(euReturnDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      assignedCourierId: assignedCourierId || null,
      secondCourierId: secondCourierId || null,
      vehicleInfo: vehicleInfo || null,
      notes: notes || null,
      createdById: user.id,
    },
  });

  // Auto-create 2 trips
  const tripUaEu = await prisma.trip.create({
    data: {
      direction: 'ua_to_eu',
      country: country as Country,
      departureDate: new Date(departureDate),
      arrivalDate: euArrivalDate ? new Date(euArrivalDate) : null,
      journeyId: journey.id,
      assignedCourierId: assignedCourierId || null,
      secondCourierId: secondCourierId || null,
      vehicleInfo: vehicleInfo || null,
      createdById: user.id,
    },
  });

  const tripEuUa = await prisma.trip.create({
    data: {
      direction: 'eu_to_ua',
      country: country as Country,
      departureDate: euReturnDate ? new Date(euReturnDate) : new Date(departureDate),
      arrivalDate: endDate ? new Date(endDate) : null,
      journeyId: journey.id,
      assignedCourierId: assignedCourierId || null,
      secondCourierId: secondCourierId || null,
      vehicleInfo: vehicleInfo || null,
      createdById: user.id,
    },
  });

  return NextResponse.json({
    ...journey,
    trips: [tripUaEu, tripEuUa],
  }, { status: 201 });
}

// PATCH /api/journeys?id=xxx
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id обов\'язковий' }, { status: 400 });

  const body = await request.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (body.status !== undefined) data.status = body.status as TripStatus;
  if (body.assignedCourierId !== undefined) data.assignedCourierId = body.assignedCourierId || null;
  if (body.secondCourierId !== undefined) data.secondCourierId = body.secondCourierId || null;
  if (body.euArrivalDate !== undefined) data.euArrivalDate = body.euArrivalDate ? new Date(body.euArrivalDate) : null;
  if (body.euReturnDate !== undefined) data.euReturnDate = body.euReturnDate ? new Date(body.euReturnDate) : null;
  if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null;
  if (body.notes !== undefined) data.notes = body.notes || null;

  const updated = await prisma.journey.update({
    where: { id },
    data,
    include: { trips: true },
  });

  // Sync status/courier to child trips
  if (body.status !== undefined || body.assignedCourierId !== undefined || body.secondCourierId !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tripSync: any = {};
    if (body.assignedCourierId !== undefined) tripSync.assignedCourierId = body.assignedCourierId || null;
    if (body.secondCourierId !== undefined) tripSync.secondCourierId = body.secondCourierId || null;
    if (Object.keys(tripSync).length > 0) {
      await prisma.trip.updateMany({ where: { journeyId: id }, data: tripSync });
    }
  }

  return NextResponse.json(updated);
}
