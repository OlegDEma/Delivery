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
import { calculateVolumetricWeight, roundWeight } from '@/lib/utils/volumetric';
import { calculateParcelCost } from '@/lib/utils/pricing';
import { generateITN, generateInternalNumber, generatePlaceITN, withItnRetry } from '@/lib/utils/itn';
import { parsePackagingPrices } from '@/lib/validators/common';
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
  payer?: Payer;
  paymentMethod?: PaymentMethod;
  paymentInUkraine?: boolean;
  needsPackaging?: boolean;
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
    const volW = p.length && p.width && p.height
      ? calculateVolumetricWeight(Number(p.length), Number(p.width), Number(p.height))
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
      select: { country: true },
    });
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

  let deliveryCost = 0, packagingCost = 0, insuranceCost = 0, addressDeliveryCost = 0, totalCost = 0;
  if (pricingCountry) {
    const config = await prisma.pricingConfig.findFirst({
      where: { country: pricingCountry, direction: input.direction, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (config) {
      const deliveryMethod = (receiverAddrForPricing?.deliveryMethod ?? receiver?.addresses[0]?.deliveryMethod) as DeliveryMethod | undefined;
      const breakdown = calculateParcelCost(
        {
          pricePerKg: Number(config.pricePerKg),
          weightType: config.weightType,
          insuranceThreshold: Number(config.insuranceThreshold),
          insuranceRate: Number(config.insuranceRate),
          insuranceEnabled: config.insuranceEnabled,
          packagingEnabled: config.packagingEnabled,
          packagingPrices: parsePackagingPrices(config.packagingPrices),
          addressDeliveryPrice: Number(config.addressDeliveryPrice),
        },
        {
          actualWeight: totalWeight,
          volumetricWeight: totalVolWeight,
          declaredValue: input.declaredValue ? Number(input.declaredValue) : 0,
          needsPackaging: input.needsPackaging ?? false,
          isAddressDelivery: deliveryMethod === 'address',
        }
      );
      deliveryCost = breakdown.deliveryCost;
      packagingCost = breakdown.packagingCost;
      insuranceCost = breakdown.insuranceCost;
      addressDeliveryCost = breakdown.addressDeliveryCost;
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
          totalWeight,
          totalVolumetricWeight: totalVolWeight,
          totalPlacesCount: totalPlaces,
          payer: input.payer || 'sender',
          paymentMethod: input.paymentMethod || 'cash',
          paymentInUkraine: input.paymentInUkraine ?? false,
          needsPackaging: input.needsPackaging ?? false,
          deliveryCost: deliveryCost || null,
          packagingCost: packagingCost || null,
          insuranceCost: insuranceCost || null,
          addressDeliveryCost: addressDeliveryCost || null,
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
