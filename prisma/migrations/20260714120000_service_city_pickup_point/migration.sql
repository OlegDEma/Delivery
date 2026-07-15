-- ТЗ docx 12.07.26: обмеження «Заборонити "Пункт збору"» у Містах обслуговування.
-- Механізм аналогічний «Пошта»/«Виклик кур'єра»: false = заборонено.
ALTER TABLE "service_cities"
  ADD COLUMN "accepts_pickup_point" BOOLEAN NOT NULL DEFAULT true;
