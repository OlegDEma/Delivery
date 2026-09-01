-- ТЗ docx 30.08.26: у формі «Додати адресу» поля розділені — окремо Вулиця і
-- Номер будинку, окремо Прізвище та Імʼя (раніше були одним рядком адреси і
-- одним полем «Клієнт»). Зберігаємо їх окремо, щоб коректно переносити у форму
-- створення посилки.
ALTER TABLE "route_tasks" ADD COLUMN IF NOT EXISTS "manual_street" TEXT;
ALTER TABLE "route_tasks" ADD COLUMN IF NOT EXISTS "manual_building" TEXT;
ALTER TABLE "route_tasks" ADD COLUMN IF NOT EXISTS "manual_first_name" TEXT;
ALTER TABLE "route_tasks" ADD COLUMN IF NOT EXISTS "manual_last_name" TEXT;
