/**
 * ТЗ (docx 20.06.26): «Виклик кур'єра» та «Пошта» доступні ЗА ЗАМОВЧУВАННЯМ
 * у всіх країнах і всіх населених пунктах. Адмін може ЗАБОРОНИТИ опцію для
 * окремого населеного пункту або цілої країни (розділ Логістика → «Міста
 * обслуговування»).
 *
 * Заборона зберігається рядком ServiceCity, де відповідний прапорець = false:
 *   - acceptsCourierPickup === false → «Виклик кур'єра»/«Адресна доставка» заборонено;
 *   - acceptsPostal === false        → «Пошта» заборонено.
 * Рядок з city === '*' діє на ВСЮ країну; інакше — на конкретне місто.
 * Відсутність рядка/прапорець true → опція доступна (дефолт).
 *
 * ТЗ docx 29.06.26: обмеження можна задати ОКРЕМО для Відправника та Отримувача
 * (поле target). Приклад: Австрія — Отримувач може отримати поштою, а Відправник
 * відправити нам поштою не може. target='both' діє на обидві сторони.
 */
export type ServiceSide = 'sender' | 'receiver';
export type ServiceTargetValue = ServiceSide | 'both';

export interface ServiceRule {
  country: string;
  city: string;
  acceptsCourierPickup: boolean;
  acceptsPostal: boolean;
  /** На кого поширюється обмеження: відправник / отримувач / обидва. */
  target?: ServiceTargetValue;
}

/** Спец-значення city для правила на цілу країну. */
export const COUNTRY_WIDE_CITY = '*';

function forbidden(
  rules: ServiceRule[],
  country: string | null | undefined,
  city: string | null | undefined,
  flag: 'acceptsCourierPickup' | 'acceptsPostal',
  side: ServiceSide,
): boolean {
  if (!country) return false; // без країни заборону не визначити → дозволено
  const c = (city || '').trim().toLowerCase();
  return rules.some(r => {
    const target = r.target || 'both';
    return r.country === country && r[flag] === false &&
      (target === 'both' || target === side) &&
      (r.city === COUNTRY_WIDE_CITY || r.city.trim().toLowerCase() === c);
  });
}

/**
 * «Виклик кур'єра» / «Адресна доставка» дозволені (default true, якщо не
 * заборонено в Логістиці для цієї сторони).
 */
export function isCourierAllowed(
  rules: ServiceRule[],
  country: string | null | undefined,
  city: string | null | undefined,
  side: ServiceSide,
): boolean {
  return !forbidden(rules, country, city, 'acceptsCourierPickup', side);
}

/** «Пошта» дозволена (default true, якщо не заборонено в Логістиці для сторони). */
export function isPostalAllowed(
  rules: ServiceRule[],
  country: string | null | undefined,
  city: string | null | undefined,
  side: ServiceSide,
): boolean {
  return !forbidden(rules, country, city, 'acceptsPostal', side);
}
