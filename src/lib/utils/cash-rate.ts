import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { getNbuEurRate } from '@/lib/utils/nbu-rate';

/**
 * ТЗ docx 04.11.26 (п.7, скріншот до «Реквізити рахунку»): «При виборі оплати в Україні
 * рахунок повинен виставлятись лише в гривнях … шляхом множення суми в євро до оплати
 * за посилку на поточний курс продажу євро у обмінниках, або, якщо це неможливо, — на
 * курс НБУ. Перше краще».
 *
 * Курс продажу в обмінниках — готівковий курс продажу EUR ПриватБанку (публічний API без
 * ключа, оновлюється протягом дня). Недоступний → курс НБУ → резервний курс з «Реквізитів
 * для рахунку» (uahPerEur) → 42. Кеш у памʼяті процесу — 30 хв.
 */
const CACHE_TTL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

let cached: { rate: number; at: number } | null = null;

async function fetchCashEurSale(): Promise<number | null> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.rate;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch('https://api.privatbank.ua/p24api/pubinfo?exchange&coursid=5', {
      signal: controller.signal, cache: 'no-store',
    });
    clearTimeout(timer);
    if (!res.ok) return cached?.rate ?? null;
    const list = (await res.json()) as { ccy?: string; sale?: string }[];
    const rate = Number(list.find((r) => r.ccy === 'EUR')?.sale);
    if (!Number.isFinite(rate) || rate <= 0) return cached?.rate ?? null;
    cached = { rate, at: Date.now() };
    return rate;
  } catch (e) {
    logger.warn('cash_rate.fetch_failed', { error: e instanceof Error ? e.message : String(e) });
    return cached?.rate ?? null;
  }
}

export type InvoiceRateSource = 'cash' | 'nbu' | 'reserve';

/** Курс для рахунку в гривнях (грн за 1 EUR) і звідки він узятий. */
export async function invoiceUahPerEur(): Promise<{ rate: number; source: InvoiceRateSource }> {
  const cash = await fetchCashEurSale();
  if (cash) return { rate: cash, source: 'cash' };
  const nbu = await getNbuEurRate();
  if (nbu && Number.isFinite(nbu) && nbu > 0) return { rate: nbu, source: 'nbu' };
  const settings = await prisma.invoiceSettings.findFirst({ where: { isSingleton: true }, select: { uahPerEur: true } });
  const reserve = settings?.uahPerEur ? Number(settings.uahPerEur) : 42;
  return { rate: reserve > 0 ? reserve : 42, source: 'reserve' };
}
