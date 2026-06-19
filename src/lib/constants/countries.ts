export const COUNTRIES = {
  UA: 'UA',
  NL: 'NL',
  AT: 'AT',
  DE: 'DE',
} as const;

export type CountryCode = (typeof COUNTRIES)[keyof typeof COUNTRIES];

export const COUNTRY_LABELS: Record<CountryCode, string> = {
  UA: 'Україна',
  NL: 'Нідерланди',
  AT: 'Австрія',
  DE: 'Німеччина',
};

/** Родовий відмінок (до кого/чого?) — для підстановки в «В дорозі до …»
 *  та «Виїзд з …» (ТЗ docx 14.05.26). */
export const COUNTRY_LABELS_GENITIVE: Record<CountryCode, string> = {
  UA: 'України',
  NL: 'Нідерландів',
  AT: 'Австрії',
  DE: 'Німеччини',
};

/** Знахідний відмінок (в кого/що?) — для «Приїзд в …» (ТЗ docx 14.05.26). */
export const COUNTRY_LABELS_ACCUSATIVE: Record<CountryCode, string> = {
  UA: 'Україну',
  NL: 'Нідерланди',
  AT: 'Австрію',
  DE: 'Німеччину',
};

export const COUNTRY_PHONE_CODES: Record<CountryCode, string> = {
  UA: '+380',
  NL: '+31',
  AT: '+43',
  DE: '+49',
};

export const EU_COUNTRIES: CountryCode[] = ['NL', 'AT', 'DE'];

// Short number ranges per trip
export const SHORT_NUMBER_RANGES = {
  NL: { start: 1, end: 100 },
  VIENNA: { start: 101, end: 200 },
  LINZ: { start: 201, end: 300 },
  GEOGRAPHY: { start: 301, end: 500 },
  EU_TO_UA: { start: 501, end: 1000 },
} as const;
