---
name: delivery-project
description: Codebase knowledge for Delivery — pro-bono parcel-logistics SaaS that moves parcels between EU (NL/AT/DE) and Ukraine through a Lviv hub + Nova Poshta. Next.js 16 + Supabase + Prisma + Tailwind/shadcn. Use this whenever working in the Delivery repo (Windows `D:\Delivery` or a macOS clone) — the project has its own breaking-change Next.js, a domain-specific tariff calculator with five service kinds, a client-owned Google Doc ТЗ (newest dated section at the top, read via the Drive connector) that drives requirements, and a series of subtle traps (currency conversion for insurance, recalc must fire on cost-affecting fields, weight calculator semantics differ from `actual=max` default, Twilio fallback stub, etc.). Triggers when user is in this repo, mentions parcels / посилки / тарифи / клієнти / кур'єр / Львів in a coding context, asks about TZ sections (§E1–E14, §E48–E61), references `ТЗ`, asks about pricing/insurance/packaging/Пакет, or says «фікси» / «продовжуй» / «доведи до ладу» while in this codebase. Skip when the user is in another project or asking generic Next.js questions unrelated to this domain.
---

# Delivery project — operating handbook

This is **your** project. The user is a contributor doing this pro-bono for a friend's logistics business between Europe and Ukraine. Their tolerance for shortcuts is zero. Their tolerance for false-positive «все готово» is even lower.

Read this whole file before answering. Then read the specific reference file for whatever you're touching. Don't trust your training data on Next.js — this version (16.2.3) and Prisma 7 have breaking changes from public docs.

## Domain in one paragraph

A courier company moves parcels both directions between Ukraine and three European countries (Netherlands, Austria, Germany). Sender drops off at a pickup point, requests a courier visit, ships locally to our warehouse, or hands over to the driver. Driver consolidates parcels into a trip (truck-load), drives to/from Lviv. In Lviv the parcel may be handed to Nova Poshta (`ТТН`) for last-mile within Ukraine — both our ITN and the Nova Poshta TTN travel with the parcel. Money flows in EUR (Europe) and UAH (Ukraine) — operator sets the exchange rate manually.

## Read these first

| Need | File |
|---|---|
| **Project context pack (read first on a new machine)** | **`.claude/context/00-START-HERE.md`** |
| Where the project stands right now, by ТЗ date | `.claude/context/01-current-state.md` |
| How we work (ТЗ → code → live test → push → client comment) | `.claude/context/02-workflow.md` |
| Setup & commands on Windows **and macOS**, env traps | `.claude/context/03-environment.md` |
| Reading the ТЗ doc + commenting back to the client | `.claude/context/04-tz-and-client.md` |
| Browser-testing playbook (roles, gotchas) | `.claude/context/05-ui-testing.md` |
| Open threads to pick up next | `.claude/context/06-open-items.md` |
| What's done vs not, mapped to the client's ТЗ rows (May–July) | `references/tz-audit.md` |
| Schema entities + how they relate | `references/data-model.md` |
| Pricing calculator + currency + ТЗ §8/§9/§10/§11 | `references/pricing.md` |
| SMS-invoice pipeline (Twilio + stub fallback) | `references/invoice-sms.md` |
| Multi-location story (current state + planned `Location` entity) | `references/locations.md` |
| Recurring traps and how to avoid them | `references/pitfalls.md` |
| Roles + RBAC matrix | `references/roles.md` |
| Build / migrate / push commands | `references/commands.md` |
| Status state machine for parcels | `references/parcel-statuses.md` |

## Five hard rules (override anything else)

### 1. Don't claim «все зроблено» until you've manually QA'd or said you haven't

The user has caught me lying three times in this project alone. Pattern: I run `tsc --noEmit` + `next build`, both pass, I declare done. Then the user opens the browser, finds the bug.

When you finish a fix:
- Say what you ran (`tsc`, `next build`, `eslint <file>`).
- Say what you did **not** test (browser, real DB, real Twilio call).
- List specific things the user should click to verify.
- Never write «✅ Все працює без багів» without UI verification.

If the user asks «ти все зробив?» and you haven't QA'd → answer «ні» and list what's unverified. They prefer honest «не знаю» over false confidence.

### 2. Recalc fires on every cost-affecting PATCH

The hardest bug in this project's history: PATCH `/api/parcels/[id]` used to only recalc costs when `body.places` was in the payload. If the user changed only `declaredValue` or toggled `insuranceApplied`, the DB had the new field but `totalCost` / `insuranceCost` stayed stale — live calculator showed one number, saved value another.

**Rule:** any field that participates in `calculateParcelCost` MUST trigger a recalc when it's in the PATCH body. Current list (keep in sync with `src/app/api/parcels/[id]/route.ts:costAffectingTouched`):

- `places` (weight/dimensions)
- `declaredValue`
- `insuranceApplied`
- `needsPackaging`
- `parcelMoneyAmount`
- `collectionMethod`
- `collectionPointId`

When you add a new cost-affecting field, add it to this list. Search for `costAffectingTouched` in the repo.

### 3. Declared value lives in two currencies; the calculator works in EUR

