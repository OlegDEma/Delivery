-- Per ТЗ §8/§E11: «Невірно рахується Розрахункова вага! Бере більшу
-- замість рахувати згідно правил!». Тип `actual` означав max(факт, об'ємна),
-- що ТЗ явно називає помилкою — розрахункова вага має бути комбінацією
-- часток. Переводимо всі тарифи з `actual` на `custom`, тоді калькулятор
-- застосовує `weight_custom_factual_fraction` (default 0.5 = середня).
-- Адмін потім донастроює точну частку в /admin/pricing.
--
-- Тарифи явно виставлені на `volumetric` чи `average` — НЕ чіпаємо.
UPDATE "pricing_config"
SET "weight_type" = 'custom'
WHERE "weight_type" = 'actual';

-- Default for new rows.
ALTER TABLE "pricing_config"
  ALTER COLUMN "weight_type" SET DEFAULT 'custom';
