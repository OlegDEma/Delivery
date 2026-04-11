-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('open', 'in_progress', 'resolved', 'rejected');

-- CreateTable
CREATE TABLE "claims" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parcel_id" UUID NOT NULL,
    "client_id" UUID,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "resolution" TEXT,
    "status" "ClaimStatus" NOT NULL DEFAULT 'open',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "claims_parcel_id_idx" ON "claims"("parcel_id");

-- CreateIndex
CREATE INDEX "claims_status_idx" ON "claims"("status");

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
