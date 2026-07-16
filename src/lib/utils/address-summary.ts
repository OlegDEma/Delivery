import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';

export interface PartyAddrLike {
  country?: string | null;
  city?: string | null;
  street?: string | null;
  building?: string | null;
  apartment?: string | null;
  postalCode?: string | null;
  landmark?: string | null;
  npWarehouseNum?: string | null;
  pickupPointText?: string | null;
  deliveryMethod?: string | null;
}

/**
 * ТЗ docx 15.07.26 (п.2): у підсумковій формі Отримувача/Відправника мають
 * бути ЛИШЕ дані, збережені останніми — тобто лише для ПОТОЧНОГО способу
 * доставки. Приклад бага: після зміни «Пошта (НП №12)» → «Адресна (Ударна 2)»
 * у підсумку висіла і Ударна 2, і НП №12. Тепер поля гейтяться за
 * deliveryMethod, тож нерелевантні дані не показуються.
 *
 * Повертає { main, suffix }:
 *  - main   — адреса для <AddressLink> (клікабельне посилання на карту);
 *  - suffix — додаток (кв., орієнтир, НП, пункт видачі) вже зі своїм роздільником.
 * Обидві сторінки (staff /parcels/[id] + client /my-orders/[id]) використовують
 * це → вигляд гарантовано однаковий (ТЗ docx 15.07.26 п.3).
 *
 * hideCountryForUA=true — для Відправника (країну «Україна» не показуємо).
 */
export function summarizePartyAddress(
  a: PartyAddrLike,
  opts?: { hideCountryForUA?: boolean },
): { main: string; suffix: string } {
  const method = a.deliveryMethod || 'address';
  const countryLabel = a.country ? (COUNTRY_LABELS[a.country as CountryCode] || a.country) : '';
  const showCountry = !!countryLabel && !(opts?.hideCountryForUA && a.country === 'UA');
  // Індекс (поштовий код) — релевантний для не-UA сторони (ТЗ docx 01.07.26).
  const showPostal = !!a.postalCode && a.country !== 'UA';

  let main = [showCountry ? countryLabel : null, a.city].filter(Boolean).join(', ');
  if (method === 'address') {
    if (a.street) main += `, ${a.street}`;
    if (a.building) main += ` ${a.building}`;
  }
  if (showPostal) main += `, ${a.postalCode}`;

  const suffix: string[] = [];
  if (method === 'address') {
    if (a.apartment) suffix.push(`, кв. ${a.apartment}`);
    if (a.landmark) suffix.push(` (${a.landmark})`);
  } else if (method === 'np_warehouse') {
    if (a.npWarehouseNum) suffix.push(` | НП №${a.npWarehouseNum}`);
  } else if (method === 'pickup_point') {
    if (a.pickupPointText) suffix.push(` | ${a.pickupPointText}`);
  }

  return { main, suffix: suffix.join('') };
}
