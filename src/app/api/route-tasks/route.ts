import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth/guards';
import { LOGISTICS_ROLES } from '@/lib/constants/roles';

/**
 * ТЗ docx 08.08.26 (v12): RouteTask = «адреса на маршруті» поїздки. Може бути:
 *  • привʼязана до посилки (parcelId) — з посилки поїздки;
 *  • ручна (manual*) — довільна адреса, додана Водієм вручну (copy/paste).
 * taskDate = у якому листі адреса. NULL = ще в ЗАГАЛЬНОМУ списку (не в листі).
 */

// GET /api/route-tasks?journeyId=xxx — усі задачі рейсів поїздки (для дато-листів + ручні).
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
      status: true, failureReason: true, sortOrder: true, createdAt: true,
      addressText: true, postalCode: true,
      manualName: true, manualPhone: true, manualDirection: true, manualCity: true,
      manualStreet: true, manualBuilding: true, manualFirstName: true, manualLastName: true,
    },
  });
  return NextResponse.json(tasks);
}

export async function POST(request: NextRequest) {
  const guard = await requireRole(LOGISTICS_ROLES);
  if (!guard.ok) return guard.response;

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Очікується JSON body' }, { status: 400 }); }

  // ── Режим 1: ручна адреса (без посилки) → у ЗАГАЛЬНИЙ список (taskDate=null). ──
  if (body.manual) {
    const journeyId = body.journeyId;
    if (!journeyId) return NextResponse.json({ error: 'journeyId обовʼязковий' }, { status: 400 });
    const trip = await prisma.trip.findFirst({ where: { journeyId }, orderBy: { direction: 'asc' }, select: { id: true } });
    if (!trip) return NextResponse.json({ error: 'Рейси поїздки не знайдено' }, { status: 404 });
    // ТЗ docx 30.08.26: адреса приходить окремими полями (вулиця + номер будинку),
    // ПІБ — окремо прізвище та імʼя. Зводимо їх у legacy-поля addressText/manualName,
    // щоб старі записи й вигляди списку працювали без змін.
    const street = String(body.manualStreet ?? '').trim();
    const building = String(body.manualBuilding ?? '').trim();
    const lastName = String(body.manualLastName ?? '').trim();
    const firstName = String(body.manualFirstName ?? '').trim();
    const composedAddress = [street, building].filter(Boolean).join(' ');
    const composedName = [lastName, firstName].filter(Boolean).join(' ');
    const addressText = String(body.addressText ?? composedAddress).trim();
    if (!addressText) return NextResponse.json({ error: 'Вкажіть вулицю і номер будинку' }, { status: 400 });
    await prisma.routeTask.create({
      data: {
        tripId: trip.id, taskType: 'delivery', taskDate: null,
        addressText,
        postalCode: body.postalCode ? String(body.postalCode).trim() : null,
        manualCity: body.manualCity ? String(body.manualCity).trim() : null,
        manualName: (body.manualName ? String(body.manualName).trim() : composedName) || null,
        manualPhone: body.manualPhone ? String(body.manualPhone).trim() : null,
        manualDirection: body.manualDirection ? String(body.manualDirection).trim() : null,
        manualStreet: street || null,
        manualBuilding: building || null,
        manualLastName: lastName || null,
        manualFirstName: firstName || null,
      },
    });
    return NextResponse.json({ created: 1 }, { status: 201 });
  }

  // ── Режим 2: «Створити Маршрутний лист» — перемістити обрані адреси на дату. ──
  const taskDate = body.taskDate ? new Date(body.taskDate) : null;
  const parcelIds: string[] = Array.isArray(body.parcelIds) ? body.parcelIds : [];
  const taskIds: string[] = Array.isArray(body.taskIds) ? body.taskIds : [];
  if (!taskDate || Number.isNaN(taskDate.getTime())) {
    return NextResponse.json({ error: 'Невалідна дата листа' }, { status: 400 });
  }
  if (parcelIds.length === 0 && taskIds.length === 0) {
    return NextResponse.json({ error: 'Оберіть хоча б одну адресу' }, { status: 400 });
  }

  let created = 0;
  if (parcelIds.length) {
    const parcels = await prisma.parcel.findMany({
      where: { id: { in: parcelIds } },
      select: { id: true, tripId: true, direction: true, receiverAddressId: true, senderAddressId: true },
    });
    for (const p of parcels) {
      if (!p.tripId) continue;
      const exists = await prisma.routeTask.findFirst({
        where: { tripId: p.tripId, parcelId: p.id, taskDate }, select: { id: true },
      });
      if (exists) continue;
      const taskType = p.direction === 'eu_to_ua' ? 'pickup' : 'delivery';
      const addressId = p.direction === 'eu_to_ua' ? p.senderAddressId : p.receiverAddressId;
      await prisma.routeTask.create({
        data: { tripId: p.tripId, parcelId: p.id, taskDate, taskType, addressId: addressId ?? null },
      });
      created++;
    }
  }
  // Наявні ручні адреси (taskDate=null) → переміщуємо в лист (проставляємо дату).
  if (taskIds.length) {
    const r = await prisma.routeTask.updateMany({ where: { id: { in: taskIds } }, data: { taskDate } });
    created += r.count;
  }
  return NextResponse.json({ created }, { status: 201 });
}
