-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "deleted_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "parcels" ADD COLUMN     "deleted_at" TIMESTAMPTZ,
ADD COLUMN     "route_task_fail_reason" TEXT,
ADD COLUMN     "route_task_reschedule_date" DATE,
ADD COLUMN     "route_task_status" TEXT;
