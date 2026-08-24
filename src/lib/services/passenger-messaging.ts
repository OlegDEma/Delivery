/**
 * ТЗ docx 23.08.26 (Замовлення/Пасажири, п.5-6): після внесення даних і закріплення
 * місця за пасажиром можна надіслати йому ПІДТВЕРДЖЕННЯ з усіма даними, а також
 * РАХУНОК — через WhatsApp / Viber / SMS, так само як це зроблено для посилок.
 *
 * Факт відправки пишеться у `sms_log` (passenger_id + kind), щоб на сайті було
 * видно, що саме вже надсилали пасажиру.
 */

import { prisma } from '@/lib/prisma';
import { formatDate } from '@/lib/utils/format';

export type PassengerMessageKind = 'confirmation' | 'invoice';

const COUNTRY_LABELS: Record<string, string> = { UA: 'Україна', NL: 'Нідерланди', AT: 'Австрія', DE: 'Німеччина' };

interface PassengerForMessage {
  firstName: string;
  lastName: string;
  phone: string;
  seatNumber: number | null;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  price: unknown;
  currency: string;
  isPaid: boolean;
  trip: { direction: string; country: string; departureDate: Date | string } | null;
}

/** Маршрут рейсу лише країнами (ТЗ 08.08: без «ЄС»/«Європа»). */
function routeLabel(trip: PassengerForMessage['trip']): string {
  if (!trip) return '';
  const eu = COUNTRY_LABELS[trip.country] || trip.country;
  return trip.direction === 'ua_to_eu' ? `Україна → ${eu}` : `${eu} → Україна`;
}

/** Підтвердження місця: усі дані поїздки пасажира. */
export function buildPassengerConfirmation(p: PassengerForMessage): string {
  const price = p.price != null ? Number(p.price) : null;
  return [
    'Підтвердження бронювання місця',
    p.trip ? `Рейс: ${routeLabel(p.trip)}, ${formatDate(p.trip.departureDate)}` : null,
    `Пасажир: ${p.lastName} ${p.firstName}`,
    `Телефон: ${p.phone}`,
    p.seatNumber != null ? `Місце: ${p.seatNumber}` : null,
    p.pickupAddress ? `Посадка: ${p.pickupAddress}` : null,
    p.dropoffAddress ? `Висадка: ${p.dropoffAddress}` : null,
    price != null ? `Вартість: ${price.toFixed(2)} ${p.currency}` : null,
    `Оплата: ${p.isPaid ? 'оплачено' : 'не оплачено'}`,
  ].filter((l) => l !== null).join('\n');
}

/** Рахунок до оплати за проїзд. */
export function buildPassengerInvoice(p: PassengerForMessage): string {
  const price = p.price != null ? Number(p.price) : null;
  return [
    'Рахунок за проїзд',
    p.trip ? `Рейс: ${routeLabel(p.trip)}, ${formatDate(p.trip.departureDate)}` : null,
    `Пасажир: ${p.lastName} ${p.firstName}`,
    p.seatNumber != null ? `Місце: ${p.seatNumber}` : null,
    price != null ? `До сплати: ${price.toFixed(2)} ${p.currency}` : 'До сплати: уточнюється',
    p.isPaid ? 'Статус: оплачено, дякуємо!' : 'Статус: очікує оплати',
  ].filter((l) => l !== null).join('\n');
}

export async function loadPassengerForMessage(passengerId: string) {
  return prisma.passenger.findFirst({
    where: { id: passengerId, deletedAt: null },
    select: {
      id: true, firstName: true, lastName: true, phone: true, seatNumber: true,
      pickupAddress: true, dropoffAddress: true, price: true, currency: true, isPaid: true,
      trip: { select: { direction: true, country: true, departureDate: true } },
    },
  });
}

export function buildPassengerBody(p: PassengerForMessage, kind: PassengerMessageKind): string {
  return kind === 'invoice' ? buildPassengerInvoice(p) : buildPassengerConfirmation(p);
}

/** Записуємо факт надсилання повідомлення пасажиру. */
export async function logPassengerMessage(args: {
  passengerId: string;
  phone: string;
  body: string;
  channel: string;
  kind: PassengerMessageKind;
  sentById: string;
  provider: string | null;
  status: 'queued' | 'sent' | 'failed';
}) {
  return prisma.smsLog.create({
    data: {
      passengerId: args.passengerId,
      toParty: 'passenger',
      toPhone: args.phone,
      body: args.body,
      channel: args.channel,
      kind: args.kind,
      provider: args.provider,
      status: args.status,
      sentById: args.sentById,
    },
  });
}
