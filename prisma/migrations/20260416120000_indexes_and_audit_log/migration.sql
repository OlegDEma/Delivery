-- Composite indexes for hot queries on parcels
CREATE INDEX "parcels_deleted_at_created_at_idx"
  ON "parcels" ("deleted_at", "created_at" DESC);

CREATE INDEX "parcels_direction_status_idx"
  ON "parcels" ("direction", "status");

CREATE INDEX "parcels_trip_id_status_idx"
  ON "parcels" ("trip_id", "status");

CREATE INDEX "parcels_is_paid_direction_idx"
  ON "parcels" ("is_paid", "direction");

-- Status history timeline queries: WHERE parcel_id = ? ORDER BY changed_at DESC
CREATE INDEX "parcel_status_history_parcel_id_changed_at_idx"
  ON "parcel_status_history" ("parcel_id", "changed_at" DESC);

-- Audit log: records sensitive operations.
CREATE TABLE "audit_log" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event" TEXT NOT NULL,
  "actor_id" UUID,
  "subject_id" UUID,
  "subject_type" TEXT,
  "payload" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_log_event_idx" ON "audit_log" ("event");
CREATE INDEX "audit_log_actor_id_idx" ON "audit_log" ("actor_id");
CREATE INDEX "audit_log_subject_id_idx" ON "audit_log" ("subject_id");
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" ("created_at");
