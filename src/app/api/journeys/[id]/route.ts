import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth/guards';
import { LOGISTICS_ROLES, ADMIN_ROLES } from '@/lib/constants/roles';
import { isUuid } from '@/lib/validators/common';
import { logger } from '@/lib/logger';
import type { TripStatus } from '@/generated/prisma/enums';

// GET /api/journeys/[id] — full journey details with child trips & parcels
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(LOGISTICS_ROLES);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });

  const journey = await prisma.journey.findUnique({
    where: { id },
    include: {
      assignedCourier: { select: { id: true, fullName: true } },
      secondCourier: { select: { id: true, fullName: true } },
      trips: {
        include: {
          _count: { select: { parcels: { where: { deletedAt: null } } } },
        },
        orderBy: { departureDate: 'asc' },
      },
    },
  });
  if (!journey) return NextResponse.json({ error: 'Поїздку не знайдено' }, { status: 404 });
  return NextResponse.json(journey);
}

// PATCH /api/journeys/[id] — update journey (logistics roles)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(LOGISTICS_ROLES);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Очікується JSON body' }, { status: 400 }); }

  const exists = await prisma.journey.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: 'Поїздку не знайдено' }, { status: 404 });

  // Date validation
  for (const field of ['departureDate', 'euArrivalDate', 'euReturnDate', 'endDate']) {
    if (body[field] != null && Number.isNaN(new Date(body[field]).getTime())) {
      return NextResponse.json({ error: `Невалідна дата: ${field}` }, { status: 400 });
    }
  }
  if (body.status && !['planned', 'in_progress', 'completed', 'cancelled'].includes(body.status)) {
    return NextResponse.json({ error: 'Невалідний статус' }, { status: 400 });
  }

  // Validate courier IDs if changing
  for (const field of ['assignedCourierId', 'secondCourierId'] as const) {
    if (body[field] !== undefined && body[field]) {
      const u = await prisma.profile.findUnique({ where: { id: body[field] }, select: { id: true } });
      if (!u) return NextResponse.json({ error: 'Кур\'єра не знайдено' }, { status: 404 });
    }
  }

  const data: Record<string, unknown> = {};
  if (body.departureDate !== undefined) data.departureDate = body.departureDate ? new Date(body.departureDate) : null;
  if (body.euArrivalDate !== undefined) data.euArrivalDate = body.euArrivalDate ? new Date(body.euArrivalDate) : null;
  if (body.euReturnDate !== undefined) data.euReturnDate = body.euReturnDate ? new Date(body.euReturnDate) : null;
  if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null;
  if (body.status !== undefined) data.status = body.status as TripStatus;
  if (body.assignedCourierId !== undefined) data.assignedCourierId = body.assignedCourierId || null;
  if (body.secondCourierId !== undefined) data.secondCourierId = body.secondCourierId || null;
  if (body.vehicleInfo !== undefined) data.vehicleInfo = body.vehicleInfo || null;
  if (body.notes !== undefined) data.notes = body.notes || null;

  const updated = await prisma.journey.update({ where: { id }, data });
  return NextResponse.json(updated);
}

// DELETE /api/journeys/[id] — cancel journey (admin only).
// Soft-cancel: sets status=cancelled and cascades to child trips that haven't
// started yet. Hard delete is risky because child trips may have parcels and
// statusHistory we'd want to keep.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(ADMIN_ROLES);
  if (!guard.ok) return guard.response;
  const userId = guard.user.userId;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });

  const journey = await prisma.journey.findUnique({
    where: { id },
    include: { trips: { select: { id: true, status: true, _count: { select: { parcels: { where: { deletedAt: null } } } } } } },
  });
  if (!journey) return NextResponse.json({ error: 'Поїздку не знайдено' }, { status: 404 });

  // Block hard delete if any trip has parcels — caller should reassign first.
  const tripsWithParcels = journey.trips.filter(t => t._count.parcels > 0);
  if (tripsWithParcels.length > 0) {
    return NextResponse.json(
      { error: `Неможливо видалити: ${tripsWithParcels.length} рейсів мають посилки. Спочатку переприв'яжіть посилки.` },
      { status: 409 }
    );
  }

  // No parcels — safe to hard delete journey + child trips.
  await prisma.$transaction([
    prisma.trip.deleteMany({ where: { journeyId: id } }),
    prisma.journey.delete({ where: { id } }),
  ]);

  logger.audit('journey.deleted', { journeyId: id, userId });
  return NextResponse.json({ success: true });
}
