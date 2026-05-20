# Pricing calculator

Single source of truth: `src/lib/utils/pricing.ts`. Helper: `src/lib/utils/pricing-input.ts` (maps `PricingConfig` row → `PricingConfigInput`).

## High-level flow

```
declaredValue (in declaredValueCurrency) ───► toEur() ─────────┐
                                                                │
weight × effectivePricePerKg ─► baseDeliveryCost                ▼
   (Lviv exception → lvivPricePerKg)  │                   insuranceCost
                                      ▼                         │
              max(baseDeliveryCost, applicable_minimum) ─► deliveryCost
                                       │                        │
                                       ▼                  packagingCost
                                  + parcelMoneyCost ◄─── parcelMoneyAmount × tier-percent / 100
                                       │
                                       ▼
                              ────► totalCost
```

## Inputs

`PricingConfigInput` (from `PricingConfig` Prisma row via `buildPricingInput()`):

| Field | Meaning |
|---|---|
| `pricePerKg` | EUR per kg of billable weight |
| `lvivPricePerKg` | ТЗ §49/§50 — reduced EUR/kg when receiver city is Lviv. `null`/`0` = no exception |
| `weightType` | `actual` | `volumetric` | `average` | `custom` — DB default is `custom` |
| `weightCustomFactualFraction` | 0..1, used when type=`custom` |
| `insuranceEnabled` | tariff-level toggle (is the option offered?) |
| `insurancePercent` | WHOLE percent (1.0 = 1%, NOT 0.01); converted from `insuranceRate * 100` |
| `packagingEnabled` | tariff-level toggle |
| `packagingPer10kg` | EUR per (full or partial) 10kg block |
| `packagingPrices` | LEGACY JSON `{"10":1,"20":2,"30+":5}` — fallback when `packagingPer10kg=0` |
| `addressDeliveryPrice` | MIN-floor for single-parcel courier-pickup |
| `pickupPointPrice` | MIN-floor for pickup-point hand-over |
| `minMultiPerAddress` | MIN-floor per parcel when multi-parcel pickup |
| `minBothDirections` | MIN-floor when sender both sends and receives same time |
| `parcelMoneyPercent` | WHOLE percent applied to «Пакет» sum — LOW tier (sum ≤ threshold) |
| `parcelMoneyPercentHigh` | ТЗ §53 — HIGH tier percent (sum > threshold); `0` → fallback to low tier |
| `parcelMoneyThreshold` | ТЗ §53 — EUR boundary between tiers; default 2000 |

`ParcelCostInput` per parcel:

| Field | Meaning |
|---|---|
| `actualWeight` | sum of `place.weight` |
| `volumetricWeight` | sum of `place.volumetricWeight` |
| `declaredValue` | **already in EUR** (caller converts via `toEur()`) |
| `insurance` | opt-in checkbox from form/saved `parcel.insuranceApplied` |
| `needsPackaging` | opt-in checkbox |
| `isAddressDelivery` | receiver chose «адреса» (vs Nova Poshta warehouse) |
| `isPickupPoint` | collection method = pickup_point |
| `isCourierPickup` | collection method = courier_pickup |
| `isMultiParcelPickup` | operator answered «2+ parcels» on courier_pickup |
| `isBothDirections` | sender both sends UA→EU and receives EU→UA from same location |
| `parcelMoneyAmount` | the cash sum sender transfers |
| `receiverCity` | ТЗ §49/§50 — receiver settlement; when `isLvivCity()` matches and tariff has `lvivPricePerKg`, the reduced rate applies |

## How weight is computed

`getBillableWeight(actual, volumetric, weightType, customFactualFraction)` in `src/lib/utils/volumetric.ts`:

```
if (actual >= volumetric) return actual;  // ТЗ rule 1: factual wins when bigger

switch (weightType) {
  case 'actual':    return volumetric;          // legacy «max» — DOES NOT MATCH ТЗ for v > a
  case 'volumetric': return volumetric;
  case 'average':   return (actual + volumetric) / 2;
  case 'custom':    return ffrac × actual + (1 − ffrac) × volumetric;  // ТЗ-correct
}
```

**Important:** the DB default is now `weightType='custom'` (migration `20260519120000_weight_type_custom_default` converted existing `actual` rows). `custom` with `weightCustomFactualFraction` is the ТЗ-correct behaviour. The `actual` legacy branch (returns `max`) is kept only for back-compat.

## Lviv exception (ТЗ §49/§50)

```
lvivException = isLvivCity(receiverCity) && tariff.lvivPricePerKg > 0
effectivePricePerKg = lvivException ? lvivPricePerKg : pricePerKg
baseDeliveryCost = billableWeight × effectivePricePerKg
```

`isLvivCity()` (in `pricing.ts`) matches `львів`/`lviv`/`львов`/`lwow`/`lwów` (lower-cased). The breakdown returns `pricePerKgApplied` + `lvivExceptionApplied`; `<CostCalculator>` shows a green «· Львів» hint. Configured per tariff in `/admin/pricing` («Ціна за кг — Львів», `0` disables).

