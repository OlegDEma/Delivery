import { prisma } from '@/lib/prisma';

/**
 * Convert a money amount in `fromCurrency` to EUR using the rate stored in
 * `invoice_settings.uahPerEur`.
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
