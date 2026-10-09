// ─────────────────────────────────────────────────────────────────────────────
// ТЗ docx 07.10.26 «Генератор унікальних трек-номерів посилок» — це і є ІТН.
// 10 цифр, маска X-XX-XXXXXX-X (у БД — суцільний рядок із 10 цифр):
//   1-ша      — напрямок: 1 — в Україну (eu_to_ua), 2 — з України (ua_to_eu);
//   2–3       — код країни: 31 NL, 43 AT, 49 DE (01 UA — резерв).
//               Рішення 08.10.26: це ЄВРОПЕЙСЬКА країна рейсу для обох
//               напрямків, тож з номера видно і напрямок, і країну
//               (1-31 — з Нідерландів в Україну, 2-31 — з України в Нідерланди);
//   4–9       — порядковий номер з глобального лічильника БД (не обнуляється
//               щороку, на відміну від yearly_sequence), 6 цифр з нулями зліва;
//   10-та     — контрольна цифра за алгоритмом Луна (Mod 10) від перших 9.
// ─────────────────────────────────────────────────────────────────────────────

export const ITN_COUNTRY_CODES: Record<string, string> = {
  UA: '01',
  NL: '31',
  AT: '43',
  DE: '49',
};

/** Контрольна цифра Луна (Mod 10) для рядка цифр, до якого її буде дописано. */
export function luhnCheckDigit(payload: string): number {
  let sum = 0;
  // Справа наліво; подвоюємо кожну другу цифру, починаючи з найправішої
  // (бо контрольна цифра стане новою найправішою позицією).
  for (let i = 0; i < payload.length; i++) {
    let d = Number(payload[payload.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

/** Повний номер (з контрольною цифрою) проходить перевірку Луна. */
export function isLuhnValid(digits: string): boolean {
  if (!/^\d{2,}$/.test(digits)) return false;
  return luhnCheckDigit(digits.slice(0, -1)) === Number(digits[digits.length - 1]);
}

/** ТЗ 07.10.26: зібрати 10-значний ІТН. */
export function buildItn10(direction: string, euCountry: string | null | undefined, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999_999) {
    throw new Error(`ITN_SEQUENCE_OUT_OF_RANGE:${sequence}`);
  }
  const dirDigit = direction === 'ua_to_eu' ? '2' : '1';
  const country = ITN_COUNTRY_CODES[euCountry ?? ''] ?? ITN_COUNTRY_CODES.UA;
  const payload = `${dirDigit}${country}${String(sequence).padStart(6, '0')}`;
  return `${payload}${luhnCheckDigit(payload)}`;
}

/** Показ людині: 1310000147 → 1-31-000014-7. Інші рядки (старі 14-значні) — як є. */
export function formatItn(itn: string | null | undefined): string {
  if (!itn) return '';
  return /^\d{10}$/.test(itn) ? `${itn[0]}-${itn.slice(1, 3)}-${itn.slice(3, 9)}-${itn[9]}` : itn;
}

/**
 * ТЗ 07.10.26 (п.2): «якщо вводять трек-номер вручну — спершу перевірити контрольну
 * цифру за Луном; якщо не збігається — „Невірний формат номера“, не навантажуючи БД».
 *
 * Номером вважаємо лише те, що СХОЖЕ на ІТН: 10 цифр (дефіси/пробіли ігноруємо),
 * перша — 1 або 2, далі відомий код країни. Телефони (0672524578), прізвища, ТТН
 * (14 цифр) і старі 14-значні ІТН сюди не потрапляють і шукаються як раніше.
 * Суфікс місця «-2/3» (зі штрихкоду етикетки) відкидаємо.
 */
export function checkItnQuery(raw: string): { looksLikeItn: false } | { looksLikeItn: true; valid: boolean; itn: string } {
  const base = raw.trim().replace(/[-\s]\d+\/\d+$/, '');
  const digits = base.replace(/[\s-]/g, '');
  if (!/^\d{10}$/.test(digits)) return { looksLikeItn: false };
  if (!/^[12]$/.test(digits[0]) || !Object.values(ITN_COUNTRY_CODES).includes(digits.slice(1, 3))) {
    return { looksLikeItn: false };
  }
  return { looksLikeItn: true, valid: isLuhnValid(digits), itn: digits };
}

export const INVALID_ITN_MESSAGE = 'Невірний формат номера';

/** Код місця «1310000144-2/3» → «1-31-000014-4-2/3» (для людини). */
export function formatPlaceItn(itnPlace: string | null | undefined): string {
  if (!itnPlace) return '';
  const m = itnPlace.match(/^(\d{10})(-\d+\/\d+)?$/);
  return m ? `${formatItn(m[1])}${m[2] ?? ''}` : itnPlace;
}

/**
 * Generate Individual Transport Number (ITN) — СТАРИЙ формат (до ТЗ 07.10.26).
 * Лишається лише для довідки/сумісності; нові посилки отримують buildItn10().
 * Format: YY + 6-digit sequential + 4-digit random + 2-digit checksum = 14 digits
 *
 * Randomness note: this uses crypto.getRandomValues where available (all
 * modern Node + browser) so the 4-digit suffix gives ~10000 possible values
 * per sequential+year combo. Real collisions are vanishingly rare, but
 * callers should still handle @unique collisions via a retry wrapper.
 */
export function generateITN(year: number, sequentialNumber: number): string {
  const yy = String(year).slice(-2);
  const seq = String(sequentialNumber).padStart(6, '0');
  const random = String(1000 + secureRandomInt(9000)); // 1000..9999
  const base = `${yy}${seq}${random}`;

  // Simple checksum: sum of all digits mod 97, padded to 2 digits
  const checksum = Array.from(base)
    .reduce((sum, d) => sum + Number(d), 0) % 97;
  const check = String(checksum).padStart(2, '0');

  return `${base}${check}`;
}

/** Returns a cryptographically-random integer in [0, max). */
function secureRandomInt(max: number): number {
  const g = globalThis as { crypto?: { getRandomValues?: (arr: Uint32Array) => Uint32Array } };
  if (g.crypto?.getRandomValues) {
    const arr = new Uint32Array(1);
    g.crypto.getRandomValues(arr);
    return arr[0] % max;
  }
  return Math.floor(Math.random() * max);
}

/**
 * Generate ITN for a specific place within a parcel
 * Appends place info: ITN-placeNumber/totalPlaces
 */
export function generatePlaceITN(
  parcelITN: string,
  placeNumber: number,
  totalPlaces: number
): string {
  return `${parcelITN}-${placeNumber}/${totalPlaces}`;
}

/**
 * Generate human-readable internal number.
 * Format: "287 Іванівці 1/3, 10.05.2026"
 * Year is 4 digits — we need clarity for records that span decades.
 */
export function generateInternalNumber(
  sequentialNumber: number,
  receiverCity: string,
  placeNumber: number,
  totalPlaces: number,
  date: Date
): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear());

  const placePart = totalPlaces > 1
    ? `${placeNumber}/${totalPlaces}`
    : '1';

  return `${sequentialNumber} ${receiverCity} ${placePart}, ${dd}.${mm}.${yyyy}`;
}

/**
 * Run `create` with a fresh ITN, retrying on Prisma unique-constraint errors.
 * The caller passes a factory that builds the ITN and performs the insert.
 *
 * Typical usage inside a prisma.$transaction:
 *   const parcel = await withItnRetry((itn) => tx.parcel.create({ data: { ...data, itn } }));
 */
export async function withItnRetry<T>(
  fn: (itn: string) => Promise<T>,
  year: number,
  sequentialNumber: number,
  maxAttempts = 5
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    const itn = generateITN(year, sequentialNumber);
    try {
      return await fn(itn);
    } catch (err) {
      // Retry only on Prisma "Unique constraint failed" — rethrow anything else.
      const e = err as { code?: string; meta?: { target?: string[] } };
      if (e?.code === 'P2002' && (e.meta?.target?.includes('itn') ?? true)) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError ?? new Error('ITN retry exhausted');
}
