import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validators/common';

/**
 * GET /api/client-portal/orders/[id]
 *
 * Повертає деталі посилки для авторизованого Клієнта — лише якщо він є
 * відправником або отримувачем цієї посилки. Інакше 404 (щоб не «світити»
 * існування чужих посилок).
 *
 * Фікс багу з docx 03.06.2026: «Посилки створені клієнтом не клікабельні.
 * Не можу зайти в створену посилку з аккаунту клієнта.»
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Знаходимо Client за телефоном профілю. Клієнт не може існувати в БД,
  // якщо профіль ще не «склеєний» з Client-карткою — тоді 404.
  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  if (!profile?.phone) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const client = await prisma.client.findUnique({ where: { phone: profile.phone } });
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Доступ лише до власних посилок (sender/receiver = поточний клієнт).
  const parcel = await prisma.parcel.findFirst({
    where: {
      id,
      deletedAt: null,
      OR: [{ senderId: client.id }, { receiverId: client.id }],
    },
    include: {
      sender: { select: { firstName: true, lastName: true, phone: true } },
      receiver: { select: { firstName: true, lastName: true, phone: true } },
      receiverAddress: true,
      senderAddress: true,
      places: { orderBy: { placeNumber: 'asc' } },
      statusHistory: {
        orderBy: { changedAt: 'desc' },
        select: { status: true, changedAt: true, notes: true },
      },
      trip: { select: { departureDate: true, country: true } },
      collectionPoint: {
        select: { name: true, city: true, address: true, country: true },
      },
    },
  });

  if (!parcel) {
    return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });
  }

  return NextResponse.json(parcel);
}