`parcel.declaredValue` is a Decimal stored in the DB. `parcel.declaredValueCurrency` ('EUR' | 'UAH') is the source-of-truth currency. The whole pricing system runs in EUR.

Anywhere that multiplies `declaredValue × insurancePercent`:

1. Read `declaredValueCurrency` and `invoice_settings.uahPerEur` (rate, default 42).
2. Convert to EUR via `toEur(amount, currency)` from `src/lib/utils/currency.ts`.
3. THEN multiply by the rate.

**Trap:** UAH-sender parcel where insurance was computed as if 2500 was EUR → 75 EUR insurance, which is 3× the actual delivery cost. Anytime you see suspicious round numbers in insurance — currency conversion is likely missing.

### 4. The weight calculator is fraction-based, not max-based

ТЗ §8: «Якщо фактична вага більша від об'ємної — береться фактична. Інакше — комбінація часток фактичної+об'ємної, яка прописується в Тарифах.»

`getBillableWeight(a, v, weightType, customFactualFraction)` in `src/lib/utils/volumetric.ts`:

- `a >= v` → always `a` (factual wins).
- `a < v` AND `weightType=actual` → returns `v` (legacy «max» behaviour, **does not match ТЗ**).
- `a < v` AND `weightType=custom` → `ffrac × a + (1 − ffrac) × v` — this is ТЗ-correct.

The default seed uses `actual`. For new tariffs the admin must switch to `custom`. Existing tariffs in the prod DB have `actual` → they show max-behaviour and don't match ТЗ. The user has flagged this as «Невірно рахується Розрахункова вага! Бере більшу замість рахувати згідно правил!». Open work: migrate `actual` → `custom` with `factualFraction=0.5` or change the enum semantics.

### 5. Comments in Ukrainian, code identifiers in English

The existing codebase mixes English identifiers with Ukrainian comments. Match the convention. Don't translate comments unless the user asks. Don't anglicise variable names from existing Ukrainian-named ones.

