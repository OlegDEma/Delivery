-- Per ТЗ §5: список міст, де клієнту дозволено обирати «Виклик кур'єра».
-- В Україні — лише Львів. У EU — кожна обслуговувана країна (NL/AT/DE)
-- по суті завжди дозволяє courier_pickup, тому seed містить порожні
-- значення — у EU client portal допускає courier_pickup без явного
-- запису в цій таблиці (fallback логіка в API).
CREATE TABLE IF NOT EXISTS "service_cities" (
  "id"                       UUID         NOT NULL DEFAULT gen_random_uuid(),
  "country"                  "Country"    NOT NULL,
  "city"                     TEXT         NOT NULL,
  "accepts_courier_pickup"   BOOLEAN      NOT NULL DEFAULT TRUE,
  "notes"                    TEXT,
  "created_at"               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at"               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT "service_cities_pkey"             PRIMARY KEY ("id"),
  CONSTRAINT "service_cities_country_city_key" UNIQUE ("country", "city")
);

CREATE INDEX IF NOT EXISTS "service_cities_country_pickup_idx"
  ON "service_cities" ("country", "accepts_courier_pickup");

-- Seed: Львів — єдине UA-місто з courier_pickup за замовчуванням.
INSERT INTO "service_cities" ("country", "city", "accepts_courier_pickup")
VALUES ('UA', 'Львів', TRUE)
ON CONFLICT ("country", "city") DO NOTHING;
