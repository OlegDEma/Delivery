/**
 * ТЗ docx 28.09.26 (скарга «Не використовує при обрахунку тарифи, тобто
 * мінімальну оплату») + ТЗ docx 21.09.26 (п.3 «вартість повинна рахуватись
 * згідно вибраної опції»).
 *
 * «Пункт збору/видачі» — це САМООБСЛУГОВУВАННЯ з двох боків: або Відправник
 * сам привозить посилку у наш пункт (collectionMethod='pickup_point',
 * напрямок EU→UA), або Отримувач сам забирає її з пункту видачі
 * (receiverAddress.deliveryMethod='pickup_point'). В обох випадках діє
 * мінімальна вартість `pickupPointPrice` з Тарифів (NL 15 €, AT 10 €).
 *
 * Раніше враховувався лише перший випадок, тож посилка 0.1 кг до пункту видачі
 * у Відні виходила 0.26 € — саме це клієнт і назвав «рахує собі, не беручи до
 * уваги правила».
 */
export function isPickupPointPricing(opts: {
  direction?: string | null;
  collectionMethod?: string | null;
  receiverDeliveryMethod?: string | null;
}): boolean {
  const senderSide = opts.direction === 'eu_to_ua' && opts.collectionMethod === 'pickup_point';
  const receiverSide = opts.receiverDeliveryMethod === 'pickup_point';
  return senderSide || receiverSide;
}

/**
 * ТЗ docx 09.10.26 (Загальні зауваження, п.2): «Як мінімальний платіж у Нідерланди
 * може складати, при адресній доставці менше 30€? Це невірно».
 *
 * Причина: мінімум «Адресна доставка» вмикався лише коли в адресі Отримувача стояло
 * deliveryMethod='address'. Але в Європі Нової пошти немає — для «Україна→Європа»
 * посилку або везуть на адресу, або Отримувач забирає її з пункту видачі. Якщо ж до
 * посилки потрапила адреса з іншим способом (напр. українська адреса «НП відділення»
 * того самого клієнта) — мінімум мовчки не застосовувався (29 € замість 30 €).
 * Тепер для UA→EU все, що не «Пункт видачі», — адресна доставка.
 */
export function isAddressDeliveryPricing(opts: {
  direction?: string | null;
  receiverDeliveryMethod?: string | null;
}): boolean {
  if (opts.direction === 'ua_to_eu') return opts.receiverDeliveryMethod !== 'pickup_point';
  return opts.receiverDeliveryMethod === 'address';
}

/**
 * Адреса клієнта «на потрібному боці» маршруту: Отримувач у UA→EU і Відправник у
 * EU→UA — у Європі; Отримувач у EU→UA і Відправник у UA→EU — в Україні.
 * ТЗ docx 09.10.26: у клієнта бувають адреси в обох країнах (напр. отримує в
 * Нідерландах, а відправляв з Києва) — брати треба ту, що відповідає напрямку.
 */
export function isAddressOnSide(
  country: string | null | undefined,
  direction: string | null | undefined,
  role: 'sender' | 'receiver',
): boolean {
  if (!country || !direction) return true;
  const euSide = (direction === 'ua_to_eu') === (role === 'receiver');
  return euSide ? country !== 'UA' : country === 'UA';
}
