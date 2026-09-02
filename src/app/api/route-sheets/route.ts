import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth/guards';
import { LOGISTICS_ROLES, ROLES } from '@/lib/constants/roles';
import { isUuid } from '@/lib/validators/common';
import { logger } from '@/lib/logger';

/**
 * ТЗ docx 30.08.26: Маршрутний лист — самостійна сутність (поїздка + дата).
 * ТЗ docx 02.09.26: на одну дату може бути КІЛЬКА листів — по одному на водія.
 * Обидва водії бачать усі листи поїздки, але редагувати/видаляти може лише
 * автор свого листа (та суперадмін).
 */

/** Чи може користувач змінювати цей лист (ТЗ 02.09.26 — лише свій). */
function canMutateSheet(user: { userId: string; role: string }, sheetOwnerId: string | null) {
  return user.role === ROLES.SUPER_ADMIN || sheetOwnerId === user.userId;
}

// GET /api/route-sheets?journeyId=... — усі листи поїздки (обох водіїв)
export async function GET(request: NextRequest) {
  const guard = await requireRole(LOGISTICS_ROLES);
  if (!guard.ok) return guard.response;

  const journeyId = new URL(request.url).searchParams.get('journeyId');
  if (!journeyId || !isUuid(journeyId)) {
    return NextResponse.json({ error: 'journeyId обовʼязковий' }, { status: 400 });
  }

  const sheets = await prisma.routeSheet.findMany({
    where: { journeyId },
    orderBy: [{ sheetDate: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true, sheetDate: true, createdAt: true, createdById: true,
    },
  });

  // Імʼя автора листа — у шапці показуємо саме його (ТЗ 02.09.26), а не всіх водіїв.
  const ownerIds = [...new Set(sheets.map((s) => s.createdById).filter(Boolean))] as string[];
  const owners = ownerIds.length
    ? await prisma.profile.findMany({ where: { id: { in: ownerIds } }, select: { id: true, fullName: true } })
    : [];
  const nameById = new Map(owners.map((o) => [o.id, o.fullName]));

  return NextResponse.json(
    sheets.map((s) => ({
      ...s,
      ownerName: s.createdById ? nameById.get(s.createdById) ?? null : null,
      isMine: s.createdById === guard.user.userId,
      canMutate: canMutateSheet(guard.user, s.createdById),
    })),
  );
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

  // ТЗ docx 02.09.26: дубль забороняємо лише в межах ОДНОГО автора — інший водій
  // має право створити свій лист на ту саму дату.
  const existing = await prisma.routeSheet.findFirst({
    where: { journeyId, sheetDate: new Date(picked), createdById: guard.user.userId },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: 'У вас уже є Маршрутний лист на цю дату' }, { status: 409 });
  }

  const sheet = await prisma.routeSheet.create({
    data: { journeyId, sheetDate: new Date(picked), createdById: guard.user.userId },
    select: { id: true, sheetDate: true, createdAt: true, createdById: true },
  });
  logger.audit('route_sheet.created', { sheetId: sheet.id, journeyId, sheetDate: picked, userId: guard.user.userId });
  return NextResponse.json(sheet, { status: 201 });
}

// DELETE /api/route-sheets?id=... — видалити СВІЙ лист (адреси → загальний список)
export async function DELETE(request: NextRequest) {
  const guard = await requireRole(LOGISTICS_ROLES);
  if (!guard.ok) return guard.response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id || !isUuid(id)) return NextResponse.json({ error: 'id обовʼязковий' }, { status: 400 });

  const sheet = await prisma.routeSheet.findUnique({
    where: { id },
    select: { id: true, journeyId: true, sheetDate: true, createdById: true },
  });
  if (!sheet) return NextResponse.json({ error: 'Маршрутний лист не знайдено' }, { status: 404 });

  // ТЗ docx 02.09.26: чужий лист чіпати не можна.
  if (!canMutateSheet(guard.user, sheet.createdById)) {
    return NextResponse.json({ error: 'Це Маршрутний лист іншого водія' }, { status: 403 });
  }

  // Адреси цього листа НЕ видаляємо — повертаємо у загальний список.
  await prisma.routeTask.updateMany({
    where: { routeSheetId: sheet.id },
    data: { taskDate: null, routeSheetId: null },
  });
  await prisma.routeSheet.delete({ where: { id } });

  logger.audit('route_sheet.deleted', { sheetId: id, journeyId: sheet.journeyId, userId: guard.user.userId });
  return NextResponse.json({ success: true });
}
