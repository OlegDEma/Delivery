-- ТЗ docx 21.08.26: пасажирські (посадкові) місця задаються НА ПОЇЗДКУ (а не на кожен
-- рейс). Кожен рейс поїздки успадковує це число. Додаємо колонку на journeys та
-- переносимо вже наявні значення з рейсів (беремо максимум по рейсах поїздки).
ALTER TABLE "journeys" ADD COLUMN IF NOT EXISTS "passenger_capacity" INTEGER NOT NULL DEFAULT 0;

UPDATE "journeys" j
SET "passenger_capacity" = sub.cap
FROM (
  SELECT "journey_id", MAX("passenger_capacity") AS cap
  FROM "trips"
  WHERE "journey_id" IS NOT NULL
  GROUP BY "journey_id"
) sub
WHERE j."id" = sub."journey_id" AND sub.cap > j."passenger_capacity";
