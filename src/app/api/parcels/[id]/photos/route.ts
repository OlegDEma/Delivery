import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaff } from '@/lib/auth/guards';
import { isUuid } from '@/lib/validators/common';
import { uploadParcelPhoto, ParcelPhotoError } from '@/lib/services/parcel-photos';

// POST /api/parcels/[id]/photos — upload photo (Працівник). Клієнт — /api/client-portal/orders/[id]/photos.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });

  const parcel = await prisma.parcel.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!parcel) return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Файл не знайдено' }, { status: 400 });

  try {
    return NextResponse.json(await uploadParcelPhoto(prisma, id, file));
  } catch (err) {
    if (err instanceof ParcelPhotoError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Не вдалося завантажити фото' }, { status: 500 });
  }
}
