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
import { calculateParcelCost, type CostBreakdown } from '@/lib/utils/pricing';
import { buildPricingInput } from '@/lib/utils/pricing-input';
import { toEur } from '@/lib/utils/currency';
import { isPickupPointPricing, isAddressDeliveryPricing } from '@/lib/utils/pricing-flags';
import { generateInternalNumber, generatePlaceITN, buildItn10 } from '@/lib/utils/itn';
import { logger } from '@/lib/logger';
import { ensureJourneyNumbersForTrip } from '@/lib/services/journey-numbering';

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
  /** ТЗ docx 03.10.26 (п.2): номер ТТН Нової пошти, якщо Клієнт відправляє поштою. */
  npTtn?: string | null;
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
  /** ТЗ docx 12.10.26: номер у поїздці (з моменту прив'язки до рейсу). */
  journeyNumber: number | null;
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
  let tripCountry: Country | null = null;
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
    tripCountry = trip?.country ?? null;
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

  // ТЗ docx 20.10.26: розрахунок винесено в priceParcel — той самий виклик робить
  // редагування замовлення Клієнтом, тож сума після правки = сума при створенні.
  const { pricingCountry, breakdown } = await priceParcel({
    direction: input.direction,
    tripCountry,
    collectionPointId: input.collectionPointId ?? null,
    collectionMethod: input.collectionMethod ?? null,
    senderAddressCountry: senderData?.addresses[0]?.country ?? null,
    receiverAddress: receiverAddrForPricing ?? receiver?.addresses[0] ?? null,
    receiverCity: receiver?.addresses[0]?.city ?? null,
    totalWeight,
    totalVolWeight,
    declaredValue: input.declaredValue ?? null,
    declaredValueCurrency: input.declaredValueCurrency || 'EUR',
    insurance: input.insurance === true,
    needsPackaging: input.needsPackaging ?? false,
    doorstepDelivery: input.doorstepDelivery ?? false,
    isMultiParcelPickup: !!input.isMultiParcelPickup,
    parcelMoneyAmount: input.parcelMoneyAmount ?? null,
    isBothDirections,
  });
  const deliveryCost = breakdown?.deliveryCost ?? 0;
  const packagingCost = breakdown?.packagingCost ?? 0;
  const doorstepCost = breakdown?.doorstepCost ?? 0;
  const insuranceCost = breakdown?.insuranceCost ?? 0;
  // ТЗ docx 21.09.26 (п.4): страхування понад 50 € вмикається автоматично —
  // прапорець беремо з розрахунку, щоб у посилці стояло insuranceApplied=true.
  const insuranceAutoApplied = breakdown?.insuranceAutoApplied ?? false;
  const addressDeliveryCost = breakdown?.addressDeliveryCost ?? 0;
  const pickupPointCost = breakdown?.pickupPointCost ?? 0;
  const parcelMoneyCost = breakdown?.parcelMoneyCost ?? 0;
  const totalCost = breakdown?.totalCost ?? 0;

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

    // 3. ТЗ docx 07.10.26: 10-значний ІТН — напрямок + код ЄС-країни + глобальний
    //    порядковий номер (послідовність parcel_itn_seq, не обнуляється щороку) +
    //    контрольна цифра Луна. Номер детермінований, тож повторів-ретраїв не треба.
    //    ЄС-країна — та сама, що визначає тариф (рейс → пункт збору → адреса).
    const [{ nextval }] = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('parcel_itn_seq')`;
    const itn = buildItn10(input.direction, pricingCountry, Number(nextval));
    const parcel = await tx.parcel.create({
        data: {
          itn,
          // ТЗ docx 03.10.26 (п.2, п.4): ТТН, введений Клієнтом при відправці поштою.
          npTtn: input.npTtn?.trim() || null,
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
          insuranceApplied: input.insurance === true || insuranceAutoApplied,
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
          // Перевірка 22.09.26: спосіб передачі зберігаємо і для UA→EU (клієнт у Львові
          // обирає «Виклик курʼєра»/«Пошта» — раніше вибір мовчки губився і Працівник
          // не знав, як посилка потрапить на склад). Тарифні ознаки вище лишаються
          // лише для EU→UA — на вартість це не впливає. Пункт збору — суто EU.
          collectionMethod: input.collectionMethod ?? null,
          collectionPointId:
            input.direction === 'eu_to_ua' && input.collectionMethod === 'pickup_point'
              ? (input.collectionPointId ?? null) : null,
          collectionDate: input.collectionDate ?? null,
          collectionAddress:
            input.collectionMethod === 'courier_pickup'
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
      });

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

  // ТЗ docx 12.10.26: номер у поїздці — з моменту прив'язки до рейсу, хоч би хто
  // створив посилку (Клієнт, Працівник, авто-прив'язка). Помилка нумерації не має
  // зривати створення — на перегляді рейсу/посилки номер добереться ще раз.
  let journeyNumber: number | null = null;
  if (input.tripId) {
    try {
      await ensureJourneyNumbersForTrip(input.tripId);
      journeyNumber = (await prisma.parcel.findUnique({ where: { id: result.id }, select: { journeyNumber: true } }))?.journeyNumber ?? null;
    } catch (e) {
      logger.error('parcel.journey_number_failed', e, { parcelId: result.id });
    }
  }

  return { ...result, journeyNumber };
}

export interface PriceParcelInput {
  direction: Direction;
  /** Країна рейсу (якщо посилка прив'язана до рейсу). */
  tripCountry: Country | null;
  collectionPointId: string | null;
  collectionMethod: CollectionMethod | null;
  /** Країна адреси Відправника — для EU→UA, коли немає рейсу/пункту збору. */
  senderAddressCountry: Country | null;
  /** Адреса Отримувача: країна — для UA→EU, спосіб доставки — для мінімумів. */
  receiverAddress: { country: Country | null; deliveryMethod: DeliveryMethod | null } | null;
  /** Per ТЗ §49/§50 — знижена ціна за кг, коли Отримувач у Львові. */
  receiverCity: string | null;
  totalWeight: number;
  totalVolWeight: number;
  declaredValue: number | null;
  declaredValueCurrency: string;
  insurance: boolean;
  needsPackaging: boolean;
  doorstepDelivery: boolean;
  isMultiParcelPickup: boolean;
  parcelMoneyAmount: number | null;
  isBothDirections: boolean;
}

/**
 * Розрахунок вартості посилки за тарифом — спільний для створення (createParcel) і
 * редагування замовлення Клієнтом (ТЗ docx 20.10.26), щоб після правки сума була
 * рівно такою, якою була б при створенні з тими самими даними.
 *
 * Країна тарифу: рейс (ЄС) → для EU→UA пункт збору → адреса сторони в ЄС
 * (EU→UA — Відправник, UA→EU — Отримувач). Немає тарифу — breakdown = null.
 */
export async function priceParcel(input: PriceParcelInput): Promise<{
  pricingCountry: Country | null;
  breakdown: CostBreakdown | null;
}> {
  let pricingCountry: Country | null = null;
  if (input.tripCountry && input.tripCountry !== 'UA') pricingCountry = input.tripCountry;
  if (!pricingCountry && input.direction === 'eu_to_ua' && input.collectionPointId) {
    const cp = await prisma.collectionPoint.findUnique({
      where: { id: input.collectionPointId },
      select: { country: true },
    });
    if (cp && cp.country !== 'UA') pricingCountry = cp.country;
  }
  if (!pricingCountry) {
    const country = input.direction === 'eu_to_ua'
      ? input.senderAddressCountry
      : (input.receiverAddress?.country ?? null);
    if (country && country !== 'UA') pricingCountry = country;
  }
  if (!pricingCountry) return { pricingCountry, breakdown: null };

  const config = await prisma.pricingConfig.findFirst({
    where: { country: pricingCountry, direction: input.direction, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!config) {
    logger.warn('parcel.create.pricing_not_found', {
      country: pricingCountry, direction: input.direction,
    });
    return { pricingCountry, breakdown: null };
  }
  const deliveryMethod = input.receiverAddress?.deliveryMethod ?? undefined;
  // Перевід declaredValue з UAH в EUR — інакше 2500 грн × 3% дають
  // 75 «EUR» страхування (бо весь розрахунок ведеться в EUR).
  const declaredValueEur = input.declaredValue
    ? await toEur(Number(input.declaredValue), input.declaredValueCurrency || 'EUR')
    : 0;
  const breakdown = calculateParcelCost(
    buildPricingInput(config),
    {
      actualWeight: input.totalWeight,
      volumetricWeight: input.totalVolWeight,
      declaredValue: declaredValueEur,
      // ТЗ: insurance/packaging — opt-in checkboxes. Default off when
      // caller didn't pass an explicit boolean. Pricing config gates whether
      // the option is even allowed for the direction.
      insurance: input.insurance,
      needsPackaging: input.needsPackaging,
      // ТЗ docx 01.07.26: doorstep — за явним opt-in чекбоксом.
      isDoorstepDelivery: input.doorstepDelivery,
      // ТЗ docx 09.10.26: див. isAddressDeliveryPricing (UA→EU — усе, крім пункту видачі).
      isAddressDelivery: isAddressDeliveryPricing({ direction: input.direction, receiverDeliveryMethod: deliveryMethod }),
      // ТЗ docx 28.09.26: мінімум «Пункт збору» діє і коли Отримувач сам
      // забирає посилку з пункту видачі (не лише коли Відправник привозить).
      isPickupPoint: isPickupPointPricing({
        direction: input.direction,
        collectionMethod: input.collectionMethod,
        receiverDeliveryMethod: deliveryMethod,
      }),
      isCourierPickup:
        input.direction === 'eu_to_ua' && input.collectionMethod === 'courier_pickup',
      isMultiParcelPickup:
        input.collectionMethod === 'courier_pickup' && input.isMultiParcelPickup,
      isBothDirections: input.isBothDirections,
      parcelMoneyAmount: input.parcelMoneyAmount ? Number(input.parcelMoneyAmount) : 0,
      receiverCity: input.receiverCity,
    }
  );
  return { pricingCountry, breakdown };
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
export async function detectBothDirections(args: {
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
