-- Add new pricing fields per TZ:
--  packaging_per_10kg   — flat €/10kg replacing legacy tier JSON
--  parcel_money_percent — % from "Пакет" (cash transferred by sender)
--  pickup_point_price   — flat price for hand-off at collection point
ALTER TABLE "pricing_config"
  ADD COLUMN IF NOT EXISTS "packaging_per_10kg"  NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "parcel_money_percent" NUMERIC(5, 2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pickup_point_price"   NUMERIC(10, 2) NOT NULL DEFAULT 0;
