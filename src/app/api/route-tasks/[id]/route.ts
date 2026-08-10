import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth/guards';
import { LOGISTICS_ROLES } from '@/lib/constants/roles';

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
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
