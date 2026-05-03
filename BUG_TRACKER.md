# QA Pass — Full app sweep — 2026-05-02

## Test cases run

### T1: Auth ✅
- /login renders, valid + invalid creds tested ("Невірний email або пароль" message correct)
- /register renders with PhoneInput
- /forgot-password renders
- /reset-password renders with proper "посилання недійсне" if no token
- Logout button works

### T2: /parcels list ✅
- 9 parcels visible
- Format «Кому/Куди/Від кого/Звідки» — receiver first, per ТЗ ✅
- Search filter (text) — works (filtered to 1 result, then back to 9)
- Status filter dropdown — 12 options visible incl. virtual ones
- Date filter with X-clear button
- Courier filter — defaults to «Без кур'єра», all options
- Bulk select via checkbox — bulk action bar appears with «Вибрано: 1»

### T3: /parcels/new full flow ✅
- Empty submit → «Спочатку виберіть отримувача» error UI
- Required validation: senderId/receiverId enforced via API
- Insurance toggle: 100 EUR → +3 EUR, 13 EUR total ✅
- Insurance OFF: 10 EUR total (no 3%)
- Currency switches: UAH for UA sender, EUR for EU sender
- localStorage direction persisted across reloads (eu_to_ua → ua_to_eu)
- localStorage lastEuCountry remembered

### T4: /parcels/[id] ✅
- Detail page with status history
- Cost breakdown rendered (Доставка, Страхування, Пакування, Всього)
- Status change dropdown with allowed transitions
- «Прийняти оплату» dialog opens, fields rendered

### T5: /clients list ✅
- 12 clients visible
- Search by «Демський» → filtered to 1 (initial confusion: was filling sidebar global search; correct field works)

### T6: /clients/[id] ✅
- Edit form: PhoneInput UA+380 with current number (0 stripped)
- Address inline edit: AddressEditor with «Адреса» selector → 3 options
- Saved as pickup_point + «Біля ТРЦ Forum, 2 поверх» (from earlier test)
- «+ Адреса» dialog: AddressEditor with Index/City/Street/Building/Landmark
- Tooltip on «Індекс» renders via portal — NOT clipped

### T7: Admin pages ✅
- /admin/users: PhoneInput in create + edit modals, full table
- /admin/pricing: section «Правила розрахункової ваги» with formula + types + warning
- /admin/statuses: status dictionary with allowed transitions
- /admin/import: import CSV form
- /admin/collection-points: PhoneInput on full row (after fix)

### T8: Logistics ✅
- /trips: 7 trips with direction/status/dates
- /trips/[id]: detail renders («Нідерланди → UA»)
- /journeys: «Поїздки» journey cycles
- /routes: «Маршрутний лист» (no parcels for date)
- /calendar: «Календар рейсів»

### T9: Warehouse ✅
- /warehouse: status groups
- /warehouse/scan: «Сканер складу» with scan options
- /scan: QR scanner

