-- ТЗ docx 12.10.26: «Усі телефони повинні друкуватись з кодом країни. Прошу пояснити,
-- чому деякі телефони відображаються з кодом країни а деякі без?»
-- Причина: при пошуку клієнта за цифрами без «+» (напр. 647863741) форма створення
-- брала ці цифри як є; селектор показував код країни клієнта (🇳🇱 +31), але в базу
-- йшов номер без коду. Код форми виправлено; тут — доповнюємо наявні номери кодом
-- країни картки клієнта (саме його оператор бачив у селекторі). Лише номери з цифр,
-- без «+», і лише якщо після доповнення номер не збігається з іншим клієнтом.
-- Бекап «до»: C:/Users/olegd/Delivery-backup-2026-09-15T15-23-11/phones-2026-10-13/before.json

UPDATE clients c
SET phone = n.full_phone,
    phone_normalized = substr(n.full_phone, 2)
FROM (
  SELECT id,
         (CASE country::text WHEN 'UA' THEN '+380' WHEN 'NL' THEN '+31' WHEN 'AT' THEN '+43' WHEN 'DE' THEN '+49' END)
           || regexp_replace(phone, '^0+', '') AS full_phone
  FROM clients
  WHERE left(phone, 1) <> '+'
    AND phone ~ '^[0-9]+$'
    AND country IS NOT NULL
) n
WHERE c.id = n.id
  AND n.full_phone IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM clients d WHERE d.phone = n.full_phone AND d.id <> c.id);

-- Знімки сторін у прийнятих посилках (ТЗ 26.07.26): той самий номер — з кодом країни
-- адреси знімка.
UPDATE parcels
SET sender_snapshot = jsonb_set(sender_snapshot::jsonb, '{phone}', to_jsonb(
      (CASE sender_snapshot->'address'->>'country' WHEN 'UA' THEN '+380' WHEN 'NL' THEN '+31' WHEN 'AT' THEN '+43' WHEN 'DE' THEN '+49' END)
      || regexp_replace(sender_snapshot->>'phone', '^0+', '')))
WHERE left(sender_snapshot->>'phone', 1) <> '+'
  AND sender_snapshot->>'phone' ~ '^[0-9]+$'
  AND sender_snapshot->'address'->>'country' IN ('UA', 'NL', 'AT', 'DE');

UPDATE parcels
SET receiver_snapshot = jsonb_set(receiver_snapshot::jsonb, '{phone}', to_jsonb(
      (CASE receiver_snapshot->'address'->>'country' WHEN 'UA' THEN '+380' WHEN 'NL' THEN '+31' WHEN 'AT' THEN '+43' WHEN 'DE' THEN '+49' END)
      || regexp_replace(receiver_snapshot->>'phone', '^0+', '')))
WHERE left(receiver_snapshot->>'phone', 1) <> '+'
  AND receiver_snapshot->>'phone' ~ '^[0-9]+$'
  AND receiver_snapshot->'address'->>'country' IN ('UA', 'NL', 'AT', 'DE');
