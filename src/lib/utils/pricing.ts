import { getBillableWeight } from './volumetric';

/**
 * Pricing inputs used by `calculateParcelCost`. Mirrors the persisted
 * `PricingConfig` row (Decimal columns are converted to plain `number` by
 * the caller).
 */
export interface PricingConfigInput {
  pricePerKg: number;
  /**
   * Per ТЗ §49/§50 — знижена ціна за кг коли Отримувач у Львові.
   * null/undefined = винятку немає.
   */
  lvivPricePerKg?: number | null;
  weightType: 'actual' | 'volumetric' | 'average' | 'custom';
  /** Used only when weightType='custom'. Частка фактичної ваги (0..1). */
  weightCustomFactualFraction?: number;

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

  /**
   * Per ТЗ — це не «надбавка», а МІНІМУМ для одиничної посилки коли кур'єр
   * заїжджає на адресу відправника. Діє як підлога: max(weight × pricePerKg,
   * addressDeliveryPrice).
   */
  addressDeliveryPrice: number;

  /** Те саме як addressDeliveryPrice, але для здачі/отримання на пункті збору. */
  pickupPointPrice: number;

  /**
   * Мінімум коли від ОДНОГО відправника забираємо 2+ посилок на РІЗНІ адреси
   * одержувачів. Діє як підлога per parcel.
   */
  minMultiPerAddress: number;

  /**
   * Мінімум коли клієнт ОДНОЧАСНО і відправляє в UA, і отримує з UA з тієї ж
   * локації. Діє як підлога per parcel.
   */
  minBothDirections: number;

  /**
   * Whole-percent rate applied to the «Пакет» amount.
   * Per ТЗ §53 — НИЖНІЙ tier: діє коли сума ≤ `parcelMoneyThreshold`.
   */
  parcelMoneyPercent: number;
  /**
   * Per ТЗ §53 — ВЕРХНІЙ tier «Пакет%»: діє коли сума > `parcelMoneyThreshold`.
   * 0/undefined → fallback на `parcelMoneyPercent` (один tier).
   */
  parcelMoneyPercentHigh?: number;
  /**
   * Per ТЗ §53 — межа (EUR) між нижнім і верхнім tier «Пакет%».
   * undefined → 2000 (значення з ТЗ).
   */
  parcelMoneyThreshold?: number;
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
   * Sender хоче, щоб ми приїхали на його адресу за посилкою (collection
   * method = courier_pickup). Діє як підлога addressDeliveryPrice.
   */
  isCourierPickup?: boolean;
  /**
   * При courier_pickup — оператор обрав «Дві або більше посилок» (per ТЗ).
   * Тоді замість addressDeliveryPrice діє minMultiPerAddress.
   */
  isMultiParcelPickup?: boolean;
  /**
   * Клієнт одночасно і відправляє в UA, і отримує з UA з тієї ж локації.
   * Діє як підлога minBothDirections (детекція — на бекенді при створенні).
   */
  isBothDirections?: boolean;
  /**
   * «Пакет» — money sender transfers to receiver. 0 / undefined = option not used.
   * The amount itself is NOT a delivery cost — only the % fee from it is.
   */
  parcelMoneyAmount?: number;
  /**
   * Населений пункт Отримувача. Per ТЗ §49/§50 — якщо це Львів і в тарифі
   * заданий `lvivPricePerKg`, застосовується знижена ціна за кг.
   */
  receiverCity?: string | null;
}

/**
 * Чи місто Отримувача — Львів (для ТЗ-винятку §49/§50). Нормалізуємо до
 * нижнього регістру + покриваємо латинку і поширені варіанти написання.
 */
export function isLvivCity(city: string | null | undefined): boolean {
  if (!city) return false;
  const n = city.trim().toLowerCase();
  return n === 'львів' || n === 'lviv' || n === 'львов' || n === 'lwow' || n === 'lwów';
}

export interface CostBreakdown {
  /** Фактична застосована ціна за кг (з урахуванням Львів-винятку §49/§50). */
  pricePerKgApplied: number;
  /** True коли спрацював Львів-виняток (знижена ціна за кг). */
  lvivExceptionApplied: boolean;
  /** weight × pricePerKg (без застосування мінімуму). Лишається для прозорості. */
  baseDeliveryCost: number;
  /** Який тариф-мінімум був застосований (0 якщо не діяв). */
  minimumApplied: number;
  /** Назва підлоги для UI («Адресна доставка», «Пункт збору» тощо). */
  minimumLabel: string | null;
  /**
   * Фактично нарахована вартість перевезення (з урахуванням мінімуму) =
   * max(baseDeliveryCost, minimumApplied).
   */
  deliveryCost: number;
  insuranceCost: number;
  packagingCost: number;
  /** @deprecated тепер вкладено в deliveryCost (мінімум). Завжди 0. */
  addressDeliveryCost: number;
  /** @deprecated тепер вкладено в deliveryCost (мінімум). Завжди 0. */
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
  // 1. Базова вартість перевезення = вага × ціна/кг.
  const billableWeight = getBillableWeight(
    parcel.actualWeight,
    parcel.volumetricWeight,
    config.weightType,
    config.weightCustomFactualFraction,
  );
  // Per ТЗ §49/§50: Отримувач у Львові → знижена ціна за кг (якщо задана).
  const lvivException = isLvivCity(parcel.receiverCity) && !!config.lvivPricePerKg && config.lvivPricePerKg > 0;
  const effectivePricePerKg = lvivException ? config.lvivPricePerKg! : config.pricePerKg;
  const baseDeliveryCost = roundMoney(billableWeight * effectivePricePerKg);

