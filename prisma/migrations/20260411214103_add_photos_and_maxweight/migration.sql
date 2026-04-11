-- AlterTable
ALTER TABLE "parcels" ADD COLUMN     "photos" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "max_weight" DECIMAL(8,2);
