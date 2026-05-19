# Pitfalls / recurring bugs in this project

Every fix in here has burned at least one session. Read before touching the affected file.

## 1. PATCH `/api/parcels/[id]` recalc gate

**Bug history:** Recalc lived inside `if (Array.isArray(body.places))`. Editing only `declaredValue` → DB had new value but `totalCost` stayed stale. Live calculator showed 33, saved 32. User screenshots got progressively angrier.

**Now:** flag `costAffectingTouched` is computed before the gate:

```ts
const costAffectingTouched =
  Array.isArray(body.places) ||
  body.declaredValue !== undefined ||
  body.insuranceApplied !== undefined ||
  body.needsPackaging !== undefined ||
  body.parcelMoneyAmount !== undefined ||
  body.collectionMethod !== undefined ||
  body.collectionPointId !== undefined;
```

If you add a new cost-affecting field to `Parcel` schema, add it here. The recalc itself sits OUTSIDE the `if (body.places)` block.

**Test:** open detail page → edit declaredValue from 200 to 300 → save → reload → totalCost should reflect 300×insurancePercent, not 200×insurancePercent.

## 2. Currency conversion for insurance

**Bug history:** UA-sender parcel had `declaredValue=2500 UAH`. Insurance computed as `2500 × 0.03 = 75 EUR`. Three times bigger than delivery cost.

**Now:** calculator never sees UAH. Callers convert via `toEur(amount, currency)` from `src/lib/utils/currency.ts`:

```ts
const declaredValueEur = await toEur(
  Number(input.declaredValue) || 0,
  input.declaredValueCurrency || 'EUR'
);
// pass declaredValueEur to calculateParcelCost
```

The helper reads `invoice_settings.uahPerEur` (admin-configurable, default 42).

**Test:** create UA→EU parcel, declaredValue=2500 UAH, insurance opted-in. With rate=42 and insurancePercent=1: should be `2500/42 × 1% ≈ 0.60 EUR`, not 25 EUR.

## 3. declaredValueCurrency display

**Related:** the parcel detail page must show the correct currency label. The formula:

```ts
const senderInUA = senderCountry === 'UA' || (!senderCountry && direction === 'ua_to_eu');
const declaredCurrency = senderInUA ? 'UAH' : 'EUR';
```

Before sender is picked → fall back to direction. After pick → use sender's country.

**The persisted `parcel.declaredValueCurrency` field is the source of truth for existing parcels.** Don't recompute from direction at display time — that breaks if sender is moved between regions.

## 4. Weight calculator default

**Bug:** `weightType='actual'` returns `max(a, v)` when `v > a`. ТЗ wants fraction-based combination.

**Current state:** unfixed. Existing tariffs need either:
- Migration: `actual` → `custom` with `factualFraction=0.5`. Risky data change.
- OR semantics change: `actual` to mean «always factual». Doesn't match ТЗ either.

**Workaround for now:** admin opens `/admin/pricing`, changes weightType to «Власна частка» per tariff.

If you implement the proper fix: write a migration that picks 0.5 as default fraction for tariffs that currently say `actual`. The legacy `volumetric` and `average` modes can stay for backward-compat (rare).

## 5. `react-hooks/set-state-in-effect` lint

**Pattern:** Next.js 16 lint plugin flags this. Many older components in this codebase trip it. New code MUST avoid synchronous `setState` inside `useEffect` body.

**Bad:**

```ts
useEffect(() => {
  setLoading(true);          // sync setState → trips the rule
  fetch(...).then(setData);
}, []);
```

**Good (async-only setState):**

```ts
useEffect(() => {
  let cancelled = false;
  (async () => {
    const res = await fetch(...);
    if (cancelled) return;
    setData(await res.json());
    setLoading(false);
  })();
  return () => { cancelled = true; };
}, []);
```

**Good (derive from props, gate effect on it):**

```ts
const shouldFetch = !!country && country !== 'UA' && actualWeight > 0;
useEffect(() => {
  if (!shouldFetch) return;
  // ...
}, [shouldFetch, ...]);
if (!shouldFetch) return null;  // derived render
```

See `src/components/parcels/cost-calculator.tsx` for the idiomatic pattern.

## 6. ClientSearch + edit modal

