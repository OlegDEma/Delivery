-- Курс UAH/EUR для конвертації оголошеної вартості при розрахунку страхування.
-- Без цього 2500 грн оголошеної вартості × 3% = 75 «EUR» страхування — бо
-- системний розрахунок ведеться в EUR і число 2500 трактувалось як EUR.
ALTER TABLE "invoice_settings"
  ADD COLUMN IF NOT EXISTS "uah_per_eur" NUMERIC(8, 2) NOT NULL DEFAULT 42;
