import { logger } from '@/lib/logger';

/**
 * ТЗ docx 12.07.26: «За величину курсу обміну необхідно брати курс Нацбанку
 * на момент виставлення рахунку».
 *
 * Офіційний курс НБУ (грн за 1 EUR) з публічного API:
 *   https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=EUR&json
 *
 * Курс кешується в пам'яті процесу на CACHE_TTL_MS (НБУ оновлює курс раз на
 * день — годинного кешу з запасом вистачає, і ми не б'ємо їхній API на кожен
 * розрахунок). Захист від деградації:
 *  - failure-cooldown: після невдачі не фетчимо повторно FAIL_COOLDOWN_MS —
 *    інакше при лежачому НБУ КОЖЕН UAH-розрахунок чекав би 5с таймаут;
 *  - single-flight: одночасні виклики з холодним кешем ділять один запит.
 * При недоступності НБУ повертаємо застарілий кеш або null — той, хто
 * викликає, робить fallback на резервний курс (invoice_settings.uahPerEur).
 */

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 година
const FAIL_COOLDOWN_MS = 2 * 60 * 1000; // 2 хв без повторних спроб після фейлу
const FETCH_TIMEOUT_MS = 5000;

let cachedRate: number | null = null;
let cachedAt = 0;
let lastFailedAt = 0;
let inflight: Promise<number | null> | null = null;

async function fetchNbuRate(): Promise<number | null> {
  const staleAgeMs = cachedRate !== null ? Date.now() - cachedAt : null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(
      'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=EUR&json',
      { signal: controller.signal, cache: 'no-store' }
    );
    clearTimeout(timer);
    if (!res.ok) {
      lastFailedAt = Date.now();
      logger.warn('nbu.rate_fetch_failed', { reason: 'http', status: res.status, staleAgeMs });
      return cachedRate; // застарілий кеш кращий за нічого
    }

    const data: { rate?: number; cc?: string }[] = await res.json();
    const rate = Number(data?.[0]?.rate);
    if (!Number.isFinite(rate) || rate <= 0) {
      lastFailedAt = Date.now();
      logger.warn('nbu.rate_fetch_failed', { reason: 'malformed_payload', staleAgeMs });
      return cachedRate;
    }

    cachedRate = rate;
    cachedAt = Date.now();
    lastFailedAt = 0;
    return rate;
  } catch (err) {
    // Мережа/таймаут — віддаємо застарілий кеш (або null → fallback у caller).
    lastFailedAt = Date.now();
    logger.warn('nbu.rate_fetch_failed', { reason: 'network_or_timeout', err: String(err), staleAgeMs });
    return cachedRate;
  }
}

export async function getNbuEurRate(): Promise<number | null> {
  const now = Date.now();
  if (cachedRate !== null && now - cachedAt < CACHE_TTL_MS) return cachedRate;
  // Failure-cooldown: нещодавно впало — не намагаємось знову (без 5с очікувань).
  if (now - lastFailedAt < FAIL_COOLDOWN_MS) return cachedRate;
  // Single-flight: паралельні виклики ділять один запит до НБУ.
  if (inflight) return inflight;
  inflight = fetchNbuRate().finally(() => { inflight = null; });
  return inflight;
}
