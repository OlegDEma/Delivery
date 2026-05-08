-- New parcel-level fields per TZ:
--   insurance_applied         — explicit checkbox state (vs deriving from cost > 0)
--   pickup_point_cost         — fee for handing parcel over at a pickup point
--   parcel_money_amount       — "Пакет": cash sent by sender to receiver
--   parcel_money_cost         — calculated % fee from parcel_money_amount
--   invoice_sent_to_payer_at  — SMS invoice timestamp (null = not sent)
ALTER TABLE "parcels"
  ADD COLUMN IF NOT EXISTS "insurance_applied"         BOOLEAN        NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "pickup_point_cost"         NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "parcel_money_amount"       NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS "parcel_money_cost"         NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "invoice_sent_to_payer_at"  TIMESTAMPTZ;

-- Backfill insurance_applied for legacy parcels: if insurance_cost > 0, the
-- old auto-insurance kicked in, so treat it as "applied" for display purposes.
UPDATE "parcels"
SET "insurance_applied" = TRUE
WHERE "insurance_cost" IS NOT NULL AND "insurance_cost" > 0;
