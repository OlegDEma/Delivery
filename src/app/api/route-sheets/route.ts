import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth/guards';
import { LOGISTICS_ROLES } from '@/lib/constants/roles';
import { isUuid } from '@/lib/validators/common';
import { logger } from '@/lib/logger';

/**
 * ТЗ docx 30.08.26: Маршрутний лист — самостійна сутність (поїздка + дата).
 * «Створити Маршрутний лист» → обрати дату → МЛ зʼявляється кнопкою під нею,
 * ще ПОРОЖНІЙ. Адреси додаються потім (RouteTask.taskDate = дата листа).
 * Раніше МЛ був лише похідною від задач, тому порожній створити було неможливо.
 */

// GET /api/route-sheets?journeyId=... — списки листів поїздки
export async function GET(request: NextRequest) {
  const guard = await requireRole(LOGISTICS_ROLES);
  if (!guard.ok) return guard.response;

  const journeyId = new URL(request.url).searchParams.get('journeyId');
  if (!journeyId || !isUuid(journeyId)) {
    return NextResponse.json({ error: 'journeyId обовʼязковий' }, { status: 400 });
  }

  const sheets = await prisma.routeSheet.findMany({
    where: { journeyId },
    orderBy: { sheetDate: 'asc' },
    select: { id: true, sheetDate: true, createdAt: true },
  });
  return NextResponse.json(sheets);
}

// POST /api/route-sheets — створити лист на дату (порожній)
export async function POST(request: NextRequest) {
  const guard = await requireRole(LOGISTICS_ROLES);
  if (!guard.ok) return guard.response;

  let body: { journeyId?: string; sheetDate?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Очікується JSON body' }, { status: 400 }); }

  const { journeyId, sheetDate } = body;
  if (!journeyId || !isUuid(journeyId)) {
    return NextResponse.json({ error: 'journeyId обовʼязковий' }, { status: 400 });
  }
  if (!sheetDate || Number.isNaN(new Date(sheetDate).getTime())) {
    return NextResponse.json({ error: 'Оберіть дату Маршрутного листа' }, { status: 400 });
  }

  const journey = await prisma.journey.findUnique({
    where: { id: journeyId },
    select: { id: true, departureDate: true, endDate: true, euReturnDate: true },
  });
  if (!journey) return NextResponse.json({ error: 'Поїздку не знайдено' }, { status: 404 });

  // ТЗ 21.08: дата має попадати в діапазон поїздки — інакше лист «повисає».
  // Date з Prisma треба зводити в ISO (String(Date) дає «Tue Sep 01 2026…»).
  const day = (d: Date | string | null) =>
    d ? (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)) : null;
  const start = day(journey.departureDate);
  const end = day(journey.endDate) ?? day(journey.euReturnDate) ?? start;
  const picked = sheetDate.slice(0, 10);
  if (start && end && (picked < start || picked > end)) {
    return NextResponse.json(
      { error: `Дата поза межами поїздки (${start} — ${end}). Оберіть іншу.` },
      { status: 400 },
    );
  }

  const existing = await prisma.routeSheet.findFirst({
    where: { journeyId, sheetDate: new Date(picked) },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: 'Маршрутний лист на цю дату вже існує' }, { status: 409 });
  }

  const sheet = await prisma.routeSheet.create({
    data: { journeyId, sheetDate: new Date(picked), createdById: guard.user.userId },
    select: { id: true, sheetDate: true, createdAt: true },
  });
  logger.audit('route_sheet.created', { sheetId: sheet.id, journeyId, sheetDate: picked, userId: guard.user.userId });
  return NextResponse.json(sheet, { status: 201 });
}

// DELETE /api/route-sheets?id=... — видалити лист (адреси повертаються в загальний список)
export async function DELETE(request: NextRequest) {
  const guard = await requireRole(LOGISTICS_ROLES);
  if (!guard.ok) return guard.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id || !isUuid(id)) return NextResponse.json({ error: 'id обовʼязковий' }, { status: 400 });

  const sheet = await prisma.routeSheet.findUnique({
    where: { id },
    select: { id: true, journeyId: true, sheetDate: true },
  });
  if (!sheet) return NextResponse.json({ error: 'Маршрутний лист не знайдено' }, { status: 404 });

  // Адреси цього листа НЕ видаляємо — повертаємо у загальний список (taskDate=null).
  const trips = await prisma.trip.findMany({ where: { journeyId: sheet.journeyId }, select: { id: true } });
  await prisma.routeTask.updateMany({
    where: { tripId: { in: trips.map((t) => t.id) }, taskDate: sheet.sheetDate },
    data: { taskDate: null },
  });
  await prisma.routeSheet.delete({ where: { id } });

  logger.audit('route_sheet.deleted', { sheetId: id, journeyId: sheet.journeyId, userId: guard.user.userId });
  return NextResponse.json({ success: true });
}
