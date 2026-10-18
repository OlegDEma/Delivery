'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

type Row =
  | { kind: 'parcel'; num: number | null; p: PrintParcel }
  | { kind: 'ghost'; num: number; g: PrintTrip['transfersOut'][number] };

/**
 * ТЗ docx 12.10.26 (коментар клієнта): «Записів може бути більше як 15, у відповідності
 * до висоти рядка 10–12 мм». Запис = 12 мм (два рядки по 6 мм). Робоча висота аркуша
 * 297 − 25 − 10 = 262 мм: заголовок 10 мм + шапка стовпчиків 6 мм + 20 × 12 мм = 256 мм.
 */
const ROWS_PER_SHEET = 20;

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
 * Дані — сторони в Європі: для UA→EU — Отримувач, для EU→UA — Відправник (саме за
 * ними водій їде на адреси). Запис — два рядки таблиці:
 *   N | Примітки | Місто, Вулиця     | № дому | Поштовий код
 *     |          | Прізвище Ім'я     |        |      Телефон
 */
export default function TripPrintListPage() {
  const { id } = useParams<{ id: string }>();
  const [trip, setTrip] = useState<PrintTrip | null>(null);
  const [error, setError] = useState('');
  const sheetsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/trips/${id}`)
      .then(async (r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setTrip)
      .catch(() => setError('Рейс не знайдено'));
  }, [id]);

  // Рядки фіксованої висоти, тож довгий текст не переноситься на новий рядок, а
  // друкується меншим кеглем — щоб водій бачив адресу/примітку повністю. Ширина
  // превʼю дорівнює ширині друку (21 см − поля), тож підібраний кегль вірний і на папері.
  useLayoutEffect(() => {
    const root = sheetsRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>('[data-fit]').forEach((el) => {
      const min = Number(el.dataset.fitMin || 8);
      let size = Number(el.dataset.fit);
      el.style.fontSize = `${size}pt`;
      const overflows = () => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
      while (overflows() && size > min) {
        size -= 0.5;
        el.style.fontSize = `${size}pt`;
      }
    });
  }, [trip]);

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

  // Розбиваємо на аркуші по ROWS_PER_SHEET записів — кожен аркуш окремою таблицею з розривом сторінки.
  const sheets: Row[][] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_SHEET) sheets.push(rows.slice(i, i + ROWS_PER_SHEET));

  const title = `Рейс ${formatDate(trip.departureDate)} ${tripRouteLabel(trip.country, trip.direction)}`;

  return (
    <div className="trip-print-list">
      {/* @page — А4, поля 25 / 10 / 10 / 10 мм (ТЗ 12.10.26, коментар клієнта). Ширина
          таблиці 21 − 2 = 19 см: № 1,6 · Примітки 4,2 · Адреса 7,9 · Дім 1,4 · Індекс/Телефон 3,9.
          Висота запису фіксована (2 × 0,6 см), текст не переноситься — інакше рядки
          вийшли б різної висоти. */}
      <style>{`
        @page { size: A4; margin: 2.5cm 1cm 1cm 1cm; }
        .trip-print-list { font-family: Arial, Helvetica, sans-serif; font-size: 14pt; color: #000; }
        .trip-print-list table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .trip-print-list td, .trip-print-list th {
          border: 1px solid #000; padding: 0 3pt; vertical-align: middle;
          height: 0.6cm; max-height: 0.6cm; line-height: 1.1; overflow: hidden;
        }
        .trip-print-list th { font-size: 9pt; font-weight: normal; text-align: left; color: #333; }
        .trip-print-list .c-num { width: 1.6cm; }
        .trip-print-list .c-note { width: 4.2cm; }
        .trip-print-list .c-bld { width: 1.4cm; }
        .trip-print-list .c-right { width: 3.9cm; }
        .trip-print-list td.num { text-align: center; font-weight: bold; }
        .trip-print-list td.note { vertical-align: top; padding-top: 1pt; }
        /* Однорядковий вміст: без переносу; кегль підбирає useLayoutEffect (data-fit). */
        .trip-print-list .fit { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        /* Примітка: до трьох рядків у клітинці висотою 1,2 см (обидва рядки запису). */
        .trip-print-list .note-text { height: 1.12cm; overflow: hidden; white-space: normal; overflow-wrap: anywhere; line-height: 1.1; }
        .trip-print-list .postal { text-align: left; }
        .trip-print-list .phone { text-align: right; }
        .trip-print-list tbody.parcel-row { break-inside: avoid; page-break-inside: avoid; }
        .trip-print-list .sheet-page + .sheet-page { break-before: page; page-break-before: always; }
        .trip-print-list h1 { font-size: 16pt; font-weight: bold; margin: 0 0 0.3cm; line-height: 0.7cm; white-space: nowrap; }
        /* На телефоні превʼю не стискаємо (інакше вигляд не відповідає папері) —
           аркуш реальної ширини, горизонтальна прокрутка. */
        @media screen { .trip-print-list .sheets { overflow-x: auto; } }
        @media screen {
          /* Превʼю = аркуш A4 з тими самими полями, щоб на екрані було видно, що влізе на папір. */
          .trip-print-list .sheet-page { width: 21cm; box-sizing: border-box; background: #fff; padding: 2.5cm 1cm 1cm; margin: 0 auto 0.5cm; box-shadow: 0 1px 4px rgba(0,0,0,.15); }
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

      <div className="sheets" ref={sheetsRef}>
      {rows.length === 0 ? (
        <div className="sheet-page">
          <h1>{title}</h1>
          <p>У рейсі ще немає посилок.</p>
        </div>
      ) : sheets.map((sheet, si) => (
        <div key={si} className="sheet-page">
          {si === 0 && <h1>{title}</h1>}
          <table>
            <colgroup>
              <col className="c-num" />
              <col className="c-note" />
              <col />
              <col className="c-bld" />
              <col className="c-right" />
            </colgroup>
            <thead>
              <tr>
                <th>№</th>
                <th>Примітки</th>
                <th>{euSide === 'receiver' ? 'Отримувач' : 'Відправник'}: адреса, прізвище та імʼя</th>
                <th>Дім</th>
                <th>Індекс / телефон</th>
              </tr>
            </thead>
            {sheet.map((row) => {
              if (row.kind === 'ghost') {
                const g = row.g;
                return (
                  <tbody key={`g-${g.id}`} className="parcel-row">
                    <tr>
                      <td rowSpan={2} className="num"><div className="fit" data-fit="14">{formatJourneyNumber(row.num)}</div></td>
                      <td rowSpan={2}></td>
                      <td colSpan={3}>
                        <div className="fit" data-fit="14">
                          {g.toTrip
                            ? `Перенесена до рейсу ${tripRouteLabel(g.toTrip.country, g.toTrip.direction)} ${formatDate(g.toTrip.departureDate)}`
                            : 'Прибрана з рейсу'}
                        </div>
                      </td>
                    </tr>
                    <tr><td colSpan={3}></td></tr>
                  </tbody>
                );
              }
              const party = parcelParties(row.p)[euSide];
              const a = party.address;
              const cityStreet = [a?.city, a?.street].filter(Boolean).join(', ');
              // ТЗ docx 12.10.26: «003/2» — кількість місць через дріб, якщо їх більше одного.
              const places = row.p.totalPlacesCount > 1 ? `/${row.p.totalPlacesCount}` : '';
              // «Лише основне»: коротка примітка Працівника для списку, інакше — нотатка Клієнта.
              const note = (row.p.listNote || row.p.clientNote || '').replace(/\s+/g, ' ').trim();
              return (
                <tbody key={row.p.id} className="parcel-row">
                  <tr>
                    <td rowSpan={2} className="num">
                      <div className="fit" data-fit="14">{row.num != null ? `${formatJourneyNumber(row.num)}${places}` : (places ? `—${places}` : '—')}</div>
                    </td>
                    <td rowSpan={2} className="note">
                      {note && <div className="note-text" data-fit="11" data-fit-min="7">{note}</div>}
                    </td>
                    <td><div className="fit" data-fit="14">{cityStreet || '—'}</div></td>
                    <td><div className="fit" data-fit="14">{a?.building || ''}</div></td>
                    {/* ТЗ 12.10.26: індекс NL — літери великі (старі записи на кшталт «1813 tt»). */}
                    <td><div className="fit postal" data-fit="14">{(a?.postalCode || '').toUpperCase()}</div></td>
                  </tr>
                  <tr>
                    <td><div className="fit" data-fit="12">{[party.lastName, party.firstName].filter(Boolean).join(' ')}</div></td>
                    <td></td>
                    <td><div className="fit phone" data-fit="14">{withCountryCode(party.phone, a?.country)}</div></td>
                  </tr>
                </tbody>
              );
            })}
          </table>
        </div>
      ))}
      </div>
    </div>
  );
}
