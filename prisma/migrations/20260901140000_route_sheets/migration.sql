-- ТЗ docx 30.08.26: «Створити Маршрутний лист» має створювати МЛ САМ ПО СОБІ —
-- натиснув кнопку, обрав дату, МЛ зʼявився під кнопкою. Адреси додаються ПІСЛЯ.
-- Раніше МЛ існував лише як похідна від задач із цією датою, тому порожній МЛ
-- створити було неможливо (клієнт: «Не створюється маршрутний лист»).
CREATE TABLE IF NOT EXISTS "route_sheets" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "journey_id" UUID NOT NULL REFERENCES "journeys"("id") ON DELETE CASCADE,
  "sheet_date" DATE NOT NULL,
  "created_by" UUID REFERENCES "profiles"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "route_sheets_journey_date_key"
  ON "route_sheets" ("journey_id", "sheet_date");
CREATE INDEX IF NOT EXISTS "route_sheets_journey_id_idx"
  ON "route_sheets" ("journey_id");
