import type { PrintListRow } from '@/components/shared/print-list-sheets';

/**
 * ТЗ docx 20.10.26: друк Маршрутного листа — шаблоном списку рейсу. Записи (вже
 * впорядковані за обраним групуванням і «Країною перебування») готує сторінка
 * «Маршрути» і передає вкладці друку через localStorage — щоб друк збігався з тим,
 * що Працівник бачить на екрані, без повторення логіки групування.
 */
export interface RoutesPrintPayload {
  title: string;
  addressHeader: string;
  rows: PrintListRow[];
}

export const ROUTES_PRINT_KEY_PREFIX = 'routes-print:';
