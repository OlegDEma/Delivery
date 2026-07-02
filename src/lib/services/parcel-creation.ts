/**
 * Shared parcel-creation logic — used by both staff route (POST /api/parcels)
 * and client portal (POST /api/client-portal/orders).
 *
 * Guarantees (by running inside prisma.$transaction):
 *  - yearlySequence is upserted so 1 Jan of a new year doesn't blow up.
 *  - ITN collisions are retried (up to 5 attempts) in-transaction.
 *  - All side-effects (places, status history, address usage, short number
 *    counter, description suggestion) either succeed together or roll back.
 *
 * Returns the freshly-created parcel with its basic includes.
 */

import type { Country, Direction, ShipmentType, Payer, PaymentMethod, CreatedSource, ParcelStatus, CollectionMethod, DeliveryMethod } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';
import { calculateVolumetricWeight, volumetricWeightFromVolume, roundWeight } from '@/lib/utils/volumetric';
import { calculateParcelCost } from '@/lib/utils/pricing';
import { buildPricingInput } from '@/lib/utils/pricing-input';
import { toEur } from '@/lib/utils/currency';
import { generateInternalNumber, generatePlaceITN, withItnRetry } from '@/lib/utils/itn';
import { logger } from '@/lib/logger';

export interface ParcelPlaceInput {
  weight?: number;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  volume?: number | null;
  needsPackaging?: boolean;
}

export interface CreateParcelInput {
  senderId: string;
  senderAddressId?: string | null;
  receiverId: string;
  receiverAddressId?: string | null;
  tripId?: string | null;
  direction: Direction;
  shipmentType?: ShipmentType;
  description?: string | null;
  declaredValue?: number | null;
  declaredValueCurrency?: 'EUR' | 'UAH';
  /** When true, user explicitly opted in for insurance — overrides pricing config. */
  insurance?: boolean;
  /**
   * @deprecated Insurance cost is now computed from `insurance` + tariff
   * `insurancePercent`. Field kept so older callers don't break, but its
   * value is ignored — the calculator is the single source of truth.
   */
  insuranceCost?: number | null;
  payer?: Payer;
  paymentMethod?: PaymentMethod;
  paymentInUkraine?: boolean;
  needsPackaging?: boolean;
  /** ТЗ docx 01.07.26: opt-in «Доставка до порога будинку». */
  doorstepDelivery?: boolean;
  /**
   * Per ТЗ: при collectionMethod = courier_pickup — true якщо «2+ посилок
   * з цієї локації» (впливає на мінімальний тариф).
   */
  isMultiParcelPickup?: boolean | null;
  /** «Пакет» — money sender transfers to receiver (optional). 0/undef = no Пакет. */
  parcelMoneyAmount?: number | null;
  /**
   * Send invoice SMS on save (per ТЗ). The /api/parcels POST handler reads
   * this flag separately to call `invoice-sms.ts` after the parcel exists —
   * `createParcel()` itself doesn't fire SMS, since the recipient phone /
   * payer is fully derivable from the saved record.
   */
  sendInvoice?: boolean;
  places: ParcelPlaceInput[];
  createdById: string;
  createdSource: CreatedSource;
  status: ParcelStatus;
  statusNote?: string;
  // Collection (EU→UA only, enforced by caller)
  collectionMethod?: CollectionMethod | null;
  collectionPointId?: string | null;
  collectionDate?: Date | null;
  collectionAddress?: string | null;
}

export interface CreatedParcelSummary {
  id: string;
  itn: string;
  internalNumber: string;
  sequentialNumber: number;
  shortNumber: number | null;
  totalCost: number | null;
}

