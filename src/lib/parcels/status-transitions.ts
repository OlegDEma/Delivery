/**
 * Правила переходу між статусами посилки.
 *
 * Мапа: з якого статусу -> у які наступні дозволено переходити.
 *
 * Призначення:
 * - Фронтенд: dropdown «Змінити статус» показує тільки допустимі переходи
 *   з поточного статусу (пункт з ТЗ клієнта: «Статуси що випадають зі списку
 *   мають відповідати прийнятим в програмі статусам і правилам їх зміни»).
 * - Бекенд: `PATCH /api/parcels/[id]` валідує перехід. Super_admin може
 *   обходити обмеження через ?force=1.
 *
 * Напрямки:
 *   eu_to_ua: draft → accepted_for_transport_to_ua → in_transit_to_ua
 *             → at_lviv_warehouse → at_nova_poshta → delivered_ua
 *   ua_to_eu: draft → accepted_for_transport_to_eu → in_transit_to_eu
 *             → at_eu_warehouse → delivered_eu
 *
 * Кінцеві статуси (`delivered_*`, `returned`) не мають продовження.
 * Термінальні проблемні (`not_received`, `refused`) — дозволяють повернення
 * на склад або спробу повторної доставки.
 */

import type { ParcelStatusType } from '@/lib/constants/statuses';

// Спрощена матриця за ТЗ «Статуси» (6 основних):
//   1. draft — «Створена»
//   2. accepted_for_transport_* — «Прийнято до перевезення»
//   3. in_transit_* — «В дорозі» (auto при старті рейсу — окрема задача)
//   4. delivered_* — «Доставлено» (термінальний, не змінюється)
//   5. at_nova_poshta — «На Новій пошті» (auto коли отримано ТТН)
//   6. not_received — «Не отримано»
//
// Технічні склади (at_lviv_warehouse / at_eu_warehouse / at_collection_point)
// лишаються в enum для сумісності з логістикою/aging, але не пропонуються
// користувачу в dropdown — вони вмикаються автоматично через PATCH (напр.
// bulk-status на складі) або з окремих сторінок.
export const STATUS_TRANSITIONS: Record<ParcelStatusType, ParcelStatusType[]> = {
  draft: [
    'accepted_for_transport_to_ua',
    'accepted_for_transport_to_eu',
  ],
  at_collection_point: [
    'accepted_for_transport_to_ua',
    'accepted_for_transport_to_eu',
  ],
  // ---- EU → UA ----
  accepted_for_transport_to_ua: ['in_transit_to_ua'],
  at_eu_warehouse: ['in_transit_to_ua'],
  in_transit_to_ua: ['at_nova_poshta', 'delivered_ua'],
  at_lviv_warehouse: ['at_nova_poshta', 'delivered_ua'],
  at_nova_poshta: ['delivered_ua', 'not_received'],
  // ---- UA → EU ----
  accepted_for_transport_to_eu: ['in_transit_to_eu'],
  in_transit_to_eu: ['delivered_eu', 'not_received'],
  // ---- Кінцеві/проблемні ----
  // «Доставлено» — фінал, за ТЗ: «коли посилці призначено статус
  // Доставлено, ніяких статусів (навіть того самого) вже призначати
  // ніхто (і програма теж) не може». Порожній масив переходів +
  // сервер відкидає PATCH. Super_admin теж не обходить.
  delivered_ua: [],
  delivered_eu: [],
  not_received: ['at_nova_poshta', 'delivered_ua', 'delivered_eu'],
  refused: [],
  returned: [],
};

/** Термінальні статуси — після них жодних змін статусу. */
export const TERMINAL_STATUSES: ParcelStatusType[] = ['delivered_ua', 'delivered_eu'];

export function isTerminal(status: ParcelStatusType | null | undefined): boolean {
  return !!status && TERMINAL_STATUSES.includes(status);
}

/**
 * Чи допустимий перехід з поточного статусу в новий.
 * Якщо from === to — повертає true (idempotent update).
 */
export function isAllowedTransition(
  from: ParcelStatusType | null | undefined,
  to: ParcelStatusType
): boolean {
  if (!from) return true; // новостворена — будь-який стартовий статус ОК
  if (from === to) return true;
  return (STATUS_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Список статусів доступних з поточного (для dropdown у UI).
 * Включає сам поточний як першу опцію (зручно для контрольованого select).
 */
export function nextStatuses(from: ParcelStatusType): ParcelStatusType[] {
  return [from, ...(STATUS_TRANSITIONS[from] ?? [])];
}
