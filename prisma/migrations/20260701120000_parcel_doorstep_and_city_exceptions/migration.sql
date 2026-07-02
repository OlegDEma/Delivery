-- ТЗ docx 01.07.26.
-- (C7) Опт-ін «Доставка до порога будинку» per-parcel + збережена нарахована сума.
ALTER TABLE "parcels"
  ADD COLUMN "doorstep_delivery" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "doorstep_cost"     NUMERIC(10, 2) DEFAULT 0;

-- (C8) Винятки-міста для правила обмеження на всю країну (service_cities.city='*').
ALTER TABLE "service_cities"
  ADD COLUMN "exceptions" TEXT[] NOT NULL DEFAULT '{}';
