-- Per ТЗ §8: розрахункова вага через частки фактичної та об'ємної ваги
-- (тільки коли об'ємна > фактичної). Зберігаємо як decimal(4,3) щоб
-- помістити 0.000..1.000 з кроком 0.001.
ALTER TYPE "WeightType" ADD VALUE IF NOT EXISTS 'custom';

ALTER TABLE "pricing_config"
  ADD COLUMN IF NOT EXISTS "weight_custom_factual_fraction" NUMERIC(4, 3) NOT NULL DEFAULT 0.5;
