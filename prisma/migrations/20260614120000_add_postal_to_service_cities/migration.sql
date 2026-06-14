-- Додаємо прапорець «Пошта доступна» до міст обслуговування (ТЗ docx 14.05.26).
-- Опція «Пошта» у формах показується, лише якщо в Логістиці її передбачено
-- для країни (агрегуємо acceptsPostal по країні).
ALTER TABLE "service_cities" ADD COLUMN "accepts_postal" BOOLEAN NOT NULL DEFAULT false;
