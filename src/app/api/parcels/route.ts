import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff } from '@/lib/auth/guards';
import { ROLES } from '@/lib/constants/roles';
import { parseBody, createParcelSchema } from '@/lib/validators';
import { createParcel } from '@/lib/services/parcel-creation';
import { logger } from '@/lib/logger';
import { kyivDateRange } from '@/lib/utils/tz';
import type { Prisma } from '@/generated/prisma/client';

// GET /api/parcels — staff only. Drivers see only their own + unassigned.
// Admins/cashiers/warehouse see everything.
export async function GET(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const currentUserId = guard.user.userId;
  const currentRole = guard.user.role;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const senderPhone = searchParams.get('senderPhone');
  const receiverPhone = searchParams.get('receiverPhone');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const tripId = searchParams.get('tripId');
  const courierId = searchParams.get('courierId');
  const unassigned = searchParams.get('unassigned');
  const q = searchParams.get('q');
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20));
  const sortByParam = searchParams.get('sortBy') || 'createdAt';
  const sortOrderParam = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';
  const allowedSortFields = ['createdAt', 'totalWeight', 'internalNumber', 'totalCost'] as const;
  const sortBy = (allowedSortFields as readonly string[]).includes(sortByParam) ? sortByParam : 'createdAt';

  const where: Prisma.ParcelWhereInput = { deletedAt: null };

  if (status) {
    // Virtual statuses for dashboard shortcuts — combine both directions.
    const virtualGroups: Record<string, string[]> = {
      in_transit: ['in_transit_to_ua', 'in_transit_to_eu'],
      at_warehouse: ['at_lviv_warehouse', 'at_eu_warehouse'],
      delivered: ['delivered_ua', 'delivered_eu'],
    };
    if (virtualGroups[status]) {
      where.status = { in: virtualGroups[status] } as Prisma.ParcelWhereInput['status'];
    } else {
      where.status = status as Prisma.ParcelWhereInput['status'];
    }
  }
  if (tripId) where.tripId = tripId;
  if (courierId) where.assignedCourierId = courierId;
  if (unassigned === '1') where.assignedCourierId = null;

  // Driver scoping: drivers see only parcels assigned to them OR unassigned
  // (unless they explicitly pass ?courierId=other — which we reject below).
  const driverScope: Prisma.ParcelWhereInput[] = [];
  if (currentRole === ROLES.DRIVER_COURIER) {
    if (courierId && courierId !== currentUserId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    driverScope.push(
      { assignedCourierId: currentUserId },
      { assignedCourierId: null },
    );
  }

  if (senderPhone) {
    where.sender = { phone: { contains: senderPhone } };
  }
  if (receiverPhone) {
    where.receiver = { phone: { contains: receiverPhone } };
  }
  if (dateFrom || dateTo) {
    // "YYYY-MM-DD" from the UI is a calendar day in Europe/Kyiv; kyivDateRange
    // converts it to the correct UTC bounds (handles DST).
    where.createdAt = kyivDateRange(dateFrom, dateTo);
  }
  if (q) {
    // If query looks like place ITN (contains -), also search by base ITN
    const baseItn = q.includes('-') ? q.split('-')[0] : null;

    where.OR = [
      { itn: { contains: q } },
      ...(baseItn ? [{ itn: { contains: baseItn } }] : []),
      { internalNumber: { contains: q, mode: 'insensitive' as const } },
      { npTtn: { contains: q } },
      { places: { some: { itnPlace: q } } },
      { sender: { lastName: { contains: q, mode: 'insensitive' as const } } },
      { receiver: { lastName: { contains: q, mode: 'insensitive' as const } } },
      { sender: { phone: { contains: q } } },
      { receiver: { phone: { contains: q } } },
    ];
  }

  // Combine driver scope with any existing where.OR via AND
  if (driverScope.length > 0) {
    if (where.OR) {
      where.AND = [
        { OR: where.OR },
        { OR: driverScope },
      ];
      delete where.OR;
    } else {
      where.OR = driverScope;
    }
  }

  const [parcels, total] = await Promise.all([
    prisma.parcel.findMany({
      where,
      include: {
        sender: { select: { id: true, phone: true, firstName: true, lastName: true } },
        receiver: { select: { id: true, phone: true, firstName: true, lastName: true } },
        receiverAddress: { select: { city: true, street: true, building: true, npWarehouseNum: true, deliveryMethod: true } },
        places: {
          orderBy: { placeNumber: 'asc' },
          select: { id: true, placeNumber: true, weight: true, volumetricWeight: true, itnPlace: true },
        },
      },
      orderBy: { [sortBy]: sortOrderParam },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.parcel.count({ where }),
  ]);

  return NextResponse.json({
    parcels,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}

// POST /api/parcels — create new parcel
export async function POST(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const userId = guard.user.userId;

  const parsed = await parseBody(request, createParcelSchema);
  if (parsed instanceof NextResponse) return parsed;

  try {
    const initialStatus = parsed.direction === 'eu_to_ua'
      ? 'accepted_for_transport_to_ua'
      : 'accepted_for_transport_to_eu';

    const created = await createParcel({
      senderId: parsed.senderId,
      senderAddressId: parsed.senderAddressId ?? null,
      receiverId: parsed.receiverId,
      receiverAddressId: parsed.receiverAddressId ?? null,
      tripId: parsed.tripId ?? null,
      direction: parsed.direction,
      shipmentType: parsed.shipmentType,
      description: parsed.description ?? null,
      declaredValue: parsed.declaredValue ?? null,
      payer: parsed.payer,
      paymentMethod: parsed.paymentMethod,
      paymentInUkraine: parsed.paymentInUkraine,
      needsPackaging: parsed.needsPackaging,
      places: parsed.places,
      createdById: userId,
      createdSource: 'worker',
      status: initialStatus,
      collectionMethod: parsed.collectionMethod ?? null,
      collectionPointId: parsed.collectionPointId ?? null,
      collectionDate: parsed.collectionDate ? new Date(parsed.collectionDate) : null,
      collectionAddress: parsed.collectionAddress ?? null,
    });

    const full = await prisma.parcel.findUnique({
      where: { id: created.id },
      include: {
        sender: { select: { phone: true, firstName: true, lastName: true } },
        receiver: { select: { phone: true, firstName: true, lastName: true } },
        places: true,
      },
    });

    return NextResponse.json(full, { status: 201 });
  } catch (err) {
    logger.error('parcel.create.failed', err, { userId });
    return NextResponse.json(
      { error: 'Не вдалося створити посилку. Спробуйте ще раз.' },
      { status: 500 }
    );
  }
}
