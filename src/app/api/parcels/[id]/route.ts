import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { ParcelStatus } from '@/generated/prisma/enums';
import type { Prisma } from '@/generated/prisma/client';
import { calculateParcelCost } from '@/lib/utils/pricing';
import { calculateVolumetricWeight, roundWeight } from '@/lib/utils/volumetric';
import { requireRole, requireStaff } from '@/lib/auth/guards';
import { ADMIN_ROLES } from '@/lib/constants/roles';
import { parseBody, updateParcelSchema, parsePackagingPrices } from '@/lib/validators';
import { logger } from '@/lib/logger';
import { writeAuditLog } from '@/lib/audit';
import { isAllowedTransition } from '@/lib/parcels/status-transitions';

// Статуси «прийнято до перевезення» і далі — після них редагування ваги,
// розмірів та деталей заборонено всім, окрім super_admin. Список дублює
// LOCKED_STATUSES з UI-сторінки /parcels/[id] навмисно — клієнт і сервер
// повинні узгоджувати правило, навіть якщо одна сторона буде обійдена.
const LOCKED_FOR_EDIT: ParcelStatus[] = [
  'accepted_for_transport_to_ua', 'in_transit_to_ua', 'at_lviv_warehouse', 'at_nova_poshta', 'delivered_ua',
  'accepted_for_transport_to_eu', 'in_transit_to_eu', 'at_eu_warehouse', 'delivered_eu',
];

// GET /api/parcels/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const parcel = await prisma.parcel.findFirst({
    where: { id, deletedAt: null },
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
      collectionPoint: {
        select: {
          id: true,
          name: true,
          country: true,
          city: true,
          address: true,
          contactPhone: true,
          workingHours: true,
          workingDays: true,
        },
      },
      collectedBy: { select: { id: true, fullName: true } },
    },
  });

  if (!parcel) {
    return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });
  }

  // Pull audit-log rows that target this parcel. These capture operations
  // that aren't reflected in statusHistory (e.g. manual cost overrides,
  // deletions, un-deletions, PII edits) and round out the "journal" view.
  const auditEntries = await prisma.auditLog.findMany({
    where: { subjectType: 'parcel', subjectId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // Resolve actor names in one round-trip instead of joining per-row.
  const actorIds = Array.from(
    new Set(auditEntries.map((a) => a.actorId).filter((x): x is string => !!x))
  );
  const actors = actorIds.length
    ? await prisma.profile.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, fullName: true },
      })
    : [];
  const actorMap = new Map(actors.map((a) => [a.id, a.fullName]));

  return NextResponse.json({
    ...parcel,
    auditLog: auditEntries.map((a) => ({
      id: a.id,
      event: a.event,
      actor: a.actorId ? actorMap.get(a.actorId) ?? null : null,
      payload: a.payload,
      createdAt: a.createdAt,
    })),
  });
}

