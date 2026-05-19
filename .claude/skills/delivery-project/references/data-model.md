# Data model

Source of truth: `prisma/schema.prisma`. Generated client at `src/generated/prisma/` is committed.

## Core entities

### `Profile` (auth + role)

Mirrors a Supabase auth user (`id` is the auth UID). Stores role, full name, phone, avatar. Roles are the `UserRole` enum:

`super_admin / admin / cashier / warehouse_worker / driver_courier / client`

A profile relates to many parcels/trips/etc. through assignment/creation relations.

### `Client` (delivery customer, not an app user necessarily)

- `id, phone (unique), phoneNormalized, firstName, lastName, middleName?, email?`
- `clientType` (individual | organization), `organizationName?`
- `country?` (UA/NL/AT/DE)
- Has many `ClientAddress`.
- A login-capable client may have a matching `Profile` with the same phone; that's how the client portal links.

### `ClientAddress`

Multiple addresses per client. Holds `country, city, street, building, apartment, postalCode, landmark, npWarehouseNum, npPoshtamatNum, pickupPointText, deliveryMethod (address | np_warehouse | np_poshtamat | pickup_point), usageCount, isDefault`.

The `usageCount` is bumped on every parcel that uses this address — used to sort autocompletion.

### `Parcel` (the core)

Tons of fields. Key ones:

- `itn` (unique short-code, generated via `generateITN`, displayed everywhere)
- `internalNumber` (e.g. «88 Львів 1, 09.05.2026») — human-readable label combining sequence + city + place + date
- `sequentialNumber` (year-sequential, comes from `YearlySequence`)
- `shortNumber?` (per-trip per-city counter — `shortNumberCounterNl` etc on Trip)
- `direction` (eu_to_ua | ua_to_eu)
- `senderId, senderAddressId?, receiverId, receiverAddressId?`
- `shipmentType` (parcels_cargo | documents | tires_wheels)
- `description?, declaredValue?, declaredValueCurrency (default EUR)`
- `totalWeight, totalVolumetricWeight, totalPlacesCount`
- `payer (sender | receiver), paymentMethod (cash | cashless), paymentInUkraine`
- `needsPackaging` (boolean, packaging service opted in)
- **Cost components**: `deliveryCost, packagingCost, insuranceCost, addressDeliveryCost (legacy, =0 now), pickupPointCost (legacy), parcelMoneyCost, totalCost`. All EUR.
- `insuranceApplied` (boolean, opt-in flag)
- `parcelMoneyAmount?` (the «Пакет» sum sender transfers to receiver)
- `isMultiParcelPickup?` (boolean? — null when method != courier_pickup; affects min-tariff)
- `npTtn?, npTrackingStatus?`
- `status` (ParcelStatus enum — see `references/parcel-statuses.md`)
- `createdSource` (worker | client_web | client_telegram)
- `createdById, assignedCourierId, collectedById` (different roles)
- Collection fields (EU→UA only): `collectionMethod (pickup_point | courier_pickup | external_shipping | direct_to_driver), collectionPointId?, collectionDate?, collectionAddress?, collectedAt?`
- Route-task fields: `routeTaskStatus, routeTaskFailReason, routeTaskReschedDate`
- `tripId?` (which truck-load carries this parcel)
- `invoiceSentToPayerAt?` — bumped when SMS invoice was queued/sent
- `deletedAt?` — soft delete

### `ParcelPlace`

A parcel has 1..N places (boxes). Each has its own weight, dimensions, volume, ITN code, and `needsPackaging` (per-place flag — currently set always false on creation since per-place UI was removed per ТЗ §E11).

`itnPlace` is unique — printable QR code on the box.

### `ParcelStatusHistory`

Audit log of every status change. `parcelId, status, changedById, changedAt, notes, location`.

### `Trip` and `Journey`

- **Journey** = a round trip (UA → EU country → UA). Has `country, departureDate, euArrivalDate, euReturnDate, endDate, assignedCourier, secondCourier, vehicleInfo, passengerCapacity`.
- **Trip** = a one-way leg. Belongs to a Journey. Has `direction, country, departureDate, arrivalDate, status, journeyId?, assignedCourier, secondCourier, vehicleInfo, maxWeight, shortNumberCounter{Nl,Vienna,Linz,Geo,EuUa}` (per-city sequence counters for short-numbers).
- **Question**: do we need both? In practice operators mostly work with Trip. Journey is more of a planning grouping. Could collapse into one entity if it confuses people.

