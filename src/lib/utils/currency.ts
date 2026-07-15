import { prisma } from '@/lib/prisma';
import { getNbuEurRate } from '@/lib/utils/nbu-rate';

/**
 * Convert a money amount in `fromCurrency` to EUR.
 *
 * ТЗ docx 12.07.26: за курс береться КУРС НБУ на момент розрахунку/виставлення
 * рахунку (getNbuEurRate, кеш 1 год). Якщо НБУ недоступний — fallback на
 * резервний курс `invoice_settings.uahPerEur`, далі — 42.
 *
 * Why we need this: the cost calculator works in EUR. If declared value is
 * in UAH (наприклад UA→EU посилки), множити її напряму на % страхування
 * дає астрономічну суму (2500 грн × 3% = 75 «EUR» — баг).
 *
 * Returns plain `number`. Caller decides on rounding. Returns 0 for invalid
 * inputs to keep callers free of null-checks.
 */
export async function toEur(amount: number, fromCurrency: 'EUR' | 'UAH' | string): Promise<number> {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (fromCurrency === 'EUR' || !fromCurrency) return amount;

  if (fromCurrency === 'UAH') {
    // ТЗ docx 12.07.26: курс НБУ — першоджерело.
    const nbuRate = await getNbuEurRate();
    if (nbuRate && Number.isFinite(nbuRate) && nbuRate > 0) {
      return amount / nbuRate;
    }
    // Fallback: резервний курс, збережений адміном у «Реквізити для рахунку».
    const settings = await prisma.invoiceSettings.findFirst({
      where: { isSingleton: true },
      select: { uahPerEur: true },
    });
    const rate = settings?.uahPerEur ? Number(settings.uahPerEur) : 42;
    if (!rate || !Number.isFinite(rate) || rate <= 0) return amount; // fallback — no conversion
    return amount / rate;
  }

  // Non-UA currency we don't know — return as-is, log for visibility.
  return amount;
}

/**
 * Sync version: when caller already loaded the rate.
 */
export function toEurSync(amount: number, fromCurrency: 'EUR' | 'UAH' | string, uahPerEur: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (fromCurrency === 'EUR' || !fromCurrency) return amount;
  if (fromCurrency === 'UAH') {
    if (!uahPerEur || !Number.isFinite(uahPerEur) || uahPerEur <= 0) return amount;
    return amount / uahPerEur;
  }
  return amount;
}
