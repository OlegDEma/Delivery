import { normalizeCityForMatch } from '@/lib/utils/transliterate';

/** ТЗ docx 11.10.26: номер посилки в поїздці для показу — 1 → «001». */
export function formatJourneyNumber(n: number | null | undefined): string {
  return n == null ? '' : String(n).padStart(3, '0');
}

/**
 * ТЗ docx 12.10.26 (відповідь клієнта в коментарі до дати 12.10.26): локальні номери в
 * межах однієї поїздки (тижня) — окремими діапазонами за напрямком, країною і містом:
 *   Україна→Нідерланди            001–100
 *   Україна→Австрія (Відень)      101–200
 *   Україна→Австрія (Лінц)        201–300
 *   Україна→Австрія (решта країни) 301–400
 *   Нідерланди→Україна            501–600
 *   Австрія→Україна               601–700 (без прив'язки до міст)
 * Щотижня нумерація починається знову — номер прив'язаний до конкретної поїздки.
 *
 * Німеччину клієнт не назвав: беремо вільні діапазони свого напрямку — Україна→Німеччина
 * 401–500 (залишок блоку 001–500), Німеччина→Україна 701–800 (залишок 501–1000).
 */
export type JourneyRangeKey =
  | 'ua_nl' | 'ua_at_vienna' | 'ua_at_linz' | 'ua_at_geo' | 'ua_other'
  | 'nl_ua' | 'at_ua' | 'other_ua';

export const JOURNEY_NUMBER_RANGES: Record<JourneyRangeKey, { start: number; end: number; label: string }> = {
  ua_nl: { start: 1, end: 100, label: 'Україна → Нідерланди' },
  ua_at_vienna: { start: 101, end: 200, label: 'Україна → Австрія (Відень)' },
  ua_at_linz: { start: 201, end: 300, label: 'Україна → Австрія (Лінц)' },
  ua_at_geo: { start: 301, end: 400, label: 'Україна → Австрія (решта)' },
  ua_other: { start: 401, end: 500, label: 'Україна → Німеччина' },
  nl_ua: { start: 501, end: 600, label: 'Нідерланди → Україна' },
  at_ua: { start: 601, end: 700, label: 'Австрія → Україна' },
  other_ua: { start: 701, end: 800, label: 'Німеччина → Україна' },
};

/**
 * Якщо діапазон за тиждень вичерпано (напр. 101-ша посилка до Нідерландів) — посилка
 * не лишається без номера: беремо наступний вільний після 1000 (спільний «запас» поїздки).
 */
export const JOURNEY_NUMBER_OVERFLOW_START = 1001;

/**
 * Розподіл номерів для ще не пронумерованих посилок поїздки. `used` — усі вже видані
 * номери поїздки (і видалених посилок, і рядків «Перенесена до рейсу …»): наступний у
 * діапазоні = найбільший виданий у ньому + 1, тож номери не повторюються. Вичерпаний
 * діапазон → наступний вільний після 1000. Посилки — у порядку передачі (за часом створення).
 */
export function assignJourneyNumbers(
  pending: { id: string; key: JourneyRangeKey }[],
  used: number[],
): { id: string; num: number; overflow: boolean }[] {
  const next = new Map<JourneyRangeKey, number>();
  let nextOverflow = Math.max(JOURNEY_NUMBER_OVERFLOW_START - 1, ...used) + 1;
  return pending.map(({ id, key }) => {
    const range = JOURNEY_NUMBER_RANGES[key];
    const n = next.get(key)
      ?? used.reduce((m, u) => (u >= range.start && u <= range.end && u > m ? u : m), range.start - 1) + 1;
    if (n <= range.end) {
      next.set(key, n + 1);
      return { id, num: n, overflow: false };
    }
    return { id, num: nextOverflow++, overflow: true };
  });
}

/** Перше слово назви міста без номерів районів: «Wien 10», «Wien-Favoriten» → «wien». */
/**
 * Назви Відня/Лінца, як вони реально лежать у базі: латиниця, екзонім (Відень→Wien) і
 * ПОСИМВОЛЬНА транслітерація кирилиці — поле міста транслітерується на blur, а таблиця
 * екзонімів спрацьовує лише на «голе» слово, тож «Відень 10» зберігається як «Viden 10»,
 * «Вена 22» — «Vena 22», «Лінц-Урфар» — «Lints-Urfar», «у Відні» — «U Vidni».
 */
const VIENNA_NAMES = new Set(['wien', 'vienna', 'vienne', 'viden', 'vyden', 'vidni', 'vena']);
const LINZ_NAMES = new Set(['linz', 'lints', 'lynts', 'linc']);
/** Службові слова перед назвою: «м. Відень», «місто Лінц», «A-1100 Wien», «у Відні». */
const CITY_PREFIX_WORDS = new Set(['m', 'mist', 'misto', 'g', 'gorod', 'a', 'u', 'v', 'stadt', 'city']);

/** Перше значуще слово назви міста: без номерів районів, індексів і службових слів. */
function cityBase(city: string | null | undefined): string {
  const words = normalizeCityForMatch(city, 'AT')
    .replace(/[\d.,()'’"«»]/g, ' ')
    .split(/[\s\-–]+/)
    .filter(Boolean);
  return words.find((w) => !CITY_PREFIX_WORDS.has(w)) ?? '';
}

/** Місто Австрії для діапазону: Відень / Лінц / решта (за назвою, інакше — за індексом). */
export function austrianCityGroup(
  addr: { city?: string | null; postalCode?: string | null } | null | undefined,
): 'vienna' | 'linz' | 'geo' {
  const base = cityBase(addr?.city);
  // Порівнюємо ПЕРШЕ значуще слово: «Wiener Neustadt» (base «wiener») і «Schwechat bei
  // Wien» — інші міста, у Відень не потрапляють.
  if (VIENNA_NAMES.has(base)) return 'vienna';
  if (LINZ_NAMES.has(base)) return 'linz';
  // Назва не впізнана (порожня, лише район «Favoriten», одрук) — за індексом:
  // Відень — уся зона 1xxx (1010…1239), Лінц — 4010…4040.
  const pc = (addr?.postalCode ?? '').replace(/\s/g, '').replace(/^A-?/i, '');
  if (/^1\d{3}$/.test(pc)) return 'vienna';
  if (/^40[1-4]0$/.test(pc)) return 'linz';
  return 'geo';
}

/**
 * Діапазон номера посилки в поїздці. country — країна поїздки (рейсу); euAddress —
 * адреса сторони в Європі (для Україна→Австрія — Отримувача: від неї Відень/Лінц/решта).
 */
export function journeyNumberRangeKey(
  direction: string,
  country: string | null | undefined,
  euAddress?: { city?: string | null; postalCode?: string | null } | null,
): JourneyRangeKey {
  if (direction === 'eu_to_ua') {
    if (country === 'NL') return 'nl_ua';
    if (country === 'AT') return 'at_ua';
    return 'other_ua';
  }
  if (country === 'NL') return 'ua_nl';
  if (country === 'AT') {
    const g = austrianCityGroup(euAddress);
    return g === 'vienna' ? 'ua_at_vienna' : g === 'linz' ? 'ua_at_linz' : 'ua_at_geo';
  }
  return 'ua_other';
}
