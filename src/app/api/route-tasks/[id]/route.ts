import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth/guards';
import { LOGISTICS_ROLES, ROLES } from "@/lib/constants/roles";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

const VALID_TASK_STATUS = ['pending', 'address_confirmed', 'in_navigator', 'completed', 'not_completed', 'rescheduled'];

// PATCH /api/route-tasks/[id] — оновити задачу маршруту.
// ТЗ docx 08.08.26 (v12):
//  • taskDate — «Перенести»: адреса переміщується у Маршрутний лист обраної дати
//    (лист = група задач за taskDate);
//  • status/failureReason — операційне вікно для РУЧНИХ адрес (у посилок статус
//    зберігається на самій посилці, у ручних — на RouteTask).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(LOGISTICS_ROLES);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Очікується JSON body' }, { status: 400 }); }

  const task = await prisma.routeTask.findUnique({
    where: { id },
    select: { id: true, parcelId: true, tripId: true, routeSheetId: true, routeSheet: { select: { createdById: true } } },
  });
  if (!task) return NextResponse.json({ error: "Задачу не знайдено" }, { status: 404 });

  // ТЗ docx 02.09.26: адресу, що лежить у ЧУЖОМУ Маршрутному листі, чіпати не можна.
  const isSuper = guard.user.role === ROLES.SUPER_ADMIN;
  if (task.routeSheet && !isSuper && task.routeSheet.createdById !== guard.user.userId) {
    return NextResponse.json({ error: "Ця адреса у Маршрутному листі іншого водія" }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  let moved = false;
  if (body.taskDate !== undefined) {
    const newDate = body.taskDate ? new Date(body.taskDate) : null;
    if (newDate && Number.isNaN(newDate.getTime())) {
      return NextResponse.json({ error: "Невалідна дата" }, { status: 400 });
    }
    data.taskDate = newDate;
    // ТЗ docx 02.09.26: «Перенести» кладе адресу у МІЙ лист на обрану дату.
    // Порожня дата = повернення у загальний список (лист відвʼязуємо).
    if (!newDate) {
      data.routeSheetId = null;
    } else {
      const trip = await prisma.trip.findUnique({ where: { id: task.tripId }, select: { journeyId: true } });
      // Trip.journeyId необовʼязковий — старі рейси можуть бути без поїздки.
      const target = trip?.journeyId
        ? await prisma.routeSheet.findFirst({
            where: {
              journeyId: trip.journeyId,
              sheetDate: newDate,
              ...(isSuper ? {} : { createdById: guard.user.userId }),
            },
            orderBy: { createdAt: "asc" },
            select: { id: true },
          })
        : null;
      // ТЗ docx 30.08.26 (п.2): якщо Маршрутного листа на цю дату немає — адреса
      // НЕ блокується, а повертається у ЗАГАЛЬНИЙ список поїздки (дата лишається
      // як позначка, коли її планують відвідати). Помилку показуємо лише тоді, коли
      // дата взагалі не попадає в жодну поїздку — це перевіряє клієнтська частина.
      data.routeSheetId = target ? target.id : null;
      if (!target) data.taskDate = null;
    }
    moved = true;
  }
  if (body.status !== undefined) {
    if (!VALID_TASK_STATUS.includes(body.status)) {
      return NextResponse.json({ error: 'Невалідний статус' }, { status: 400 });
    }
    data.status = body.status;
  }
  if (body.failureReason !== undefined) {
    data.failureReason = body.failureReason ? String(body.failureReason) : null;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Немає що оновлювати' }, { status: 400 });
  }

  await prisma.routeTask.update({ where: { id }, data });
  // Після переміщення у новий лист — операційний статус посилки скидаємо на «Очікує»
  // (свіжий запис на нову дату), щоб не тягнути «Перенесено» у цільовий лист.
  if (moved && task.parcelId) {
    await prisma.parcel
      .update({ where: { id: task.parcelId }, data: { routeTaskStatus: 'pending', routeTaskReschedDate: null } })
      .catch(() => {});
  }
  // Кажемо клієнту, чи адреса лягла в лист, чи повернулась у загальний список.
  const movedToGeneral = moved && !!body.taskDate && data.routeSheetId === null;
  return NextResponse.json({ success: true, movedToGeneral });
}

// DELETE /api/route-tasks/[id] — прибрати посилку з Маршрутного листа (ТЗ docx 08.08.26).
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(LOGISTICS_ROLES);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });
  const exists = await prisma.routeTask.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: 'Задачу не знайдено' }, { status: 404 });
  await prisma.routeTask.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
