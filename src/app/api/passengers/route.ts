import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff, requireRole } from '@/lib/auth/guards';
import { ADMIN_ROLES } from '@/lib/constants/roles';
import { normalizePhone } from '@/lib/utils/phone';
import { capitalize } from '@/lib/utils/format';
import { z } from 'zod';
import { parseBody } from '@/lib/validators';
import { isUuid } from '@/lib/validators/common';
import { logger } from '@/lib/logger';

const passengerCreateSchema = z.object({
  tripId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(5).max(30),
  seatNumber: z.number().int().min(1).max(99).nullable().optional(),
  pickupAddress: z.string().trim().max(500).nullable().optional(),
  dropoffAddress: z.string().trim().max(500).nullable().optional(),
  price: z.number().min(0).max(99999).nullable().optional(),
  currency: z.enum(['EUR', 'UAH', 'USD']).default('EUR'),
  isPaid: z.boolean().default(false),
  notes: z.string().trim().max(1000).nullable().optional(),
});

// GET /api/passengers?tripId=...
// За замовчуванням повертає пасажирів майбутніх та нещодавніх рейсів.
export async function GET(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get('tripId');

  if (tripId) {
    const [trip, passengers] = await Promise.all([
      prisma.trip.findUnique({
        where: { id: tripId },
        select: {
          id: true, direction: true, country: true,
          departureDate: true, arrivalDate: true, status: true,
          passengerCapacity: true,
          assignedCourier: { select: { fullName: true } },
        },
      }),
      prisma.passenger.findMany({
        where: { tripId, deletedAt: null },
        orderBy: [{ seatNumber: 'asc' }, { createdAt: 'asc' }],
        include: {
          createdBy: { select: { fullName: true } },
        },
      }),
    ]);

    if (!trip) {
      return NextResponse.json({ error: 'Рейс не знайдено' }, { status: 404 });
    }

    return NextResponse.json({
      trip,
      passengers: passengers.map((p) => ({
        ...p,
        price: p.price != null ? Number(p.price) : null,
      })),
      stats: {
        capacity: trip.passengerCapacity,
        occupied: passengers.length,
        free: Math.max(0, trip.passengerCapacity - passengers.length),
      },
    });
  }

  // Без tripId — зведення по рейсах. Беремо всі майбутні рейси, плюс
  // недавні (7 днів) з пасажирами, щоб було видно хто сьогодні-вчора їхав.
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const trips = await prisma.trip.findMany({
    where: {
      OR: [
        { departureDate: { gte: new Date() } },
        { passengers: { some: { deletedAt: null } }, departureDate: { gte: weekAgo } },
      ],
    },
    orderBy: { departureDate: 'asc' },
    select: {
      id: true, direction: true, country: true,
      departureDate: true, arrivalDate: true, status: true,
      passengerCapacity: true,
      assignedCourier: { select: { fullName: true } },
      _count: { select: { passengers: { where: { deletedAt: null } } } },
    },
  });

  return NextResponse.json({
    trips: trips.map((t) => ({
      ...t,
      occupied: t._count.passengers,
      free: Math.max(0, t.passengerCapacity - t._count.passengers),
    })),
  });
}

// POST /api/passengers — створити пасажира на рейсі. Admin/staff.
export async function POST(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const userId = guard.user.userId;

  const parsed = await parseBody(request, passengerCreateSchema);
  if (parsed instanceof NextResponse) return parsed;
  const body = parsed;

  // Перевіряємо що рейс існує і місце (якщо задано) не зайняте.
  const trip = await prisma.trip.findUnique({
    where: { id: body.tripId },
    select: { id: true, passengerCapacity: true },
  });
  if (!trip) {
    return NextResponse.json({ error: 'Рейс не знайдено' }, { status: 404 });
  }

  if (body.seatNumber != null) {
    if (body.seatNumber > trip.passengerCapacity) {
      return NextResponse.json(
        { error: `Місце ${body.seatNumber} перевищує місткість рейсу (${trip.passengerCapacity})` },
        { status: 400 }
      );
    }
    const taken = await prisma.passenger.findFirst({
      where: { tripId: body.tripId, seatNumber: body.seatNumber, deletedAt: null },
    });
    if (taken) {
      return NextResponse.json({ error: `Місце ${body.seatNumber} вже зайняте` }, { status: 409 });
    }
  }

  const passenger = await prisma.passenger.create({
    data: {
      tripId: body.tripId,
      firstName: capitalize(body.firstName),
      lastName: capitalize(body.lastName),
      phone: body.phone,
      phoneNormalized: normalizePhone(body.phone),
      seatNumber: body.seatNumber ?? null,
      pickupAddress: body.pickupAddress || null,
      dropoffAddress: body.dropoffAddress || null,
      price: body.price ?? null,
      currency: body.currency,
      isPaid: body.isPaid,
      notes: body.notes || null,
      createdById: userId,
    },
  });

  logger.audit('passenger.created', {
    passengerId: passenger.id, tripId: body.tripId, userId,
  });

  return NextResponse.json({
    ...passenger,
    price: passenger.price != null ? Number(passenger.price) : null,
  }, { status: 201 });
}

// DELETE /api/passengers?id=... — soft delete (admin only)
export async function DELETE(request: NextRequest) {
  const guard = await requireRole(ADMIN_ROLES);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });

  const exists = await prisma.passenger.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: 'Пасажира не знайдено' }, { status: 404 });

  await prisma.passenger.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
