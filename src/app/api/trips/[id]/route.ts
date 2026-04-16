import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, requireStaff } from '@/lib/auth/guards';
import { LOGISTICS_ROLES } from '@/lib/constants/roles';

// GET /api/trips/[id] — staff only
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

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
          collectionPoint: {
            select: { id: true, name: true, city: true, address: true },
          },
        },
        orderBy: { shortNumber: 'asc' },
      },
      _count: { select: { parcels: true, routeTasks: true } },
    },
  });

  if (!trip) return NextResponse.json({ error: 'Рейс не знайдено' }, { status: 404 });
  return NextResponse.json(trip);
}

// PATCH /api/trips/[id] — logistics roles only
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(LOGISTICS_ROLES);
  if (!guard.ok) return guard.response;
  const user = { id: guard.user.userId };

  const { id } = await params;
  const body = await request.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (body.status !== undefined) {
    data.status = body.status;

    // When trip starts moving — update all linked parcels
    if (body.status === 'in_progress') {
      const trip = await prisma.trip.findUnique({ where: { id }, select: { direction: true } });
      if (trip) {
        const newParcelStatus = trip.direction === 'eu_to_ua' ? 'in_transit_to_ua' : 'in_transit_to_eu';
        const parcels = await prisma.parcel.findMany({
          where: { tripId: id, status: { notIn: [newParcelStatus, 'delivered_ua', 'delivered_eu', 'not_received', 'refused', 'returned'] } },
          select: { id: true, collectedAt: true, collectionMethod: true, direction: true },
        });
        for (const p of parcels) {
          // For EU→UA parcels that never went through a pickup point (e.g.
          // direct_to_driver / courier_pickup / external_shipping), stamp
          // collectedAt now so receipt time is always recorded.
          const shouldStampCollected =
            p.direction === 'eu_to_ua' && !p.collectedAt && !!p.collectionMethod;

          await prisma.parcel.update({
            where: { id: p.id },
            data: {
              status: newParcelStatus as import('@/generated/prisma/client').ParcelStatus,
              ...(shouldStampCollected ? { collectedAt: new Date(), collectedById: user.id } : {}),
              statusHistory: {
                create: {
                  status: newParcelStatus as import('@/generated/prisma/client').ParcelStatus,
                  changedById: user.id,
                  notes: 'Рейс розпочав рух',
                },
              },
            },
          });
        }
      }
    }

    // When trip completed (EU→UA) — parcels arrive at warehouse
    if (body.status === 'completed') {
      const trip = await prisma.trip.findUnique({ where: { id }, select: { direction: true } });
      if (trip && trip.direction === 'eu_to_ua') {
        const parcels = await prisma.parcel.findMany({
          where: { tripId: id, status: 'in_transit_to_ua' },
          select: { id: true },
        });
        for (const p of parcels) {
          await prisma.parcel.update({
            where: { id: p.id },
            data: {
              status: 'at_lviv_warehouse',
              statusHistory: {
                create: {
                  status: 'at_lviv_warehouse',
                  changedById: user.id,
                  notes: 'Рейс завершено, посилка на складі',
                },
              },
            },
          });
        }
      }
    }
  }
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