## How the minimum is picked

Priority (in calculator):

1. `isBothDirections` AND `minBothDirections > 0` → use `minBothDirections` (label «Туди-сюди з локації»)
2. `isMultiParcelPickup` AND `minMultiPerAddress > 0` → use `minMultiPerAddress` (label «2+ посилок з локації»)
3. `isCourierPickup` AND `addressDeliveryPrice > 0` → use `addressDeliveryPrice` (label «Адресна доставка»)
4. `isPickupPoint` AND `pickupPointPrice > 0` → use `pickupPointPrice` (label «Пункт збору»)
5. `isAddressDelivery` AND `addressDeliveryPrice > 0` → use `addressDeliveryPrice` (covers ua_to_eu where receiver picks address delivery)

If `baseDeliveryCost >= minimumApplied`, the minimum is dropped (no floor needed).

`deliveryCost = max(baseDeliveryCost, minimumApplied)`.

## Insurance

```
if (insurance && tariff.insuranceEnabled && declaredValueEur > 0):
   insuranceCost = declaredValueEur × insurancePercent / 100
```

`insurancePercent` is **whole percent** (1.0 = 1%). The DB column `insuranceRate` is the fraction (0.01); `buildPricingInput` multiplies by 100.

**CRITICAL: declaredValueEur must be already converted from UAH if applicable.** Callers (parcel-creation, PATCH route, calculate route) all use `toEur(declaredValue, declaredValueCurrency)` before passing to the calculator.

## Packaging

```
if (needsPackaging && tariff.packagingEnabled):
  if (packagingPer10kg > 0):
    blocks = max(1, ceil(actualWeight / 10))
    packagingCost = blocks × packagingPer10kg
  else if (packagingPrices):
    packagingCost = getLegacyPackagingPrice(packagingPrices, actualWeight)
```

Legacy tier JSON: `{ "10": 1, "20": 2, "30+": 5 }` — find the lowest threshold ≥ weight; use «+» entry for over-max.

## Parcel money («Пакет») — two-tier (ТЗ §53)

```
if (parcelMoneyAmount > 0):
   threshold   = parcelMoneyThreshold > 0 ? parcelMoneyThreshold : 2000
   highPercent = parcelMoneyPercentHigh > 0 ? parcelMoneyPercentHigh : parcelMoneyPercent
   percent     = parcelMoneyAmount > threshold ? highPercent : parcelMoneyPercent
   parcelMoneyCost = parcelMoneyAmount × percent / 100   // only when percent > 0
```

Two rates: sum ≤ threshold → `parcelMoneyPercent` (low); sum > threshold → `parcelMoneyPercentHigh` (high). If the high rate is left at `0`, the calculator falls back to the low rate (single-tier behaviour). The amount itself is NOT in the delivery cost — only the % fee. The amount appears as `(1000)` on the printable receipt.

## Total

```
totalCost = roundMoney(deliveryCost + insuranceCost + packagingCost + parcelMoneyCost)
```

`roundMoney` uses multiply-round-divide to avoid IEEE-754 display artifacts.

## Where the calculator is invoked

1. **POST `/api/parcels/calculate`** — live preview from the form's `<CostCalculator>` component. Fetches `PricingConfig` row, builds input, returns breakdown.
2. **`createParcel()` in `src/lib/services/parcel-creation.ts`** — at parcel creation. Saves all cost components in the parcel row.
3. **PATCH `/api/parcels/[id]`** in `src/app/api/parcels/[id]/route.ts` — runs when `costAffectingTouched` is true. Reads fresh values from `body` (with fallback to saved values), recalculates, writes updated cost fields to the same PATCH transaction.

All three paths use `buildPricingInput()` + `calculateParcelCost()` — no duplication.

## ТЗ-specific defaults (seed values for fresh DB)

NL eu_to_ua: `pricePerKg=2`, `lvivPricePerKg=1.5`, `addressDeliveryPrice=30`, `pickupPointPrice=15`, `minMultiPerAddress=15`, `minBothDirections=15`.
AT eu_to_ua: `pricePerKg=1.5`, `lvivPricePerKg=1.0`, `addressDeliveryPrice=15`, `pickupPointPrice=10`, `minMultiPerAddress=10`, `minBothDirections=10`.
All seed rows: `weightType='custom'`. `parcelMoneyThreshold` defaults to 2000, `parcelMoneyPercent`/`parcelMoneyPercentHigh` to 0 (option off until admin configures).

Existing prod DB has older values (5 €/kg) — admin needs to update via `/admin/pricing`.

## Outstanding gaps (from `tz-audit.md`)

- **Lviv exception** — DONE (commit 4abaf2c).
- **Пакет% two-tier** — DONE (commit cb54577).
- **Weight default** — DONE: `custom` is the default (commit ffbf6d7).
- **Per-shipment-type pricing**: tariffs don't distinguish documents / tires / parcels. Still open.
