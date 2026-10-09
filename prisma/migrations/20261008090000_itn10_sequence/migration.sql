-- ТЗ docx 07.10.26 «Генератор унікальних трек-номерів посилок» (ІТН, 10 цифр).
-- 1) Глобальний лічильник порядкових номерів ІТН: на відміну від yearly_sequence
--    НЕ обнуляється щороку — інакше 10-значні номери повторювались би через рік.
CREATE SEQUENCE IF NOT EXISTS "parcel_itn_seq" START WITH 1 MINVALUE 1 MAXVALUE 999999 NO CYCLE;

-- 2) Старий 14-значний ІТН для вже створених посилок: на надрукованих етикетках
--    QR містить саме його — пошук/відстеження мають і далі знаходити посилку.
ALTER TABLE "parcels" ADD COLUMN IF NOT EXISTS "itn_legacy" TEXT;
CREATE INDEX IF NOT EXISTS "parcels_itn_legacy_idx" ON "parcels" ("itn_legacy");
