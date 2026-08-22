-- ТЗ docx 21.08.26 (Транспортні засоби): у кожному мікроавтобусі вказується
-- загальна кількість місць (включно з водієм) + можливість зберігати декілька
-- документів-фото (зелена карта, ОСЦПВ, техогляд, дві сторінки техпаспорта),
-- з можливістю видалити/замінити. tech_passport_photo (стор. 1) вже існує.
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "total_seats" INTEGER;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "green_card_photo" TEXT;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "oscpv_photo" TEXT;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "tech_inspection_photo" TEXT;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "tech_passport_photo_2" TEXT;
