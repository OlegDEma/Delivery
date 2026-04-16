-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');

-- CreateEnum
CREATE TYPE "CollectionMethod" AS ENUM ('pickup_point', 'courier_pickup', 'external_shipping', 'direct_to_driver');

-- AlterEnum
ALTER TYPE "ParcelStatus" ADD VALUE 'at_collection_point';

-- AlterTable
ALTER TABLE "collection_points" ADD COLUMN     "latitude" DECIMAL(10,7),
ADD COLUMN     "longitude" DECIMAL(10,7),
ADD COLUMN     "max_capacity" INTEGER,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "working_days" "Weekday"[] DEFAULT ARRAY[]::"Weekday"[];

-- AlterTable
ALTER TABLE "parcels" ADD COLUMN     "collected_at" TIMESTAMPTZ,
ADD COLUMN     "collected_by" UUID,
ADD COLUMN     "collection_address" TEXT,
ADD COLUMN     "collection_date" DATE,
ADD COLUMN     "collection_method" "CollectionMethod",
ADD COLUMN     "collection_point_id" UUID;

-- CreateIndex
CREATE INDEX "collection_points_country_idx" ON "collection_points"("country");

-- CreateIndex
CREATE INDEX "collection_points_is_active_idx" ON "collection_points"("is_active");

-- CreateIndex
CREATE INDEX "parcels_collection_point_id_idx" ON "parcels"("collection_point_id");

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_collection_point_id_fkey" FOREIGN KEY ("collection_point_id") REFERENCES "collection_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_collected_by_fkey" FOREIGN KEY ("collected_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
