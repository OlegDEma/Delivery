import type { PricingConfig } from '@/generated/prisma/client';
import type { PricingConfigInput } from './pricing';
import { parsePackagingPrices } from '@/lib/validators/common';

/**
 * Convert a Prisma `PricingConfig` row (with Decimal columns) into the plain
 * `PricingConfigInput` shape consumed by `calculateParcelCost`.
 *
 * Lives in its own module so both the live-preview route
 * (`/api/parcels/calculate`) and the persistence service (`parcel-creation`)
 * use exactly the same field mapping — keeps the calculator deterministic
 * across UI and DB.
 */
export function buildPricingInput(config: PricingConfig): PricingConfigInput {
  return {
    pricePerKg: Number(config.pricePerKg),
    weightType: config.weightType,
    weightCustomFactualFraction: Number(config.weightCustomFactualFraction),
    insuranceEnabled: config.insuranceEnabled,
    // DB stores fraction (0..1, e.g. 0.01 = 1%). Calculator wants whole-percent.
    insurancePercent: Number(config.insuranceRate) * 100,
    packagingEnabled: config.packagingEnabled,
    packagingPer10kg: Number(config.packagingPer10kg),
    packagingPrices: parsePackagingPrices(config.packagingPrices),
    addressDeliveryPrice: Number(config.addressDeliveryPrice),
    pickupPointPrice: Number(config.pickupPointPrice),
    minMultiPerAddress: Number(config.minMultiPerAddress),
    minBothDirections: Number(config.minBothDirections),
    parcelMoneyPercent: Number(config.parcelMoneyPercent),
  };
}
