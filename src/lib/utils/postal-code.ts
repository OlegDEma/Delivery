/**
 * ТЗ docx 12.10.26 «Створення посилки Клієнтом»: «При введенні індексу міста в
 * Нідерландах після введення цифр автоматично робиться пропуск на один знак і букви
 * вводяться автоматично великими» — формат NL-індексу «1234 AB».
 *
 * Для інших країн значення не чіпаємо. `prev` — попереднє значення поля: пробіл після
 * 4 цифр додаємо лише коли користувач ДОПИСУЄ, інакше Backspace по пробілу одразу
 * повертав би його назад і стерти цифру було б неможливо.
 */
export function formatPostalCodeInput(next: string, prev: string, country: string | null | undefined): string {
  if (country !== 'NL') return next;
  const compact = next.toUpperCase().replace(/\s+/g, '');
  const m = compact.match(/^(\d{0,4})([A-Z]{0,2})/);
  if (!m) return next.toUpperCase();
  const [, digits, letters] = m;
  // Нестандартне введення (зайві символи) — лише великі літери, без обрізання.
  if (digits.length + letters.length !== compact.length) return next.toUpperCase();
  if (letters) return digits.length === 4 ? `${digits} ${letters}` : compact;
  const growing = next.length > prev.length;
  return digits.length === 4 && growing ? `${digits} ` : digits;
}
