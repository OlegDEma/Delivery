-- ТЗ docx 26.07.26 (п.1): незмінний знімок сторін для accepted+ посилок.
-- Nullable JSONB — існуючі рядки не порушуються; draft лишається NULL.
ALTER TABLE "parcels"
  ADD COLUMN IF NOT EXISTS "sender_snapshot"   JSONB,
  ADD COLUMN IF NOT EXISTS "receiver_snapshot" JSONB;

-- BACKFILL: усі НЕ-draft посилки без знімка отримують знімок з поточних живих
-- даних Client + прив'язаної ClientAddress. Ключі camelCase — щоб збігалися з
-- TS PartySnapshot (buildPartySnapshot у JS дає таку саму форму).
UPDATE "parcels" p
SET "sender_snapshot" = (
  SELECT jsonb_build_object(
    'firstName',  s."first_name",
    'lastName',   s."last_name",
    'middleName', s."middle_name",
    'phone',      s."phone",
    'address', (
      SELECT jsonb_build_object(
        'country',         a."country",
        'city',            a."city",
        'street',          a."street",
        'building',        a."building",
        'apartment',       a."apartment",
        'postalCode',      a."postal_code",
        'landmark',        a."landmark",
        'npWarehouseNum',  a."np_warehouse_num",
        'npPoshtamatNum',  a."np_poshtamat_num",
        'pickupPointText', a."pickup_point_text",
        'deliveryMethod',  a."delivery_method"
      )
      FROM "client_addresses" a WHERE a."id" = p."sender_address_id"
    )
  )
  FROM "clients" s WHERE s."id" = p."sender_id"
)
WHERE p."status" <> 'draft' AND p."sender_snapshot" IS NULL;

UPDATE "parcels" p
SET "receiver_snapshot" = (
  SELECT jsonb_build_object(
    'firstName',  r."first_name",
    'lastName',   r."last_name",
    'middleName', r."middle_name",
    'phone',      r."phone",
    'address', (
      SELECT jsonb_build_object(
        'country',         a."country",
        'city',            a."city",
        'street',          a."street",
        'building',        a."building",
        'apartment',       a."apartment",
        'postalCode',      a."postal_code",
        'landmark',        a."landmark",
        'npWarehouseNum',  a."np_warehouse_num",
        'npPoshtamatNum',  a."np_poshtamat_num",
        'pickupPointText', a."pickup_point_text",
        'deliveryMethod',  a."delivery_method"
      )
      FROM "client_addresses" a WHERE a."id" = p."receiver_address_id"
    )
  )
  FROM "clients" r WHERE r."id" = p."receiver_id"
)
WHERE p."status" <> 'draft' AND p."receiver_snapshot" IS NULL;
