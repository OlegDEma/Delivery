import { parcelParties, type ParcelPartiesInput, type PartySnapshot, type SnapshotAddress } from '@/lib/parcels/party-snapshot';

/**
 * ТЗ docx 15.10.26 «Відображення посилок у Поїздці, Рейсі, Маршруті»: у списках посилок
 * поїздки завжди показуємо адресу в країні призначення поїздки (Європа) — незалежно від
 * того, чия це адреса, Відправника чи Отримувача. За зразок — правила Маршрутів
 * (routes/page.tsx, partyInCountry): посилка UA→EU → Отримувач, EU→UA → Відправник.
 */
export function euSideParty(p: ParcelPartiesInput & { direction: string }): {
  roleLabel: 'Відправник' | 'Отримувач';
  party: PartySnapshot;
  address: SnapshotAddress | null;
} {
  const pt = parcelParties(p);
  const isSender = p.direction === 'eu_to_ua';
  const party = isSender ? pt.sender : pt.receiver;
  return { roleLabel: isSender ? 'Відправник' : 'Отримувач', party, address: party.address };
}

/** Рядок адреси як у Маршрутах: «індекс, місто, вулиця будинок». */
export function euAddressLine(a: SnapshotAddress | null | undefined): string {
  if (!a) return '';
  return [a.postalCode?.toUpperCase(), a.city, [a.street, a.building].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
}
