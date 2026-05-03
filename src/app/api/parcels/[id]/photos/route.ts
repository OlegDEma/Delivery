import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validators/common';

// POST /api/parcels/[id]/photos — upload photo
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });

  const formData = await request.formData();
  const file = formData.get('file') as File;
  if (!file) return NextResponse.json({ error: 'Файл не знайдено' }, { status: 400 });

  // Validate MIME — photos only. Without this anyone could dump arbitrary
  // files into our public storage bucket.
  const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: 'Дозволені тільки зображення (JPEG/PNG/WebP/HEIC)' }, { status: 400 });
  }
  // 15 MB cap — modern phone photos run 5–10 MB, headroom for HEIC.
  const MAX_SIZE = 15 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: `Файл завеликий (макс ${MAX_SIZE / 1024 / 1024} MB)` }, { status: 400 });
  }

  // Upload to Supabase Storage
  const serviceClient = await createServiceClient();
  // Sanitize filename — strip path separators + non-ascii, keep extension.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const fileName = `parcels/${id}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await serviceClient.storage
    .from('photos')
    .upload(fileName, file, { contentType: file.type });

  if (uploadError) {
    // If bucket doesn't exist, create it
    if (uploadError.message.includes('not found') || uploadError.message.includes('Bucket')) {
      await serviceClient.storage.createBucket('photos', { public: true });
      // Retry upload
      const { error: retryError } = await serviceClient.storage
        .from('photos')
        .upload(fileName, file, { contentType: file.type });
      if (retryError) {
        return NextResponse.json({ error: retryError.message }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }
  }

  // Get public URL
  const { data: urlData } = serviceClient.storage.from('photos').getPublicUrl(fileName);
  const photoUrl = urlData.publicUrl;

  // Add to parcel photos array
  const parcel = await prisma.parcel.findUnique({ where: { id }, select: { photos: true } });
  const photos = [...(parcel?.photos || []), photoUrl];

  await prisma.parcel.update({
    where: { id },
    data: { photos },
  });

  return NextResponse.json({ url: photoUrl, photos });
}
