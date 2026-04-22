import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { normalizePhone } from '@/lib/utils/phone';

// GET /api/client-portal/receivers?q=
// Повертає унікальних отримувачів з попередніх відправлень цього клієнта.
// Дані беруться з останнього відправлення (останнього parcel) до кожного
// отримувача: прізвище, ім'я, телефон, місто, адреса/склад НП.
//
// За ТЗ «Нова посилка — Отримувач»: «При знаходженні клієнта в пошуку
// показуються наступні дані: прізвище, ім'я, номер телефону, місто,
// адреса доставки. Дані беруться з останнього відправлення».
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim().toLowerCase();

  // Знаходимо клієнта у базі клієнтів по телефону профілю.
  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  if (!profile?.phone) return NextResponse.json([]);

  const me = await prisma.client.findUnique({ where: { phone: profile.phone } });
  if (!me) return NextResponse.json([]);

  // Витягуємо посилки, які я відправляв, з включеним отримувачем і адресою.
  // ordered DESC so Map's first set wins (= last shipment to each receiver).
  const parcels = await prisma.parcel.findMany({
    where: { senderId: me.id, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      receiverId: true,
      createdAt: true,
      receiver: {
        select: { id: true, firstName: true, lastName: true, phone: true, phoneNormalized: true },
      },
      receiverAddress: {
        select: { country: true, city: true, street: true, building: true, npWarehouseNum: true, deliveryMethod: true },
      },
    },
  });

  // Dedupe by receiverId — keep the first (latest) occurrence.
  const seen = new Set<string>();
  const results: Array<{
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    country: string | null;
    city: string | null;
    street: string | null;
    building: string | null;
    npWarehouseNum: string | null;
    deliveryMethod: string | null;
  }> = [];

  for (const p of parcels) {
    if (!p.receiver || seen.has(p.receiver.id)) continue;
    seen.add(p.receiver.id);
    results.push({
      id: p.receiver.id,
      firstName: p.receiver.firstName,
      lastName: p.receiver.lastName,
      phone: p.receiver.phone,
      country: p.receiverAddress?.country ?? null,
      city: p.receiverAddress?.city ?? null,
      street: p.receiverAddress?.street ?? null,
      building: p.receiverAddress?.building ?? null,
      npWarehouseNum: p.receiverAddress?.npWarehouseNum ?? null,
      deliveryMethod: p.receiverAddress?.deliveryMethod ?? null,
    });
  }

  // Filter by query — по прізвищу/імені/телефону. Для телефона — endsWith
  // на нормалізованій версії щоб не вимагати коду країни.
  if (q) {
    const qDigits = normalizePhone(q);
    return NextResponse.json(
      results.filter((r) => {
        const name = `${r.lastName} ${r.firstName}`.toLowerCase();
        if (name.includes(q)) return true;
        if (qDigits && r.phone && normalizePhone(r.phone).endsWith(qDigits)) return true;
        return false;
      })
    );
  }

  return NextResponse.json(results);
}
