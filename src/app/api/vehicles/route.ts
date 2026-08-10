import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, requireStaff } from '@/lib/auth/guards';
import { ADMIN_ROLES } from '@/lib/constants/roles';
import { mapVehicleBody } from '@/lib/vehicles/map';

// GET /api/vehicles — список ТЗ. Доступний усім staff (для дропдауну у формах поїздок).
export async function GET() {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const vehicles = await prisma.vehicle.findMany({
    orderBy: [{ isActive: 'desc' }, { brand: 'asc' }, { model: 'asc' }],
  });
  return NextResponse.json(vehicles);
}

// POST /api/vehicles — створення (лише адміністрування).
export async function POST(request: NextRequest) {
  const guard = await requireRole(ADMIN_ROLES);
  if (!guard.ok) return guard.response;
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Очікується JSON body' }, { status: 400 }); }

  const data = mapVehicleBody(body);
  if (!data.brand || !data.model || !data.regNumber) {
    return NextResponse.json({ error: 'Марка, модель і реєстраційний номер обовʼязкові' }, { status: 400 });
  }
  const vehicle = await prisma.vehicle.create({ data });
  return NextResponse.json(vehicle, { status: 201 });
}
