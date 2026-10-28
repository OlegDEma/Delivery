import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { findOwnOpenOrder } from '@/lib/client-portal/own-order';
import { uploadParcelPhoto, ParcelPhotoError } from '@/lib/services/parcel-photos';

/**
 * POST /api/client-portal/orders/[id]/photos — фото посилки від Клієнта.
 *
 * ТЗ docx 26.10.26 (п.1): «Можливість додати фото посилки та створити нотатку має бути
 * у будь-кого, хто створює посилку. Реалізація стандартна» — те саме сховище й той самий
 * перелік фото посилки, що й у Працівника («Додати фото»).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const own = await findOwnOpenOrder(id);
  if (!own.ok) return own.response;

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Файл не знайдено' }, { status: 400 });

  try {
    const { photos } = await uploadParcelPhoto(prisma, id, file);
    return NextResponse.json({ photos });
  } catch (err) {
    if (err instanceof ParcelPhotoError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: 'Не вдалося завантажити фото. Спробуйте ще раз.' }, { status: 500 });
  }
}
