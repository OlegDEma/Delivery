import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, requireStaff } from '@/lib/auth/guards';
import { ADMIN_ROLES } from '@/lib/constants/roles';
import type { Weekday } from '@/generated/prisma/enums';
import type { Prisma } from '@/generated/prisma/client';

// GET /api/collection-points/[id] — point details with parcels waiting
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const point = await prisma.collectionPoint.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          parcels: {
            where: { deletedAt: null, status: 'at_collection_point' },
          },
        },
      },
    },
  });

  if (!point) {
    return NextResponse.json({ error: 'Пункт не знайдено' }, { status: 404 });
  }

  return NextResponse.json(point);
}

// PATCH /api/collection-points/[id] — update (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(ADMIN_ROLES);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await request.json();

  const data: Prisma.CollectionPointUpdateInput = {};
  if (body.name !== undefined) data.name = body.name || null;
  if (body.country !== undefined) data.country = body.country;
  if (body.city !== undefined) data.city = body.city;
  if (body.address !== undefined) data.address = body.address;
  if (body.postalCode !== undefined) data.postalCode = body.postalCode || null;
  if (body.contactPhone !== undefined) data.contactPhone = body.contactPhone || null;
  if (body.workingHours !== undefined) data.workingHours = body.workingHours || null;
  if (body.workingDays !== undefined) data.workingDays = (body.workingDays || []) as Weekday[];
  if (body.latitude !== undefined) {
    data.latitude = body.latitude != null && body.latitude !== '' ? Number(body.latitude) : null;
  }
  if (body.longitude !== undefined) {
    data.longitude = body.longitude != null && body.longitude !== '' ? Number(body.longitude) : null;
  }
  if (body.notes !== undefined) data.notes = body.notes || null;
  if (body.maxCapacity !== undefined) data.maxCapacity = body.maxCapacity ? Number(body.maxCapacity) : null;
  if (body.isActive !== undefined) data.isActive = !!body.isActive;

  const updated = await prisma.collectionPoint.update({ where: { id }, data });
  return NextResponse.json(updated);
}

// DELETE /api/collection-points/[id] — soft delete via isActive=false (admin only)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(ADMIN_ROLES);
  if (!guard.ok) return guard.response;

  const { id } = await params;

  // If the point has parcels associated, just deactivate. If it doesn't, hard delete.
  const count = await prisma.parcel.count({ where: { collectionPointId: id } });
  if (count > 0) {
    await prisma.collectionPoint.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ success: true, deactivated: true });
  }
  await prisma.collectionPoint.delete({ where: { id } });
  return NextResponse.json({ success: true, deleted: true });
}