Lint rule `react-hooks/set-state-in-effect` is in the codebase but several files have pre-existing violations. When you add a new effect with `setState`, restructure to avoid it — see `src/components/parcels/cost-calculator.tsx` for the idiomatic pattern (compute `shouldFetch` from props, gate the effect on it, don't sync-clear stale state in the effect body).

## What the project actually does, screen by screen

### Public

- `/login`, `/register`, `/forgot-password`, `/reset-password` — Supabase Auth, email/password.

### Client portal `(client-portal)`

- `/my-orders` — list of parcels where this client is sender or receiver. Shows ITN and TTN side-by-side when TTN is set (per ТЗ §7).
- `/new-order` — client creates an order from scratch. Direction must be picked consciously (no last-used default). The form has more restricted UI than the staff form: no receiver search (privacy), `external_shipping` is disabled, `courier_pickup` is only available for clients whose sender is in an EU country **or** in a UA city listed in `service_cities`.

### Staff dashboard `(dashboard)`

- `/` — operator home. Shows action cards (pending client orders, unpaid parcels, upcoming trip), stat tiles, recent activity.
- `/parcels` — list with filter by status, sender phone, date, and «хто приймав» courier (via `acceptedById` ⇄ `parcel.collectedById`). Default filter: «Не прийняті кур'єром».
- `/parcels/[id]` — parcel detail. ITN+TTN at the top, sender/receiver with edit pencil + send-invoice icon, places card, details card (edit declaredValue/insurance/parcelMoney/etc.), payment card with cost breakdown, invoice-history card (only when ≥1 SMS sent).
- `/parcels/[id]/print` — thermal-printer-friendly etikettes + receipt. Receipt shows «Пакет: (1000)» line per ТЗ.
- `/parcels/new` — staff creates a parcel with sender/receiver search, full collection method (with multi-parcel question for `courier_pickup`), shipment services (insurance/packaging/parcel-money), pricing live preview, trip selection.
- `/my-parcels` — courier-only view, three tabs: parcels I created from scratch / clients sent to my trip / parcels I need to deliver.
- `/journeys`, `/trips`, `/trips/[id]`, `/routes`, `/calendar`, `/warehouse`, `/collection-points/[id]` — logistics.
- `/clients`, `/clients/[id]` — clients CRUD.
- `/passengers` — courier carrying people, separate vertical.
- `/cash-register`, `/debts`, `/reports`, `/analytics` — finance.
- `/admin/users`, `/admin/pricing`, `/admin/service-cities`, `/admin/invoice-settings`, `/admin/statuses`, `/admin/collection-points`, `/admin/import` — admin.

## Conventions worth knowing before editing

- **API routes** follow Next.js 16 conventions: file-based at `src/app/api/**/route.ts`. `params` is a **Promise** (`{ params: Promise<{ id: string }> }`) — `await` it. Authentication via `requireAuth()` / `requireStaff()` / `requireRole()` from `src/lib/auth/guards.ts`.
- **Server-side Prisma** uses the singleton in `src/lib/prisma.ts`. Don't `new PrismaClient()` in routes.
- **Validators** are Zod schemas under `src/lib/validators/`. Always run input through `parseBody(request, schema)` and `instanceof NextResponse` to handle the 400 case.
- **Generated Prisma client** lives at `src/generated/prisma/` (committed to repo). After schema changes: `npx prisma migrate dev` locally — but in this repo migrations are written by hand into `prisma/migrations/<timestamp>_<name>/migration.sql` and applied via `npx prisma migrate deploy`. **Then** `npx prisma generate`.
- **Currency**: `Decimal` in Prisma → `Number(field)` in TS. Round money via `roundMoney()` from `pricing.ts`.
- **i18n**: All user-facing strings are Ukrainian, except shadcn components and error fallbacks. Date formatting via `formatDate()` from `src/lib/utils/format.ts`.
- **Status labels**: `STATUS_LABELS` map in `src/lib/constants/statuses.ts`. Use `statusLabel(status, { tripCountry, direction })` for dynamic labels like «В дорозі до Нідерландів».

## How to do a fix (the routine)

1. Read the specific reference file in `references/` for the area you're touching.
2. Check `references/tz-audit.md` to see if the ask is already implemented or partially-done.
3. Search the codebase: `grep -rn "<keyword>" src/` rather than guess at file names.
4. Make the change. Always:
   - `npx tsc --noEmit` (fast)
   - `npx eslint <changed-files>` (file-scoped, the project has pre-existing violations in untouched code)
   - `rm -rf .next && npm run build` (slow but catches Next.js-specific issues)
5. Commit with a Ukrainian message that explains WHY (not WHAT — the diff shows what).
6. `GIT_ASKPASS=true git push origin main` — the project uses Windows credential manager and async pushes hang. The `GIT_ASKPASS=true` workaround makes them complete synchronously.
7. Tell the user what you did + what you didn't verify.

## Push troubleshooting (this comes up every session)

On **Windows** the user has Git Credential Manager; `git push` often appears to hang
(the credential prompt can't reach the user). Workaround:

```bash
GIT_ASKPASS=true git push origin main
```

**Never conclude «push is blocked» without checking the remote directly** — a hung
background push usually completes on its own after several minutes:

```bash
git ls-remote origin refs/heads/main   # compare with git rev-parse HEAD
```

`git rev-list --count @{u}..HEAD` reads a stale tracking ref and will lie to you.
On **macOS** credentials come from `osxkeychain` — one interactive login, then pushes
are normal. See `.claude/context/03-environment.md` for the cross-platform command table.

## What's missing from the codebase that the business will eventually need

Documented in `references/locations.md` and `references/tz-audit.md`. The big ones:

1. **Multi-location** — the schema hard-codes `at_lviv_warehouse` and `at_eu_warehouse` as enum values. If they open a Kyiv office, the schema breaks. Solution: separate `Location` entity, `parcel.currentLocationId`, generic `at_warehouse` status.
2. **Currency cash flow** — `CashRegister` is one global cash; no shift-close / Z-report; no expenses tracking. Profit can't be calculated.
3. **Tariff per shipment type** — `documents` and `tires_wheels` cost differently from `parcels_cargo`. Calculator currently ignores `shipmentType`.
4. **Customer notifications on status changes** — SMS infra exists (`invoice-sms.ts`) but only fires on the invoice flow. Need triggers on `at_lviv_warehouse`, `at_nova_poshta`, `delivered_ua`, etc.
5. **Lviv exception in tariffs** — ТЗ §49/§50: NL→Lviv = 1.5 €/кг (not 2), AT→Lviv = 1.0 €/кг (not 1.5). Not implemented.
6. **Vehicle as entity** — `Trip.vehicleInfo` is freetext. Can't report «which truck made how many trips».
7. **Receipt signature** — no canvas signature, no structured photo tags (`pickup-photo` vs `delivery-photo` vs `damage-photo`).
8. **Lint debt** — 21 `react-hooks/set-state-in-effect` errors in pre-existing components. Build passes but next React/Next upgrade may hard-error.

## When in doubt about ТЗ

**Current source of truth (since Aug 2026): a Google Doc owned by the client**, read
live through the Drive connector — no more `.xlsx` exports from Downloads. Full details
(fileId, how to read it, why comments and images are invisible to the connector, and the
protocol for commenting back to the client) are in **`.claude/context/04-tz-and-client.md`**.

Newest dated section is at the TOP of the doc. The client also edits OLD sections —
re-read a date before assuming it is unchanged.

The older spreadsheet-based audit at `references/tz-audit.md` was code-verified on
2026-05-19 and covers the May–July rows (E3, E4, E7, …) — those row numbers are still
used in conversation. For August-onward work read `.claude/context/01-current-state.md`.

**Crucial:** «реалізовано в коді» ≠ «клієнт підтвердив». Report what was verified live
and what was not — never a blanket «готово».

## When the user says «фікси» / «продовжуй»

Read `bug-hunt-loop` skill (user-level). Short version: this means «continue working without check-ins until you hit a real blocker or finish the backlog». Don't ask «що далі?» at the end of a fix — pick the next item from the audit, do it, report, repeat.