export async function createParcel(input: CreateParcelInput): Promise<CreatedParcelSummary> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const totalPlaces = input.places.length;

  // Compute aggregate weights + build place data (ITN is filled in inside tx).
  let totalWeight = 0;
  let totalVolWeight = 0;
  const placeBlueprints = input.places.map((p, i) => {
    const w = Number(p.weight) || 0;
    // ТЗ (docx 13.06.26): об'ємна вага НІКОЛИ не нульова. Беремо Д×Ш×В коли є
    // розміри, інакше — з прямо введеного об'єму (м³ × 250). Раніше при
    // введенні лише об'єму volW лишалась 0 → на детальній «0.00 кг» і
    // занижена вартість доставки.
    const volW = p.length && p.width && p.height
      ? calculateVolumetricWeight(Number(p.length), Number(p.width), Number(p.height))
      : p.volume
        ? volumetricWeightFromVolume(Number(p.volume))
        : 0;
    totalWeight += w;
    totalVolWeight += volW;
    return {
      placeNumber: i + 1,
      weight: roundWeight(w),
      length: p.length != null ? Number(p.length) : null,
      width: p.width != null ? Number(p.width) : null,
      height: p.height != null ? Number(p.height) : null,
      volume: p.volume != null ? Number(p.volume) : null,
      volumetricWeight: volW > 0 ? roundWeight(volW) : null,
      needsPackaging: !!p.needsPackaging,
    };
  });
  totalWeight = roundWeight(totalWeight);
  totalVolWeight = roundWeight(totalVolWeight);

  // Pre-validate FK references — Prisma errors otherwise leak as opaque 500.
  // Sender/receiver are checked separately for clearer error messages.
  const [senderCheck, receiverCheck] = await Promise.all([
    prisma.client.findFirst({ where: { id: input.senderId, deletedAt: null }, select: { id: true } }),
    prisma.client.findFirst({ where: { id: input.receiverId, deletedAt: null }, select: { id: true } }),
  ]);
  if (!senderCheck) throw new Error('SENDER_NOT_FOUND');
  if (!receiverCheck) throw new Error('RECEIVER_NOT_FOUND');
  if (input.senderAddressId) {
    const a = await prisma.clientAddress.findUnique({ where: { id: input.senderAddressId }, select: { id: true, clientId: true } });
    if (!a || a.clientId !== input.senderId) throw new Error('SENDER_ADDRESS_NOT_FOUND');
  }
  if (input.receiverAddressId) {
    const a = await prisma.clientAddress.findUnique({ where: { id: input.receiverAddressId }, select: { id: true, clientId: true } });
    if (!a || a.clientId !== input.receiverId) throw new Error('RECEIVER_ADDRESS_NOT_FOUND');
  }
  if (input.tripId) {
    const t = await prisma.trip.findUnique({ where: { id: input.tripId }, select: { id: true } });
    if (!t) throw new Error('TRIP_NOT_FOUND');
  }
  if (input.collectionPointId) {
    const c = await prisma.collectionPoint.findUnique({ where: { id: input.collectionPointId }, select: { id: true } });
    if (!c) throw new Error('COLLECTION_POINT_NOT_FOUND');
  }

  // Fetch receiver city / pricing inputs outside tx — read-only lookups.
  const [receiver, senderData, receiverAddrForPricing] = await Promise.all([
    prisma.client.findUnique({
      where: { id: input.receiverId },
      include: {
        addresses: {
          where: input.receiverAddressId ? { id: input.receiverAddressId } : undefined,
          orderBy: { usageCount: 'desc' },
          take: 1,
        },
      },
    }),
    prisma.client.findUnique({
      where: { id: input.senderId },
      include: {
        addresses: {
          where: input.senderAddressId ? { id: input.senderAddressId } : undefined,
          orderBy: { usageCount: 'desc' },
          take: 1,
        },
      },
    }),
    input.receiverAddressId
      ? prisma.clientAddress.findUnique({ where: { id: input.receiverAddressId } })
      : Promise.resolve(null),
  ]);
  const receiverCity = receiver?.addresses[0]?.city || 'Невідомо';

  // Pricing lookup. Priority:
  //  EU→UA: trip.country (EU side) → collectionPoint.country → senderAddr.country
  //  UA→EU: trip.country → receiverAddr.country
  // Sender's registered country may be UA even though they physically send from NL.
  let pricingCountry: Country | null = null;
  if (input.tripId) {
    const trip = await prisma.trip.findUnique({
      where: { id: input.tripId },
      select: { country: true, status: true },
    });
    // Reject parcel attachment to a finished/cancelled trip — illogical to add
    // new shipments to a trip that's already arrived or was cancelled.
    if (trip && (trip.status === 'completed' || trip.status === 'cancelled')) {
      throw new Error(`TRIP_NOT_ACCEPTING:${trip.status}`);
    }
    if (trip && trip.country !== 'UA') pricingCountry = trip.country;
  }
  if (!pricingCountry && input.direction === 'eu_to_ua' && input.collectionPointId) {
    const cp = await prisma.collectionPoint.findUnique({
      where: { id: input.collectionPointId },
      select: { country: true },
    });
    if (cp && cp.country !== 'UA') pricingCountry = cp.country;
  }
  if (!pricingCountry) {
    const addr = input.direction === 'eu_to_ua'
      ? (senderData?.addresses[0] ?? null)
      : (receiverAddrForPricing ?? receiver?.addresses[0] ?? null);
    const country = addr?.country ?? null;
    if (country && country !== 'UA') pricingCountry = country;
  }

  // Per ТЗ §11: «При отриманні з України та передачі в Україну одномоментно
  // з однієї локації — мінімальна вартість посилки 15€/10€». Ми це детектуємо
  // тут: чи є інша посилка цього клієнта в протилежному напрямку, створена
  // у вікні ±2 дні з тієї ж локації (collectionPointId або addresses).
  const isBothDirections = await detectBothDirections({
    senderId: input.senderId,
    receiverId: input.receiverId,
    direction: input.direction,
    collectionPointId: input.collectionPointId ?? null,
    senderAddressId: input.senderAddressId ?? null,
  });

  let deliveryCost = 0;
  let packagingCost = 0;
  let insuranceCost = 0;
  let addressDeliveryCost = 0;
  let pickupPointCost = 0;
  let parcelMoneyCost = 0;
  let doorstepCost = 0;
  let totalCost = 0;
  if (pricingCountry) {
    const config = await prisma.pricingConfig.findFirst({
      where: { country: pricingCountry, direction: input.direction, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (config) {
      const deliveryMethod = (receiverAddrForPricing?.deliveryMethod ?? receiver?.addresses[0]?.deliveryMethod) as DeliveryMethod | undefined;
      // Перевід declaredValue з UAH в EUR — інакше 2500 грн × 3% дають
      // 75 «EUR» страхування (бо весь розрахунок ведеться в EUR).
      const declaredValueEur = input.declaredValue
        ? await toEur(Number(input.declaredValue), input.declaredValueCurrency || 'EUR')
        : 0;
      const breakdown = calculateParcelCost(
        buildPricingInput(config),
        {
          actualWeight: totalWeight,
          volumetricWeight: totalVolWeight,
          declaredValue: declaredValueEur,
          // ТЗ: insurance/packaging — opt-in checkboxes. Default off when
          // caller didn't pass an explicit boolean (e.g. legacy admin form
          // before retrofit). Pricing config gates whether the option is
          // even allowed for the direction.
          insurance: input.insurance === true,
          needsPackaging: input.needsPackaging ?? false,
          // ТЗ docx 01.07.26: doorstep — за явним opt-in чекбоксом.
          isDoorstepDelivery: input.doorstepDelivery ?? false,
          isAddressDelivery: deliveryMethod === 'address',
          isPickupPoint:
            input.direction === 'eu_to_ua' && input.collectionMethod === 'pickup_point',
          isCourierPickup:
            input.direction === 'eu_to_ua' && input.collectionMethod === 'courier_pickup',
          isMultiParcelPickup:
            input.collectionMethod === 'courier_pickup' && !!input.isMultiParcelPickup,
          isBothDirections,
          parcelMoneyAmount: input.parcelMoneyAmount ? Number(input.parcelMoneyAmount) : 0,
          // Per ТЗ §49/§50 — знижена ціна за кг коли Отримувач у Львові.
          receiverCity: receiver?.addresses[0]?.city ?? null,
        }
      );
      deliveryCost = breakdown.deliveryCost;
      packagingCost = breakdown.packagingCost;
      doorstepCost = breakdown.doorstepCost;
      insuranceCost = breakdown.insuranceCost;
      addressDeliveryCost = breakdown.addressDeliveryCost;
      pickupPointCost = breakdown.pickupPointCost;
      parcelMoneyCost = breakdown.parcelMoneyCost;
      totalCost = breakdown.totalCost;
    } else {
      logger.warn('parcel.create.pricing_not_found', {
        country: pricingCountry, direction: input.direction,
      });
    }
  }

  // Now run the transactional bit: sequence + short number counter + create.
  const result = await prisma.$transaction(async (tx) => {
    // 1. Upsert yearlySequence row for the current year, incrementing counter.
    const sequence = await tx.yearlySequence.upsert({
      where: { year: currentYear },
      update: { lastNumber: { increment: 1 } },
      create: { year: currentYear, lastNumber: 1 },
    });
    const seqNum = sequence.lastNumber;
    const internalNumber = generateInternalNumber(seqNum, receiverCity, 1, totalPlaces, now);

    // 2. If attached to a trip, bump the appropriate short-number counter.
    let shortNumber: number | null = null;
    if (input.tripId) {
      const counterField = pickCounterField(input.direction, receiver?.addresses[0]?.country);
      if (counterField) {
        const updatedTrip = await tx.trip.update({
          where: { id: input.tripId },
          data: { [counterField]: { increment: 1 } },
        });
        const counterValue = (updatedTrip as unknown as Record<string, number>)[counterField];
        shortNumber = counterBase(counterField) + counterValue;
      }
    }

    // 3. Create parcel with ITN-retry.
    const parcel = await withItnRetry<{ id: string; itn: string }>(
      (itn) => tx.parcel.create({
        data: {
          itn,
          internalNumber,
          sequentialNumber: seqNum,
          shortNumber,
          direction: input.direction,
          senderId: input.senderId,
          senderAddressId: input.senderAddressId || null,
          receiverId: input.receiverId,
          receiverAddressId: input.receiverAddressId || null,
          tripId: input.tripId || null,
          shipmentType: input.shipmentType || 'parcels_cargo',
          description: input.description || null,
          declaredValue: input.declaredValue ? Number(input.declaredValue) : null,
          declaredValueCurrency: input.declaredValueCurrency || 'EUR',
          totalWeight,
          totalVolumetricWeight: totalVolWeight,
          totalPlacesCount: totalPlaces,
          payer: input.payer || 'sender',
          paymentMethod: input.paymentMethod || 'cash',
          paymentInUkraine: input.paymentInUkraine ?? false,
          needsPackaging: input.needsPackaging ?? false,
          doorstepDelivery: input.doorstepDelivery ?? false,
          deliveryCost: deliveryCost || null,
          packagingCost: packagingCost || null,
          doorstepCost: doorstepCost || null,
          insuranceCost: insuranceCost || null,
          insuranceApplied: input.insurance === true,
          addressDeliveryCost: addressDeliveryCost || null,
          pickupPointCost: pickupPointCost || null,
          isMultiParcelPickup:
            input.collectionMethod === 'courier_pickup'
              ? !!input.isMultiParcelPickup
              : null,
          parcelMoneyAmount:
            input.parcelMoneyAmount && Number(input.parcelMoneyAmount) > 0
              ? Number(input.parcelMoneyAmount)
              : null,
          parcelMoneyCost: parcelMoneyCost || null,
          totalCost: totalCost || null,
          collectionMethod: input.direction === 'eu_to_ua' ? (input.collectionMethod ?? null) : null,
          collectionPointId:
            input.direction === 'eu_to_ua' && input.collectionMethod === 'pickup_point'
              ? (input.collectionPointId ?? null) : null,
          collectionDate: input.collectionDate ?? null,
          collectionAddress:
            input.direction === 'eu_to_ua' && input.collectionMethod === 'courier_pickup'
              ? (input.collectionAddress ?? null) : null,
          status: input.status,
          createdSource: input.createdSource,
          createdById: input.createdById,
          places: {
            create: placeBlueprints.map(pb => ({
              ...pb,
              itnPlace: generatePlaceITN(itn, pb.placeNumber, totalPlaces),
              barcodeData: generatePlaceITN(itn, pb.placeNumber, totalPlaces),
            })),
          },
          statusHistory: {
            create: {
              status: input.status,
              changedById: input.createdById,
              notes: input.statusNote ?? 'Створено',
            },
          },
        },
        select: { id: true, itn: true },
      }),
      currentYear,
      seqNum,
    );

    // 4. Bump address usage counts.
    if (input.senderAddressId) {
      await tx.clientAddress.update({
        where: { id: input.senderAddressId },
        data: { usageCount: { increment: 1 } },
      });
    }
    if (input.receiverAddressId) {
      await tx.clientAddress.update({
        where: { id: input.receiverAddressId },
        data: { usageCount: { increment: 1 } },
      });
    }

    // 5. Save description as suggestion (best-effort).
    if (input.description) {
      await tx.descriptionSuggestion.upsert({
        where: { text: input.description },
        update: { usageCount: { increment: 1 } },
        create: { text: input.description },
      }).catch(() => { /* ignore */ });
    }

    return {
      id: parcel.id,
      itn: parcel.itn,
      internalNumber,
      sequentialNumber: seqNum,
      shortNumber,
      totalCost: totalCost || null,
    };
  }, {
    // The transaction can do several writes; give it extra time.
    timeout: 15_000,
    maxWait: 5_000,
  });

  logger.info('parcel.created', {
    parcelId: result.id, itn: result.itn, direction: input.direction,
    source: input.createdSource, userId: input.createdById,
  });

  return result;
}

/**
 * Pick the right short-number counter on the trip record based on direction
 * and receiver country. The city-based distinction (Vienna vs Linz) is a
 * TODO — needs product decision on how to detect.
 */
function pickCounterField(direction: Direction, receiverCountry: Country | null | undefined): string | null {
  if (direction === 'eu_to_ua') return 'shortNumberCounterEuUa';
  if (!receiverCountry) return 'shortNumberCounterGeo';
  switch (receiverCountry) {
    case 'NL': return 'shortNumberCounterNl';
    case 'AT': return 'shortNumberCounterVienna';
    default: return 'shortNumberCounterGeo';
  }
}

/** Offset added to the counter value to produce the final short-number range. */
function counterBase(counterField: string): number {
  switch (counterField) {
    case 'shortNumberCounterNl': return 0;
    case 'shortNumberCounterVienna': return 100;
    case 'shortNumberCounterLinz': return 200;
    case 'shortNumberCounterGeo': return 300;
    case 'shortNumberCounterEuUa': return 500;
    default: return 0;
  }
}

/**
 * Per ТЗ §11: «При отриманні з України та передачі в Україну одномоментно
 * з однієї локації — мінімальна вартість 15/10 €». Тобто коли клієнт
 * одночасно і відправляє в UA, і отримує з UA з тієї ж локації — діє
 * нижчий поріг.
 *
 * Детекція: шукаємо інші не-видалені посилки цього клієнта в ПРОТИЛЕЖНОМУ
 * напрямку, створені у вікні ±2 дні, де клієнт виступає в дзеркальній ролі
 * (sender↔receiver) — це означає що він і відправляє, і отримує. Локація
 * звіряється через collectionPointId (для eu_to_ua) або через senderAddressId
 * (як проксі — клієнт зазвичай користується тією ж адресою).
 *
 * Повертає true коли знайдено — тоді калькулятор застосує `minBothDirections`.
 */
async function detectBothDirections(args: {
  senderId: string;
  receiverId: string;
  direction: Direction;
  collectionPointId: string | null;
  senderAddressId: string | null;
}): Promise<boolean> {
  const oppositeDirection: Direction = args.direction === 'eu_to_ua' ? 'ua_to_eu' : 'eu_to_ua';
  const windowStart = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

  // Дзеркальна роль — той хто зараз sender, у протилежному напрямку має бути
  // receiver (бо саме він і отримує посилку «назад»).
  const mirrored = await prisma.parcel.findFirst({
    where: {
      deletedAt: null,
      direction: oppositeDirection,
      receiverId: args.senderId,
      // Локація має збігатись — або та сама точка збору, або та сама адреса.
      OR: [
        ...(args.collectionPointId ? [{ collectionPointId: args.collectionPointId }] : []),
        ...(args.senderAddressId ? [{ receiverAddressId: args.senderAddressId }] : []),
      ],
      createdAt: { gte: windowStart, lte: windowEnd },
    },
    select: { id: true },
  });
  return !!mirrored;
}