  // 2. Визначаємо релевантний мінімум-поріг. ТЗ — пріоритети:
  //    1) «Туди-сюди» (одночасний UA→EU + EU→UA з однієї локації)
  //    2) «2+ посилок з однієї локації» (multi-parcel courier_pickup)
  //    3) Single courier_pickup → addressDeliveryPrice
  //    4) Pickup point → pickupPointPrice
  //    5) Receiver address delivery → addressDeliveryPrice (історично)
  // У сумнівах беремо найнижчий ненульовий поріг — щоб клієнт не платив
  // зайве при подвійній підставі.
  let minimumApplied = 0;
  let minimumLabel: string | null = null;
  if (parcel.isBothDirections && config.minBothDirections > 0) {
    minimumApplied = config.minBothDirections;
    minimumLabel = 'Туди-сюди з локації';
  } else if (parcel.isMultiParcelPickup && config.minMultiPerAddress > 0) {
    minimumApplied = config.minMultiPerAddress;
    minimumLabel = '2+ посилок з локації';
  } else if (parcel.isCourierPickup && config.addressDeliveryPrice > 0) {
    minimumApplied = config.addressDeliveryPrice;
    minimumLabel = 'Адресна доставка';
  } else if (parcel.isPickupPoint && config.pickupPointPrice > 0) {
    minimumApplied = config.pickupPointPrice;
    minimumLabel = 'Пункт збору';
  } else if (parcel.isAddressDelivery && config.addressDeliveryPrice > 0) {
    // Якщо одержувач обрав адресну доставку (не НП), застосовуємо ту ж
    // підлогу. Це покриває напрям ua_to_eu, де sender = клієнт в UA,
    // а receiver — в EU з адресною доставкою.
    minimumApplied = config.addressDeliveryPrice;
    minimumLabel = 'Адресна доставка';
  }
  // Поріг не діє якщо базова вже більша.
  if (baseDeliveryCost >= minimumApplied) {
    minimumApplied = 0;
    minimumLabel = null;
  }
  const deliveryCost = roundMoney(Math.max(baseDeliveryCost, minimumApplied));

  // 3. Страхування — opt-in via checkbox, % from declaredValue.
  let insuranceCost = 0;
  if (parcel.insurance && config.insuranceEnabled && parcel.declaredValue > 0) {
    insuranceCost = roundMoney(parcel.declaredValue * (config.insurancePercent / 100));
  }

  // 4. Пакування — opt-in. € per (full or partial) 10 kg block.
  // Legacy fallback: tier table.
  // ТЗ §E4/§E14: «Увага — до обрахунку брати Розрахункову вагу» — пакування
  // рахується від billableWeight (розрахункової), НЕ від фактичної.
  let packagingCost = 0;
  if (parcel.needsPackaging && config.packagingEnabled) {
    if (config.packagingPer10kg > 0) {
      const blocks = Math.max(1, Math.ceil(billableWeight / 10));
      packagingCost = roundMoney(blocks * config.packagingPer10kg);
    } else if (config.packagingPrices) {
      packagingCost = roundMoney(getLegacyPackagingPrice(config.packagingPrices, billableWeight));
    }
  }

  // 5. «Пакет» (money transfer) — % fee. Per ТЗ §53 — два tier-и:
  //    сума ≤ поріг → parcelMoneyPercent; сума > поріг → parcelMoneyPercentHigh.
  //    Якщо верхній tier не заданий (0) — діє один tier (нижній).
  let parcelMoneyCost = 0;
  if (parcel.parcelMoneyAmount && parcel.parcelMoneyAmount > 0) {
    const threshold = config.parcelMoneyThreshold && config.parcelMoneyThreshold > 0
      ? config.parcelMoneyThreshold
      : 2000;
    const highPercent = config.parcelMoneyPercentHigh && config.parcelMoneyPercentHigh > 0
      ? config.parcelMoneyPercentHigh
      : config.parcelMoneyPercent;
    const appliedPercent = parcel.parcelMoneyAmount > threshold
      ? highPercent
      : config.parcelMoneyPercent;
    if (appliedPercent > 0) {
      parcelMoneyCost = roundMoney(parcel.parcelMoneyAmount * (appliedPercent / 100));
    }
  }

  const totalCost = roundMoney(
    deliveryCost + insuranceCost + packagingCost + parcelMoneyCost
  );

  return {
    pricePerKgApplied: effectivePricePerKg,
    lvivExceptionApplied: lvivException,
    baseDeliveryCost,
    minimumApplied,
    minimumLabel,
    deliveryCost,
    insuranceCost,
    packagingCost,
    // Lagacy: ці компоненти більше не нараховуються окремо — вони стали
    // мінімумом. Лишаємо у відповіді як 0, щоб не зламати legacy споживачів.
    addressDeliveryCost: 0,
    pickupPointCost: 0,
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
