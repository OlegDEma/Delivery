'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
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
  | { kind: 'parcel'; num: number | null; p: PrintParcel }
  | { kind: 'ghost'; num: number; g: PrintTrip['transfersOut'][number] };

/** ТЗ docx 12.10.26: «Висота рядків списку має бути така, щоб на листку поміщалося 15 записів». */
const ROWS_PER_SHEET = 15;

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
 *  - поля аркуша: верхнє 2,5 см, нижнє/ліве/праве 1,5 см;
 *  - 15 записів на аркуш, усі рядки однакової висоти;
 *  - кількість місць (якщо більше однієї) — через дріб біля номера: «003/2»;
 *  - кнопка «Друкувати» — звичайний друк на підключеному принтері;
 *  - Прізвище та Ім'я — меншим кеглем (12);
 *  - номер будинку — навпроти вулиці, на її рівні, максимально зліва.
 *
 * Дані — сторони в Європі: для UA→EU — Отримувач, для EU→UA — Відправник (саме за
 * ними водій їде на адреси). Запис — два рядки таблиці:
 *   N | Місто, Вулиця     | № дому | Поштовий код
 *     | Прізвище Ім'я     |        |      Телефон
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
  const rows: Row[] = [
    ...trip.parcels.map((p): Row => ({ kind: 'parcel', num: p.journeyNumber, p })),
    ...trip.transfersOut
      .filter((g) => g.journeyNumber != null && g.parcel.tripId !== trip.id)
      .map((g): Row => ({ kind: 'ghost', num: g.journeyNumber as number, g })),
  ].sort((a, b) => (a.num ?? Number.MAX_SAFE_INTEGER) - (b.num ?? Number.MAX_SAFE_INTEGER));

  // Розбиваємо на аркуші по 15 записів — кожен аркуш окремою таблицею з розривом сторінки.
  const sheets: Row[][] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_SHEET) sheets.push(rows.slice(i, i + ROWS_PER_SHEET));

  return (
    <div className="trip-print-list">
      {/* @page — А4, поля 2,5 / 1,5 / 1,5 / 1,5 см (ТЗ 12.10.26). Робоча висота аркуша
          29,7 − 2,5 − 1,5 = 25,7 см: заголовок ≈ 1 см + 15 записів × 1,6 см = 25 см.
          Висота запису фіксована (2 × 0,8 см), текст не переноситься — інакше рядки
          вийшли б різної висоти. */}
      <style>{`
        @page { size: A4; margin: 2.5cm 1.5cm 1.5cm 1.5cm; }
        .trip-print-list { font-family: Arial, Helvetica, sans-serif; font-size: 14pt; color: #000; }
        .trip-print-list table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .trip-print-list td {
          border: 1px solid #000; padding: 0 4pt; vertical-align: middle;
          height: 0.8cm; max-height: 0.8cm; line-height: 1.1;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .trip-print-list td.num { width: 2cm; text-align: center; font-weight: bold; }
        .trip-print-list td.bld { width: 1.8cm; text-align: left; }
        .trip-print-list td.right { width: 4.2cm; }
        .trip-print-list td.postal { text-align: left; }
        .trip-print-list td.phone { text-align: right; }
        .trip-print-list td.name { font-size: 12pt; }
        .trip-print-list tbody.parcel-row { break-inside: avoid; page-break-inside: avoid; }
        .trip-print-list .sheet-page + .sheet-page { break-before: page; page-break-before: always; }
        .trip-print-list h1 { font-size: 16pt; font-weight: bold; margin: 0 0 0.3cm; height: 0.7cm; }
        @media screen {
          /* Превʼю = аркуш A4 з тими самими полями, щоб на екрані було видно, що влізе на папір. */
          .trip-print-list .sheet-page { width: 21cm; max-width: 100%; box-sizing: border-box; background: #fff; padding: 2.5cm 1.5cm 1.5cm; margin: 0 auto 0.5cm; box-shadow: 0 1px 4px rgba(0,0,0,.15); }
        }
      `}</style>

      {/* ТЗ docx 12.10.26: кнопка «Друкувати» — звичайний друк браузера на підключеному
          принтері. Панель «липка», щоб кнопка була під рукою на довгому списку. */}
      <div className="print:hidden sticky top-14 md:top-0 z-20 bg-gray-50 py-2 mb-4 flex flex-wrap gap-2 items-center">
        <Button onClick={() => window.print()}>🖨 Друкувати</Button>
        <Button variant="outline" onClick={() => window.close()}>Закрити</Button>
        <span className="text-sm text-gray-500" style={{ fontFamily: 'inherit', fontSize: 13 }}>
          Записів: {rows.length} · аркушів А4: {Math.max(1, sheets.length)}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="sheet-page">
          <h1>Рейс {formatDate(trip.departureDate)} {tripRouteLabel(trip.country, trip.direction)}</h1>
          <p>У рейсі ще немає посилок.</p>
        </div>
      ) : sheets.map((sheet, si) => (
        <div key={si} className="sheet-page">
          {si === 0 && (
            <h1>Рейс {formatDate(trip.departureDate)} {tripRouteLabel(trip.country, trip.direction)}</h1>
          )}
          <table>
            {sheet.map((row) => {
              if (row.kind === 'ghost') {
                const g = row.g;
                return (
                  <tbody key={`g-${g.id}`} className="parcel-row">
                    <tr>
                      <td rowSpan={2} className="num">{formatJourneyNumber(row.num)}</td>
                      <td colSpan={3}>
                        {g.toTrip
                          ? `Перенесена до рейсу ${tripRouteLabel(g.toTrip.country, g.toTrip.direction)} ${formatDate(g.toTrip.departureDate)}`
                          : 'Прибрана з рейсу'}
                      </td>
                    </tr>
                    <tr><td colSpan={3}></td></tr>
                  </tbody>
                );
              }
              const party = parcelParties(row.p)[euSide];
              const a = party.address;
              const cityStreet = [a?.city, a?.street].filter(Boolean).join(', ');
              // Рядки однакової висоти (без переносу), тож дуже довгу адресу не обрізаємо,
              // а друкуємо меншим кеглем — водій має бачити її повністю.
              const addrSize = cityStreet.length > 44 ? '10pt' : cityStreet.length > 36 ? '12pt' : undefined;
              // ТЗ docx 12.10.26: «003/2» — кількість місць через дріб, якщо їх більше одного.
              const places = row.p.totalPlacesCount > 1 ? `/${row.p.totalPlacesCount}` : '';
              return (
                <tbody key={row.p.id} className="parcel-row">
                  <tr>
                    <td rowSpan={2} className="num">{row.num != null ? `${formatJourneyNumber(row.num)}${places}` : (places ? `—${places}` : '—')}</td>
                    <td style={addrSize ? { fontSize: addrSize } : undefined}>{cityStreet || '—'}</td>
                    <td className="bld">{a?.building || ''}</td>
                    <td className="right postal">{a?.postalCode || ''}</td>
                  </tr>
                  <tr>
                    <td className="name">{[party.lastName, party.firstName].filter(Boolean).join(' ')}</td>
                    <td className="bld"></td>
                    <td className="right phone">{withCountryCode(party.phone, a?.country)}</td>
                  </tr>
                </tbody>
              );
            })}
          </table>
        </div>
      ))}
    </div>
  );
}
