-- Per ТЗ: при collection_method = courier_pickup оператор зазначає, чи від
-- цього відправника це єдина посилка, чи 2+. Впливає на мінімальний тариф
-- (single → addressDeliveryPrice; multi → minMultiPerAddress).
ALTER TABLE "parcels"
  ADD COLUMN IF NOT EXISTS "is_multi_parcel_pickup" BOOLEAN;
