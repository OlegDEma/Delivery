import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { normalizePhone } from '@/lib/utils/phone';

// GET /api/client-portal/receivers?q=
//
// Пошук отримувача за прізвищем/телефоном. Двоступенева стратегія:
//
// 1) Спочатку дивимось у МОЇ попередні відправлення — якщо клієнт колись
//    відправляв цій людині, одразу показуємо з пам'яті (дані з останнього
//    відправлення).
//
// 2) Якщо в моїх відправленнях не знайдено — розширюємо на всю базу клієнтів
//    за точним збігом прізвища/телефону. Для кожного знайденого підтягуємо
//    адресу з його останньої посилки (як отримувача).
//
// Privacy: min 2 символи у запиті — захист від enumeration.
// Повертаємо лише поля потрібні для prefill форми: ім'я, прізвище, телефон,
// країна, місто, адреса/склад НП.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  if (q.length < 2) return NextResponse.json([]);

  const qLower = q.toLowerCase();
  const qDigits = normalizePhone(q);

  // Хто я — щоб відсортувати власну історію першою.
  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  const me = profile?.phone
    ? await prisma.client.findUnique({ where: { phone: profile.phone } })
    : null;

  type ReceiverResult = {
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
    /** Прапорець — «ви вже відправляли цій людині» для майбутньої індикації */
    fromMyHistory: boolean;
  };

  const map = new Map<string, ReceiverResult>();

  // (1) Мої попередні відправлення — якщо є.
  if (me) {
    const myParcels = await prisma.parcel.findMany({
      where: { senderId: me.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        receiver: {
          select: { id: true, firstName: true, lastName: true, phone: true, phoneNormalized: true },
        },
        receiverAddress: {
          select: { country: true, city: true, street: true, building: true, npWarehouseNum: true, deliveryMethod: true },
        },
      },
    });
    for (const p of myParcels) {
      if (!p.receiver || map.has(p.receiver.id)) continue;
      const name = `${p.receiver.lastName} ${p.receiver.firstName}`.toLowerCase();
      const phoneMatches = qDigits && p.receiver.phoneNormalized?.endsWith(qDigits);
      if (!name.includes(qLower) && !phoneMatches) continue;
      map.set(p.receiver.id, {
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
        fromMyHistory: true,
      });
    }
  }

  // (2) Розширений пошук по всій базі клієнтів.
  const clients = await prisma.client.findMany({
    where: {
      deletedAt: null,
      OR: [
        { lastName: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        ...(qDigits ? [{ phoneNormalized: { endsWith: qDigits } }] : []),
      ],
    },
    take: 20,
    orderBy: { lastName: 'asc' },
    select: { id: true, firstName: true, lastName: true, phone: true },
  });

  // Для кожного — його остання посилка ЯК ОТРИМУВАЧА (щоб взяти адресу).
  const missingIds = clients.map((c) => c.id).filter((id) => !map.has(id));
  if (missingIds.length > 0) {
    const lastParcels = await prisma.parcel.findMany({
      where: { receiverId: { in: missingIds }, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        receiverId: true,
        receiverAddress: {
          select: { country: true, city: true, street: true, building: true, npWarehouseNum: true, deliveryMethod: true },
        },
      },
    });
    // per-receiverId: перший (=найсвіжіший) запис.
    const addrByReceiver = new Map<string, typeof lastParcels[number]['receiverAddress']>();
    for (const p of lastParcels) {
      if (!addrByReceiver.has(p.receiverId)) {
        addrByReceiver.set(p.receiverId, p.receiverAddress);
      }
    }
    for (const c of clients) {
      if (map.has(c.id)) continue;
      const addr = addrByReceiver.get(c.id);
      map.set(c.id, {
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        country: addr?.country ?? null,
        city: addr?.city ?? null,
        street: addr?.street ?? null,
        building: addr?.building ?? null,
        npWarehouseNum: addr?.npWarehouseNum ?? null,
        deliveryMethod: addr?.deliveryMethod ?? null,
        fromMyHistory: false,
      });
    }
  }

  // Сортування: спочатку з моєї історії, потім решта.
  const results = Array.from(map.values()).sort((a, b) => {
    if (a.fromMyHistory !== b.fromMyHistory) return a.fromMyHistory ? -1 : 1;
    return a.lastName.localeCompare(b.lastName);
  });

  return NextResponse.json(results);
}
