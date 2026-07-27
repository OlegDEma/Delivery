import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parcelParties } from '@/lib/parcels/party-snapshot';

// GET /api/tracking?q=... — public, no auth required
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();

  if (!q) {
    return NextResponse.json({ error: 'Вкажіть номер посилки' }, { status: 400 });
  }

  // Search by ITN, internal number, or NP TTN
  const parcel = await prisma.parcel.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { itn: q },
        ...(q.includes('-') ? [{ itn: q.split('-')[0] }] : []),
        { internalNumber: { contains: q, mode: 'insensitive' } },
        { npTtn: q },
        { places: { some: { itnPlace: q } } },
      ],
    },
    select: {
      internalNumber: true,
      npTtn: true,
      status: true,
      direction: true,
      totalPlacesCount: true,
      createdAt: true,
      receiverAddress: { select: { city: true } },
      // ТЗ docx 26.07.26 (п.1): місто отримувача — зі знімка для accepted+ (parcelParties
      // визначає «заморожено» за наявністю senderSnapshot, тож потрібні обидва поля).
      senderSnapshot: true,
      receiverSnapshot: true,
      statusHistory: {
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
    internalNumber: parcel.internalNumber,
    npTtn: parcel.npTtn || null,
    status: parcel.status,
    direction: parcel.direction,
    totalPlacesCount: parcel.totalPlacesCount,
    createdAt: parcel.createdAt,
    receiverCity: parcelParties(parcel).receiver.address?.city || null,
    statusHistory: parcel.statusHistory,
  });
}
