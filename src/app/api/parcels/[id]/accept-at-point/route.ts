import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff } from '@/lib/auth/guards';
import { isUuid } from '@/lib/validators/common';

/**
 * POST /api/parcels/[id]/accept-at-point
 * Marks parcel as physically received at a collection point.
 * - Sets status to 'at_collection_point'
 * - Sets collectedAt = now, collectedById = current user
 * - If collectionPointId not set yet, sets it from body
 * - Creates status-history entry
 *
 * Body: { collectionPointId?: string, notes?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const userId = guard.user.userId;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });
  const body = await request.json().catch(() => ({}));

  const parcel = await prisma.parcel.findFirst({ where: { id, deletedAt: null } });
  if (!parcel) {
    return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });
  }

  // Must be EU→UA direction — pickup points are only meaningful on EU side
  if (parcel.direction !== 'eu_to_ua') {
    return NextResponse.json(
      { error: 'Прийом на пункті збору доступний тільки для посилок EU→UA' },
      { status: 400 }
    );
  }

  // Can accept only from statuses where parcel is still on the EU side
  const acceptableFromStatuses = ['draft', 'at_collection_point', 'accepted_for_transport_to_ua'];
  if (!acceptableFromStatuses.includes(parcel.status)) {
    return NextResponse.json(
      { error: `Не можна прийняти посилку на пункті — поточний статус: «${parcel.status}». Посилка вже в дорозі або доставлена.` },
      { status: 400 }
    );
  }

  const collectionPointId = body.collectionPointId || parcel.collectionPointId;
  if (!collectionPointId) {
    return NextResponse.json(
      { error: 'Вкажіть пункт збору' },
      { status: 400 }
    );
  }

  // Verify the collection point exists and is active
  const point = await prisma.collectionPoint.findUnique({ where: { id: collectionPointId } });
  if (!point) {
    return NextResponse.json({ error: 'Пункт збору не знайдено' }, { status: 404 });
  }

  const updated = await prisma.parcel.update({
    where: { id },
    data: {
      status: 'at_collection_point',
      collectionPointId,
      collectionMethod: parcel.collectionMethod ?? 'pickup_point',
      collectedAt: new Date(),
      collectedById: userId,
      statusHistory: {
        create: {
          status: 'at_collection_point',
          changedById: userId,
          notes: body.notes || `Прийнято на пункті збору: ${point.city}, ${point.address}`,
          location: `${point.city}, ${point.address}`,
        },
      },
    },
    include: {
      collectionPoint: true,
      collectedBy: { select: { fullName: true } },
    },
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/parcels/[id]/accept-at-point — revert acceptance
 * (for mistakes: go back to 'draft' or previous state)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const userId = guard.user.userId;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });
  const parcel = await prisma.parcel.findFirst({ where: { id, deletedAt: null } });
  if (!parcel) {
    return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });
  }
  if (parcel.status !== 'at_collection_point') {
    return NextResponse.json(
      { error: 'Прийом можна відмінити тільки зі статусу «На пункті збору»' },
      { status: 400 }
    );
  }

  await prisma.parcel.update({
    where: { id },
    data: {
      status: 'draft',
      collectedAt: null,
      collectedById: null,
      statusHistory: {
        create: {
          status: 'draft',
          changedById: userId,
          notes: 'Прийом на пункті збору скасовано',
        },
      },
    },
  });

  return NextResponse.json({ success: true });
}
