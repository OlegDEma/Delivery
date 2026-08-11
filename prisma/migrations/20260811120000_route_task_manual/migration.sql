-- ТЗ docx 08.08.26 (v12): ручні адреси на маршруті (без посилки) + task_date NULL =
-- адреса ще в ЗАГАЛЬНОМУ списку (не переміщена в Маршрутний лист).

ALTER TABLE "route_tasks" ALTER COLUMN "task_date" DROP NOT NULL;
ALTER TABLE "route_tasks" ADD COLUMN "manual_name" TEXT;
ALTER TABLE "route_tasks" ADD COLUMN "manual_phone" TEXT;
ALTER TABLE "route_tasks" ADD COLUMN "manual_direction" TEXT;
ALTER TABLE "route_tasks" ADD COLUMN "manual_city" TEXT;
