# Invoice SMS pipeline

End-to-end SMS flow for «Відправити рахунок» (ТЗ §E12).

## Pipeline (one diagram)

```
User clicks send-invoice icon on parcel detail
        OR ticks «Відправити рахунок» on parcels/new form
                          │
                          ▼
        POST /api/parcels/[id]/send-invoice
        body: { toParty: 'sender' | 'receiver', overridePhone? }
                          │
                          ▼
        sendInvoice() in src/lib/services/invoice-sms.ts
        │
        ├─► Resolve recipient (parcel.sender or parcel.receiver)
        ├─► Validate phone exists, totalCost > 0
        ├─► Load InvoiceSettings (singleton row: bank + template)
        ├─► renderInvoiceTemplate(template, ctx, bank)
        │     {{name}} {{amount}} {{itn}} {{internalNumber}}
        │     {{bankName}} {{iban}} {{accountHolder}} {{swift}}
        ├─► sendViaProvider(phone, body)
        │     ├─► If TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER:
        │     │     POST api.twilio.com/.../Messages.json with Basic Auth
        │     │     → returns { status: 'sent', provider: 'twilio' } or 'failed'
        │     └─► Else: log + return { status: 'queued', provider: null }
        ├─► INSERT sms_log (parcelId, toParty, toPhone, body, provider,
        │                   status, errorMessage, sentById)
        └─► UPDATE parcel.invoiceSentToPayerAt = now()  (if status != failed)
```

## Components

### `src/lib/services/invoice-sms.ts`

Two exports:

- `renderInvoiceTemplate(template, ctx, bank)` — pure function, substitutes `{{placeholder}}`.
- `sendInvoice(args)` — orchestrator. Throws `PARCEL_NOT_FOUND`, `NO_PHONE_FOR_PARTY`, `TOTAL_COST_NOT_SET` for caller to handle.

Returns `{ ok, smsLogId, body, status, errorMessage? }`.

### `src/app/api/parcels/[id]/send-invoice/route.ts`

Thin POST wrapper. Validates input, calls `sendInvoice()`, maps errors to HTTP codes:

- `PARCEL_NOT_FOUND` → 404
- `NO_PHONE_FOR_PARTY` → 400
- `TOTAL_COST_NOT_SET` → 400 (with message about waiting for cost calc)
- Other errors → 500

### `src/app/api/parcels/[id]/invoice-history/route.ts`

GET — returns last 20 sms_log entries for the parcel, with operator names resolved.

### `src/components/parcels/send-invoice-button.tsx`

Icon button (Lucide `Receipt`) used inline next to the pencil edit icon. Confirms with `confirm()` dialog, calls API, toasts result, triggers `onSent?.()` callback for parent to refresh history.

### `src/components/parcels/invoice-history.tsx`

Compact list card that auto-hides when there are zero entries. Shows status badges (queued/sent/failed), body preview (truncated to 80 chars), operator + timestamp.

### `src/app/(dashboard)/admin/invoice-settings/page.tsx`

Admin CRUD for `InvoiceSettings`. Three cards:

1. Bank details (`bankName`, `iban`, `accountHolder`, `swift`).
2. Exchange rate (`uahPerEur`).
3. SMS template + placeholder help list.

### `/api/admin/invoice-settings`

GET — loads singleton (creates if missing).
PATCH — admin-only update. Numeric fields clamped: `uahPerEur` ∈ [1, 1000]. String fields trimmed + capped (bank 100ch, iban 50ch, etc.).

## Provider switching

The whole point of the indirection is so we can replace Twilio without touching the orchestrator. Current providers:

- **Twilio** (when 3 env vars are set): real SMS, Ukraine number ~ $0.05/SMS.
- **Stub** (env vars not set): logs body length to `logger.info`, returns `queued`. No external call.

To swap to TurboSMS or Viber: replace the inner block of `sendViaProvider` in `invoice-sms.ts`. Status mapping stays — return `'sent' | 'failed' | 'queued'`.

## Template authoring

Default template (if `InvoiceSettings.smsTemplate` is empty):

```
Шановний(а) {{name}}!
До оплати за доставку {{internalNumber}}: {{amount}} EUR.
Реквізити: {{accountHolder}}, IBAN {{iban}} ({{bankName}}).
Дякуємо!
```

Placeholders are case-sensitive. Missing values render as empty string (no crash, no `undefined`).

## Audit

Every send attempt writes to `sms_log` regardless of success. Failures keep their error message. Use this when the user says «I sent it but the recipient didn't get it» — check `sms_log.status` and `errorMessage`.

## Triggering from creation

When operator creates a parcel with `sendInvoice: true` in the body, `POST /api/parcels/route.ts` calls `sendInvoice()` asynchronously after parcel is saved (so failure of SMS doesn't block parcel creation). Logged via `logger.error('parcel.invoice.send_failed', ...)`.

## Gotchas

- **No phone, no send.** If the recipient client has no phone stored, the orchestrator throws `NO_PHONE_FOR_PARTY`. Operator sees a toast. Fix: edit the client's phone first.
- **Cost not calculated.** If `parcel.totalCost` is null (e.g. parcel created without pricing config matching), throws `TOTAL_COST_NOT_SET`. Operator must trigger a recalc (any cost-affecting PATCH) first.
- **Spam protection — none.** Operator can click the button 5 times → 5 SMS. The `invoice-history` card shows previous sends so they can see they've already done it, but there's no rate-limit.
- **Currency in SMS.** Template uses `{{amount}}` which is `parcel.totalCost` formatted as `EUR`. Total is always EUR (calculator works in EUR). UAH-paying customers see «X EUR» in the SMS — but they pay in UAH at the operator's exchange rate.
- **Provider env var leak.** If env vars are partially set (e.g. ACCOUNT_SID but no AUTH_TOKEN), the code falls back to stub mode silently. Logged in `logger.warn('sms.invoice.stub_send')`.
