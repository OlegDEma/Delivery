'use client';

import { useSyncExternalStore } from 'react';
import { PrintListSheets } from '@/components/shared/print-list-sheets';
import { ROUTES_PRINT_KEY_PREFIX, type RoutesPrintPayload } from './payload';

/** Знімок для друку читаємо один раз (вкладка друку не змінює його). */
let cached: { key: string; payload: RoutesPrintPayload | null } | null = null;
function readPayload(): RoutesPrintPayload | null {
  const key = new URLSearchParams(window.location.search).get('key') || '';
  if (cached?.key === key) return cached.payload;
  let payload: RoutesPrintPayload | null = null;
  try {
    const raw = window.localStorage.getItem(ROUTES_PRINT_KEY_PREFIX + key);
    payload = raw ? (JSON.parse(raw) as RoutesPrintPayload) : null;
  } catch {
    payload = null;
  }
  cached = { key, payload };
  return payload;
}
const noopSubscribe = () => () => {};

/**
 * ТЗ docx 20.10.26 (Логістика/Маршрути): «Друк Маршрутного листка здійснювати за тим же
 * шаблоном (поля, формат і т.п.), що і друк списку посилок в Рейсі». Вміст аркуша
 * (адреси листа у вибраному порядку групування) готує сторінка «Маршрути».
 */
export default function RoutesPrintPage() {
  // undefined — ще на сервері (до гідрації), null — даних для друку немає.
  const payload = useSyncExternalStore(noopSubscribe, readPayload, () => undefined);

  if (payload === undefined) return <div className="text-center py-12 text-gray-500">Завантаження…</div>;
  if (!payload) {
    return (
      <div className="text-center py-12 text-gray-500">
        Немає даних для друку. Відкрийте «Маршрути» і натисніть 🖨 у Маршрутному листі ще раз.
      </div>
    );
  }
  return <PrintListSheets title={payload.title} addressHeader={payload.addressHeader} rows={payload.rows} />;
}
