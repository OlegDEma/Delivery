/**
 * ТЗ (docx 20.06.26): «Виклик кур'єра» та «Пошта» доступні ЗА ЗАМОВЧУВАННЯМ
 * у всіх країнах і всіх населених пунктах. Адмін може ЗАБОРОНИТИ опцію для
 * окремого населеного пункту або цілої країни (розділ Логістика → «Міста
 * обслуговування»).
 *
 * Заборона зберігається рядком ServiceCity, де відповідний прапорець = false:
 *   - acceptsCourierPickup === false → «Виклик кур'єра» заборонено;
 *   - acceptsPostal === false        → «Пошта» заборонено.
 * Рядок з city === '*' діє на ВСЮ країну; інакше — на конкретне місто.
 * Відсутність рядка/прапорець true → опція доступна (дефолт).
 */
export interface ServiceRule {
  country: string;
  city: string;
  acceptsCourierPickup: boolean;
  acceptsPostal: boolean;
}

/** Спец-значення city для правила на цілу країну. */
export const COUNTRY_WIDE_CITY = '*';

function forbidden(
  rules: ServiceRule[],
  country: string | null | undefined,
  city: string | null | undefined,
  flag: 'acceptsCourierPickup' | 'acceptsPostal',
): boolean {
  if (!country) return false; // без країни заборону не визначити → дозволено
  const c = (city || '').trim().toLowerCase();
  return rules.some(r =>
    r.country === country && r[flag] === false &&
    (r.city === COUNTRY_WIDE_CITY || r.city.trim().toLowerCase() === c)
  );
}

/** «Виклик кур'єра» дозволений (default true, якщо не заборонено в Логістиці). */
export function isCourierAllowed(rules: ServiceRule[], country: string | null | undefined, city: string | null | undefined): boolean {
  return !forbidden(rules, country, city, 'acceptsCourierPickup');
}

/** «Пошта» дозволена (default true, якщо не заборонено в Логістиці). */
export function isPostalAllowed(rules: ServiceRule[], country: string | null | undefined, city: string | null | undefined): boolean {
  return !forbidden(rules, country, city, 'acceptsPostal');
}
