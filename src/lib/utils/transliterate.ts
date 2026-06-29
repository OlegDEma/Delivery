/**
 * ТЗ docx 29.06.26 §3: коли у формі Відправника/Отримувача обрано країну ≠ UA
 * (Австрія / Нідерланди / Німеччина), назви населених пунктів, введені
 * кирилицею, мають АВТОМАТИЧНО транслітеруватися в латиницю — так, як вони
 * пишуться в оригіналі (Амстердам→Amsterdam, Відень→Wien, Роттердам→Rotterdam).
 * Далі латинська назва порівнюється з Логістикою/Пунктами збору для визначення
 * наявності пунктів та доступних способів.
 *
 * Стратегія:
 *  1) Таблиця ЕКЗОНІМІВ — офіційні місцеві написання там, де проста
 *     транслітерація дала б хибний результат (Відень→Wien, а не «Viden»;
 *     Мюнхен→München; Гаага→Den Haag).
 *  2) Якщо міста немає в таблиці — посимвольна транслітерація укр/рос-кирилиці.
 *  3) Латинський ввід («Amsterdam») лишається без змін (ідемпотентність).
 */

/** Нормалізація ключа: нижній регістр, без пробілів/дефісів/апострофів. */
function normKey(s: string): string {
  return s.toLowerCase().replace(/[\s'’`\-]/g, '');
}

/**
 * Екзоніми міст, які ми обслуговуємо (NL / AT / DE). Ключ — нормалізована
 * кирилична форма (укр і поширені рос-варіанти), значення — як місто
 * пишеться латиницею (узгоджено з тим, як його заносять у Логістику).
 */
const CITY_EXONYMS: Record<string, string> = {
  // Австрія
  'відень': 'Wien', 'вена': 'Wien',
  'грац': 'Graz',
  'лінц': 'Linz', 'линц': 'Linz',
  'зальцбург': 'Salzburg',
  'інсбрук': 'Innsbruck', 'инсбрук': 'Innsbruck',
  'клагенфурт': 'Klagenfurt',
  // Нідерланди
  'амстердам': 'Amsterdam',
  'роттердам': 'Rotterdam', 'ротердам': 'Rotterdam',
  'гаага': 'Den Haag', 'денхааг': 'Den Haag',
  'утрехт': 'Utrecht',
  'ейндговен': 'Eindhoven', 'ейндховен': 'Eindhoven', 'айндговен': 'Eindhoven',
  'гронінген': 'Groningen', 'гронинген': 'Groningen',
  'тілбург': 'Tilburg', 'тилбург': 'Tilburg',
  'венло': 'Venlo',
  'неймеген': 'Nijmegen', 'наймеген': 'Nijmegen',
  'гарлем': 'Haarlem', 'харлем': 'Haarlem',
  'бреда': 'Breda',
  'арнем': 'Arnhem', 'арнгем': 'Arnhem',
  'маастрихт': 'Maastricht',
  // Німеччина
  'мюнхен': 'München',
  'кельн': 'Köln', 'кьольн': 'Köln',
  'берлін': 'Berlin', 'берлин': 'Berlin',
  'гамбург': 'Hamburg', 'хамбург': 'Hamburg',
  'франкфурт': 'Frankfurt',
  'дюссельдорф': 'Düsseldorf',
  'штутгарт': 'Stuttgart', 'штутґарт': 'Stuttgart',
  'дрезден': 'Dresden',
  'нюрнберг': 'Nürnberg',
  'ганновер': 'Hannover',
  'бремен': 'Bremen',
  'дортмунд': 'Dortmund',
  'ессен': 'Essen',
  'лейпциг': 'Leipzig', 'ляйпциг': 'Leipzig',
  'бонн': 'Bonn',
};

/** Посимвольна транслітерація укр/рос-кирилиці → латиниця (fallback). */
const CHAR_MAP: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'ґ': 'g', 'д': 'd', 'е': 'e',
  'є': 'ie', 'ё': 'e', 'ж': 'zh', 'з': 'z', 'и': 'y', 'і': 'i', 'ї': 'i',
  'й': 'i', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p',
  'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts',
  'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e',
  'ю': 'iu', 'я': 'ia',
};

function translitChars(value: string): string {
  let out = '';
  for (const ch of value) {
    const lower = ch.toLowerCase();
    const mapped = CHAR_MAP[lower];
    if (mapped === undefined) {
      out += ch; // не-кирилиця (пробіл, дефіс, латиниця, цифра) — лишаємо
    } else if (ch === lower) {
      out += mapped;
    } else {
      // Велика кирилична літера → капіталізуємо перший символ мапінгу.
      out += mapped ? mapped.charAt(0).toUpperCase() + mapped.slice(1) : mapped;
    }
  }
  return out;
}

const CYRILLIC_RE = /[А-Яа-яЁёІіЇїЄєҐґ]/;

/** Capitalize кожного слова (для результату посимвольної транслітерації). */
function capitalizeWords(value: string): string {
  return value
    .split(/\s+/)
    .map(w => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Транслітерує назву населеного пункту в латиницю для EU-країн (AT/NL/DE).
 * Для UA та для вже-латинського вводу повертає значення без змін.
 */
export function transliterateCity(
  value: string | null | undefined,
  country: string | null | undefined,
): string {
  if (!value) return value ?? '';
  // UA лишаємо кирилицею. Без країни — не чіпаємо (бракує контексту).
  if (!country || country === 'UA') return value;
  // Уже латиниця (немає кирилиці) → нічого не робимо (ідемпотентність).
  if (!CYRILLIC_RE.test(value)) return value;
  const exonym = CITY_EXONYMS[normKey(value)];
  if (exonym) return exonym;
  return capitalizeWords(translitChars(value.trim()));
}

/**
 * Нормалізована форма для ПОРІВНЯННЯ міста з Логістикою: транслітерує (для EU)
 * і приводить до нижнього регістру без країв. Гарантує, що «Відень», введене
 * кирилицею, співпаде з CollectionPoint.city='Wien' / ServiceCity.
 */
export function normalizeCityForMatch(
  value: string | null | undefined,
  country: string | null | undefined,
): string {
  return transliterateCity(value, country).trim().toLowerCase();
}
