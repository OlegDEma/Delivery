import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { ParcelStatus } from '@/generated/prisma/enums';
import type { Prisma } from '@/generated/prisma/client';
import { calculateParcelCost } from '@/lib/utils/pricing';
import { calculateVolumetricWeight, volumetricWeightFromVolume, roundWeight } from '@/lib/utils/volumetric';
import { requireRole, requireStaff } from '@/lib/auth/guards';
import { ADMIN_ROLES } from '@/lib/constants/roles';
import { parseBody, updateParcelSchema } from '@/lib/validators';
import { buildPricingInput } from '@/lib/utils/pricing-input';
import { toEur } from '@/lib/utils/currency';
import { logger } from '@/lib/logger';
import { writeAuditLog } from '@/lib/audit';
import { isAllowedTransition, isTerminal } from '@/lib/parcels/status-transitions';
import { isUuid } from '@/lib/validators/common';

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
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });

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
          postalCode: true,
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
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });
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
    // ТЗ: після «Доставлено» жодних змін статусу — навіть super_admin.
    if (isTerminal(parcel.status)) {
      return NextResponse.json(
        { error: 'Посилка має статус «Доставлено» — зміна статусу неможлива.' },
        { status: 409 }
      );
    }

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

    // ТЗ §E55–E61: статус «Доставлено» можна присвоїти ЛИШЕ після оплати.
    // Super_admin може обійти (виняткові ситуації), решта — ні.
    const deliveredStatuses: ParcelStatus[] = ['delivered_ua', 'delivered_eu'];
    if (deliveredStatuses.includes(body.status as ParcelStatus) && !parcel.isPaid && !isSuperAdmin) {
      return NextResponse.json(
        { error: 'Статус «Доставлено» можна присвоїти лише після прийняття оплати. Спершу прийміть оплату у блоці «Оплата».' },
        { status: 409 }
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
  if (body.npTtn !== undefined) {
    updateData.npTtn = body.npTtn;
    // Auto-transition: за ТЗ «На Новій пошті» — автоматичний статус що
    // замінює «В дорозі до України» одразу після того, як посилка отримала
    // ТТН НП. Виконуємо тільки коли TTN щойно додали (раніше не було) і
    // поточний статус — у фазі eu_to_ua до НП.
    const autoEligible: ParcelStatus[] = ['in_transit_to_ua', 'at_lviv_warehouse'];
    if (body.npTtn && !parcel.npTtn && autoEligible.includes(parcel.status)) {
      updateData.status = 'at_nova_poshta';
      updateData.statusHistory = {
        create: {
          status: 'at_nova_poshta',
          changedById: userId,
          notes: 'Автоматично: отримано ТТН Нової Пошти',
        },
      };
    }
  }
  if (body.tripId !== undefined) {
    if (body.tripId) {
      // Reject re-assignment to a finished/cancelled trip — same logic as on create.
      const trip = await prisma.trip.findUnique({
        where: { id: body.tripId },
        select: { status: true },
      });
      if (!trip) {
        return NextResponse.json({ error: 'Рейс не знайдено' }, { status: 404 });
      }
      if (trip.status === 'completed' || trip.status === 'cancelled') {
        const label = trip.status === 'completed' ? 'завершено' : 'скасовано';
        return NextResponse.json(
          { error: `Рейс уже ${label} — посилку додавати не можна.` },
          { status: 409 }
        );
      }
      updateData.trip = { connect: { id: body.tripId } };
    } else {
      updateData.trip = { disconnect: true };
    }
  }
  if (body.assignedCourierId !== undefined) {
    if (body.assignedCourierId) {
      const courier = await prisma.profile.findUnique({
        where: { id: body.assignedCourierId },
        select: { id: true, role: true },
      });
      if (!courier) {
        return NextResponse.json({ error: 'Кур\'єра не знайдено' }, { status: 404 });
      }
      if (courier.role !== 'driver_courier' && courier.role !== 'super_admin' && courier.role !== 'admin') {
        return NextResponse.json({ error: 'Користувач не може бути кур\'єром (роль не дозволяє)' }, { status: 400 });
      }
      updateData.assignedCourier = { connect: { id: body.assignedCourierId } };
    } else {
      updateData.assignedCourier = { disconnect: true };
    }
  }
  // ТЗ docx 02.07.26 (D2): зміна адреси/міста при редагуванні — прив'язуємо
  // посилку до НОВОГО запису адреси (створеного клієнтом), не мутуючи спільну
  // адресу (щоб не зачепити інші посилки на цю ж адресу).
  if (body.senderAddressId !== undefined && body.senderAddressId) {
    updateData.senderAddress = { connect: { id: body.senderAddressId } };
  }
  if (body.receiverAddressId !== undefined && body.receiverAddressId) {
    updateData.receiverAddress = { connect: { id: body.receiverAddressId } };
  }
  // ТЗ docx 15.07.26 (п.1): resolve-to-owner — при редагуванні сторони, коли
  // введений номер належить іншому запису Client, посилку перелінковуємо на
  // власника номера. Чиста зміна relation (вартість залежить від адреси, не
  // від id клієнта), тож перерахунок не потрібен.
  if (body.senderId !== undefined && body.senderId) {
    updateData.sender = { connect: { id: body.senderId } };
  }
  if (body.receiverId !== undefined && body.receiverId) {
    updateData.receiver = { connect: { id: body.receiverId } };
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
  if (body.insuranceApplied !== undefined) updateData.insuranceApplied = body.insuranceApplied;
  if (body.needsPackaging !== undefined) updateData.needsPackaging = body.needsPackaging;
  if (body.doorstepDelivery !== undefined) updateData.doorstepDelivery = body.doorstepDelivery;
  if (body.parcelMoneyAmount !== undefined) {
    updateData.parcelMoneyAmount = body.parcelMoneyAmount && Number(body.parcelMoneyAmount) > 0
      ? Number(body.parcelMoneyAmount)
      : null;
  }
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
  if (body.isMultiParcelPickup !== undefined) updateData.isMultiParcelPickup = body.isMultiParcelPickup;
  if (body.routeTaskStatus !== undefined) updateData.routeTaskStatus = body.routeTaskStatus || null;
  if (body.routeTaskFailReason !== undefined) updateData.routeTaskFailReason = body.routeTaskFailReason || null;
  if (body.routeTaskReschedDate !== undefined) {
    updateData.routeTaskReschedDate = body.routeTaskReschedDate ? new Date(body.routeTaskReschedDate) : null;
  }

  // Places update — replaces dimensions/weight per place; delete missing ones.
  // Підготовляємо оновлення місць (якщо є в body) ТА паралельно завжди
  // перераховуємо вартість, бо клієнт міг змінити лише оголошену вартість,
  // страхування, Пакет, спосіб прийому — усе це впливає на ціну.
  let placeUpdates: Array<{ id: string; data: Record<string, unknown> }> = [];
  let placesToDelete: string[] = [];
  let totalWeight = parcel.totalWeight ? Number(parcel.totalWeight) : 0;
  let totalVolWeight = parcel.totalVolumetricWeight ? Number(parcel.totalVolumetricWeight) : 0;

  if (Array.isArray(body.places)) {
    const incomingIds = new Set(
      body.places.map(p => p.id).filter((x): x is string => typeof x === 'string')
    );
    const existingIds = parcel.places.map(p => p.id);
    placesToDelete = existingIds.filter(eid => !incomingIds.has(eid));

    let tw = 0;
    let tv = 0;
    placeUpdates = body.places
      .filter(p => p.id)
      .map(p => {
        const w = Number(p.weight) || 0;
        const l = p.length != null ? Number(p.length) : null;
        const wd = p.width != null ? Number(p.width) : null;
        const h = p.height != null ? Number(p.height) : null;
        const vol = p.volume != null ? Number(p.volume) : null;
        // ТЗ (docx 13.06.26): при переході від Д/Ш/В до загального об'єму
        // береться ОСТАННЄ введене. Розміри мають пріоритет; коли їх стерли —
        // рахуємо з об'єму (× 250). Об'ємна вага ніколи не нульова коли є хоч
        // одне джерело.
        const volW = l && wd && h
          ? calculateVolumetricWeight(l, wd, h)
          : vol
            ? volumetricWeightFromVolume(vol)
            : 0;
        tw += w;
        tv += volW;
        return {
          id: p.id!,
          data: {
            weight: roundWeight(w),
            length: l,
            width: wd,
            height: h,
            volume: vol,
            volumetricWeight: volW > 0 ? roundWeight(volW) : null,
            ...(p.needsPackaging !== undefined ? { needsPackaging: p.needsPackaging } : {}),
          },
        };
      });

    totalWeight = roundWeight(tw);
    totalVolWeight = roundWeight(tv);
    updateData.totalWeight = totalWeight;
    updateData.totalVolumetricWeight = totalVolWeight;
  }

  // ВАЖЛИВО: recalc вартості — ВЖИВАЄТЬСЯ ЗАВЖДИ якщо в PATCH є хоча б одне
  // cost-affecting поле або зміна місць. До цього recalc стояв всередині
  // блоку `if (body.places)`, тож редагування лише `declaredValue` /
  // `insuranceApplied` / `parcelMoneyAmount` не оновлювало `totalCost`,
  // `insuranceCost` тощо — клієнт бачив один live-розрахунок, інший —
  // у блоці «Оплата». Це і був баг.
  const costAffectingTouched =
    Array.isArray(body.places) ||
    body.declaredValue !== undefined ||
    body.insuranceApplied !== undefined ||
    body.needsPackaging !== undefined ||
    body.doorstepDelivery !== undefined ||
    body.parcelMoneyAmount !== undefined ||
    body.collectionMethod !== undefined ||
    body.collectionPointId !== undefined ||
    body.isMultiParcelPickup !== undefined ||
    // ТЗ docx 02.07.26 (D2): зміна адреси впливає на країну тарифу/спосіб.
    body.senderAddressId !== undefined ||
    body.receiverAddressId !== undefined;

  if (costAffectingTouched) {
    try {
      // ТЗ docx 01.07.26 (C4-reopen): при зміні пункту збору перерахунок має
      // брати країну тарифу з НОВОГО пункту (свіже body), а не зі збереженого —
      // інакше зміна пункту на інший (наприклад іншої країни) рахує ціну за
      // старим тарифом. Fallback на збережений id, коли поле не торкалось.
      const effectiveCollectionPointId = body.collectionPointId !== undefined
        ? body.collectionPointId
        : parcel.collectionPointId;
      // ТЗ docx 02.07.26 (D2): при зміні адреси беремо НОВИЙ addressId зі свіжого
      // body, щоб перерахунок ішов за новим містом/країною.
      const effectiveSenderAddressId = body.senderAddressId !== undefined && body.senderAddressId
        ? body.senderAddressId : parcel.senderAddressId;
      const effectiveReceiverAddressId = body.receiverAddressId !== undefined && body.receiverAddressId
        ? body.receiverAddressId : parcel.receiverAddressId;
      const [trip, collectionPoint, senderAddr, receiverAddr] = await Promise.all([
        parcel.tripId
          ? prisma.trip.findUnique({ where: { id: parcel.tripId }, select: { country: true } })
          : Promise.resolve(null),
        effectiveCollectionPointId
          ? prisma.collectionPoint.findUnique({
              where: { id: effectiveCollectionPointId },
              select: { country: true },
            })
          : Promise.resolve(null),
        effectiveSenderAddressId
          ? prisma.clientAddress.findUnique({ where: { id: effectiveSenderAddressId } })
          : Promise.resolve(null),
        effectiveReceiverAddressId
          ? prisma.clientAddress.findUnique({ where: { id: effectiveReceiverAddressId } })
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
          // Recalc враховує СВІЖІ значення з body, з fallback на збережений
          // запис коли поле не торкалось у цьому PATCH.
          const declaredValue = body.declaredValue !== undefined
            ? (body.declaredValue ?? 0)
            : (parcel.declaredValue ?? 0);
          const insuranceApplied = body.insuranceApplied !== undefined
            ? body.insuranceApplied
            : parcel.insuranceApplied;
          const needsPackaging = body.needsPackaging !== undefined
            ? body.needsPackaging
            : parcel.needsPackaging;
          // ТЗ docx 01.07.26: doorstep — opt-in чекбокс.
          const doorstepDelivery = body.doorstepDelivery !== undefined
            ? body.doorstepDelivery
            : parcel.doorstepDelivery;
          const parcelMoneyAmount = body.parcelMoneyAmount !== undefined
            ? body.parcelMoneyAmount
            : parcel.parcelMoneyAmount;
          const collectionMethod = body.collectionMethod !== undefined
            ? body.collectionMethod
            : parcel.collectionMethod;
          // Конвертуємо declaredValue в EUR коли вказана UAH (per fix —
          // 2500 грн × 3% не повинні давати 75 EUR страхування).
          const declaredCurrency = parcel.declaredValueCurrency || 'EUR';
          const declaredValueEur = await toEur(Number(declaredValue) || 0, declaredCurrency);
          const breakdown = calculateParcelCost(
            buildPricingInput(pricing),
            {
              actualWeight: totalWeight,
              volumetricWeight: totalVolWeight,
              declaredValue: declaredValueEur,
              insurance: !!insuranceApplied,
              needsPackaging: !!needsPackaging,
              isDoorstepDelivery: !!doorstepDelivery,
              isAddressDelivery,
              isPickupPoint:
                parcel.direction === 'eu_to_ua' && collectionMethod === 'pickup_point',
              isCourierPickup:
                parcel.direction === 'eu_to_ua' && collectionMethod === 'courier_pickup',
              isMultiParcelPickup: body.isMultiParcelPickup !== undefined
                ? !!body.isMultiParcelPickup
                : !!parcel.isMultiParcelPickup,
              isBothDirections: false,
              parcelMoneyAmount: parcelMoneyAmount ? Number(parcelMoneyAmount) : 0,
              // Per ТЗ §49/§50 — Львів-виняток на ціну за кг.
              receiverCity: receiverAddr?.city ?? null,
            }
          );
          updateData.deliveryCost = breakdown.deliveryCost;
          updateData.insuranceCost = breakdown.insuranceCost;
          updateData.packagingCost = breakdown.packagingCost;
          updateData.doorstepCost = breakdown.doorstepCost;
          updateData.addressDeliveryCost = breakdown.addressDeliveryCost;
          updateData.pickupPointCost = breakdown.pickupPointCost;
          updateData.parcelMoneyCost = breakdown.parcelMoneyCost;
          updateData.totalCost = breakdown.totalCost;
        }
      }
    } catch (e) {
      logger.error('parcel.cost_recalc_failed', e, { parcelId: id });
      // Leave cost fields as-is; user can set manually.
    }
  }

  // Single transaction: places + parcel update.
  if (Array.isArray(body.places)) {
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

  // No places change — single update (recalc уже всередині updateData).
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
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });

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
