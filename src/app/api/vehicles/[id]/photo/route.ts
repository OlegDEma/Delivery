import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth/guards';
import { ADMIN_ROLES } from '@/lib/constants/roles';
import { isUuid } from '@/lib/validators/common';

// POST /api/vehicles/[id]/photo — завантажити фото техпаспорта (ТЗ docx 08.08.26).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(ADMIN_ROLES);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });

  const formData = await request.formData();
  const file = formData.get('file') as File;
  if (!file) return NextResponse.json({ error: 'Файл не знайдено' }, { status: 400 });

  const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: 'Дозволені тільки зображення (JPEG/PNG/WebP/HEIC)' }, { status: 400 });
  }
  const MAX_SIZE = 15 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: `Файл завеликий (макс ${MAX_SIZE / 1024 / 1024} MB)` }, { status: 400 });
  }

  const serviceClient = await createServiceClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const fileName = `vehicles/${id}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await serviceClient.storage
    .from('photos')
    .upload(fileName, file, { contentType: file.type });

  if (uploadError) {
    if (uploadError.message.includes('not found') || uploadError.message.includes('Bucket')) {
      await serviceClient.storage.createBucket('photos', { public: true });
      const { error: retryError } = await serviceClient.storage
        .from('photos')
        .upload(fileName, file, { contentType: file.type });
      if (retryError) return NextResponse.json({ error: retryError.message }, { status: 500 });
    } else {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }
  }

  const { data: urlData } = serviceClient.storage.from('photos').getPublicUrl(fileName);
  const photoUrl = urlData.publicUrl;

  await prisma.vehicle.update({ where: { id }, data: { techPassportPhoto: photoUrl } });
  return NextResponse.json({ url: photoUrl });
}