### `PricingConfig` (one row per country×direction)

Fields used by `calculateParcelCost`:

- `pricePerKg`
- `weightType` (actual | volumetric | average | custom)
- `weightCustomFactualFraction` (0..1, used when type=custom)
- `insuranceEnabled, insuranceRate (0..1 fraction)`
- `packagingEnabled, packagingPer10kg, packagingPrices (legacy JSON)`
- `addressDeliveryPrice` (minimum for courier_pickup at sender's address)
- `pickupPointPrice` (minimum for hand-over at pickup point)
- `minMultiPerAddress` (minimum per parcel when multiple parcels from same sender to different addresses)
- `minBothDirections` (minimum when same client both sends and receives simultaneously)
- `parcelMoneyPercent` (% from «Пакет» sum)
- `collectionDays` (Weekday[])
- `isActive`

### `CollectionPoint`

Physical hand-over points. Per country, with `name, city, address, postalCode, contactPhone, workingHours, workingDays (Weekday[]), latitude/longitude, notes, maxCapacity, isActive`.

### `ServiceCity` (added 2026-05-09)

Whitelist of cities where the client portal allows «Виклик кур'єра». `(country, city)` unique. Default seed: `(UA, Львів)`. In EU, all major cities — but if the row exists, it controls availability.

### `InvoiceSettings` (singleton)

`isSingleton` field is `true` for the one valid row. Stores:

- Bank details: `bankName, iban, accountHolder, swift`
- `smsTemplate` (Mustache-like `{{placeholder}}` syntax)
- `uahPerEur` (rate, default 42 — used by currency conversion)

### `SmsLog`

Audit of every SMS send attempt. `parcelId, toParty (sender|receiver), toPhone, body, provider (twilio|null), status (queued|sent|failed), errorMessage, sentById, createdAt`.

### `CashRegister`

Payment events. `parcelId?, amount, currency, paymentMethod, paymentType (income|expense|refund), description, receivedById, confirmed, confirmedById, confirmedAt`.

### `RouteTask` (daily courier sheet)

Per-day actions for a courier: `taskType (pickup|delivery|passenger), taskDate, clientId?, addressId?, addressText, postalCode, assignedCourierId, status, rescheduleDate?, failureReason, sortOrder, estimatedArrivalStart/End`.

### `WarehouseInventory`

Scan log: every time a place is scanned in/out at the warehouse — `parcelId, placeId, action (received|dispatched|scanned|packaged), scannedById, scannedAt, notes`.

### `Passenger`

People transported on a trip (not parcels). Separate vertical.

### `Claim`

Customer complaint about a parcel — damage / lost / delay / other. `parcelId, clientId?, type, description, resolution, status (open|in_progress|resolved|rejected)`.

### `AuditLog`

Immutable record of sensitive ops (deletions, role changes, manual cost overrides). Written by `logger.audit()`.

### `YearlySequence`

`{ year: 2026, lastNumber: 31 }`. Incremented inside the parcel-creation transaction to give each parcel a yearly sequential number.

### Other utility

- `DescriptionSuggestion` — distinct text values for autocomplete on the description field.
- `NpSyncLog` — Nova Poshta API call log.

## Enums you'll hit often

- `Country`: UA | NL | AT | DE (hard-coded; adding a new country needs a migration)
- `Direction`: eu_to_ua | ua_to_eu
- `DeliveryMethod`: address | np_warehouse | np_poshtamat | pickup_point
- `CollectionMethod`: pickup_point | courier_pickup | external_shipping | direct_to_driver
- `ShipmentType`: parcels_cargo | documents | tires_wheels
- `PaymentMethod`: cash | cashless
- `Payer`: sender | receiver
- `WeightType`: actual | volumetric | average | custom
- `ParcelStatus`: draft / at_collection_point / accepted_for_transport_to_ua / in_transit_to_ua / at_lviv_warehouse / at_nova_poshta / delivered_ua / accepted_for_transport_to_eu / in_transit_to_eu / at_eu_warehouse / delivered_eu / not_received / refused / returned
- `TripStatus`: planned | in_progress | completed | cancelled
- `RouteTaskStatus`: pending | address_confirmed | in_navigator | completed | not_completed | rescheduled
- `CashPaymentType`: income | expense | refund
- `CreatedSource`: worker | client_web | client_telegram
- `WarehouseAction`: received | dispatched | scanned | packaged
- `UserRole`: super_admin | admin | cashier | warehouse_worker | driver_courier | client
- `Weekday`: mon..sun
