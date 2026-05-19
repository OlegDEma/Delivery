# Multi-location story (current + planned)

## Current state — single-Lviv-hub assumption baked into schema

The codebase assumes ONE warehouse in UA («Lviv») and ONE warehouse per EU country. Hard-coded points:

### 1. `ParcelStatus` enum values

```
at_lviv_warehouse    ← literally hardcoded city name in a status enum
at_eu_warehouse      ← which EU? unknown from status alone
```

If business opens a Kyiv office, there's no `at_kyiv_warehouse`. Would need an enum-value migration (PostgreSQL allows `ALTER TYPE ... ADD VALUE`).

### 2. `Country` enum

```
UA | NL | AT | DE
```

Adding a new country (Czech Republic, Poland, Italy) needs a migration. Can't be done via admin UI.

### 3. `Trip.shortNumberCounter*` — five hard-coded counter columns

```
shortNumberCounterNl       ← Netherlands
shortNumberCounterVienna   ← Vienna (Austria)
shortNumberCounterLinz     ← Linz (Austria) — separate from Vienna
shortNumberCounterGeo      ← Georgia? unused?
shortNumberCounterEuUa     ← generic EU→UA
```

`pickCounterField()` in `parcel-creation.ts` has a hard-coded switch. TODO comment says «Vienna vs Linz distinction is a TODO — needs product decision on how to detect».

### 4. `service_cities` is the closest thing to a `Location` table

Per ТЗ §E13, courier_pickup is only available for clients whose city is in `service_cities` with `acceptsCourierPickup=true`. Default seed: Lviv only.

This is the right idea but limited scope — only used for client portal restriction, not for «which hub does this parcel go through».

### 5. `CashRegister` — one global cash

No `locationId`. Can't answer «how much cash is in the Lviv office vs Amsterdam office».

## Planned model: `Location` entity

When business actually expands, this is the refactor:

```prisma
model Location {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name        String   // "Lviv Hub", "Amsterdam Warehouse"
  country     Country
  city        String
  address     String?
  type        LocationType // 'warehouse' | 'office' | 'pickup_point'
  parentId    String?  // for hierarchies (Amsterdam Warehouse → Amsterdam Office)
  isActive    Boolean  @default(true)
  // ... contact details, working hours, etc.
}

enum LocationType {
  warehouse
  office
  pickup_point
  collection_point
}
```

### Refactor steps (estimate: 2-3 days)

1. Create `Location` table. Backfill: insert «Lviv Hub» (UA), «Amsterdam Warehouse» (NL), «Vienna Warehouse» (AT), etc.
2. Add `Parcel.currentLocationId` foreign key. Backfill: parcels with status `at_lviv_warehouse` → Lviv Hub, etc.
3. Replace status enum values:
   - `at_lviv_warehouse` → `at_warehouse` (location-agnostic)
   - `at_eu_warehouse` → also `at_warehouse`
   - Parcel always carries `currentLocationId` for the actual location.
4. UI displays: «На складі: <Location.name>» instead of relying on status alone.
5. `Trip.shortNumberCounter*` → drop the five columns. Add `TripShortNumberCounter(tripId, locationId, counter)` table OR store as `Trip.shortNumberCounters Json`.
6. `CashRegister.locationId` — track which location holds the cash. Add «Close shift» / «Z-report» per location.
7. `PricingConfig` — optional `locationId` field for location-specific rates (e.g. different price in Kyiv office vs Lviv office).
8. Admin UI: `/admin/locations` CRUD.

## Why this isn't done yet

User said in current sessions: «в нас може бути 2 студії в різних локаціях, і треба щоб все коректно працювало». But the actual scope is still a single Lviv hub + a few EU points. Refactor risk > value at current scale.

Action plan when user says «зробити мульти-локацію»:

1. Read this doc.
2. Confirm scope: how many UA cities? How many EU points? Hierarchy?
3. Write migration with backfill SQL.
4. Plan a coordinated UI rollout — status labels change everywhere, screenshots will change.
5. Test that historical parcels still display correctly.

## Smaller wins available now (without full refactor)

If user wants the SMELL of multi-location without the full thing:

- Add `Parcel.currentLocationText` (free text) — operators can write «Lviv» or «Kyiv». Not structured but at least visible.
- Make `at_lviv_warehouse` status more generic in label («На складі») and rely on the text field for specifics.
- Add per-courier «home base» (`Profile.homeLocationId`) — drivers see their location's parcels first.

These are 1-day work and don't break the schema.
