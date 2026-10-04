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
