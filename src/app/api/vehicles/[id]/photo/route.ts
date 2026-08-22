import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth/guards';
import { ADMIN_ROLES } from '@/lib/constants/roles';
import { isUuid } from '@/lib/validators/common';

// ТЗ docx 21.08.26: кілька документів-фото транспорту. Кожен слот → своя колонка.
const SLOT_TO_COLUMN = {
  techPassport: 'techPassportPhoto',
  techPassport2: 'techPassportPhoto2',
  greenCard: 'greenCardPhoto',
  oscpv: 'oscpvPhoto',
  techInspection: 'techInspectionPhoto',
} as const;
type Slot = keyof typeof SLOT_TO_COLUMN;

function resolveSlot(request: NextRequest): Slot {
  const raw = new URL(request.url).searchParams.get('slot');
  // Дефолт — техпаспорт стор.1 (беквфіл сумісності зі старим одно-фото ендпоінтом).
  return raw && raw in SLOT_TO_COLUMN ? (raw as Slot) : 'techPassport';
}

/** Витягуємо storage-шлях із public URL (…/object/public/photos/<path>). */
function storagePathFromUrl(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/\/photos\/(.+)$/);
  return m ? m[1] : null;
}

// POST /api/vehicles/[id]/photo?slot=<slot> — завантажити/замінити фото документа.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(ADMIN_ROLES);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });
  const slot = resolveSlot(request);
  const column = SLOT_TO_COLUMN[slot];

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
  const fileName = `vehicles/${id}/${slot}-${Date.now()}-${safeName}`;

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

  // Старе фото цього слота — прибираємо зі storage (заміна), щоб не накопичувати сміття.
  const prev = await prisma.vehicle.findUnique({ where: { id }, select: { [column]: true } as never });
  const prevPath = storagePathFromUrl((prev as Record<string, string | null> | null)?.[column] ?? null);
  if (prevPath && prevPath !== fileName) {
    await serviceClient.storage.from('photos').remove([prevPath]).catch(() => {});
  }

  const { data: urlData } = serviceClient.storage.from('photos').getPublicUrl(fileName);
  const photoUrl = urlData.publicUrl;

  await prisma.vehicle.update({ where: { id }, data: { [column]: photoUrl } });
  return NextResponse.json({ url: photoUrl, slot });
}

// DELETE /api/vehicles/[id]/photo?slot=<slot> — видалити фото документа.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(ADMIN_ROLES);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });
  const slot = resolveSlot(request);
  const column = SLOT_TO_COLUMN[slot];

  const current = await prisma.vehicle.findUnique({ where: { id }, select: { [column]: true } as never });
  if (!current) return NextResponse.json({ error: 'Транспорт не знайдено' }, { status: 404 });

  const path = storagePathFromUrl((current as Record<string, string | null>)[column] ?? null);
  if (path) {
    const serviceClient = await createServiceClient();
    await serviceClient.storage.from('photos').remove([path]).catch(() => {});
  }
  await prisma.vehicle.update({ where: { id }, data: { [column]: null } });
  return NextResponse.json({ success: true, slot });
}
