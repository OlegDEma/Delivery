-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "journey_id" UUID;

-- CreateTable
CREATE TABLE "journeys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "country" "Country" NOT NULL,
    "departure_date" DATE NOT NULL,
    "eu_arrival_date" DATE,
    "eu_return_date" DATE,
    "end_date" DATE,
    "status" "TripStatus" NOT NULL DEFAULT 'planned',
    "assigned_courier_id" UUID,
    "second_courier_id" UUID,
    "vehicle_info" TEXT,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journeys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "journeys_departure_date_idx" ON "journeys"("departure_date");

-- CreateIndex
CREATE INDEX "journeys_status_idx" ON "journeys"("status");

-- AddForeignKey
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_assigned_courier_id_fkey" FOREIGN KEY ("assigned_courier_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_second_courier_id_fkey" FOREIGN KEY ("second_courier_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_journey_id_fkey" FOREIGN KEY ("journey_id") REFERENCES "journeys"("id") ON DELETE SET NULL ON UPDATE CASCADE;
