'use client';

import { useLayoutEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Запис друкованого списку (два рядки таблиці):
 *   N | Примітки | Місто, Вулиця     | № дому | Поштовий код
 *     |          | Прізвище Ім'я     |        |      Телефон
 */
export interface PrintListRecord {
  kind: 'record';
  key: string;
  /** Номер у стовпчику «№» (напр. «003/2»); порожньо — клітинка без номера. */
  num: string;
  /** Підпис запису для попередження «Не вмістилось повністю» (напр. «№003»). */
  label: string;
  /** ТЗ docx 20.10.26 (Маршрути): статус адреси у МЛ — «Відправник»/«Отримувач»/«Пасажир». */
  noteLead?: string;
  note: string;
  cityStreet: string;
  building: string;
  postal: string;
  name: string;
  phone: string;
}
/** Рядок «Перенесена до рейсу …» — номер лишається за посилкою, що поїхала іншим рейсом. */
export interface PrintListGhost {
  kind: 'ghost';
  key: string;
  num: string;
  text: string;
}
export type PrintListRow = PrintListRecord | PrintListGhost;

/**
 * ТЗ docx 12.10.26 (коментар клієнта): «Записів може бути більше як 15, у відповідності
 * до висоти рядка 10–12 мм». Запис = 12 мм (два рядки по 6 мм). Робоча висота аркуша
 * 297 − 25 − 10 = 262 мм: заголовок 10 мм + шапка стовпчиків 6 мм + 20 × 12 мм = 256 мм.
 */
export const ROWS_PER_SHEET = 20;

/**
 * Шаблон друку списку на А4 — спільний для списку посилок рейсу і Маршрутного листа.
 *
 * ТЗ docx 11.10.26 / 12.10.26 — див. /trips/[id]/print (поля, кеглі, стовпчики).
 * ТЗ docx 20.10.26:
 *  - «Друк Маршрутного листка здійснювати за тим же шаблоном (поля, формат і т.п.), що і
 *    друк списку посилок в Рейсі» — тому шаблон винесено сюди;
 *  - «Незалежно скільки є посилок — друкується ціла сторінка: частина з посилками, решта
 *    просто з порожніми полями. В них можна вписувати інформацію при потребі» — останній
 *    аркуш доповнюємо порожніми записами до ROWS_PER_SHEET;
 *  - «Прізвище та ім'я клієнта вирівнювати по правому краю»;
 *  - «Загальну рамку кожного номера зробити трошки (10%) грубшою» — рамка запису
 *    (обидва рядки разом) товща за внутрішні лінії, див. --frame нижче.
 */
export function PrintListSheets({
  title,
  addressHeader,
  rows,
}: {
  title: string;
  /** Підпис третього стовпчика шапки. */
  addressHeader: string;
  rows: PrintListRow[];
}) {
  const sheetsRef = useRef<HTMLDivElement>(null);
  const clipWarnRef = useRef<HTMLSpanElement>(null);

  // Рядки фіксованої висоти, тож довгий текст не переноситься на новий рядок, а
  // друкується меншим кеглем — щоб водій бачив адресу/примітку повністю. Ширина
  // превʼю дорівнює ширині друку (21 см − поля), тож підібраний кегль вірний і на папері.
  useLayoutEffect(() => {
    const root = sheetsRef.current;
    if (!root) return;
    const clipped: string[] = [];
    root.querySelectorAll<HTMLElement>('[data-fit]').forEach((el) => {
      const min = Number(el.dataset.fitMin || 8);
      const multiline = el.classList.contains('note-text');
      let size = Number(el.dataset.fit);
      el.style.fontSize = `${size}pt`;
      delete el.dataset.clipped;
      // Ширину тексту міряємо Range без округлень: scrollWidth/clientWidth — цілі пікселі,
      // а «…» браузер ставить уже при переповненні на частку пікселя. Запас 1 px — бо
      // метрики шрифту на папері трохи інші, ніж на екрані. Примітка переноситься на
      // кілька рядків — для неї важить лише висота.
      const overflows = () => {
        if (el.scrollHeight > el.clientHeight + 1) return true;
        if (multiline) return false;
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getBoundingClientRect().width > el.getBoundingClientRect().width - 1;
      };
      while (overflows() && size > min) {
        size -= 0.5;
        el.style.fontSize = `${size}pt`;
      }
      if (overflows()) {
        // Не вмістилось і найменшим кеглем: в однорядкових клітинках браузер ставить «…»
        // сам (text-overflow), у примітці — обрізаємо по цілому рядку з «…» (line-clamp).
        el.dataset.clipped = '1';
        if (multiline) {
          const linePx = (size * 96) / 72 * 1.1;
          el.style.setProperty('--lines', String(Math.max(1, Math.floor(el.clientHeight / linePx))));
        }
        if (el.dataset.label) clipped.push(el.dataset.label);
      }
    });
    // Підказка Працівнику (на папір не друкується): що саме не вмістилось повністю.
    if (clipWarnRef.current) {
      clipWarnRef.current.textContent = clipped.length
        ? `Не вмістилось повністю (на папері з «…»): ${clipped.join(', ')}. Для приміток впишіть коротку «Примітку для списку» в картці посилки.`
        : '';
    }
  }, [rows]);

  // Розбиваємо на аркуші по ROWS_PER_SHEET записів; ТЗ 20.10.26 — завжди цілі аркуші
  // (хоча б один), вільні місця — порожні записи для ручних нотаток.
  const sheetCount = Math.max(1, Math.ceil(rows.length / ROWS_PER_SHEET));
  const sheets: (PrintListRow | null)[][] = [];
  for (let si = 0; si < sheetCount; si++) {
    const part: (PrintListRow | null)[] = rows.slice(si * ROWS_PER_SHEET, (si + 1) * ROWS_PER_SHEET);
    while (part.length < ROWS_PER_SHEET) part.push(null);
    sheets.push(part);
  }

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
        /* ТЗ 20.10.26: рамка кожного запису (номера) трохи товща за внутрішні лінії. У таблиці
           з border-collapse ширша межа перемагає, тож зовнішній контур запису бере --frame.
           Буквальні +10% (1,1px) браузер не малює: товщину лінії він округлює вниз до цілих
           точок екрана/друку, і 1,1px виходить рівно як 1px (перевірено 23.10.26). Тож рамка —
           найменший крок, який гарантовано видно: 2px ≈ 0,5 мм проти 0,26 мм внутрішніх ліній. */
        .trip-print-list { --frame: 2px; }
        .trip-print-list tbody.parcel-row { border: var(--frame) solid #000; }
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
        .trip-print-list .note-text[data-clipped] { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: var(--lines, 4); }
        .trip-print-list .postal { text-align: left; }
        .trip-print-list .phone { text-align: right; }
        /* ТЗ 20.10.26: прізвище та імʼя — по правому краю. */
        .trip-print-list .name { text-align: right; }
        .trip-print-list tbody.parcel-row { break-inside: avoid; page-break-inside: avoid; }
        .trip-print-list .sheet-page + .sheet-page { break-before: page; page-break-before: always; }
        .trip-print-list h1 { font-size: 16pt; font-weight: bold; margin: 0 0 0.3cm; line-height: 0.7cm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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
          Записів: {rows.length} · аркушів А4: {sheetCount}
        </span>
        <span ref={clipWarnRef} className="basis-full text-amber-700 empty:hidden" style={{ fontFamily: 'inherit', fontSize: 13 }} />
      </div>

      <div className="sheets" ref={sheetsRef}>
        {sheets.map((sheet, si) => (
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
                  <th>{addressHeader}</th>
                  <th>Дім</th>
                  <th>Індекс / телефон</th>
                </tr>
              </thead>
              {sheet.map((row, ri) => {
                if (!row) {
                  // ТЗ 20.10.26: порожній запис — ті самі клітинки, щоб можна було вписати від руки.
                  return (
                    <tbody key={`e-${si}-${ri}`} className="parcel-row">
                      <tr><td rowSpan={2}></td><td rowSpan={2}></td><td></td><td></td><td></td></tr>
                      <tr><td></td><td></td><td></td></tr>
                    </tbody>
                  );
                }
                if (row.kind === 'ghost') {
                  return (
                    <tbody key={row.key} className="parcel-row">
                      <tr>
                        <td rowSpan={2} className="num"><div className="fit" data-fit="14">{row.num}</div></td>
                        <td rowSpan={2}></td>
                        <td colSpan={3}><div className="fit" data-fit="14">{row.text}</div></td>
                      </tr>
                      <tr><td colSpan={3}></td></tr>
                    </tbody>
                  );
                }
                const hasNote = !!(row.noteLead || row.note);
                return (
                  <tbody key={row.key} className="parcel-row">
                    <tr>
                      <td rowSpan={2} className="num">
                        <div className="fit" data-fit="14">{row.num}</div>
                      </td>
                      <td rowSpan={2} className="note">
                        {hasNote && (
                          <div className="note-text" data-fit="11" data-fit-min="7" data-label={`${row.label} — примітка`}>
                            {row.noteLead && <b>{row.noteLead}{row.note ? '. ' : ''}</b>}
                            {row.note}
                          </div>
                        )}
                      </td>
                      <td><div className="fit" data-fit="14" data-label={`${row.label} — адреса`}>{row.cityStreet || '—'}</div></td>
                      <td><div className="fit" data-fit="14">{row.building}</div></td>
                      <td><div className="fit postal" data-fit="14">{row.postal}</div></td>
                    </tr>
                    <tr>
                      <td><div className="fit name" data-fit="12" data-label={`${row.label} — прізвище та імʼя`}>{row.name}</div></td>
                      <td></td>
                      <td><div className="fit phone" data-fit="14" data-label={`${row.label} — телефон`}>{row.phone}</div></td>
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