// PATCH /api/parcels/[id] — update status or fields (staff only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const userId = guard.user.userId;
  const isSuperAdmin = guard.user.role === 'super_admin';

  const { id } = await params;
  const parsed = await parseBody(request, updateParcelSchema);
  if (parsed instanceof NextResponse) return parsed;
  const body = parsed;

  const parcel = await prisma.parcel.findFirst({
    where: { id, deletedAt: null },
    include: { places: { select: { id: true } } },
  });
  if (!parcel) {
    return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });
  }

  const isLocked = LOCKED_FOR_EDIT.includes(parcel.status);

  // Блок редагування «Місць» (ваги/розмірів) після accepted_for_transport_*
  // — тільки super_admin може обходити. Фронтенд вже приховує кнопку
  // «Редагувати», але сервер має валідувати самостійно.
  if (Array.isArray(body.places) && isLocked && !isSuperAdmin) {
    return NextResponse.json(
      { error: 'Редагування місць заборонено після прийому посилки до перевезення. Зверніться до Суперадміна.' },
      { status: 403 }
    );
  }

  // Status-only change path (doesn't touch places, can be simple update).
  if (body.status) {
    // Валідація переходу — super_admin може обходити правила. Якщо поточний
    // статус === новий, пропускаємо (ідемпотентність).
    if (!isSuperAdmin && !isAllowedTransition(parcel.status, body.status as ParcelStatus)) {
      return NextResponse.json(
        {
          error: `Недопустимий перехід статусу: ${parcel.status} → ${body.status}. Дивіться «Статуси» в Адмініструванні.`,
        },
        { status: 400 }
      );
    }
    const statusUpdateData: Prisma.ParcelUpdateInput = {
      status: body.status as ParcelStatus,
      statusHistory: {
        create: {
          status: body.status as ParcelStatus,
          changedById: userId,
          notes: body.statusNote || null,
          location: body.location || null,
        },
      },
    };

    // Auto-link to nearest trip when status becomes "Прийнято до перевезення"
    const acceptedStatuses: ParcelStatus[] = ['accepted_for_transport_to_ua', 'accepted_for_transport_to_eu'];
    if (acceptedStatuses.includes(body.status) && !parcel.tripId) {
      const direction = body.status === 'accepted_for_transport_to_ua' ? 'eu_to_ua' : 'ua_to_eu';

      const [receiverAddr, senderAddr] = await Promise.all([
        parcel.receiverAddressId
          ? prisma.clientAddress.findUnique({ where: { id: parcel.receiverAddressId } })
          : Promise.resolve(null),
        parcel.senderAddressId
          ? prisma.clientAddress.findUnique({ where: { id: parcel.senderAddressId } })
          : Promise.resolve(null),
      ]);

      const targetCountry = direction === 'eu_to_ua'
        ? senderAddr?.country
        : receiverAddr?.country;

      const nearestTrip = await prisma.trip.findFirst({
        where: {
          direction,
          status: 'planned',
          departureDate: { gte: new Date() },
          ...(targetCountry && targetCountry !== 'UA' ? { country: targetCountry } : {}),
        },
        orderBy: { departureDate: 'asc' },
      });

      if (nearestTrip) {
        statusUpdateData.trip = { connect: { id: nearestTrip.id } };
        const noteSuffix = `Автоматично прив'язано до рейсу ${nearestTrip.country} ${new Date(nearestTrip.departureDate).toLocaleDateString('uk-UA')}`;
        const sh = statusUpdateData.statusHistory as Prisma.ParcelStatusHistoryUncheckedCreateNestedManyWithoutParcelInput | undefined;
        if (sh && 'create' in sh && sh.create && !Array.isArray(sh.create)) {
          const create = sh.create as { notes?: string | null };
          create.notes = (body.statusNote ? body.statusNote + '. ' : '') + noteSuffix;
        }
      } else {
        logger.warn('parcel.auto_link.no_trip', {
          parcelId: id, direction, targetCountry,
        });
      }
    }

    const updated = await prisma.parcel.update({
      where: { id },
      data: statusUpdateData,
    });
    return NextResponse.json(updated);
  }

  // General field updates (non-status path). Build once, execute in one tx if places present.
  // Блокування «Деталей» (description / declaredValue / payer / paymentMethod /
  // paymentInUkraine / shipmentType / needsPackaging) після accepted_for_transport_*.
  // Решта полів (npTtn, tripId, assignedCourierId, isPaid, estimatedDelivery*, etc.)
  // — це операційні поля, їх редагування не блокуємо.
  if (isLocked && !isSuperAdmin) {
    const DETAIL_FIELDS: Array<keyof typeof body> = [
      'description', 'declaredValue', 'payer', 'paymentMethod',
      'paymentInUkraine', 'shipmentType', 'needsPackaging',
    ];
    const hasDetailEdit = DETAIL_FIELDS.some((f) => body[f] !== undefined);
    if (hasDetailEdit) {
      return NextResponse.json(
        { error: 'Редагування деталей заборонено після прийому посилки до перевезення. Зверніться до Суперадміна.' },
        { status: 403 }
      );
    }
  }

  const updateData: Prisma.ParcelUpdateInput = {};
  if (body.npTtn !== undefined) updateData.npTtn = body.npTtn;
  if (body.tripId !== undefined) {
    updateData.trip = body.tripId ? { connect: { id: body.tripId } } : { disconnect: true };
  }
  if (body.assignedCourierId !== undefined) {
    updateData.assignedCourier = body.assignedCourierId
      ? { connect: { id: body.assignedCourierId } }
      : { disconnect: true };
  }
  if (body.isPaid !== undefined) {
    updateData.isPaid = body.isPaid;
    if (body.isPaid) updateData.paidAt = new Date();
  }
  if (body.estimatedDeliveryStart !== undefined) {
    updateData.estimatedDeliveryStart = body.estimatedDeliveryStart ? new Date(body.estimatedDeliveryStart) : null;
  }
  if (body.estimatedDeliveryEnd !== undefined) {
    updateData.estimatedDeliveryEnd = body.estimatedDeliveryEnd ? new Date(body.estimatedDeliveryEnd) : null;
  }
  if (body.shortNumber !== undefined) updateData.shortNumber = body.shortNumber;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.declaredValue !== undefined) updateData.declaredValue = body.declaredValue ? Number(body.declaredValue) : null;
  if (body.needsPackaging !== undefined) updateData.needsPackaging = body.needsPackaging;
  if (body.payer !== undefined) updateData.payer = body.payer;
  if (body.paymentMethod !== undefined) updateData.paymentMethod = body.paymentMethod;
  if (body.paymentInUkraine !== undefined) updateData.paymentInUkraine = body.paymentInUkraine;
  if (body.shipmentType !== undefined) updateData.shipmentType = body.shipmentType;
  if (body.collectionMethod !== undefined) updateData.collectionMethod = body.collectionMethod || null;
  if (body.collectionPointId !== undefined) {
    updateData.collectionPoint = body.collectionPointId
      ? { connect: { id: body.collectionPointId } }
      : { disconnect: true };
  }
  if (body.collectionDate !== undefined) {
    updateData.collectionDate = body.collectionDate ? new Date(body.collectionDate) : null;
  }
  if (body.collectionAddress !== undefined) updateData.collectionAddress = body.collectionAddress || null;
  if (body.routeTaskStatus !== undefined) updateData.routeTaskStatus = body.routeTaskStatus || null;
  if (body.routeTaskFailReason !== undefined) updateData.routeTaskFailReason = body.routeTaskFailReason || null;
  if (body.routeTaskReschedDate !== undefined) {
    updateData.routeTaskReschedDate = body.routeTaskReschedDate ? new Date(body.routeTaskReschedDate) : null;
  }

  // Places update — replaces dimensions/weight per place; delete missing ones;
  // all mutations happen in a single transaction so the parcel aggregate
  // weights and cost stay consistent with place records.
  if (Array.isArray(body.places)) {
    const incomingIds = new Set(
      body.places.map(p => p.id).filter((x): x is string => typeof x === 'string')
    );
    const existingIds = parcel.places.map(p => p.id);
    const placesToDelete = existingIds.filter(eid => !incomingIds.has(eid));

    let totalWeight = 0;
    let totalVolWeight = 0;

    // Pre-compute normalized blueprints so we don't repeat Number() calls.
    const placeUpdates = body.places
      .filter(p => p.id) // only existing places can be updated in-place; new places would need create
      .map(p => {
        const w = Number(p.weight) || 0;
        const l = p.length != null ? Number(p.length) : null;
        const wd = p.width != null ? Number(p.width) : null;
        const h = p.height != null ? Number(p.height) : null;
        const volW = l && wd && h ? calculateVolumetricWeight(l, wd, h) : 0;
        totalWeight += w;
        totalVolWeight += volW;
        return {
          id: p.id!,
          data: {
            weight: roundWeight(w),
            length: l,
            width: wd,
            height: h,
            volumetricWeight: volW > 0 ? roundWeight(volW) : null,
            ...(p.needsPackaging !== undefined ? { needsPackaging: p.needsPackaging } : {}),
          },
        };
      });

    updateData.totalWeight = roundWeight(totalWeight);
    updateData.totalVolumetricWeight = roundWeight(totalVolWeight);

    // Recalculate costs before transaction. Priority: trip → collectionPoint → senderAddr → receiverAddr.
    try {
      const [trip, collectionPoint, senderAddr, receiverAddr] = await Promise.all([
        parcel.tripId
          ? prisma.trip.findUnique({ where: { id: parcel.tripId }, select: { country: true } })
          : Promise.resolve(null),
        parcel.collectionPointId
          ? prisma.collectionPoint.findUnique({
              where: { id: parcel.collectionPointId },
              select: { country: true },
            })
          : Promise.resolve(null),
        parcel.senderAddressId
          ? prisma.clientAddress.findUnique({ where: { id: parcel.senderAddressId } })
          : Promise.resolve(null),
        parcel.receiverAddressId
          ? prisma.clientAddress.findUnique({ where: { id: parcel.receiverAddressId } })
          : Promise.resolve(null),
      ]);

      const tripCountryIfEu = trip?.country && trip.country !== 'UA' ? trip.country : null;
      const country = parcel.direction === 'eu_to_ua'
        ? (tripCountryIfEu || collectionPoint?.country || senderAddr?.country)
        : (tripCountryIfEu || receiverAddr?.country);

      if (country && country !== 'UA') {
        const pricing = await prisma.pricingConfig.findFirst({
          where: { direction: parcel.direction, country, isActive: true },
          orderBy: { createdAt: 'desc' },
        });

        if (pricing) {
          const isAddressDelivery = receiverAddr?.deliveryMethod === 'address';
          const breakdown = calculateParcelCost(
            {
              pricePerKg: Number(pricing.pricePerKg),
              weightType: pricing.weightType,
              insuranceThreshold: Number(pricing.insuranceThreshold),
              insuranceRate: Number(pricing.insuranceRate),
              insuranceEnabled: pricing.insuranceEnabled,
              packagingEnabled: pricing.packagingEnabled,
              packagingPrices: parsePackagingPrices(pricing.packagingPrices),
              addressDeliveryPrice: Number(pricing.addressDeliveryPrice),
            },
            {
              actualWeight: totalWeight,
              volumetricWeight: totalVolWeight,
              declaredValue: Number(parcel.declaredValue) || 0,
              needsPackaging: parcel.needsPackaging,
              isAddressDelivery,
            }
          );
          updateData.deliveryCost = breakdown.deliveryCost;
          updateData.insuranceCost = breakdown.insuranceCost;
          updateData.packagingCost = breakdown.packagingCost;
          updateData.addressDeliveryCost = breakdown.addressDeliveryCost;
          updateData.totalCost = breakdown.totalCost;
        }
      }
    } catch (e) {
      logger.error('parcel.cost_recalc_failed', e, { parcelId: id });
      // Leave cost fields as-is; user can set manually.
    }

    // Run everything in one transaction.
    await prisma.$transaction(async (tx) => {
      for (const p of placeUpdates) {
        await tx.parcelPlace.update({ where: { id: p.id }, data: p.data });
      }
      if (placesToDelete.length > 0) {
        await tx.parcelPlace.deleteMany({
          where: { id: { in: placesToDelete }, parcelId: id },
        });
      }
      await tx.parcel.update({ where: { id }, data: updateData });
    });

    const full = await prisma.parcel.findUnique({ where: { id } });
    return NextResponse.json(full);
  }

  // No places — single update.
  const updated = await prisma.parcel.update({
    where: { id },
    data: updateData,
  });
  return NextResponse.json(updated);
}

// DELETE /api/parcels/[id] — soft delete (admin only)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(ADMIN_ROLES);
  if (!guard.ok) return guard.response;
  const userId = guard.user.userId;

  const { id } = await params;

  const parcel = await prisma.parcel.findFirst({ where: { id, deletedAt: null } });
  if (!parcel) {
    return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });
  }

  await prisma.parcel.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  logger.audit('parcel.deleted', {
    parcelId: id, itn: parcel.itn, userId,
  });
  await writeAuditLog({
    event: 'parcel.deleted',
    actorId: userId,
    subjectId: id,
    subjectType: 'parcel',
    payload: { itn: parcel.itn, internalNumber: parcel.internalNumber },
  });

  return NextResponse.json({ success: true });
}
