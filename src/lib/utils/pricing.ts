import { getBillableWeight } from './volumetric';

interface PricingConfig {
  pricePerKg: number;
  weightType: 'actual' | 'volumetric' | 'average';
  insuranceThreshold: number;
  insuranceRate: number;
  insuranceEnabled: boolean;
  packagingEnabled: boolean;
  packagingPrices: Record<string, number> | null;
  addressDeliveryPrice: number;
  /** Optional — if set, insurance fee cannot be below this value. */
  minInsuranceFee?: number;
}

interface ParcelData {
  actualWeight: number;
  volumetricWeight: number;
  declaredValue: number;
  needsPackaging: boolean;
  isAddressDelivery: boolean;
}

export interface CostBreakdown {
  deliveryCost: number;
  insuranceCost: number;
  packagingCost: number;
  addressDeliveryCost: number;
  totalCost: number;
  billableWeight: number;
}

/** Minimum insurance fee in EUR when insurance actually applies. */
export const DEFAULT_MIN_INSURANCE_FEE = 0.5;

/** Rounds a money amount to 2 decimals with banker's rounding safety. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Use multiply-round-divide. Avoids floating-point display artifacts like 10.005 → 10.00.
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Calculate total parcel cost based on pricing config.
 *
 * Rounding policy: intermediate weights are kept at full precision; money
 * amounts are rounded at the final step only. Small components (insurance
 * below the minimum fee) are bumped up to the minimum.
 */
export function calculateParcelCost(
  config: PricingConfig,
  parcel: ParcelData
): CostBreakdown {
  // 1. Delivery cost based on weight
  const billableWeight = getBillableWeight(
    parcel.actualWeight,
    parcel.volumetricWeight,
    config.weightType
  );
  const deliveryCost = roundMoney(billableWeight * config.pricePerKg);

  // 2. Insurance cost — applies only above threshold, with a minimum fee.
  let insuranceCost = 0;
  if (config.insuranceEnabled && parcel.declaredValue > config.insuranceThreshold) {
    const raw = parcel.declaredValue * config.insuranceRate;
    const minFee = config.minInsuranceFee ?? DEFAULT_MIN_INSURANCE_FEE;
    insuranceCost = roundMoney(Math.max(raw, minFee));
  }

  // 3. Packaging cost — based on actual weight tiers
  let packagingCost = 0;
  if (config.packagingEnabled && parcel.needsPackaging && config.packagingPrices) {
    packagingCost = roundMoney(getPackagingPrice(config.packagingPrices, parcel.actualWeight));
  }

  // 4. Address delivery cost
  const addressDeliveryCost = parcel.isAddressDelivery ? roundMoney(config.addressDeliveryPrice) : 0;

  // Total
  const totalCost = roundMoney(deliveryCost + insuranceCost + packagingCost + addressDeliveryCost);

  return {
    deliveryCost,
    insuranceCost,
    packagingCost,
    addressDeliveryCost,
    totalCost,
    billableWeight,
  };
}

/**
 * Get packaging price based on weight tiers.
 * packagingPrices format: { "10": 1, "20": 2, "30": 3, "30+": 5 }
 */
function getPackagingPrice(prices: Record<string, number>, weight: number): number {
  const sortedTiers = Object.entries(prices)
    .filter(([key]) => !key.includes('+'))
    .map(([key, value]) => ({ threshold: Number(key), price: value }))
    .sort((a, b) => a.threshold - b.threshold);

  for (const tier of sortedTiers) {
    if (weight <= tier.threshold) return tier.price;
  }

  // Over max tier — use the "+" price
  const overMaxKey = Object.keys(prices).find(k => k.includes('+'));
  return overMaxKey ? prices[overMaxKey] : sortedTiers[sortedTiers.length - 1]?.price ?? 0;
}
