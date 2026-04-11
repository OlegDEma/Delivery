import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import type { ParcelStatus } from '@/generated/prisma/client';

// GET /api/parcels/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const parcel = await prisma.parcel.findUnique({
    where: { id },
    include: {
      sender: {
        include: { addresses: { orderBy: { usageCount: 'desc' } } },
      },
      senderAddress: true,
      receiver: {
        include: { addresses: { orderBy: { usageCount: 'desc' } } },
      },
      receiverAddress: true,
      places: { orderBy: { placeNumber: 'asc' } },
      statusHistory: {
        orderBy: { changedAt: 'desc' },
        include: { changedBy: { select: { fullName: true } } },
      },
      trip: { select: { id: true, departureDate: true, country: true, direction: true } },
      assignedCourier: { select: { id: true, fullName: true } },
      createdBy: { select: { fullName: true } },
    },
  });

  if (!parcel) {
    return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });
  }

  return NextResponse.json(parcel);
}

// PATCH /api/parcels/[id] — update status or fields
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const parcel = await prisma.parcel.findUnique({ where: { id } });
  if (!parcel) {
    return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });
  }

  // Status change
  if (body.status) {
    const updated = await prisma.parcel.update({
      where: { id },
      data: {
        status: body.status as ParcelStatus,
        statusHistory: {
          create: {
            status: body.status as ParcelStatus,
            changedById: user.id,
            notes: body.statusNote || null,
            location: body.location || null,
          },
        },
      },
    });
    return NextResponse.json(updated);
  }

  // General field updates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {};
  if (body.npTtn !== undefined) updateData.npTtn = body.npTtn;
  if (body.tripId !== undefined) updateData.tripId = body.tripId;
  if (body.assignedCourierId !== undefined) updateData.assignedCourierId = body.assignedCourierId;
  if (body.isPaid !== undefined) {
    updateData.isPaid = body.isPaid;
    if (body.isPaid) updateData.paidAt = new Date();
  }
  if (body.estimatedDeliveryStart !== undefined) updateData.estimatedDeliveryStart = body.estimatedDeliveryStart;
  if (body.estimatedDeliveryEnd !== undefined) updateData.estimatedDeliveryEnd = body.estimatedDeliveryEnd;
  if (body.shortNumber !== undefined) updateData.shortNumber = body.shortNumber;

  const updated = await prisma.parcel.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json(updated);
}
