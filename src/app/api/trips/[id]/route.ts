import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

// GET /api/trips/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const trip = await prisma.trip.findUnique({
    where: { id },
    include: {
      assignedCourier: { select: { id: true, fullName: true } },
      secondCourier: { select: { id: true, fullName: true } },
      createdBy: { select: { fullName: true } },
      parcels: {
        include: {
          sender: { select: { firstName: true, lastName: true, phone: true } },
          receiver: { select: { firstName: true, lastName: true, phone: true } },
          receiverAddress: { select: { city: true, street: true, building: true, npWarehouseNum: true } },
        },
        orderBy: { shortNumber: 'asc' },
      },
      _count: { select: { parcels: true, routeTasks: true } },
    },
  });

  if (!trip) return NextResponse.json({ error: 'Рейс не знайдено' }, { status: 404 });
  return NextResponse.json(trip);
}

// PATCH /api/trips/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (body.status !== undefined) data.status = body.status;
  if (body.assignedCourierId !== undefined) data.assignedCourierId = body.assignedCourierId || null;
  if (body.secondCourierId !== undefined) data.secondCourierId = body.secondCourierId || null;
  if (body.arrivalDate !== undefined) data.arrivalDate = body.arrivalDate ? new Date(body.arrivalDate) : null;
  if (body.notes !== undefined) data.notes = body.notes || null;

  // Assign parcel to trip
  if (body.addParcelId) {
    await prisma.parcel.update({
      where: { id: body.addParcelId },
      data: { tripId: id },
    });
    const trip = await prisma.trip.findUnique({ where: { id }, include: { _count: { select: { parcels: true } } } });
    return NextResponse.json(trip);
  }

  // Remove parcel from trip
  if (body.removeParcelId) {
    await prisma.parcel.update({
      where: { id: body.removeParcelId },
      data: { tripId: null },
    });
    const trip = await prisma.trip.findUnique({ where: { id }, include: { _count: { select: { parcels: true } } } });
    return NextResponse.json(trip);
  }

  const updated = await prisma.trip.update({ where: { id }, data });
  return NextResponse.json(updated);
}
