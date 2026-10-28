/**
 * ТЗ docx 26.10.26 (Рейси): «Створити можливість групування в Рейсах як і в Маршрутах.
 * Номер — мається на увазі номер посилки. При виборі параметру групування Список посилок
 * для друку відображається відповідно до вибраного групування».
 *
 * Як у Маршрутах: Місто / Індекс — групи за абеткою (без заголовків груп, ТЗ 02.09.26),
 * «Номер» — за номером посилки в поїздці. Адреса — сторона в країні призначення
 * (euSideParty / parcelParties[euSide]). Усередині групи — за номером посилки.
 */

export type TripGroupMode = 'city' | 'postal' | 'number';

/** Порядок віконечок зліва направо — як у Маршрутах (ТЗ 02.09.26): місто, індекс, номер. */
export const TRIP_GROUP_MODES: { value: TripGroupMode; label: string }[] = [
  { value: 'city', label: 'Місто' },
  { value: 'postal', label: 'Індекс' },
  { value: 'number', label: 'Номер' },
];

export function parseTripGroupMode(raw: string | null | undefined): TripGroupMode {
  return raw === 'city' || raw === 'postal' ? raw : 'number';
}

interface GroupAddr { city?: string | null; postalCode?: string | null }

/** Ключ групи («Wien», «wien » — одна група, як у Маршрутах); порожній — без міста/індексу. */
function groupKey(addr: GroupAddr | null | undefined, mode: TripGroupMode): string {
  const raw = mode === 'postal' ? addr?.postalCode : addr?.city;
  return (raw ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('uk');
}

/**
 * Упорядкувати записи рейсу за групуванням. Записи без міста/індексу — у кінці;
 * усередині групи і для «Номер» — за номером у поїздці (без номера — у кінці).
 */
export function orderTripItems<T>(
  items: T[],
  mode: TripGroupMode,
  getAddr: (t: T) => GroupAddr | null | undefined,
  getNum: (t: T) => number | null | undefined,
): T[] {
  const num = (t: T) => getNum(t) ?? Number.MAX_SAFE_INTEGER;
  if (mode === 'number') return [...items].sort((a, b) => num(a) - num(b));
  return items
    .map((t) => ({ t, k: groupKey(getAddr(t), mode) }))
    .sort((a, b) => {
      if (!a.k !== !b.k) return a.k ? -1 : 1;
      return a.k.localeCompare(b.k, 'uk') || num(a.t) - num(b.t);
    })
    .map((x) => x.t);
}
