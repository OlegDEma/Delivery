-- Аудит 01.10.26: прод-БД була відкрита для читання і видалення з публічним
-- anon-ключем (він лежить у JS сайту): RLS був вимкнений на всіх таблицях,
-- а ролі anon/authenticated мали SELECT/INSERT/UPDATE/DELETE/TRUNCATE.
-- Перевірено: GET /rest/v1/clients віддавав персональні дані клієнтів.
--
-- Застосунок від цього не залежить: Prisma підключається як postgres з
-- rolbypassrls=true, тож RLS на нього не діє. Єдине місце, де таблиця
-- читається клієнтським ключем — profiles (логін, middleware, use-auth,
-- reset-password), тому для неї лишаємо політику «своя стрічка».

-- 1. RLS на всі таблиці public. Без політик = anon/authenticated не бачать нічого.
ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cash_register" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."client_addresses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."clients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."collection_points" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."description_suggestions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."invoice_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."journeys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."np_sync_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."parcel_places" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."parcel_status_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."parcels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."passengers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pricing_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."route_sheets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."route_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."service_cities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sms_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."trips" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."vehicles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."warehouse_inventory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."yearly_sequence" ENABLE ROW LEVEL SECURITY;

-- 2. Прибираємо зайві гранти (захист у два шари).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

-- 3. profiles: користувач читає ЛИШЕ свій рядок (потрібно для логіну і middleware).
GRANT SELECT ON public.profiles TO authenticated;
DROP POLICY IF EXISTS profiles_self_select ON public.profiles;
CREATE POLICY profiles_self_select ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
