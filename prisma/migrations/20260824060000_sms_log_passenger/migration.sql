-- ТЗ docx 23.08.26 (Пасажири, п.5-6): підтвердження та рахунок надсилаються також
-- ПАСАЖИРУ (WhatsApp/Viber/SMS), тож лог повідомлень має вміти посилатись не лише
-- на посилку, а й на пасажира.
ALTER TABLE "sms_log" ADD COLUMN IF NOT EXISTS "passenger_id" UUID;
CREATE INDEX IF NOT EXISTS "sms_log_passenger_id_idx" ON "sms_log" ("passenger_id");
