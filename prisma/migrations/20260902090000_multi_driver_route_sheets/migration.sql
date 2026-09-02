-- ТЗ docx 02.09.26: два водії можуть одночасно працювати з однією поїздкою і
-- кожен створює СВІЙ Маршрутний лист на ту саму дату. Тому:
--  1) унікальність (поїздка + дата) знімаємо — лишаємо (поїздка + дата + автор);
--  2) адресу привʼязуємо до КОНКРЕТНОГО листа (route_sheet_id), а не лише до дати,
--     бо на одну дату тепер може бути кілька листів різних водіїв.
DROP INDEX IF EXISTS "route_sheets_journey_date_key";

CREATE UNIQUE INDEX IF NOT EXISTS "route_sheets_journey_date_author_key"
  ON "route_sheets" ("journey_id", "sheet_date", "created_by");

ALTER TABLE "route_tasks"
  ADD COLUMN IF NOT EXISTS "route_sheet_id" UUID REFERENCES "route_sheets"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "route_tasks_route_sheet_id_idx"
  ON "route_tasks" ("route_sheet_id");

-- Бекфіл: наявні адреси в листах привʼязуємо до листа тієї ж поїздки та дати.
UPDATE "route_tasks" rt
SET "route_sheet_id" = rs."id"
FROM "route_sheets" rs
JOIN "trips" t ON t."journey_id" = rs."journey_id"
WHERE rt."route_sheet_id" IS NULL
  AND rt."task_date" IS NOT NULL
  AND rt."trip_id" = t."id"
  AND rs."sheet_date" = rt."task_date";
