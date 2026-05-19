# Roles + RBAC

Enum `UserRole`:

| Role | What they see / can do |
|---|---|
| `super_admin` | Everything. Only role that can override locks (edit weight/places after acceptance). Can manage users. |
| `admin` | Most things except user management. Edits tariffs, service cities, invoice settings, statuses. |
| `cashier` | Parcels list, clients, cash register, debts, reports. No tariff edits. |
| `warehouse_worker` | Parcels list, warehouse, collection points, scan. |
| `driver_courier` | `/my-parcels` (only own + unassigned), trips, routes, collection points, scan. |
| `client` | Client portal only: `/my-orders`, `/new-order`. Sees only parcels where they're sender or receiver. |

Guard helpers in `src/lib/auth/guards.ts`:

- `requireAuth()` — any logged-in user. Returns `{ ok: true, user }` or `{ ok: false, response: <401> }`.
- `requireStaff()` — any non-client role.
- `requireRole(roles)` — explicit allowlist. Example: `requireRole(ADMIN_ROLES)` for delete operations.

Constants in `src/lib/constants/roles.ts`:

```ts
ROLES.SUPER_ADMIN = 'super_admin'
ROLES.ADMIN = 'admin'
ROLES.CASHIER = 'cashier'
ROLES.WAREHOUSE_WORKER = 'warehouse_worker'
ROLES.DRIVER_COURIER = 'driver_courier'
ROLES.CLIENT = 'client'

ADMIN_ROLES = ['super_admin', 'admin']  // common combo for admin-only actions
STAFF_ROLES = everything except 'client'
```

## How driver sees parcels

`/my-parcels` page has three tabs implemented client-side via `bucket` state:

- **Оформив сам** — `parcel.createdById === user.id`. Parcels the driver created from scratch (e.g. when a client gave them only a phone, no full form).
- **До прийому** — `parcel.createdSource === 'client_web' || 'client_telegram'`. Client-originated parcels assigned to this driver's trip.
- **На видачу** — `parcel.direction === 'ua_to_eu'`. Parcels coming from UA they need to hand over in EU.

API-level scoping (`/api/parcels`):

```ts
if (currentRole === ROLES.DRIVER_COURIER) {
  if (courierId && courierId !== currentUserId) return 403;
  driverScope.push(
    { assignedCourierId: currentUserId },
    { createdById: currentUserId },
    { tripId: { in: myTripIds } }
  );
}
```

So a driver can NEVER see another driver's parcels via the API — UI scoping is enforced server-side too.

## Client portal scoping

`/api/client-portal/orders`:

```ts
const profile = await prisma.profile.findUnique({ where: { id: user.id } });
const client = await prisma.client.findUnique({ where: { phone: profile.phone } });
where: { OR: [{ senderId: client.id }, { receiverId: client.id }] }
```

Client is linked to their `Client` row by phone match. If the phone in `Profile` doesn't match any `Client`, they see empty list.

**Trap:** ТЗ §E7 bug — when client (or staff) tries to edit ONLY phone of an existing client, the API rejects with «Клієнт з таким номером вже існує» because the phone hits its own row via the unique constraint. Fix: when updating, exclude current client ID from uniqueness check.

## Admin layout guard

`src/app/(dashboard)/admin/layout.tsx`:

```tsx
if (!(ADMIN_ROLES as readonly string[]).includes(profile.role)) {
  redirect('/');
}
```

This catches `/admin/*` access from non-admin URLs (the sidebar already hides them). Belt and suspenders.

## Sidebar visibility

`src/components/layout/sidebar.tsx` — `NAV_GROUPS` array. Each item can have a `roles` filter; the whole group can be role-gated too. The sidebar hides hidden items entirely (not greyed-out).

Adding a new admin page? Add it to the «Адміністрування» group with `roles: ['super_admin', 'admin']`.

## Login flow

`/login` — Supabase Auth (`supabase.auth.signInWithPassword`).
`/register` — sign up (only certain emails are allowed? Check `auth/register/page.tsx` if relevant).
`/forgot-password` → `/reset-password` — Supabase email reset flow.

Server-side check in middleware (`src/proxy.ts` — note: the project uses `proxy.ts` because Next.js 16 deprecated `middleware.ts`):

```ts
export async function proxy(request: NextRequest) {
  return updateSession(request);  // Supabase session refresher
}
```

Sessions are stored in cookies. Don't touch the cookie names without checking Supabase docs.
