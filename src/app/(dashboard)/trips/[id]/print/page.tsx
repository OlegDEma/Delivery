'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PrintListSheets, type PrintListRow } from '@/components/shared/print-list-sheets';
import { parcelParties } from '@/lib/parcels/party-snapshot';
import { tripRouteLabel } from '@/lib/constants/countries';
import { formatDate } from '@/lib/utils/format';
import { formatJourneyNumber } from '@/lib/utils/journey-number';
import { withCountryCode } from '@/lib/utils/phone';

interface PrintAddr { country: string | null; city: string | null; street: string | null; building: string | null; postalCode: string | null }
interface PrintParcel {
  id: string;
  status: string;
  journeyNumber: number | null;
  internalNumber: string;
  totalPlacesCount: number;
  /** ТЗ docx 12.10.26 (коментар клієнта): стовпчик «Примітки». */
  listNote: string | null;
  clientNote: string | null;
  sender: { firstName: string; lastName: string; phone: string };
  receiver: { firstName: string; lastName: string; phone: string };
  senderAddress: PrintAddr | null;
  receiverAddress: PrintAddr | null;
  senderSnapshot: unknown;
  receiverSnapshot: unknown;
}
interface PrintTrip {
  id: string;
  direction: string;
  country: string;
  departureDate: string;
  parcels: PrintParcel[];
  transfersOut: {
    id: string;
    journeyNumber: number | null;
    parcel: { id: string; internalNumber: string; tripId: string | null };
    toTrip: { direction: string; country: string; departureDate: string } | null;
  }[];
}

/**
 * ТЗ docx 11.10.26 (Логістика/Рейси/Деталі рейсу, п.2): «Має бути можливість видруку
 * списку посилок, прив'язаних до конкретного рейсу. Листок А4, шрифт Arial, кегль 14,
 * зверху поле 2,5 см. Заголовок списку Рейс „дата“ „Напрямок“. Нумерація відповідно до
 * присвоєних номерів посилок, решту даних відображати з інформації в посилці, що
 * стосується Отримувача або Відправника».
 *
 * ТЗ docx 12.10.26 «Стосовно видруку списку посилок»:
 *  - телефони — завжди з кодом країни, зміщені максимально вправо в клітинці;
 *  - поштові індекси — максимально вліво;
 *  - усі рядки однакової висоти;
 *  - кількість місць (якщо більше однієї) — через дріб біля номера: «003/2»;
 *  - кнопка «Друкувати» — звичайний друк на підключеному принтері;
 *  - Прізвище та Ім'я — меншим кеглем (12);
 *  - номер будинку — навпроти вулиці, на її рівні, максимально зліва.
 *
 * ТЗ docx 12.10.26, уточнення клієнта в коментарі до дати:
 *  - поля: верх 25 мм, ліве / праве / нижнє — 10 мм;
 *  - висота запису 10–12 мм, записів на аркуші може бути більше 15 (тут — 20);
 *  - стовпчик «Примітки» праворуч від номера; номер звужено, адресу потіснено;
 *    показуємо «лише основне»: коротку примітку Працівника для списку, а якщо її
 *    немає — нотатку Клієнта (вміщуємо в клітинку меншим кеглем).
 *
 * ТЗ docx 20.10.26: ПІБ — по правому краю, рамка запису трохи товща, аркуш друкується
 * цілим (вільні записи порожні). Сам шаблон — components/shared/print-list-sheets
 * (ним же друкується Маршрутний лист).
 *
 * Дані — сторони в Європі: для UA→EU — Отримувач, для EU→UA — Відправник (саме за
 * ними водій їде на адреси).
 */
export default function TripPrintListPage() {
  const { id } = useParams<{ id: string }>();
  const [trip, setTrip] = useState<PrintTrip | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/trips/${id}`)
      .then(async (r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setTrip)
      .catch(() => setError('Рейс не знайдено'));
  }, [id]);

  if (error) return <div className="text-center py-12 text-red-500">{error}</div>;
  if (!trip) return <div className="text-center py-12 text-gray-500">Завантаження…</div>;

  const euSide = trip.direction === 'ua_to_eu' ? 'receiver' : 'sender';
  // ТЗ docx 12.10.26: номер у поїздці є з моменту прив'язки до рейсу (і в «Створеної»),
  // тож у список потрапляють усі посилки рейсу. Посилки без номера (рейс поза поїздкою) —
  // у кінці, без номера.
  type Sortable = { num: number | null; row: PrintListRow };
  const sortable: Sortable[] = [
    ...trip.parcels.map((p): Sortable => {
      const party = parcelParties(p)[euSide];
      const a = party.address;
      // ТЗ docx 12.10.26: «003/2» — кількість місць через дріб, якщо їх більше одного.
      const places = p.totalPlacesCount > 1 ? `/${p.totalPlacesCount}` : '';
      const numLabel = p.journeyNumber != null ? formatJourneyNumber(p.journeyNumber) : '—';
      return {
        num: p.journeyNumber,
        row: {
          kind: 'record',
          key: p.id,
          num: p.journeyNumber != null ? `${numLabel}${places}` : (places ? `—${places}` : '—'),
          label: `№${numLabel}`,
          // «Лише основне»: коротка примітка Працівника для списку, інакше — нотатка Клієнта.
          note: (p.listNote || p.clientNote || '').replace(/\s+/g, ' ').trim(),
          cityStreet: [a?.city, a?.street].filter(Boolean).join(', '),
          building: a?.building || '',
          // ТЗ 12.10.26: індекс NL — літери великі (старі записи на кшталт «1813 tt»).
          postal: (a?.postalCode || '').toUpperCase(),
          name: [party.lastName, party.firstName].filter(Boolean).join(' '),
          phone: withCountryCode(party.phone, a?.country),
        },
      };
    }),
    ...trip.transfersOut
      .filter((g) => g.journeyNumber != null && g.parcel.tripId !== trip.id)
      .map((g): Sortable => ({
        num: g.journeyNumber,
        row: {
          kind: 'ghost',
          key: `g-${g.id}`,
          num: formatJourneyNumber(g.journeyNumber),
          text: g.toTrip
            ? `Перенесена до рейсу ${tripRouteLabel(g.toTrip.country, g.toTrip.direction)} ${formatDate(g.toTrip.departureDate)}`
            : 'Прибрана з рейсу',
        },
      })),
  ];
  const rows = sortable
    .sort((a, b) => (a.num ?? Number.MAX_SAFE_INTEGER) - (b.num ?? Number.MAX_SAFE_INTEGER))
    .map((s) => s.row);

  return (
    <PrintListSheets
      title={`Рейс ${formatDate(trip.departureDate)} ${tripRouteLabel(trip.country, trip.direction)}`}
      addressHeader={`${euSide === 'receiver' ? 'Отримувач' : 'Відправник'}: адреса, прізвище та імʼя`}
      rows={rows}
    />
  );
}
