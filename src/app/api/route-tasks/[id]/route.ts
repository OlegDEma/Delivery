import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth/guards';
import { LOGISTICS_ROLES } from '@/lib/constants/roles';

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

  const task = await prisma.routeTask.findUnique({ where: { id }, select: { id: true, parcelId: true } });
  if (!task) return NextResponse.json({ error: 'Задачу не знайдено' }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  let moved = false;
  if (body.taskDate !== undefined) {
    const newDate = body.taskDate ? new Date(body.taskDate) : null;
    if (newDate && Number.isNaN(newDate.getTime())) {
      return NextResponse.json({ error: 'Невалідна дата' }, { status: 400 });
    }
    data.taskDate = newDate;
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
  return NextResponse.json({ success: true });
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
