-- ТЗ docx 29.06.26 «Міста обслуговування»: обмеження доступності способів
-- можна задати окремо для Відправника та Отримувача. Додаємо вимір `target`.
CREATE TYPE "ServiceTarget" AS ENUM ('sender', 'receiver', 'both');

ALTER TABLE "service_cities"
  ADD COLUMN "target" "ServiceTarget" NOT NULL DEFAULT 'both';

-- Унікальність тепер по (country, city, target) — щоб для того ж міста
-- співіснували різні правила для Відправника й Отримувача.
ALTER TABLE "service_cities" DROP CONSTRAINT "service_cities_country_city_key";
ALTER TABLE "service_cities"
  ADD CONSTRAINT "service_cities_country_city_target_key" UNIQUE ("country", "city", "target");
