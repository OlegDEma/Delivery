/**
 * Фото посилки («Додати фото»): завантаження у Storage і автоматичне видалення.
 *
 * ТЗ docx 26.10.26 (Створення посилки, п.1): «Можливість додати фото посилки та створити
 * нотатку має бути у будь-кого, хто створює посилку… Після заміни статусу на „Доставлено“
 * фото посилки (лише саме фото) автоматично видаляється». Нотатки лишаються.
 *
 * Без '@/'-імпортів: модуль використовує і Telegram-бот (src/bot), що працює окремим процесом.
 */
import { createClient } from '@supabase/supabase-js';
import type { PrismaClient } from '../../generated/prisma/client';
import type { ParcelStatus } from '../../generated/prisma/enums';

const BUCKET = 'photos';
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
// Сучасні фото з телефона — 5–10 МБ, запас під HEIC.
const MAX_SIZE = 15 * 1024 * 1024;

/** Статуси «Доставлено», після яких фото посилки видаляються. */
export const PHOTO_PURGE_STATUSES: ParcelStatus[] = ['delivered_ua', 'delivered_eu'];

function storage() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).storage;
}

/** Storage-шлях із public URL (…/object/public/photos/<path>). */
function storagePath(url: string): string | null {
  const m = url.match(/\/object\/public\/photos\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Помилка перевірки файлу — текст для користувача. */
export class ParcelPhotoError extends Error {}

/** Завантажити фото посилки; повертає новий перелік фото. */
export async function uploadParcelPhoto(db: PrismaClient, parcelId: string, file: File): Promise<{ url: string; photos: string[] }> {
  // Лише зображення — без цього в публічний bucket можна було б класти будь-які файли.
  if (!ALLOWED_MIME.has(file.type)) throw new ParcelPhotoError('Дозволені тільки зображення (JPEG/PNG/WebP/HEIC)');
  if (file.size > MAX_SIZE) throw new ParcelPhotoError(`Файл завеликий (макс ${MAX_SIZE / 1024 / 1024} MB)`);

  const st = storage();
  // Ім'я файлу — без шляхів і не-ASCII, розширення лишаємо.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const fileName = `parcels/${parcelId}/${Date.now()}-${safeName}`;

  let { error } = await st.from(BUCKET).upload(fileName, file, { contentType: file.type });
  if (error && (error.message.includes('not found') || error.message.includes('Bucket'))) {
    // Bucket ще не створено (свіжий проєкт) — створюємо і повторюємо.
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    await sb.storage.createBucket(BUCKET, { public: true });
    ({ error } = await st.from(BUCKET).upload(fileName, file, { contentType: file.type }));
  }
  if (error) throw new Error(error.message);

  const url = st.from(BUCKET).getPublicUrl(fileName).data.publicUrl;
  const parcel = await db.parcel.findUnique({ where: { id: parcelId }, select: { photos: true } });
  const photos = [...(parcel?.photos ?? []), url];
  await db.parcel.update({ where: { id: parcelId }, data: { photos } });
  return { url, photos };
}

/**
 * Видалити фото посилок (файли в Storage + перелік у посилці) і записати це в журнал
 * операцій. Помилки не прокидаються: статус «Доставлено» вже збережено, і збій Storage
 * не має його відкотити — лише лог.
 */
export async function purgeParcelPhotos(db: PrismaClient, parcelIds: string[], actorId: string | null): Promise<void> {
  if (parcelIds.length === 0) return;
  try {
    const parcels = await db.parcel.findMany({
      where: { id: { in: parcelIds }, NOT: { photos: { isEmpty: true } } },
      select: { id: true, photos: true },
    });
    if (parcels.length === 0) return;
    const paths = parcels.flatMap((p) => p.photos.map(storagePath).filter((x): x is string => !!x));
    if (paths.length) {
      const { error } = await storage().from(BUCKET).remove(paths);
      if (error) console.error('[parcel-photos] storage remove failed', error.message);
    }
    for (const p of parcels) {
      await db.parcel.update({ where: { id: p.id }, data: { photos: [] } });
      await db.auditLog.create({
        data: {
          event: 'parcel.photos_deleted',
          actorId,
          subjectId: p.id,
          subjectType: 'parcel',
          payload: { причина: 'Статус «Доставлено» — фото посилки видалено автоматично', кількість: p.photos.length },
        },
      }).catch(() => {});
    }
  } catch (err) {
    console.error('[parcel-photos] purge failed', err);
  }
}
