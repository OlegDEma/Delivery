import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parcelParties } from '@/lib/parcels/party-snapshot';
import { checkItnQuery, formatItn, INVALID_ITN_MESSAGE } from '@/lib/utils/itn';
import { parcelRouteLabel } from '@/lib/constants/countries';
import { parcelNumberWithJourney } from '@/lib/parcels/display-number';

// GET /api/tracking?q=... — public, no auth required
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();

  if (!q) {
    return NextResponse.json({ error: 'Вкажіть номер посилки' }, { status: 400 });
  }

  // ТЗ docx 07.10.26 (п.2): 10-значний ІТН спершу перевіряємо за Луном —
  // неправильний номер відхиляємо без запиту до БД.
  const itnQuery = checkItnQuery(q);
  if (itnQuery.looksLikeItn && !itnQuery.valid) {
    return NextResponse.json({ error: INVALID_ITN_MESSAGE }, { status: 400 });
  }

  // Search by ITN, internal number, or NP TTN
  const parcel = await prisma.parcel.findFirst({
    where: {
      deletedAt: null,
      OR: itnQuery.looksLikeItn
        ? [{ itn: itnQuery.itn }]
        : [
            { itn: q },
            // ТЗ 07.10.26: старий 14-значний ІТН з уже надрукованих QR.
            { itnLegacy: q },
            ...(q.includes('-') ? [{ itn: q.split('-')[0] }, { itnLegacy: q.split('-')[0] }] : []),
            { internalNumber: { contains: q, mode: 'insensitive' } },
            { npTtn: q },
            { places: { some: { itnPlace: q } } },
          ],
    },
    select: {
      internalNumber: true, journeyNumber: true,
      itn: true,
      npTtn: true,
      status: true,
      direction: true,
      totalPlacesCount: true,
      createdAt: true,
      // ТЗ docx 04.10.26: «Створена клієнтом/водієм/…» — лише джерело і роль автора.
      createdSource: true,
      createdBy: { select: { role: true } },
      receiverAddress: { select: { city: true, country: true } },
      // ТЗ docx 09.10.26: «Україна → Нідерланди» замість «Україна → Європа».
      senderAddress: { select: { country: true } },
      collectionPoint: { select: { country: true } },
      trip: { select: { country: true } },
      // ТЗ docx 26.07.26 (п.1): місто отримувача — зі знімка для accepted+ (parcelParties
      // визначає «заморожено» за наявністю senderSnapshot, тож потрібні обидва поля).
      senderSnapshot: true,
      receiverSnapshot: true,
      // ТЗ docx 26.10.26: нотатки посилки — внутрішні (Працівника/Клієнта), у публічне
      // відстеження за ІТН не віддаємо — лише зміни статусу.
      statusHistory: {
        where: { isNote: false },
        orderBy: { changedAt: 'desc' },
        select: {
          status: true,
          changedAt: true,
          notes: true,
        },
      },
    },
  });

  if (!parcel) {
    return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });
  }

  return NextResponse.json({
    // ТЗ docx 12.10.26: без старого порядкового номера (номер у поїздці замість нього).
    internalNumber: parcelNumberWithJourney(parcel.internalNumber, parcel.journeyNumber),
    // ТЗ docx 07.10.26: 10-значний ІТН у вигляді X-XX-XXXXXX-X.
    itn: formatItn(parcel.itn),
    npTtn: parcel.npTtn || null,
    status: parcel.status,
    direction: parcel.direction,
    routeLabel: parcelRouteLabel(parcel),
    totalPlacesCount: parcel.totalPlacesCount,
    createdAt: parcel.createdAt,
    receiverCity: parcelParties(parcel).receiver.address?.city || null,
    statusHistory: parcel.statusHistory,
    createdSource: parcel.createdSource,
    createdByRole: parcel.createdBy?.role ?? null,
  });
}