**Pattern:** When operator picks a client in search, it doesn't immediately set parent's `sender` state. It opens an edit-modal (`ClientCreateForm`) with prefilled data. Only after «Зберегти» the parent's state gets set.

**Trap:** if operator closes the modal without saving, parent's `sender` is still null even though there was «activity». Validation then says «Виберіть відправника». Fix: clear stale validation errors in `handleSenderSelect` / `handleReceiverSelect` (commit `f3b2470` does this).

## 7. Push hangs on Windows

**Pattern:** `git push` in `run_in_background: true` mode hangs forever because Git Credential Manager opens a GUI dialog that can't reach the agent. The push output stays at 0 bytes.

**Workaround:**

```bash
GIT_ASKPASS=true git push origin main
```

This makes Git complete synchronously using cached credentials. If credentials aren't cached, fail loud with `fatal: could not read Username` — ask user to run `git credential reject` and re-auth manually.

## 8. Address autocomplete needs country

`<AddressInput>` queries `/api/addresses/suggest?country=X&q=...`. If `country` prop is not set, the dropdown stays empty even if there are matching cities in the DB. So:

- Always pass a `country` prop. For pre-sender-pick state, use direction-based fallback (`direction === 'ua_to_eu' ? 'UA' : null`).
- For the `ClientCreateForm` modal, use the `country` state from the form's own dropdown.

`AddressEditor` (the wrapper around address fields used inline) has the same constraint — pass `country` from parent.

## 9. Multi-parcel pickup question is mandatory

When operator picks `collectionMethod=courier_pickup` in `/parcels/new`, the multi-parcel checkbox question MUST be answered. Submit blocked otherwise (commit `c584de5`). The state is `collection.isMultiParcelPickup: boolean | null`. Null = unanswered.

If you tweak the collection block, don't accidentally allow `null` through to submit — the tariff minimum calculation depends on this answer.

## 10. Lint warnings (pre-existing, don't worry about)

These are in the repo but NOT your fault. Don't try to fix as part of feature work:

- `STATUS_LABELS` unused import in `/parcels/[id]/page.tsx`
- `<img>` instead of `<Image />` in print page
- Various `set-state-in-effect` in `audit / cash-register / claims / journeys` lists

Fixing them is one-day cleanup work — separate PR. Build passes despite them.

## 11. Soft-deletes

`Parcel.deletedAt`, `Client.deletedAt` — these are soft-delete timestamps. Most queries should include `deletedAt: null` in the where-clause. Forget this and you'll show deleted parcels in lists.

Search the codebase for `deletedAt: null` to find the pattern.

## 12. The trip's `shortNumberCounter*` columns are city-specific hacks

`Trip.shortNumberCounterNl / Vienna / Linz / Geo / EuUa` — five separate counters for short-numbers per city. The `parcel-creation.ts` `pickCounterField` picks which one to increment based on direction + receiver country. There's a TODO comment about Vienna vs Linz not being detectable yet.

**Smell:** this should be a `(tripId, locationId) → counter` table, not five hard-coded columns. When you eventually add proper multi-location support (see `references/locations.md`), refactor this too.

## 13. `service_cities` is the gate for client portal courier_pickup

For client portal users in UA, `<CollectionBlock>` queries `/api/service-cities?forCourierPickup=1`, filters by `country='UA'` AND `city=sender.city` (case-insensitive). Only if a match exists is `courier_pickup` enabled.

Default seed has only `Львів`. If business expands to Kyiv, admin must add the row in `/admin/service-cities`.

## 14. The Lviv exception is missing

ТЗ §49/§50: NL → Lviv (receiver in Lviv) = 1.5 €/kg (not 2). AT → Lviv = 1.0 €/kg (not 1.5).

This is NOT implemented. The calculator currently uses the tariff's `pricePerKg` regardless of receiver city. Adding this needs:

1. Receiver city passed into `ParcelCostInput`.
2. New tariff fields: `lvivPricePerKg?` (or special-case in calculator).
3. UI to configure in `/admin/pricing`.

## 15. Two-tier «Пакет%»

ТЗ §53: separate rates for sums ≤ 2000 and > 2000. Currently one `parcelMoneyPercent` field. Schema change needed: `parcelMoneyPercentLow` + `parcelMoneyPercentHigh` (threshold at 2000).
