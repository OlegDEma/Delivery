import { getBillableWeight } from './volumetric';

/**
 * Pricing inputs used by `calculateParcelCost`. Mirrors the persisted
 * `PricingConfig` row (Decimal columns are converted to plain `number` by
 * the caller).
 */
export interface PricingConfigInput {
  pricePerKg: number;
  weightType: 'actual' | 'volumetric' | 'average';

  /** Whether the «Страхування» option is offered for this direction. */
  insuranceEnabled: boolean;
  /** Whole-percent rate applied to declaredValue when insurance is opted in. */
  insurancePercent: number;

  /** Whether the «Пакування» option is offered for this direction. */
  packagingEnabled: boolean;
  /** € charged per each (full or partial) 10 kg block when needsPackaging=true. */
  packagingPer10kg: number;
  /**
   * Legacy tiered packaging prices (e.g. {"10":1,"20":2,"30+":5}). Used as
   * a fallback when `packagingPer10kg` is 0 and `packagingPrices` is set.
   * New tariffs should leave this null.
   */
  packagingPrices?: Record<string, number> | null;

  /** Address delivery surcharge (flat). */
  addressDeliveryPrice: number;

  /** Pickup-point hand-off fee (flat, EU→UA only). */
  pickupPointPrice: number;

  /** Whole-percent rate applied to the «Пакет» amount. */
  parcelMoneyPercent: number;
}

/** Per-parcel inputs for the cost calculation. All booleans are explicit. */
export interface ParcelCostInput {
  actualWeight: number;
  volumetricWeight: number;
  declaredValue: number;

  /** User opted in for insurance via checkbox. */
  insurance: boolean;
  /** User opted in for packaging via checkbox. */
  needsPackaging: boolean;
  /** Receiver chose address delivery (vs NP warehouse / poshtomat). */
  isAddressDelivery: boolean;
  /** EU→UA parcel handed over at a pickup point. */
  isPickupPoint: boolean;
  /**
   * «Пакет» — money sender transfers to receiver. 0 / undefined = option not used.
   * The amount itself is NOT a delivery cost — only the % fee from it is.
   */
  parcelMoneyAmount?: number;
}

export interface CostBreakdown {
  deliveryCost: number;
  insuranceCost: number;
  packagingCost: number;
  addressDeliveryCost: number;
  pickupPointCost: number;
  parcelMoneyCost: number;
  totalCost: number;
  billableWeight: number;
}

/** Rounds a money amount to 2 decimals. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Multiply-round-divide. Avoids floating-point display artifacts like
  // 10.005 → 10.00 (which IEEE-754 may otherwise produce).
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Calculate total parcel cost. Each component is computed independently and
 * the total is rounded once at the end. Callers convert Prisma Decimal to
 * plain numbers before passing them in.
 */
export function calculateParcelCost(
  config: PricingConfigInput,
  parcel: ParcelCostInput
): CostBreakdown {
  // 1. Delivery — weight × price/kg.
  const billableWeight = getBillableWeight(
    parcel.actualWeight,
    parcel.volumetricWeight,
    config.weightType
  );
  const deliveryCost = roundMoney(billableWeight * config.pricePerKg);

  // 2. Insurance — opt-in via checkbox, % from declaredValue.
  // ТЗ: безумовне +3% скасовано — додається ТІЛЬКИ якщо клієнт відмітив.
  let insuranceCost = 0;
  if (parcel.insurance && config.insuranceEnabled && parcel.declaredValue > 0) {
    insuranceCost = roundMoney(parcel.declaredValue * (config.insurancePercent / 100));
  }

  // 3. Packaging — opt-in. New: € per (full or partial) 10 kg block.
  // Legacy fallback: tier table (used while older tariffs are still in DB).
  let packagingCost = 0;
  if (parcel.needsPackaging && config.packagingEnabled) {
    if (config.packagingPer10kg > 0) {
      const blocks = Math.max(1, Math.ceil(parcel.actualWeight / 10));
      packagingCost = roundMoney(blocks * config.packagingPer10kg);
    } else if (config.packagingPrices) {
      packagingCost = roundMoney(getLegacyPackagingPrice(config.packagingPrices, parcel.actualWeight));
    }
  }

  // 4. Address delivery surcharge.
  const addressDeliveryCost = parcel.isAddressDelivery ? roundMoney(config.addressDeliveryPrice) : 0;

  // 5. Pickup-point hand-off fee.
  const pickupPointCost = parcel.isPickupPoint ? roundMoney(config.pickupPointPrice) : 0;

  // 6. «Пакет» (money transfer) — % fee from the amount.
  let parcelMoneyCost = 0;
  if (parcel.parcelMoneyAmount && parcel.parcelMoneyAmount > 0 && config.parcelMoneyPercent > 0) {
    parcelMoneyCost = roundMoney(parcel.parcelMoneyAmount * (config.parcelMoneyPercent / 100));
  }

  const totalCost = roundMoney(
    deliveryCost +
    insuranceCost +
    packagingCost +
    addressDeliveryCost +
    pickupPointCost +
    parcelMoneyCost
  );

  return {
    deliveryCost,
    insuranceCost,
    packagingCost,
    addressDeliveryCost,
    pickupPointCost,
    parcelMoneyCost,
    totalCost,
    billableWeight,
  };
}

/**
 * Legacy packaging price lookup. Format: {"10":1, "20":2, "30":3, "30+":5}.
 * Used only when `packagingPer10kg` is 0 in the config — kept for tariffs
 * that haven't been migrated to the flat €/10kg model yet.
 */
function getLegacyPackagingPrice(prices: Record<string, number>, weight: number): number {
  const sortedTiers = Object.entries(prices)
    .filter(([key]) => !key.includes('+'))
    .map(([key, value]) => ({ threshold: Number(key), price: value }))
    .sort((a, b) => a.threshold - b.threshold);

  for (const tier of sortedTiers) {
    if (weight <= tier.threshold) return tier.price;
  }
  // Above the highest tier — use the «+» price if present, else last tier.
  const overMaxKey = Object.keys(prices).find(k => k.includes('+'));
  return overMaxKey ? prices[overMaxKey] : sortedTiers[sortedTiers.length - 1]?.price ?? 0;
}
