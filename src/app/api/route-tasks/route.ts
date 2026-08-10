import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth/guards';
import { LOGISTICS_ROLES } from '@/lib/constants/roles';

/**
 * ТЗ docx 08.08.26 (Маршрутні листи): «лист» = набір адрес (RouteTask) на конкретну
 * ДАТУ в межах поїздки. Тут RouteTask використовується як маркер «посилка на листі
 * дати X» (групування за датою); статус доставки лишається на самій посилці.
 */

// GET /api/route-tasks?journeyId=xxx — задачі всіх рейсів поїздки (для дато-листів).
export async function GET(request: NextRequest) {
  const guard = await requireRole(LOGISTICS_ROLES);
  if (!guard.ok) return guard.response;

  const journeyId = new URL(request.url).searchParams.get('journeyId');
  if (!journeyId) return NextResponse.json({ error: 'journeyId обовʼязковий' }, { status: 400 });

  const trips = await prisma.trip.findMany({ where: { journeyId }, select: { id: true } });
  const tripIds = trips.map((t) => t.id);
  if (tripIds.length === 0) return NextResponse.json([]);

  const tasks = await prisma.routeTask.findMany({
    where: { tripId: { in: tripIds } },
    orderBy: [{ taskDate: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true, tripId: true, parcelId: true, taskDate: true, taskType: true,
      status: true, sortOrder: true, createdAt: true,
    },
  });
  return NextResponse.json(tasks);
}

// POST /api/route-tasks — створити «Маршрутний лист» на дату: додати обрані посилки
// (RouteTask) до цієї дати. Body: { taskDate, parcelIds[] }.
export async function POST(request: NextRequest) {
  const guard = await requireRole(LOGISTICS_ROLES);
  if (!guard.ok) return guard.response;

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Очікується JSON body' }, { status: 400 }); }

  const taskDate = body.taskDate ? new Date(body.taskDate) : null;
  const parcelIds: string[] = Array.isArray(body.parcelIds) ? body.parcelIds : [];
  if (!taskDate || Number.isNaN(taskDate.getTime())) {
    return NextResponse.json({ error: 'Невалідна дата листа' }, { status: 400 });
  }
  if (parcelIds.length === 0) {
    return NextResponse.json({ error: 'Оберіть хоча б одну посилку' }, { status: 400 });
  }

  const parcels = await prisma.parcel.findMany({
    where: { id: { in: parcelIds } },
    select: { id: true, tripId: true, direction: true, receiverAddressId: true, senderAddressId: true },
  });

  let created = 0;
  for (const p of parcels) {
    if (!p.tripId) continue; // посилка має бути на рейсі
    // Не дублюємо: якщо посилка вже на листі цієї дати — пропускаємо.
    const exists = await prisma.routeTask.findFirst({
      where: { tripId: p.tripId, parcelId: p.id, taskDate },
      select: { id: true },
    });
    if (exists) continue;
    // eu_to_ua → забрати від Відправника в EU (pickup); ua_to_eu → доставити Отримувачу в EU (delivery).
    const taskType = p.direction === 'eu_to_ua' ? 'pickup' : 'delivery';
    const addressId = p.direction === 'eu_to_ua' ? p.senderAddressId : p.receiverAddressId;
    await prisma.routeTask.create({
      data: { tripId: p.tripId, parcelId: p.id, taskDate, taskType, addressId: addressId ?? null },
    });
    created++;
  }
  return NextResponse.json({ created }, { status: 201 });
}
