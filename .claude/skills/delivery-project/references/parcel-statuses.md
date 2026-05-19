# Parcel status state machine

ТЗ §E55–E61 describe the desired flow. Current implementation may differ in places.

## Enum

```
draft                          ← initial (client_web/telegram); staff usually skip
at_collection_point            ← parcel handed over at our pickup point
accepted_for_transport_to_ua   ← courier confirmed pickup, heading to UA
in_transit_to_ua               ← trip departed, en-route to UA
at_lviv_warehouse              ← arrived at Lviv hub
at_nova_poshta                 ← handed to Nova Poshta for last-mile UA
delivered_ua                   ← terminal
accepted_for_transport_to_eu   ← courier confirmed pickup in UA, heading to EU
in_transit_to_eu               ← trip departed, en-route to EU
at_eu_warehouse                ← arrived at EU hub
delivered_eu                   ← terminal
not_received                   ← receiver didn't accept (terminal-ish)
refused                        ← refused by receiver (terminal)
returned                       ← returned to sender (terminal)
```

## ТЗ-described transitions

### Created (Клієнтом)

ТЗ §E55: `draft` is the initial status when client creates the parcel through the portal. Client can pick a trip; if not, it auto-attaches to the nearest trip. Only **staff** can move it out of `draft`.

### Прийнято до перевезення в Україну (`accepted_for_transport_to_ua`)

ТЗ §E56: Assigned when:
- Staff creates a parcel from scratch (skipping `draft`).
- Staff opens client's `draft` parcel and accepts it.

Required: receiver country = UA, parcel attached to a trip going to UA.

### Прийнято до перевезення в Європу (`accepted_for_transport_to_eu`)

ТЗ §E57: Mirror of above for EU-bound parcels. Receiver country ≠ UA, attached to UA→EU trip.

### В дорозі до України (`in_transit_to_ua`)

ТЗ §E58: **Automatic** transition from `accepted_for_transport_to_ua` when the trip's `departureDate` arrives.

**Not implemented as cron yet.** Currently status changes are manual. Needs:
- Cron job (Supabase Edge Function / Vercel cron) that scans trips with `status='in_progress'` and bumps parcels from `accepted_*` → `in_transit_*`.

### В дорозі до Європи (`in_transit_to_eu`)

ТЗ §E59: Symmetric.

### Доставлено Україна / Європа (`delivered_ua` / `delivered_eu`)

ТЗ §E60/§E61: Set by staff AFTER receiving payment. Currently any staff can mark delivered without payment check — gap vs ТЗ.

Terminal:
- ТЗ §E4: «Коли посилці призначено статус Доставлено — то ніяких статусів (навіть того самого) вже призначати ніхто (і програма теж) не може.»
- Currently: `STATUS_TRANSITIONS` map in `src/lib/parcels/status-transitions.ts` may allow further changes. Verify and lock.

### Не отримано / Відмова / Повернуто

`not_received` / `refused` / `returned` exist in enum but ТЗ doesn't expand them. Existing logic probably allows them as endings.

## Transition validator

`src/lib/parcels/status-transitions.ts`:

- `STATUS_TRANSITIONS: Record<ParcelStatus, ParcelStatus[]>` — allowed next-statuses per current status.
- `isAllowedTransition(from, to)` — boolean check.
- `isTerminal(status)` — `delivered_ua` / `delivered_eu` / `refused` / `returned` → true. Others false.

PATCH `/api/parcels/[id]` enforces `isAllowedTransition` for non-super-admin operators. Super-admin can force any transition.

## Status label rendering

`src/lib/parcels/status-label.ts`:

```ts
statusLabel('in_transit_to_ua', { tripCountry: 'NL', direction: 'eu_to_ua' })
// → "В дорозі з Нідерландів"
```

The label is dynamic based on trip context. Don't render raw enum values to users.

## isEditLocked logic

On parcel detail page:

```ts
const isEditLocked =
  parcel.status !== 'draft' && parcel.status !== 'at_collection_point' && !isSuperAdmin;
```

Once a parcel hits `accepted_for_transport_*`, non-super-admin operators can no longer edit weight/dimensions. They can still edit sender/receiver details (per ТЗ §E4).

The lock is enforced in TWO places: UI hides edit buttons (`readOnly={isEditLocked}` prop), and API rejects PATCH attempts that touch locked fields.

## Open gaps vs ТЗ

1. **Auto-transition on trip start** — cron needed. Currently manual.
2. **Delivered requires payment** — currently anyone can mark delivered without checking `isPaid` or cash register.
3. **Terminal status lock** — `delivered_*` should block further status changes for everyone (including super-admin per ТЗ). Currently super-admin can override.
4. **`draft` → only staff can move out** — verify RBAC. Client should not be able to PATCH their own draft to another status.
