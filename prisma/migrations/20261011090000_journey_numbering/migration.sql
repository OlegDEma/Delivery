-- ТЗ docx 11.10.26: наскрізна нумерація посилок у поїздці + перенесення між рейсами (ТЗ 09.10.26).
ALTER TABLE "parcels" ADD COLUMN IF NOT EXISTS "journey_number" INTEGER;
ALTER TABLE "journeys" ADD COLUMN IF NOT EXISTS "parcel_counter" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "parcel_transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parcel_id" UUID NOT NULL,
    "from_trip_id" UUID NOT NULL,
    "to_trip_id" UUID,
    "journey_number" INTEGER,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "parcel_transfers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "parcel_transfers_from_trip_id_idx" ON "parcel_transfers"("from_trip_id");
CREATE INDEX IF NOT EXISTS "parcel_transfers_parcel_id_idx" ON "parcel_transfers"("parcel_id");
ALTER TABLE "parcel_transfers" ADD CONSTRAINT "parcel_transfers_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "parcel_transfers" ADD CONSTRAINT "parcel_transfers_from_trip_id_fkey" FOREIGN KEY ("from_trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "parcel_transfers" ADD CONSTRAINT "parcel_transfers_to_trip_id_fkey" FOREIGN KEY ("to_trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