### T10: Finance ✅
- /cash-register: 900 EUR прихід + entries list
- /debts: 2 boржників — 130 EUR total
- /reports: 4 tabs (Склад/Кур'єр/Рейс/Фінанси) all working
- /analytics: month-over-month, top clients, trip utilization

### T11: Passengers ✅
- Empty page «Немає рейсів» (only future trips shown — none in DB seed)
- PhoneInput in form (verified earlier)

### T12: Client portal ✅
- /my-orders: list of orders with «Кому/Від» format
- /my-parcels: redirects to /my-orders for sender-only client
- /new-order: full form with PhoneInput + 3 collection options + «Виберіть напрямок»
- E2E POST /api/client-portal/orders → 201 created (verified previously)

### T13: Public tracking ✅
- /tracking: by ITN works, shows status history

### T14: Backend API ✅
- All GET endpoints return 200
- POST validation:
  - Empty body → «senderId: Invalid input»
  - Empty places → «Додайте хоча б одне місце»
  - Negative declaredValue → «Сума не може бути від'ємною»
  - Invalid email for invoice → «invoiceEmail: Invalid email address»
- bulk-paid empty → «parcelIds: expected array»
- bulk-status empty → «Вкажіть посилки та статус»
- POST /api/clients with empty → «Телефон, ім'я та прізвище обов'язкові»
- POST /api/clients with valid → 201 created
- POST /api/descriptions → 200 OK
- PATCH /api/pricing without ID → «ID обов'язковий»

## Bugs Found + Fixed (this session)

### B1 ✅ FIXED — FieldHint tooltip clipping in Dialog
- **Where:** /clients, /clients/[id], /parcels/new, /admin/pricing modals
- **Cause:** `position: fixed` re-anchored to Dialog's transformed ancestor per CSS spec
- **Fix:** Wrapped tooltip in `createPortal(document.body)` — see `src/components/shared/field-hint.tsx`

### B2 ✅ FIXED — PhoneInput layout squeeze in /admin/collection-points
- **Where:** «Новий пункт збору» modal
- **Symptom:** Phone input was in `grid-cols-2` next to «Поштовий код» — placeholder «Введіть номер без нуля» was clipped to «Вве…»
- **Fix:** Pulled PhoneInput out of grid into its own row — see `src/app/(dashboard)/admin/collection-points/page.tsx`

### B3 ✅ FIXED — Hydration mismatch on /parcels/new direction
- **Cause:** Lazy `useState` init read localStorage during render → SSR mismatch
- **Fix:** Initialize with default, set from localStorage in `useEffect` post-mount

### B5 ✅ FIXED — /api/clients POST accepted unbounded firstName/lastName
- **Symptom:** No length validation; 500-char names saved silently → broke list layout
- **Fix:** Added Zod `createClientSchema` with sane max-length on all fields

### B11 ✅ FIXED — Race condition on POST /api/clients with same phone
- **Symptom:** Two concurrent POSTs with same phone — both pass the findUnique check, second hits unique-constraint, route doesn't catch → 500.
- **Fix:** Wrapped `prisma.client.create` in try/catch — Prisma P2002 error code translated to clean 409 «Клієнт з таким номером вже існує».

### B13 ✅ FIXED — DELETE/PATCH non-existent user → 500 with empty body
- **Where:** /api/users/[id] DELETE + PATCH
- **Fix:** Pre-flight `prisma.profile.findUnique` returns 404 «Користувача не знайдено» before update/delete.

### B14 ✅ FIXED — PATCH non-existent trip → 500
- **Where:** /api/trips/[id] PATCH
- **Fix:** Pre-flight existence check before update.

### B17 ✅ FIXED — PATCH /api/clients/[id] with phone collision → 500
- **Symptom:** Updating phone to one already used by another client → P2002 → opaque 500.
- **Fix:** Pre-flight existence check (404). Wrap `prisma.client.update` in try/catch — P2002 → 409 «Клієнт з таким номером вже існує».

### B23 ✅ FIXED — POST /api/cash with non-existent parcelId → 500
- **Fix:** Pre-flight parcel exists check; returns 404 «Посилку не знайдено».

### B25 ✅ FIXED — PATCH /api/pricing with non-existent id → 500
- **Fix:** UUID format check + pre-flight findUnique returns 404 «Конфіг не знайдено».

### B26 ✅ FIXED — POST /api/users accepted invalid role → 500
- **Symptom:** `role: 'hacker'` passed validation, then Prisma enum constraint exploded.
- **Fix:** Whitelist of 6 valid roles, rejects with 400 before Supabase create.

### B29 ✅ FIXED — 8 endpoints leaked 500 on missing/invalid JSON body
- **Affected:** /api/clients (POST + PATCH /[id]), /api/claims (POST+PATCH), /api/collection-points (POST + PATCH), /api/descriptions (POST), /api/journeys (POST+PATCH), /api/pricing (PATCH), /api/trips (POST + PATCH /[id]), /api/users (POST + PATCH /[id])
- **Symptom:** `await request.json()` threw on empty/non-JSON body → 500 with empty error.
- **Fix:** Wrapped each in try/catch returning 400 «Очікується JSON body». Added `safeJson()` helper in validators/common.ts for future use.

### B28 ✅ FIXED — POST /api/import without JSON body → 500
- **Where:** /api/import POST
- **Symptom:** Empty body or non-JSON content type → `request.json()` throws → 500 with empty body.
- **Fix:** try/catch around `request.json()`, returns 400 «Очікується JSON body».

### B27 ✅ FIXED — POST /api/users accepted any password length
- **Fix:** Min 6 chars check before Supabase Auth call. Prevents creating users with trivially weak passwords.

### B30 ✅ FIXED — Cost preview on /parcels/[id] ignored insurance opt-in
- **Symptom:** Live preview added 1% insurance from pricing config even when parcel was created without insurance opt-in. Saved totalCost = 22.50 EUR but preview showed «Всього: 23.70 EUR».
- **Fix:** Added `insuranceEnabled?: boolean` prop to CostCalculator. /parcels/new passes user's `insurance` state. /parcels/[id] passes `Number(parcel.insuranceCost) > 0`. Preview now hides insurance row + subtracts from total when opt-in is false.

### B31 ✅ FIXED — Invalid date param → 500 with empty body
- **Affected:** /api/parcels, /api/audit, /api/cash, /api/parcels/export, /api/reports/financial
- **Symptom:** `?dateFrom=invalid` threw `Date.parse('invalid')` → exception → 500 with empty body. Same for `?to=`.
- **Fix:** Added YYYY-MM-DD regex check inside `startOfKyivDay` / `endOfKyivDay`. Each calling endpoint wraps in try/catch returning 400 «Невалідна дата (очікується YYYY-MM-DD)».

## Deeper test results (this session — round 2)

### Lifecycle (e2e via UI + API)
- ✅ Парсел draft → accepted → in_transit → at_nova_poshta → paid → delivered_ua. Delivered блокує зміну статусу.
- ✅ Trip create → assign parcel → start trip → parcels auto in_transit → complete trip → parcels auto at_lviv_warehouse.
- ✅ Cash payment: POST /payment створює CashRegister entry, isPaid=true.
- ✅ Claims: create + PATCH (open → in_progress → resolved).
- ✅ Photo upload реальне PNG → Supabase Storage.
- ✅ Excel export 9.4KB xlsx з правильним Content-Type.

### Stress + concurrent
- ✅ 5 паралельних POST /api/parcels — всі створились, ITN/sequence унікальні (race condition handled у транзакції).
- ✅ Bulk-paid 20 парсел: 319ms (16ms each).
- ✅ Bulk-status 20 парсел: 2040ms (100ms each — статус-history per parcel).
- ✅ 500-char name → 400 «Too big».
- ✅ Unicode emoji в імені → 201 збережено.
- ✅ SQL-inject в q → Prisma protects.
- ✅ Negative declaredValue → 400.
- ✅ Excessive weight (99999kg) → 400 «Вага завелика».
- ✅ Excessive dimensions (9999cm) → 400.
- ✅ Too many places (50) → 400 «expected array to have <=20».

### Security
- ✅ Client GET /api/parcels → 403 Forbidden.
- ✅ Client POST /api/parcels → 403.
- ✅ Client PATCH /api/pricing → 403.
- ✅ Client POST /api/users → 403.
- ✅ Client portal POST з підставним senderPhone — НЕ створює запис від чужого клієнта (SECURITY коментар у коді: sender завжди = auth user).
- ✅ Client tries to GET foreign parcel → 403.
- ✅ Client tries to PATCH foreign parcel → 403.
- ✅ Soft-deleted client: GET → 404, search → не повертає, parcel POST з його ID → 404 «Відправника не знайдено».

### Misc
- ✅ Filter combinations (8 різних) — всі правильні counts.
- ✅ Calendar Prev/Next працює.
- ✅ Pricing PATCH + recalc reflects immediately.
- ✅ Collection-points CRUD: create + PATCH + DELETE.
- ✅ Import CSV (через JSON body — як очікує API).
- ✅ Negative page → fallback to 1.
- ✅ Big page (99999) → empty list, не падає.
- ✅ Big limit → clamped до 100.
- ✅ Bad UUID in path → 400 «Невалідний id».
- ✅ Console runtime errors: 0.
- ✅ npx tsc --noEmit: чисто.
- ✅ npx next build: усі ~50 routes компілюються.

### B33 ✅ FIXED — Print page included sidebar in print output
- **Symptom:** /parcels/[id]/print rendered etiquetes for thermal printer but dashboard layout (sidebar + mobile nav) was visible in print preview, wasting space on regular A4 printers.
- **Fix:** Added `print:hidden` to sidebar + mobile-nav root divs. Dashboard layout main wrapper has `print:ml-0 print:p-0 print:max-w-none`.

### B34 ✅ FIXED — Posylka could be paid twice (double cash entry)
- **Symptom:** POST /api/parcels/[id]/payment accepted multiple payments for the same parcel — created multiple CashRegister entries despite isPaid already being true.
- **Fix:** Pre-flight check in route — if `parcel.isPaid` already true → 409 «Посилка вже оплачена». Caller must DELETE first.

### B35 ✅ FIXED — client-portal POST silently defaulted direction
- **Symptom:** POST /api/client-portal/orders with no `direction` → silently defaulted to 'eu_to_ua'. Per ТЗ: client must explicitly pick direction («Виберіть напрямок» — без дефолту).
- **Fix:** Reject with 400 «Виберіть напрямок» when missing.

### B36 ✅ FIXED — Cancel payment on delivered parcel was allowed
- **Symptom:** DELETE /api/parcels/[id]/payment скасовувало оплату навіть на доставлених посилках → posylka delivered + isPaid:false (неконсистентний стан).
- **Fix:** Pre-flight check для status=delivered_ua/delivered_eu → 409.

### B37 ✅ FIXED — Could attach new parcel to completed/cancelled trip
- **Symptom:** POST /api/parcels з tripId завершеного рейсу → 201 створено, хоча рейс уже виконав маршрут.
- **Fix:** У `createParcel` (parcel-creation.ts) перед обробкою кидаємо `TRIP_NOT_ACCEPTING` якщо trip.status ∈ {completed, cancelled}. Routes (`/api/parcels`, `/api/client-portal/orders`) ловлять і повертають 409 «Рейс уже завершено/скасовано». Те саме для PATCH /api/parcels/[id] — re-assignment до завершеного рейсу заблоковано.

### B38 ✅ FIXED — Client stats `totalParcels` double-counted self-shipped parcels
- **Symptom:** На /clients/[id] стат «Всього посилок» = `totalSent + totalReceived`. Якщо клієнт є sender і receiver на одному парселі — рахується двічі. Сума по напрямках (eu_to_ua + ua_to_eu) не сходилася з `Всього`.
- **Fix:** Замінив на `byDirectionEuUa + byDirectionUaEu` — distinct count за направленнями.

### B39 ✅ FIXED — Duplicate clients with differently-formatted phones
- **Symptom:** POST /api/clients перевіряв тільки `phone` (raw). Створення з "+380501234567" і "+380 (50) 123-45-67" створювало два записи з однаковим `phoneNormalized`.
- **Fix:** Pre-check на `OR: [{phone}, {phoneNormalized}]` → 409 «Клієнт з таким номером вже існує».

### B40 ✅ FIXED — Adding address w/o city or country → 500 with empty body
- **Where:** PATCH /api/clients/[id] action=addAddress
- **Symptom:** Missing required `city` or `country` → Prisma constraint violation → 500.
- **Fix:** Pre-validate before DB call (country must be UA/NL/AT/DE, city non-empty) → 400 with clear message.

### B41 ✅ FIXED — Deleting address in use silently broke active parcels
- **Where:** PATCH /api/clients/[id] action=deleteAddress
- **Symptom:** Deleting an address used in non-delivered parcels → Prisma `SetNull` (or similar) cascaded → parcel.receiverAddressId became null → delivery info lost from active shipments.
- **Fix:** Pre-flight count of active (non-delivered/returned) parcels referencing the address. If >0 → 409 «Адреса використовується в N активних посилках. Спочатку завершіть або переприв'яжіть їх.»

### B42 ✅ FIXED — Pricing PATCH no validation on numeric fields
- **Where:** PATCH /api/pricing
- **Symptoms:**
  - Negative pricePerKg → 200 (saved as -5 EUR/kg)
  - String 'abc' for pricePerKg → 500 (Prisma decimal parse fails)
  - insuranceRate > 1 (e.g. 5 = 500%) → 200 (admin could accidentally set absurd rate)
  - insuranceRate negative → 200
- **Fix:** `validNumber()` helper validates each numeric field with min/max bounds:
  - `pricePerKg`, `addressDeliveryPrice` ∈ [0, 1000]
  - `insuranceRate` ∈ [0, 1]
  - `insuranceThreshold` ∈ [0, 100000]
  - `weightType` whitelist: actual/volumetric/average
  Also exposed `insuranceRate` and `insuranceThreshold` to PATCH (previously only readable via GET).

### B43 ✅ FIXED — PATCH parcel/trip with non-existent courierId → 500
- **Where:** PATCH /api/parcels/[id], PATCH /api/trips/[id]
- **Symptom:** Setting `assignedCourierId` to non-existent UUID → Prisma FK constraint fails → 500.
- **Fix:** Pre-flight `prisma.profile.findUnique`. Returns 404 «Кур'єра не знайдено». Plus role check: must be driver_courier/super_admin/admin to be assignable.

### B44 ✅ FIXED — GET /api/parcels?status=invalid → 500
- **Symptom:** Unrecognized status value passed to Prisma → enum cast error → 500 with empty body.
- **Fix:** Whitelist of valid statuses (incl. virtual `in_transit`/`at_warehouse`/`delivered`); reject other values with 400 «Невалідний статус: X».

### B45 ✅ FIXED — POST /api/collection-points with invalid country → 500
- **Symptom:** `country: 'ZZ'` → Prisma enum cast fails → 500 with empty body.
- **Fix:** Whitelist of UA/NL/AT/DE before create; 400 «Невалідна країна».

### B46 ✅ FIXED — POST /api/trips and /api/journeys with bad inputs → 500
- **Affected:** trip create with invalid country/direction/date; journey create with invalid country/date.
- **Symptom:** Bad enum/date string → 500 empty body.
- **Fix:** Pre-validate country (UA/NL/AT/DE), direction (eu_to_ua/ua_to_eu) for trips, all date fields (NaN check via `new Date().getTime()`). All return 400 with clear message.

### B47 ✅ FIXED — /api/journeys/[id] route entirely missing (no PATCH/DELETE/GET)
- **Symptom:** Journey could be created via POST /api/journeys but never updated, deleted, or fetched in detail. Frontend probably worked around it.
- **Fix:** Created `src/app/api/journeys/[id]/route.ts` with:
  - GET: full journey + child trips with parcel counts
  - PATCH (logistics roles): update dates/status/courier/notes; validates dates and courier IDs
  - DELETE (admin): hard-delete only when no child trips have parcels; cascades empty trips

### B48 ✅ FIXED — /api/trips/[id] missing DELETE
- **Symptom:** Trip could only be soft-cancelled via status change. Empty test trips piled up.
- **Fix:** Added DELETE in `/api/trips/[id]/route.ts` — only allowed when:
  - Trip has zero parcels (else 409 «Спочатку переприв'яжіть»)
  - Trip status is not `in_progress` or `completed` (else 409 «Скасуйте через статус»)

### B49 ✅ FIXED — Non-existent FK references on parcel POST → opaque 500
- **Symptoms:**
  - Non-existent receiverAddressId / senderAddressId → 500 «Не вдалося створити»
  - Non-existent tripId → 500
  - Non-existent collectionPointId → 500
  - Address belongs to different client → silent acceptance (could attach wrong address)
- **Fix:** Pre-flight checks in `createParcel` service throw named errors (`SENDER_ADDRESS_NOT_FOUND` etc). Both `/api/parcels` POST and `/api/client-portal/orders` POST translate to 404 with clear Ukrainian messages. Address ownership is also validated (must belong to the specified client).

### B50 ✅ FIXED — Dashboard `atWarehouse` count missed EU warehouse parcels
- **Symptom:** /api/stats counted only `at_lviv_warehouse`, missed `at_eu_warehouse`. Manual count was 4, stats showed 3.
- **Fix:** `status: { in: ['at_lviv_warehouse', 'at_eu_warehouse'] }`.

### B51 ✅ FIXED — Driver sees ALL unassigned parcels system-wide
- **Symptom:** Per ТЗ courier should see 3 specific categories — parcels they created, parcels on trips where they are courier, parcels personally assigned to them. Old logic added a blanket "unassigned" filter so driver A would see parcels intended for driver B's trip just because individual courier wasn't picked yet.
- **Fix:** Replaced blanket unassigned with explicit scopes:
  - `assignedCourierId = currentUserId` (assigned to me)
  - `createdById = currentUserId` (I created)
  - `tripId IN (my trips as assigned or second courier)`

### B52 ✅ FIXED — Receiver/Sender data couldn't be edited from /parcels/[id]
- **Per ТЗ:** «Можна редагувати лише дані Отримувача або Відправника» — even after parcel is locked from weight/dimension edits.
- **Symptom:** Detail page showed Від/Кому read-only. Operator couldn't fix a wrong phone or address without going to /clients/[id].
- **Fix:** New `ParcelPartyEdit` component with pencil icon next to Від:/Кому: blocks. Opens inline editor with PhoneInput + AddressEditor pre-filled. Saves changes through PATCH /api/clients/[id] (phone) and updateAddress action (address fields). Toast feedback + parent refetches on success. Visible regardless of `isEditLocked` per TZ.

### B53 ✅ Compact Status-change + Trip cards on /parcels/[id]
- **Per ТЗ:** «По можливості розмір усіх полів з інформацією максимально зменшити, зберігаючи нормальну читабельність».
- **Change:** Removed Card wrapper around status-change select and trip/courier display. Both now inline 1-row blocks with `border-y` separators. Pencil-edit button next to trip swaps in editor only when clicked. Page now shows more content above the fold while keeping every action accessible.

## Total: 52 bugs found and fixed

### B24 ✅ FIXED — PATCH /api/claims missing/invalid id → 500
- **Symptom:** `id` from body is undefined or non-existent → Prisma update threw → 500.
- **Fix:** Required check, UUID format check, pre-flight findUnique.

### B22 ✅ FIXED — POST /api/claims with bad parcelId leaked 500
- **Where:** /api/claims POST
- **Symptom:** Non-existent parcelId → FK constraint violation → 500.
- **Fix:** isUuid + pre-flight parcel exists check. Also validates clientId UUID format if provided.

### B21 ✅ FIXED — DELETE /api/passengers leaked 500 on bad/missing id
- **Where:** /api/passengers DELETE (id via query)
- **Symptom:** Both invalid UUID format and non-existent (valid format) UUID hit Prisma error → 500.
- **Fix:** isUuid guard + pre-flight findFirst.

### B20 ✅ FIXED — Photo upload accepted any MIME type
- **Where:** POST /api/parcels/[id]/photos
- **Symptom:** Could upload arbitrary text/binary files into public photo bucket — storage abuse + future XSS risk if served as HTML.
- **Fix:** MIME allowlist (JPEG/PNG/WebP/HEIC), 15 MB cap, filename sanitization (strip path separators + non-ASCII).

### B19 ✅ FIXED — bulk-status with mix of valid+missing IDs → 500
- **Symptom:** One non-existent (but valid-format) UUID among parcelIds → P2025 deep in transaction → 500.
- **Fix:** Pre-fetch all IDs, return 404 with `missing[]` list if any are absent. Silent partial-success was masking client bugs.

### B18 ✅ FIXED — Description suggestion accepted unbounded text
- **Where:** POST /api/descriptions
- **Symptom:** 2000-char descriptions persisted; would later fail when used in Parcel.description (500 max).
- **Fix:** Cap at 500 chars with 400 «Опис задовгий».

### B16 ✅ FIXED — POST /api/parcels with non-existent sender/receiver → 500
- **Symptom:** UUID format valid but client doesn't exist → FK error → opaque 500.
- **Fix:** Pre-flight existence check returns 404 «Відправника не знайдено» / «Отримувача не знайдено».

### B15 ✅ FIXED — PATCH/DELETE non-existent collection-point → 500
- **Where:** /api/collection-points/[id] PATCH + DELETE
- **Fix:** Pre-flight existence check.

### B12 ✅ FIXED — Invalid UUID on parcels sub-routes leaked 500
- **Where:** /api/parcels/[id]/{payment, photos, accept-at-point}, /api/users/[id]*, /api/collection-points/[id]/parcels
- **Fix:** isUuid guard on all resource sub-routes; consistent 400 «Невалідний id».

### B10 ✅ FIXED — Invalid UUID on resource GET endpoints → 500 with empty body
- **Where:** /api/parcels/[id], /api/clients/[id], /api/trips/[id], /api/collection-points/[id]
- **Symptom:** GET /api/parcels/fake returned 500 with empty body — Prisma threw on bad UUID cast.
- **Fix:** Added `isUuid()` helper in validators/common.ts. Each handler now returns 400 «Невалідний id» before hitting Prisma.

### B9 ✅ FIXED — Invalid addressId leaked 500 with empty body
- **Where:** PATCH /api/clients/[id] with action=updateAddress|deleteAddress
- **Symptom:** Bad UUID format → unhandled Prisma error → 500 with no body. Non-existent (but valid) UUID → also 500.
- **Fix:** Added UUID format check (400 «Невалідний addressId»). Pre-flight `findFirst` checks ownership (404 «Адресу не знайдено»). Also prevents cross-client tampering.

### B8 ✅ FIXED — /admin/* accessible by non-admin via direct URL
- **Symptom:** Driver could open `/admin/pricing` (and other /admin/*) by typing the URL — sidebar hid the link, but no server-side guard. PATCH was blocked at API; GET pages still rendered, leaking admin UI.
- **Fix:** Added `src/app/(dashboard)/admin/layout.tsx` — server component that calls `redirect('/')` if user role isn't in `ADMIN_ROLES`.

### B7 ✅ FIXED — Driver saw admin-only home widgets
- **Where:** `/` (Головна) widgets «Замовлення клієнтів чекають» + «Неоплачених посилок»
- **Symptom:** Driver role saw widgets that link to admin/cashier routes (where they get 403). Confusing UX.
- **Fix:** `useAuth().role` check on dashboard — driver only sees «upcoming trip» widget, hides pending-orders + debts.

### B6 ✅ FIXED — Status badge overflow on mobile parcel list
- **Where:** /parcels list cards
- **Symptom:** «Прийнято до перевезення до України» badge clipped at right edge on mobile (375px)
- **Fix:** Added `flex-wrap` + `whitespace-normal` so badge wraps to new line below internal number

### B4 ✅ FIXED — bulk-status bypassed transition validation
- **Where:** POST /api/parcels/bulk-status
- **Symptom:** Could mass-update parcels to ANY status (e.g. `draft` → `delivered_ua`) bypassing rules. Single-parcel PATCH validates, bulk did not.
- **Per ТЗ:** «Статуси що випадають зі списку мають відповідати … правилам їх зміни»
- **Fix:** Added `isAllowedTransition` + `isTerminal` check to bulk-status route. Returns 400 with blocked list. Super_admin can override with `?force=1`.

## Remaining: 0 open bugs

All console logs clean (0 runtime errors).
All TZ items verified through UI walkthrough.
typecheck (`npx tsc --noEmit`): clean.
