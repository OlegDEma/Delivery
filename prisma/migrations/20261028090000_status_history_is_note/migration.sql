-- ТЗ docx 26.10.26 (Рейс/Друк списку): «У списку посилок у стовпці „Примітки“ друкуються
-- саме Нотатки, які будь-хто може додати при створенні посилки». Нотатка («Додати нотатку»)
-- досі жила в історії статусів як запис без зміни статусу — поряд зі службовими записами
-- («Створено», «Перенесено з рейсу …»). Прапорець відокремлює саме нотатки.
ALTER TABLE "parcel_status_history" ADD COLUMN "is_note" BOOLEAN NOT NULL DEFAULT false;

-- Наявні нотатки: запис із тим самим статусом, що й попередній запис посилки, з текстом —
-- крім службових записів перенесення між рейсами (вони теж не міняють статус).
UPDATE "parcel_status_history" h
SET "is_note" = true
FROM (
  SELECT "id", "status", LAG("status") OVER (PARTITION BY "parcel_id" ORDER BY "changed_at", "id") AS "prev"
  FROM "parcel_status_history"
) x
WHERE h."id" = x."id"
  AND x."prev" IS NOT NULL
  AND x."prev" = x."status"
  AND h."notes" IS NOT NULL
  AND btrim(h."notes") <> ''
  AND h."notes" NOT LIKE 'Перенесено з рейсу %'
  AND h."notes" NOT LIKE 'Прив''язано до рейсу %';
