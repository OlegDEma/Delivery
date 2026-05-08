-- Singleton row for carrier bank details + SMS invoice template.
CREATE TABLE IF NOT EXISTS "invoice_settings" (
  "id"             UUID        NOT NULL DEFAULT gen_random_uuid(),
  "is_singleton"   BOOLEAN     NOT NULL DEFAULT TRUE,
  "bank_name"      TEXT,
  "iban"           TEXT,
  "account_holder" TEXT,
  "swift"          TEXT,
  "sms_template"   TEXT,
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "invoice_settings_pkey"            PRIMARY KEY ("id"),
  CONSTRAINT "invoice_settings_is_singleton_uq" UNIQUE      ("is_singleton")
);

-- Seed the single row so the admin UI never has to "create" it.
INSERT INTO "invoice_settings" ("bank_name", "iban", "account_holder", "swift", "sms_template")
VALUES (
  NULL, NULL, NULL, NULL,
  E'Шановний(а) {{name}}!\nДо оплати за доставку {{internalNumber}}: {{amount}} EUR.\nРеквізити: {{accountHolder}}, IBAN {{iban}} ({{bankName}}).\nДякуємо!'
)
ON CONFLICT DO NOTHING;

-- Audit log for every SMS-invoice send attempt.
CREATE TABLE IF NOT EXISTS "sms_log" (
  "id"             UUID        NOT NULL DEFAULT gen_random_uuid(),
  "parcel_id"      UUID,
  "to_party"       TEXT        NOT NULL,
  "to_phone"       TEXT        NOT NULL,
  "body"           TEXT        NOT NULL,
  "provider"       TEXT,
  "status"         TEXT        NOT NULL,
  "error_message"  TEXT,
  "sent_by"        UUID,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "sms_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sms_log_parcel_id_idx"  ON "sms_log" ("parcel_id");
CREATE INDEX IF NOT EXISTS "sms_log_created_at_idx" ON "sms_log" ("created_at");
