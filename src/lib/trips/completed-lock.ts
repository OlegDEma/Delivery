import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * ТЗ docx 03.11.26 (Створення посилки Працівником, п.3): «Створити/редагувати посилку
 * можливо лише на рейси, які ще не завершилися. Рейс, відмічений таким що завершився,
 * повністю блокується. Тобто заборонено міняти будь-яку інформацію, що стосується цього
 * рейсу: посилки, пасажири, водії, оплати, транспорт — абсолютно всі дані».
 *
 * Єдине джерело правила для API: будь-яка зміна посилки/пасажира завершеного рейсу і
 * самого рейсу повертає 409. Виняток — зміна статусу самого рейсу Суперадміном (щоб за
 * потреби відкрити рейс назад і виправити дані).
 */
export const TRIP_COMPLETED_LOCK_MESSAGE =
  'Рейс завершено — змінювати дані цього рейсу (посилки, пасажирів, оплати, водіїв, транспорт) не можна.';

export function isTripCompleted(status: string | null | undefined): boolean {
  return status === 'completed';
}

export function tripLockedResponse(): NextResponse {
  return NextResponse.json({ error: TRIP_COMPLETED_LOCK_MESSAGE, tripCompleted: true }, { status: 409 });
}

/** 409, якщо рейс завершено; null — можна змінювати. */
export async function lockIfTripCompleted(tripId: string | null | undefined): Promise<NextResponse | null> {
  if (!tripId) return null;
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { status: true } });
  return isTripCompleted(trip?.status) ? tripLockedResponse() : null;
}

/** 409, якщо посилка належить завершеному рейсу; null — можна змінювати. */
export async function lockIfParcelTripCompleted(parcelId: string): Promise<NextResponse | null> {
  const parcel = await prisma.parcel.findFirst({
    where: { id: parcelId },
    select: { trip: { select: { status: true } } },
  });
  return isTripCompleted(parcel?.trip?.status) ? tripLockedResponse() : null;
}
