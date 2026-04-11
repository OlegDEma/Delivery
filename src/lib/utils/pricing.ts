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

/**
 * Calculate total parcel cost based on pricing config
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
  const deliveryCost = Number((billableWeight * config.pricePerKg).toFixed(2));

  // 2. Insurance cost
  let insuranceCost = 0;
  if (config.insuranceEnabled && parcel.declaredValue > config.insuranceThreshold) {
    insuranceCost = Number((parcel.declaredValue * config.insuranceRate).toFixed(2));
  }

  // 3. Packaging cost
  let packagingCost = 0;
  if (config.packagingEnabled && parcel.needsPackaging && config.packagingPrices) {
    packagingCost = getPackagingPrice(config.packagingPrices, parcel.actualWeight);
  }

  // 4. Address delivery cost
  const addressDeliveryCost = parcel.isAddressDelivery ? config.addressDeliveryPrice : 0;

  // Total
  const totalCost = Number((deliveryCost + insuranceCost + packagingCost + addressDeliveryCost).toFixed(2));

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
 * Get packaging price based on weight tiers
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
