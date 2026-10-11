'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { parcelParties } from '@/lib/parcels/party-snapshot';
import { tripRouteLabel } from '@/lib/constants/countries';
import { formatDate } from '@/lib/utils/format';
import { formatJourneyNumber } from '@/lib/utils/journey-number';

interface PrintAddr { country: string | null; city: string | null; street: string | null; building: string | null; postalCode: string | null }
interface PrintParcel {
  id: string;
  status: string;
  journeyNumber: number | null;
  internalNumber: string;
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

type Row =
  | { kind: 'parcel'; num: number; p: PrintParcel }
  | { kind: 'ghost'; num: number; g: PrintTrip['transfersOut'][number] };

/**
 * ТЗ docx 11.10.26 (Логістика/Рейси/Деталі рейсу, п.2): «Має бути можливість видруку
 * списку посилок, прив'язаних до конкретного рейсу. Листок А4, шрифт Arial, кегль 14,
 * зверху поле 2,5 см. Заголовок списку Рейс „дата“ „Напрямок“. Нумерація відповідно до
 * присвоєних номерів посилок, решту даних відображати з інформації в посилці, що
 * стосується Отримувача або Відправника».
 *
 * Дані — сторони в Європі: для UA→EU — Отримувач, для EU→UA — Відправник (саме за
 * ними водій їде на адреси). Рядок таблиці — як на макеті клієнта:
 *   N | Місто, Вулиця / Прізвище Ім'я | № дому | Поштовий код / Телефон
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
  const rows: Row[] = [
    ...trip.parcels
      .filter((p) => p.journeyNumber != null)
      .map((p): Row => ({ kind: 'parcel', num: p.journeyNumber as number, p })),
    ...trip.transfersOut
      .filter((g) => g.journeyNumber != null && g.parcel.tripId !== trip.id)
      .map((g): Row => ({ kind: 'ghost', num: g.journeyNumber as number, g })),
  ].sort((a, b) => a.num - b.num);
  const draftCount = trip.parcels.filter((p) => p.journeyNumber == null).length;

  return (
    <div className="trip-print-list">
      {/* @page — А4, верхнє поле 2,5 см (ТЗ). Шрифт Arial 14 — на весь аркуш. */}
      <style>{`
        @page { size: A4; margin: 2.5cm 1.5cm 1.5cm 1.5cm; }
        .trip-print-list { font-family: Arial, Helvetica, sans-serif; font-size: 14pt; color: #000; }
        .trip-print-list table { width: 100%; border-collapse: collapse; }
        .trip-print-list td { border: 1px solid #000; padding: 2pt 4pt; vertical-align: middle; }
        .trip-print-list tbody.parcel-row { break-inside: avoid; page-break-inside: avoid; }
        @media screen { .trip-print-list .sheet { max-width: 18cm; background: #fff; padding: 1cm; margin: 0 auto; box-shadow: 0 1px 4px rgba(0,0,0,.15); } }
      `}</style>

      <div className="print:hidden mb-4 flex flex-wrap gap-2 items-center">
        <Button onClick={() => window.print()}>🖨 Друкувати</Button>
        <Button variant="outline" onClick={() => window.close()}>Закрити</Button>
        {draftCount > 0 && (
          <span className="text-sm text-gray-500" style={{ fontFamily: 'inherit', fontSize: 13 }}>
            Посилок у статусі «Створена» (ще без номера, до списку не включені): {draftCount}
          </span>
        )}
      </div>

      <div className="sheet">
        <h1 style={{ fontSize: '16pt', fontWeight: 'bold', margin: '0 0 8pt' }}>
          Рейс {formatDate(trip.departureDate)} {tripRouteLabel(trip.country, trip.direction)}
        </h1>

        {rows.length === 0 ? (
          <p>У рейсі ще немає прийнятих посилок.</p>
        ) : (
          <table>
            {rows.map((row) => {
              if (row.kind === 'ghost') {
                const g = row.g;
                return (
                  <tbody key={`g-${g.id}`} className="parcel-row">
                    <tr>
                      <td style={{ width: '1.6cm', textAlign: 'center', fontWeight: 'bold' }}>{formatJourneyNumber(row.num)}</td>
                      <td colSpan={3}>
                        {g.toTrip
                          ? `Перенесена до рейсу ${tripRouteLabel(g.toTrip.country, g.toTrip.direction)} ${formatDate(g.toTrip.departureDate)}`
                          : 'Прибрана з рейсу'}
                      </td>
                    </tr>
                  </tbody>
                );
              }
              const party = parcelParties(row.p)[euSide];
              const a = party.address;
              const cityStreet = [a?.city, a?.street].filter(Boolean).join(', ');
              return (
                <tbody key={row.p.id} className="parcel-row">
                  <tr>
                    <td rowSpan={2} style={{ width: '1.6cm', textAlign: 'center', fontWeight: 'bold' }}>{formatJourneyNumber(row.num)}</td>
                    <td>{cityStreet || '—'}</td>
                    <td rowSpan={2} style={{ width: '2.2cm', textAlign: 'center' }}>{a?.building || ''}</td>
                    <td style={{ width: '4.2cm', textAlign: 'center' }}>{a?.postalCode || ''}</td>
                  </tr>
                  <tr>
                    <td>{[party.lastName, party.firstName].filter(Boolean).join(' ')}</td>
                    <td style={{ textAlign: 'center' }}>{party.phone}</td>
                  </tr>
                </tbody>
              );
            })}
          </table>
        )}
      </div>
    </div>
  );
}
