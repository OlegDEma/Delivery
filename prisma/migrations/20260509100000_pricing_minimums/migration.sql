-- Per ТЗ: ще два мінімальних пороги в pricing_config.
--
--   min_multi_per_address — мін. вартість посилки коли від ОДНОГО відправника
--                          забираємо 2+ посилок на РІЗНІ адреси одержувачів.
--   min_both_directions   — мін. вартість посилки коли відправник одночасно
--                          і відправляє в UA, і отримує з UA з тієї ж локації.
ALTER TABLE "pricing_config"
  ADD COLUMN IF NOT EXISTS "min_multi_per_address" NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "min_both_directions"   NUMERIC(10, 2) NOT NULL DEFAULT 0;
