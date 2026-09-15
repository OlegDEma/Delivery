-- ТЗ docx 11.09.26 (п.1): у третьому рядку запису адреси — «Створити посилку», якщо
-- статус Відправник, АБО номер уже створеної посилки, якщо вона вже є. Щоб знати,
-- яка посилка створена з ручної адреси, запамʼятовуємо звʼязок при створенні.
ALTER TABLE "route_tasks"
  ADD COLUMN IF NOT EXISTS "created_parcel_id" UUID REFERENCES "parcels"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "route_tasks_created_parcel_id_idx" ON "route_tasks" ("created_parcel_id");
