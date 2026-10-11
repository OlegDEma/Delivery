import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/generated/prisma/client';
import type { ParcelStatus } from '@/generated/prisma/enums';
import { moveParcelToTrip } from '@/lib/services/journey-numbering';
import { tripRouteLabel } from '@/lib/constants/countries';
import { formatDate } from '@/lib/utils/format';

import { STAFF_TRANSFER_STATUSES, CLIENT_TRANSFER_STATUSES } from '@/lib/parcels/transfer-rules';
export { STAFF_TRANSFER_STATUSES, CLIENT_TRANSFER_STATUSES };

export function tripShortLabel(t: { country: string; direction: string; departureDate: Date | string }): string {
  return `${tripRouteLabel(t.country, t.direction)} ${formatDate(t.departureDate)}`;
}

export type TransferResult = { ok: true } | { ok: false; status: number; error: string };

export async function transferParcel(args: {
  parcelId: string;
  toTripId: string;
  userId: string | null;
  actor: 'staff' | 'client';
}): Promise<TransferResult> {
  const parcel = await prisma.parcel.findFirst({
    where: { id: args.parcelId, deletedAt: null },
    select: {
      id: true, status: true, direction: true, tripId: true,
      trip: { select: { id: true, country: true, direction: true, departureDate: true } },
    },
  });
  if (!parcel) return { ok: false, status: 404, error: 'Посилку не знайдено' };

  const allowed = args.actor === 'client' ? CLIENT_TRANSFER_STATUSES : STAFF_TRANSFER_STATUSES;
  if (!allowed.includes(parcel.status)) {
    return {
      ok: false, status: 409,
      error: args.actor === 'client'
        ? 'Перенести можна лише замовлення зі статусом «Створена» — зверніться до оператора.'
        : 'Перенести можна лише посилку зі статусом «Створена», «Прийнято до перевезення» або «В дорозі».',
    };
  }

  const target = await prisma.trip.findUnique({
    where: { id: args.toTripId },
    select: { id: true, country: true, direction: true, status: true, departureDate: true },
  });
  if (!target) return { ok: false, status: 404, error: 'Рейс не знайдено' };
  if (target.id === parcel.tripId) return { ok: false, status: 400, error: 'Посилка вже в цьому рейсі' };
  if (target.status !== 'planned' && target.status !== 'in_progress') {
    return { ok: false, status: 409, error: 'Цей рейс уже завершено або скасовано — оберіть інший.' };
  }
  if (target.direction !== parcel.direction) {
    return { ok: false, status: 400, error: 'Рейс іншого напрямку — оберіть рейс того самого напрямку.' };
  }
  if (parcel.trip && parcel.trip.country !== target.country) {
    return { ok: false, status: 400, error: 'Рейс до іншої країни — оберіть рейс до тієї самої країни.' };
  }

  // Посилка «В дорозі» переходить у рейс, який ще не вирушив, — фізично її зняли з
  // машини, тож повертаємо статус «Прийнято до перевезення».
  let newStatus: ParcelStatus | null = null;
  if (target.status === 'planned') {
    if (parcel.status === 'in_transit_to_ua') newStatus = 'accepted_for_transport_to_ua';
    if (parcel.status === 'in_transit_to_eu') newStatus = 'accepted_for_transport_to_eu';
  }

  const note = parcel.trip
    ? `Перенесено з рейсу ${tripShortLabel(parcel.trip)} до рейсу ${tripShortLabel(target)}`
    : `Прив'язано до рейсу ${tripShortLabel(target)}`;
  const extra: Prisma.ParcelUpdateInput = {
    ...(newStatus ? { status: newStatus } : {}),
    statusHistory: {
      create: { status: newStatus ?? parcel.status, changedById: args.userId, notes: note },
    },
  };
  await moveParcelToTrip({ parcelId: parcel.id, toTripId: target.id, userId: args.userId, extra });
  return { ok: true };
}
