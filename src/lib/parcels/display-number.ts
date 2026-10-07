/**
 * ТЗ docx 04.10.26: «Забрати дату створення посилки» з шапки (і, за рішенням
 * від 05.10.26, зі списків посилок). Номер у БД («13 Rosmalen 1, 03.10.2026»)
 * НЕ змінюємо — він на етикетках і в пошуку; прибираємо дату лише на екрані.
 */
export function displayParcelNumber(internalNumber: string): string {
  return internalNumber.replace(/,\s*\d{2}\.\d{2}\.\d{4}\s*$/, '');
}
