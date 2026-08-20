-- ТЗ docx 18.08.26: авто-відправка підтверджень різними каналами + єдиний лог.
-- Розширюємо sms_log: канал доставки та вид повідомлення.
ALTER TABLE "sms_log" ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'sms';
ALTER TABLE "sms_log" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'invoice';
