-- ТЗ docx 08.08.26: транспортні засоби як сутність + звʼязок з поїздками/рейсами.

CREATE TABLE "vehicles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "reg_number" TEXT NOT NULL,
    "tech_passport_photo" TEXT,
    "oscpv_start" DATE,
    "oscpv_end" DATE,
    "green_card_start" DATE,
    "green_card_end" DATE,
    "tech_inspection_date" DATE,
    "next_tech_inspection_date" DATE,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "journeys" ADD COLUMN "vehicle_id" UUID;
ALTER TABLE "trips" ADD COLUMN "vehicle_id" UUID;

ALTER TABLE "journeys" ADD CONSTRAINT "journeys_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "journeys_vehicle_id_idx" ON "journeys"("vehicle_id");
CREATE INDEX "trips_vehicle_id_idx" ON "trips"("vehicle_id");
