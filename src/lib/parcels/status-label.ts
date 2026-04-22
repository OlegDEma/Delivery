/**
 * Динамічний лейбл статусу з підстановкою країни.
 *
 * За ТЗ статуси «Прийнято до перевезення до …» та «В дорозі до …»
 * мають підставляти реальну країну призначення, а не загальний
 * «України / Європи».
 *
 * Країна береться з рейсу (trip.country) якщо рейс є, інакше —
 * generic label з STATUS_LABELS.
 */

import { STATUS_LABELS, type ParcelStatusType } from '@/lib/constants/statuses';
import { COUNTRY_LABELS_GENITIVE, type CountryCode } from '@/lib/constants/countries';

interface StatusContext {
  /** Країна рейсу (UA / NL / AT / DE) — якщо посилка прив'язана до рейсу. */
  tripCountry?: string | null;
  /** Напрямок — fallback коли рейсу ще нема. */
  direction?: string | null;
}

export function statusLabel(status: ParcelStatusType | string, ctx: StatusContext = {}): string {
  const base = STATUS_LABELS[status as ParcelStatusType] || String(status);

  // Вибираємо країну призначення:
  // - Для «_to_ua» призначення завжди UA (Україна)
  // - Для «_to_eu» — країна рейсу (конкретна EU країна) або generic
  const destCountry: CountryCode | null = (() => {
    if (status === 'in_transit_to_ua' || status === 'accepted_for_transport_to_ua') {
      return 'UA';
    }
    if (status === 'in_transit_to_eu' || status === 'accepted_for_transport_to_eu') {
      const t = ctx.tripCountry;
      if (t && t in COUNTRY_LABELS_GENITIVE) return t as CountryCode;
      return null;
    }
    return null;
  })();

  if (!destCountry) return base;
  const gen = COUNTRY_LABELS_GENITIVE[destCountry];

  if (status === 'in_transit_to_ua' || status === 'in_transit_to_eu') {
    return `В дорозі до ${gen}`;
  }
  if (status === 'accepted_for_transport_to_ua' || status === 'accepted_for_transport_to_eu') {
    return `Прийнято до перевезення до ${gen}`;
  }
  return base;
}
