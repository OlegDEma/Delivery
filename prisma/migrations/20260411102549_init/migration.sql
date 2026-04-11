-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('super_admin', 'admin', 'warehouse_worker', 'driver_courier', 'client');

-- CreateEnum
CREATE TYPE "Country" AS ENUM ('UA', 'NL', 'AT', 'DE');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('individual', 'organization');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('address', 'np_warehouse', 'np_poshtamat');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('eu_to_ua', 'ua_to_eu');

-- CreateEnum
CREATE TYPE "ShipmentType" AS ENUM ('parcels_cargo', 'documents', 'tires_wheels');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'cashless');

-- CreateEnum
CREATE TYPE "Payer" AS ENUM ('sender', 'receiver');

-- CreateEnum
CREATE TYPE "ParcelStatus" AS ENUM ('draft', 'accepted_for_transport_to_ua', 'in_transit_to_ua', 'at_lviv_warehouse', 'at_nova_poshta', 'delivered_ua', 'accepted_for_transport_to_eu', 'in_transit_to_eu', 'at_eu_warehouse', 'delivered_eu', 'not_received', 'refused', 'returned');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('planned', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "RouteTaskType" AS ENUM ('pickup', 'delivery', 'passenger');

-- CreateEnum
CREATE TYPE "RouteTaskStatus" AS ENUM ('pending', 'address_confirmed', 'in_navigator', 'completed', 'not_completed', 'rescheduled');

-- CreateEnum
CREATE TYPE "CashPaymentType" AS ENUM ('income', 'expense', 'refund');

-- CreateEnum
CREATE TYPE "WeightType" AS ENUM ('actual', 'volumetric', 'average');

-- CreateEnum
CREATE TYPE "CreatedSource" AS ENUM ('worker', 'client_web', 'client_telegram');

-- CreateEnum
CREATE TYPE "WarehouseAction" AS ENUM ('received', 'dispatched', 'scanned', 'packaged');

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'client',
    "avatar_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone" TEXT NOT NULL,
    "phone_normalized" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "email" TEXT,
    "client_type" "ClientType" NOT NULL DEFAULT 'individual',
    "organization_name" TEXT,
    "country" "Country",
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "country" "Country" NOT NULL,
    "city" TEXT NOT NULL,
    "street" TEXT,
    "building" TEXT,
    "apartment" TEXT,
    "postal_code" TEXT,
    "landmark" TEXT,
    "np_warehouse_num" TEXT,
    "np_poshtamat_num" TEXT,
    "delivery_method" "DeliveryMethod" NOT NULL DEFAULT 'address',
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "direction" "Direction" NOT NULL,
    "country" "Country" NOT NULL,
    "departure_date" DATE NOT NULL,
    "arrival_date" DATE,
    "status" "TripStatus" NOT NULL DEFAULT 'planned',
    "assigned_courier_id" UUID,
    "second_courier_id" UUID,
    "vehicle_info" TEXT,
    "notes" TEXT,
    "short_number_counter_nl" INTEGER NOT NULL DEFAULT 0,
    "short_number_counter_vienna" INTEGER NOT NULL DEFAULT 0,
    "short_number_counter_linz" INTEGER NOT NULL DEFAULT 0,
    "short_number_counter_geo" INTEGER NOT NULL DEFAULT 0,
    "short_number_counter_eu_ua" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "itn" TEXT NOT NULL,
    "internal_number" TEXT NOT NULL,
    "sequential_number" INTEGER NOT NULL,
    "short_number" INTEGER,
    "direction" "Direction" NOT NULL,
    "sender_id" UUID NOT NULL,
    "sender_address_id" UUID,
    "receiver_id" UUID NOT NULL,
    "receiver_address_id" UUID,
    "trip_id" UUID,
    "shipment_type" "ShipmentType" NOT NULL DEFAULT 'parcels_cargo',
    "description" TEXT,
    "declared_value" DECIMAL(10,2),
    "declared_value_currency" TEXT NOT NULL DEFAULT 'EUR',
    "total_weight" DECIMAL(8,3),
    "total_volumetric_weight" DECIMAL(8,3),
    "total_places_count" INTEGER NOT NULL DEFAULT 1,
    "payer" "Payer" NOT NULL DEFAULT 'sender',
    "payment_method" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "payment_in_ukraine" BOOLEAN NOT NULL DEFAULT false,
    "needs_packaging" BOOLEAN NOT NULL DEFAULT false,
    "delivery_cost" DECIMAL(10,2),
    "packaging_cost" DECIMAL(10,2) DEFAULT 0,
    "insurance_cost" DECIMAL(10,2) DEFAULT 0,
    "address_delivery_cost" DECIMAL(10,2) DEFAULT 0,
    "total_cost" DECIMAL(10,2),
    "cost_currency" TEXT NOT NULL DEFAULT 'EUR',
    "np_ttn" TEXT,
    "np_tracking_status" TEXT,
    "status" "ParcelStatus" NOT NULL DEFAULT 'draft',
    "created_source" "CreatedSource" NOT NULL DEFAULT 'worker',
    "created_by" UUID,
    "assigned_courier_id" UUID,
    "estimated_delivery_start" TIMESTAMPTZ,
    "estimated_delivery_end" TIMESTAMPTZ,
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "paid_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parcels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcel_places" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parcel_id" UUID NOT NULL,
    "place_number" INTEGER NOT NULL,
    "weight" DECIMAL(8,3),
    "length" DECIMAL(8,2),
    "width" DECIMAL(8,2),
    "height" DECIMAL(8,2),
    "volume" DECIMAL(10,4),
    "volumetric_weight" DECIMAL(8,3),
    "needs_packaging" BOOLEAN NOT NULL DEFAULT false,
    "packaging_done" BOOLEAN NOT NULL DEFAULT false,
    "itn_place" TEXT,
    "barcode_data" TEXT,
    "scanned_at_warehouse" TIMESTAMPTZ,
    "scanned_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parcel_places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcel_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parcel_id" UUID NOT NULL,
    "status" "ParcelStatus" NOT NULL,
    "changed_by" UUID,
    "changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "location" TEXT,

    CONSTRAINT "parcel_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_config" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "country" "Country" NOT NULL,
    "direction" "Direction" NOT NULL,
    "price_per_kg" DECIMAL(10,2) NOT NULL,
    "weight_type" "WeightType" NOT NULL DEFAULT 'actual',
    "insurance_threshold" DECIMAL(10,2) NOT NULL DEFAULT 25.00,
    "insurance_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.01,
    "insurance_enabled" BOOLEAN NOT NULL DEFAULT true,
    "packaging_enabled" BOOLEAN NOT NULL DEFAULT true,
    "packaging_prices" JSONB,
    "address_delivery_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "collection_days" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_points" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "country" "Country" NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "postal_code" TEXT,
    "contact_phone" TEXT,
    "working_hours" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_register" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parcel_id" UUID,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "payment_type" "CashPaymentType" NOT NULL DEFAULT 'income',
    "description" TEXT,
    "received_by" UUID NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_register_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" UUID NOT NULL,
    "parcel_id" UUID,
    "task_type" "RouteTaskType" NOT NULL,
    "task_date" DATE NOT NULL,
    "client_id" UUID,
    "address_id" UUID,
    "address_text" TEXT,
    "postal_code" TEXT,
    "assigned_courier_id" UUID,
    "status" "RouteTaskStatus" NOT NULL DEFAULT 'pending',
    "reschedule_date" DATE,
    "failure_reason" TEXT,
    "sort_order" INTEGER,
    "estimated_arrival_start" TIMESTAMPTZ,
    "estimated_arrival_end" TIMESTAMPTZ,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_inventory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parcel_id" UUID NOT NULL,
    "place_id" UUID,
    "action" "WarehouseAction" NOT NULL,
    "scanned_by" UUID,
    "scanned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "warehouse_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "np_sync_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parcel_id" UUID,
    "action" TEXT NOT NULL,
    "request_payload" JSONB,
    "response_payload" JSONB,
    "success" BOOLEAN,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "np_sync_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "yearly_sequence" (
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "yearly_sequence_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "description_suggestions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "text" TEXT NOT NULL,
    "usage_count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "description_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles"("email");

-- CreateIndex
CREATE INDEX "profiles_role_idx" ON "profiles"("role");

-- CreateIndex
CREATE INDEX "profiles_phone_idx" ON "profiles"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "clients_phone_key" ON "clients"("phone");

-- CreateIndex
CREATE INDEX "clients_phone_normalized_idx" ON "clients"("phone_normalized");

-- CreateIndex
CREATE INDEX "clients_last_name_first_name_idx" ON "clients"("last_name", "first_name");

-- CreateIndex
CREATE INDEX "client_addresses_client_id_idx" ON "client_addresses"("client_id");

-- CreateIndex
CREATE INDEX "client_addresses_client_id_usage_count_idx" ON "client_addresses"("client_id", "usage_count" DESC);

-- CreateIndex
CREATE INDEX "trips_departure_date_idx" ON "trips"("departure_date");

-- CreateIndex
CREATE INDEX "trips_assigned_courier_id_idx" ON "trips"("assigned_courier_id");

-- CreateIndex
CREATE INDEX "trips_status_idx" ON "trips"("status");

-- CreateIndex
CREATE UNIQUE INDEX "parcels_itn_key" ON "parcels"("itn");

-- CreateIndex
CREATE INDEX "parcels_itn_idx" ON "parcels"("itn");

-- CreateIndex
CREATE INDEX "parcels_np_ttn_idx" ON "parcels"("np_ttn");

-- CreateIndex
CREATE INDEX "parcels_sender_id_idx" ON "parcels"("sender_id");

-- CreateIndex
CREATE INDEX "parcels_receiver_id_idx" ON "parcels"("receiver_id");

-- CreateIndex
CREATE INDEX "parcels_trip_id_idx" ON "parcels"("trip_id");

-- CreateIndex
CREATE INDEX "parcels_status_idx" ON "parcels"("status");

-- CreateIndex
CREATE INDEX "parcels_assigned_courier_id_idx" ON "parcels"("assigned_courier_id");

-- CreateIndex
CREATE INDEX "parcels_created_at_idx" ON "parcels"("created_at");

-- CreateIndex
CREATE INDEX "parcels_sequential_number_idx" ON "parcels"("sequential_number");

-- CreateIndex
CREATE INDEX "parcels_trip_id_short_number_idx" ON "parcels"("trip_id", "short_number");

-- CreateIndex
CREATE UNIQUE INDEX "parcel_places_itn_place_key" ON "parcel_places"("itn_place");

-- CreateIndex
CREATE INDEX "parcel_places_parcel_id_idx" ON "parcel_places"("parcel_id");

-- CreateIndex
CREATE UNIQUE INDEX "parcel_places_parcel_id_place_number_key" ON "parcel_places"("parcel_id", "place_number");

-- CreateIndex
CREATE INDEX "parcel_status_history_parcel_id_idx" ON "parcel_status_history"("parcel_id");

-- CreateIndex
CREATE INDEX "parcel_status_history_changed_at_idx" ON "parcel_status_history"("changed_at");

-- CreateIndex
CREATE INDEX "cash_register_parcel_id_idx" ON "cash_register"("parcel_id");

-- CreateIndex
CREATE INDEX "cash_register_received_by_idx" ON "cash_register"("received_by");

-- CreateIndex
CREATE INDEX "cash_register_created_at_idx" ON "cash_register"("created_at");

-- CreateIndex
CREATE INDEX "route_tasks_trip_id_idx" ON "route_tasks"("trip_id");

-- CreateIndex
CREATE INDEX "route_tasks_task_date_idx" ON "route_tasks"("task_date");

-- CreateIndex
CREATE INDEX "route_tasks_assigned_courier_id_idx" ON "route_tasks"("assigned_courier_id");

-- CreateIndex
CREATE INDEX "route_tasks_postal_code_idx" ON "route_tasks"("postal_code");

-- CreateIndex
CREATE INDEX "warehouse_inventory_parcel_id_idx" ON "warehouse_inventory"("parcel_id");

-- CreateIndex
CREATE INDEX "warehouse_inventory_scanned_at_idx" ON "warehouse_inventory"("scanned_at");

-- CreateIndex
CREATE INDEX "np_sync_log_parcel_id_idx" ON "np_sync_log"("parcel_id");

-- CreateIndex
CREATE UNIQUE INDEX "description_suggestions_text_key" ON "description_suggestions"("text");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_addresses" ADD CONSTRAINT "client_addresses_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_assigned_courier_id_fkey" FOREIGN KEY ("assigned_courier_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_second_courier_id_fkey" FOREIGN KEY ("second_courier_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_sender_address_id_fkey" FOREIGN KEY ("sender_address_id") REFERENCES "client_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_receiver_address_id_fkey" FOREIGN KEY ("receiver_address_id") REFERENCES "client_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_assigned_courier_id_fkey" FOREIGN KEY ("assigned_courier_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_places" ADD CONSTRAINT "parcel_places_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_places" ADD CONSTRAINT "parcel_places_scanned_by_fkey" FOREIGN KEY ("scanned_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_status_history" ADD CONSTRAINT "parcel_status_history_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_status_history" ADD CONSTRAINT "parcel_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_config" ADD CONSTRAINT "pricing_config_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_register" ADD CONSTRAINT "cash_register_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_register" ADD CONSTRAINT "cash_register_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_register" ADD CONSTRAINT "cash_register_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_tasks" ADD CONSTRAINT "route_tasks_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_tasks" ADD CONSTRAINT "route_tasks_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_tasks" ADD CONSTRAINT "route_tasks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_tasks" ADD CONSTRAINT "route_tasks_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "client_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_tasks" ADD CONSTRAINT "route_tasks_assigned_courier_id_fkey" FOREIGN KEY ("assigned_courier_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_inventory" ADD CONSTRAINT "warehouse_inventory_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_inventory" ADD CONSTRAINT "warehouse_inventory_scanned_by_fkey" FOREIGN KEY ("scanned_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "np_sync_log" ADD CONSTRAINT "np_sync_log_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
