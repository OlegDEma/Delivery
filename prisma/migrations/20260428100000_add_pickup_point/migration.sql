-- Add new DeliveryMethod enum value
ALTER TYPE "DeliveryMethod" ADD VALUE IF NOT EXISTS 'pickup_point';

-- Add pickup_point_text column to client_addresses
ALTER TABLE "client_addresses" ADD COLUMN IF NOT EXISTS "pickup_point_text" TEXT;
