-- ТЗ docx 29.06.26 «Тарифи»: додаткова послуга «Доставка до порога будинку».
-- doorstep_enabled — чи пропонується послуга для напрямку (чекбокс у адмінці);
-- doorstep_price   — сума, що АДИТИВНО додається до вартості посилки при
--                    адресній доставці (до порога). Default 0/false — наявні
--                    тарифи поведінки не змінюють, поки адмін не увімкне.
ALTER TABLE "pricing_config"
  ADD COLUMN "doorstep_enabled" BOOLEAN        NOT NULL DEFAULT false,
  ADD COLUMN "doorstep_price"   NUMERIC(10, 2) NOT NULL DEFAULT 0;
