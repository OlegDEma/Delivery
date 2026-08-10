import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, requireStaff } from '@/lib/auth/guards';
import { ADMIN_ROLES } from '@/lib/constants/roles';
import { mapVehicleBody } from '@/lib/vehicles/map';

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// GET /api/vehicles/[id]
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });
  const vehicle = await prisma.vehicle.findUnique({ where: { id } });
  if (!vehicle) return NextResponse.json({ error: 'Транспорт не знайдено' }, { status: 404 });
  return NextResponse.json(vehicle);
}

// PATCH /api/vehicles/[id] — редагування (лише адміністрування).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(ADMIN_ROLES);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Очікується JSON body' }, { status: 400 }); }

  const data = mapVehicleBody(body);
  if (!data.brand || !data.model || !data.regNumber) {
    return NextResponse.json({ error: 'Марка, модель і реєстраційний номер обовʼязкові' }, { status: 400 });
  }
  const exists = await prisma.vehicle.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: 'Транспорт не знайдено' }, { status: 404 });
  const vehicle = await prisma.vehicle.update({ where: { id }, data });
  return NextResponse.json(vehicle);
}

// DELETE /api/vehicles/[id] — видалення (лише адміністрування). FK ON DELETE SET NULL
// автоматично відвʼязує поїздки/рейси.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(ADMIN_ROLES);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });
  const exists = await prisma.vehicle.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: 'Транспорт не знайдено' }, { status: 404 });
  await prisma.vehicle.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
