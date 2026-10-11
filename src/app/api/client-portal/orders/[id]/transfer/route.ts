import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validators/common';
import { transferParcel, CLIENT_TRANSFER_STATUSES } from '@/lib/services/parcel-transfer';
import { logger } from '@/lib/logger';

/**
 * ТЗ docx 09.10.26 (п.2): Клієнт може перенести своє замовлення на інший рейс,
 * поки воно «Створена» (Працівник ще не прийняв його до перевезення).
 *
 * GET  — рейси, на які можна перенести (той самий напрямок і країна, ще не вирушили).
 * POST { tripId } — перенести.
 */
async function loadOwnParcel(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  const client = profile?.phone ? await prisma.client.findUnique({ where: { phone: profile.phone } }) : null;
  if (!client) return { error: NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 }) };
  const parcel = await prisma.parcel.findFirst({
    where: { id, deletedAt: null, OR: [{ senderId: client.id }, { receiverId: client.id }] },
    select: {
      id: true, status: true, direction: true, tripId: true,
      trip: { select: { country: true } },
      senderAddress: { select: { country: true } },
      receiverAddress: { select: { country: true } },
    },
  });
  if (!parcel) return { error: NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 }) };
  return { parcel, userId: user.id };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });
  const r = await loadOwnParcel(id);
  if ('error' in r) return r.error;
  const { parcel } = r;
  if (!CLIENT_TRANSFER_STATUSES.includes(parcel.status)) return NextResponse.json({ trips: [] });

  const euCountry = parcel.trip?.country
    ?? (parcel.direction === 'eu_to_ua' ? parcel.senderAddress?.country : parcel.receiverAddress?.country);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const trips = await prisma.trip.findMany({
    where: {
      direction: parcel.direction,
      status: 'planned',
      departureDate: { gte: today },
      ...(euCountry && euCountry !== 'UA' ? { country: euCountry } : {}),
      ...(parcel.tripId ? { id: { not: parcel.tripId } } : {}),
    },
    orderBy: { departureDate: 'asc' },
    take: 12,
    select: { id: true, country: true, direction: true, departureDate: true, status: true },
  });
  return NextResponse.json({ trips });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });
  const r = await loadOwnParcel(id);
  if ('error' in r) return r.error;
  const body = await request.json().catch(() => null) as { tripId?: string } | null;
  if (!body?.tripId || !isUuid(body.tripId)) return NextResponse.json({ error: 'Оберіть рейс' }, { status: 400 });

  const res = await transferParcel({ parcelId: id, toTripId: body.tripId, userId: r.userId, actor: 'client' });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  logger.audit('parcel.transferred_by_client', { parcelId: id, toTripId: body.tripId, userId: r.userId });
  return NextResponse.json({ success: true });
}
