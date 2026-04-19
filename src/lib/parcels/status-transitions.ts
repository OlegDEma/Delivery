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

export const STATUS_TRANSITIONS: Record<ParcelStatusType, ParcelStatusType[]> = {
  draft: [
    'at_collection_point',
    'accepted_for_transport_to_ua',
    'accepted_for_transport_to_eu',
    'returned',
  ],
  at_collection_point: [
    'accepted_for_transport_to_ua',
    'accepted_for_transport_to_eu',
    'returned',
  ],
  // ---- EU → UA ----
  accepted_for_transport_to_ua: ['in_transit_to_ua', 'at_eu_warehouse'],
  at_eu_warehouse: ['in_transit_to_ua', 'accepted_for_transport_to_ua'],
  in_transit_to_ua: ['at_lviv_warehouse'],
  at_lviv_warehouse: ['at_nova_poshta', 'delivered_ua', 'returned'],
  at_nova_poshta: ['delivered_ua', 'not_received', 'refused'],
  // ---- UA → EU ----
  accepted_for_transport_to_eu: ['in_transit_to_eu', 'at_lviv_warehouse'],
  in_transit_to_eu: ['at_eu_warehouse'],
  // at_eu_warehouse — вже визначено вище (воно спільне для обох напрямків)
  // ---- Кінцеві/проблемні ----
  delivered_ua: [],
  delivered_eu: [],
  not_received: ['at_nova_poshta', 'at_lviv_warehouse', 'returned', 'refused'],
  refused: ['returned', 'at_lviv_warehouse'],
  returned: [],
};

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
