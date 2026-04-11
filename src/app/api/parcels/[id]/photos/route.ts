import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

// POST /api/parcels/[id]/photos — upload photo
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const formData = await request.formData();
  const file = formData.get('file') as File;
  if (!file) return NextResponse.json({ error: 'Файл не знайдено' }, { status: 400 });

  // Upload to Supabase Storage
  const serviceClient = await createServiceClient();
  const fileName = `parcels/${id}/${Date.now()}-${file.name}`;

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
