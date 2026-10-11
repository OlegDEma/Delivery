import type { ParcelStatusType } from '@/lib/constants/statuses';

/**
 * ТЗ docx 09.10.26 (Створення посилки Працівником, п.2): перенесення посилки на інший
 * рейс. «Працівник може це зробити на етапі „Прийнято до перевезення“ або „В дорозі
 * до…“. Клієнту доступно лише при наявному статусі „Створена“».
 * Працівнику лишаємо й «Створена» (до прийняття він і так редагує посилку).
 */
export const STAFF_TRANSFER_STATUSES: ParcelStatusType[] = [
  'draft',
  'accepted_for_transport_to_ua', 'accepted_for_transport_to_eu',
  'in_transit_to_ua', 'in_transit_to_eu',
];
export const CLIENT_TRANSFER_STATUSES: ParcelStatusType[] = ['draft'];
