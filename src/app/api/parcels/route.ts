import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff } from '@/lib/auth/guards';
import { ROLES } from '@/lib/constants/roles';
import { parseBody, createParcelSchema } from '@/lib/validators';
import { createParcel } from '@/lib/services/parcel-creation';
import { logger } from '@/lib/logger';
import { kyivDateRange } from '@/lib/utils/tz';
import type { Prisma } from '@/generated/prisma/client';
import type { Country, DeliveryMethod } from '@/generated/prisma/enums';

/**
 * Upsert a ClientAddress for parcel creation.
 *
 * Per ТЗ: «завжди зберігаємо і оновлюємо останній адрес» — when worker edits
 * inline address fields on /parcels/new, we want those edits to land back on
 * the linked address record so next parcel pre-fills with the latest data.
 *
 * - addressId given + override has fields → UPDATE that address.
 * - no addressId + override has city → CREATE a new address for the client.
 * - empty/missing override → just return addressId as-is (no DB write).
 */
async function upsertClientAddress(args: {
  clientId: string;
  addressId: string | null;
  override?: {
    country?: Country | null;
    deliveryMethod?: DeliveryMethod;
    postalCode?: string | null;
    city?: string | null;
    street?: string | null;
    building?: string | null;
    landmark?: string | null;
    npWarehouseNum?: string | null;
    pickupPointText?: string | null;
  };
  defaultCountry: Country | null;
}): Promise<string | null> {
  const { clientId, addressId, override, defaultCountry } = args;
  if (!override) return addressId;

  // Treat empty strings as "no value" so we don't wipe existing data with "".
  const clean = (v: string | null | undefined) =>
    v != null && v !== '' ? v : null;

  const data = {
    deliveryMethod: override.deliveryMethod,
    postalCode: clean(override.postalCode),
    city: clean(override.city),
    street: clean(override.street),
    building: clean(override.building),
    landmark: clean(override.landmark),
    npWarehouseNum: clean(override.npWarehouseNum),
    pickupPointText: clean(override.pickupPointText),
  };

  if (addressId) {
    // Update existing — but only fields that the worker actually entered.
    // Country isn't editable inline, so we leave it alone.
    await prisma.clientAddress.update({
      where: { id: addressId },
      data: {
        ...(data.deliveryMethod !== undefined && { deliveryMethod: data.deliveryMethod }),
        postalCode: data.postalCode,
        ...(data.city != null && { city: data.city }),
        street: data.street,
        building: data.building,
        landmark: data.landmark,
        npWarehouseNum: data.npWarehouseNum,
        pickupPointText: data.pickupPointText,
      },
    });
    return addressId;
  }

  // No addressId — only create if we have at least a city to anchor on.
  if (!data.city) return null;
  const country = override.country ?? defaultCountry;
  if (!country) return null;

  const created = await prisma.clientAddress.create({
    data: {
      clientId,
      country,
      city: data.city,
      deliveryMethod: data.deliveryMethod ?? 'address',
      postalCode: data.postalCode,
      street: data.street,
      building: data.building,
      landmark: data.landmark,
      npWarehouseNum: data.npWarehouseNum,
      pickupPointText: data.pickupPointText,
      isDefault: false,
    },
    select: { id: true },
  });
  return created.id;
}

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
    const validStatuses = [
      'draft', 'at_collection_point',
      'accepted_for_transport_to_ua', 'in_transit_to_ua', 'at_lviv_warehouse',
      'at_nova_poshta', 'delivered_ua',
      'accepted_for_transport_to_eu', 'in_transit_to_eu', 'at_eu_warehouse',
      'delivered_eu', 'not_received', 'refused', 'returned',
    ];
    if (virtualGroups[status]) {
      where.status = { in: virtualGroups[status] } as Prisma.ParcelWhereInput['status'];
    } else if (validStatuses.includes(status)) {
      where.status = status as Prisma.ParcelWhereInput['status'];
    } else {
      return NextResponse.json({ error: `Невалідний статус: ${status}` }, { status: 400 });
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
    // Per ТЗ: driver sees three categories —
    //  1. parcels they created from scratch (createdById)
    //  2. parcels assigned to a trip where they are the assigned/second courier
    //  3. parcels personally assigned to them
    // Bare-unassigned no longer included — driver shouldn't see other drivers'
    // trip parcels just because no individual courier was assigned yet.
    const myTrips = await prisma.trip.findMany({
      where: {
        OR: [{ assignedCourierId: currentUserId }, { secondCourierId: currentUserId }],
      },
      select: { id: true },
    });
    const myTripIds = myTrips.map(t => t.id);
    driverScope.push(
      { assignedCourierId: currentUserId },
      { createdById: currentUserId },
      ...(myTripIds.length > 0 ? [{ tripId: { in: myTripIds } }] : []),
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
    try {
      where.createdAt = kyivDateRange(dateFrom, dateTo);
    } catch {
      return NextResponse.json({ error: 'Невалідна дата (очікується YYYY-MM-DD)' }, { status: 400 });
    }
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
        senderAddress: { select: { city: true, street: true, building: true, npWarehouseNum: true, deliveryMethod: true } },
        places: {
          orderBy: { placeNumber: 'asc' },
          select: { id: true, placeNumber: true, weight: true, volumetricWeight: true, itnPlace: true },
        },
        // Для динамічного лейблу статусу («В дорозі до …»).
        trip: { select: { id: true, country: true, departureDate: true } },
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
    // Pre-flight: confirm sender + receiver exist. Without this, a
    // non-existent ID hits a foreign-key error deep in createParcel and
    // surfaces as opaque 500.
    const [senderExists, receiverExists] = await Promise.all([
      prisma.client.findFirst({ where: { id: parsed.senderId, deletedAt: null }, select: { id: true } }),
      prisma.client.findFirst({ where: { id: parsed.receiverId, deletedAt: null }, select: { id: true } }),
    ]);
    if (!senderExists) return NextResponse.json({ error: 'Відправника не знайдено' }, { status: 404 });
    if (!receiverExists) return NextResponse.json({ error: 'Отримувача не знайдено' }, { status: 404 });

    const initialStatus = parsed.direction === 'eu_to_ua'
      ? 'accepted_for_transport_to_ua'
      : 'accepted_for_transport_to_eu';

    // Per ТЗ: «лише номер телефону» — if worker edited phone inline, update
    // the client record so next parcel pre-fills with the new number.
    if (parsed.receiverPhoneOverride) {
      const { normalizePhone } = await import('@/lib/utils/phone');
      await prisma.client.update({
        where: { id: parsed.receiverId },
        data: { phone: parsed.receiverPhoneOverride, phoneNormalized: normalizePhone(parsed.receiverPhoneOverride) },
      }).catch((err) => logger.warn('parcel.phone_override.failed', { err: String(err), clientId: parsed.receiverId }));
    }
    if (parsed.senderPhoneOverride) {
      const { normalizePhone } = await import('@/lib/utils/phone');
      await prisma.client.update({
        where: { id: parsed.senderId },
        data: { phone: parsed.senderPhoneOverride, phoneNormalized: normalizePhone(parsed.senderPhoneOverride) },
      }).catch((err) => logger.warn('parcel.phone_override.failed', { err: String(err), clientId: parsed.senderId }));
    }

    // Per ТЗ: «завжди зберігаємо і оновлюємо останній адрес».
    // If worker provided address fields, update the linked ClientAddress
    // (or create a new one if there's no addressId yet) BEFORE the parcel
    // is created, so the parcel references the freshest version.
    const receiverAddressId = await upsertClientAddress({
      clientId: parsed.receiverId,
      addressId: parsed.receiverAddressId ?? null,
      override: parsed.receiverAddress,
      defaultCountry: parsed.direction === 'eu_to_ua' ? 'UA' : null,
    });
    const senderAddressId = await upsertClientAddress({
      clientId: parsed.senderId,
      addressId: parsed.senderAddressId ?? null,
      override: parsed.senderAddress,
      defaultCountry: parsed.direction === 'ua_to_eu' ? 'UA' : null,
    });

    const created = await createParcel({
      senderId: parsed.senderId,
      senderAddressId,
      receiverId: parsed.receiverId,
      receiverAddressId,
      tripId: parsed.tripId ?? null,
      direction: parsed.direction,
      shipmentType: parsed.shipmentType,
      description: parsed.description ?? null,
      declaredValue: parsed.declaredValue ?? null,
      declaredValueCurrency: parsed.declaredValueCurrency,
      insurance: parsed.insurance,
      insuranceCost: parsed.insuranceCost ?? null,
      payer: parsed.payer,
      paymentMethod: parsed.paymentMethod,
      paymentInUkraine: parsed.paymentInUkraine,
      needsPackaging: parsed.needsPackaging,
      sendInvoice: parsed.sendInvoice,
      invoiceEmail: parsed.invoiceEmail ?? null,
      places: parsed.places,
      createdById: userId,
      createdSource: 'worker',
      status: initialStatus,
      collectionMethod: parsed.collectionMethod ?? null,
      collectionPointId: parsed.collectionPointId ?? null,
      collectionDate: parsed.collectionDate ? new Date(parsed.collectionDate) : null,
      collectionAddress: parsed.collectionAddress ?? null,
    });

    // Send invoice SMS — best-effort, non-blocking. Real transport via Twilio
    // (TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER env vars).
    // Per ТЗ: «на телефонний номер 'Платник за доставку' відправляється
    // повідомлення». Without credentials, sender logs warning and continues.
    if (parsed.sendInvoice) {
      const { sendInvoiceEmail } = await import('@/lib/email/send-invoice');
      const payerClient = parsed.payer === 'receiver'
        ? await prisma.client.findUnique({ where: { id: parsed.receiverId }, select: { phone: true, firstName: true, lastName: true } })
        : await prisma.client.findUnique({ where: { id: parsed.senderId }, select: { phone: true, firstName: true, lastName: true } });
      const targetPhone = parsed.invoicePhone || payerClient?.phone;
      if (targetPhone) {
        void sendInvoiceEmail({
          to: targetPhone,
          parcelInternalNumber: created.internalNumber,
          parcelItn: created.itn,
          payerName: payerClient ? `${payerClient.lastName} ${payerClient.firstName}` : '',
          totalCost: created.totalCost,
          currency: parsed.declaredValueCurrency || 'EUR',
          declaredValue: parsed.declaredValue ?? null,
          insuranceCost: parsed.insuranceCost ?? null,
        }).catch((err) => logger.error('parcel.invoice.send_failed', err, { parcelId: created.id }));
      } else {
        logger.warn('parcel.invoice.no_phone', { parcelId: created.id });
      }
    }

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
    // Surface FK + business errors cleanly instead of a generic 500.
    const msg = err instanceof Error ? err.message : '';
    if (msg.startsWith('TRIP_NOT_ACCEPTING:')) {
      const tripStatus = msg.split(':')[1];
      const tripStatusLabel = tripStatus === 'completed' ? 'завершено' : 'скасовано';
      return NextResponse.json(
        { error: `Рейс уже ${tripStatusLabel} — нові посилки додавати не можна.` },
        { status: 409 }
      );
    }
    const fkErrors: Record<string, string> = {
      SENDER_NOT_FOUND: 'Відправника не знайдено',
      RECEIVER_NOT_FOUND: 'Отримувача не знайдено',
      SENDER_ADDRESS_NOT_FOUND: 'Адресу відправника не знайдено або належить іншому клієнту',
      RECEIVER_ADDRESS_NOT_FOUND: 'Адресу отримувача не знайдено або належить іншому клієнту',
      TRIP_NOT_FOUND: 'Рейс не знайдено',
      COLLECTION_POINT_NOT_FOUND: 'Пункт збору не знайдено',
    };
    if (fkErrors[msg]) {
      return NextResponse.json({ error: fkErrors[msg] }, { status: 404 });
    }
    logger.error('parcel.create.failed', err, { userId });
    return NextResponse.json(
      { error: 'Не вдалося створити посилку. Спробуйте ще раз.' },
      { status: 500 }
    );
  }
}
