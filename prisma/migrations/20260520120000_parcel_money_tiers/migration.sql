-- §E53: two-tier «Пакет%» — окремий відсоток для сум вище порогу.
ALTER TABLE "pricing_config"
  ADD COLUMN IF NOT EXISTS "parcel_money_percent_high" NUMERIC(5, 2) NOT NULL DEFAULT 0;

ALTER TABLE "pricing_config"
  ADD COLUMN IF NOT EXISTS "parcel_money_threshold" NUMERIC(10, 2) NOT NULL DEFAULT 2000;
