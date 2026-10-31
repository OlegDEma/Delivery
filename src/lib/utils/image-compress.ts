/**
 * Стиснення фото в браузері перед завантаженням на сервер.
 *
 * Відповідь клієнту на ТЗ docx 26.10.26 («НЕ ВИКОНАНО» від 30.10.26 — «Додати фото»):
 * хостинг (Vercel) приймає запит до серверної функції лише до 4,5 МБ, а фото з камери
 * телефону зазвичай 3–10 МБ — на сайті таке фото відхилялось ще до нашого коду
 * («413 FUNCTION_PAYLOAD_TOO_LARGE»), хоча на локальному сервері все працювало.
 * Тому фото зменшуємо до розумного розміру (довша сторона ≤ maxSide, JPEG) ще в браузері.
 *
 * Якщо браузер не зміг розкодувати файл — віддаємо оригінал (сервер сам скаже, що не так).
 */

/** Запас до ліміту хостингу 4,5 МБ (multipart-обгортка теж займає місце). */
export const UPLOAD_MAX_BYTES = 3.5 * 1024 * 1024;

/** Менші за це фото не чіпаємо — і так пролізуть, і якість лишиться оригінальна. */
const SKIP_BELOW_BYTES = 1024 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}

function toJpeg(img: HTMLImageElement, maxSide: number, quality: number): Promise<Blob | null> {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  // Прозорі PNG — на білому тлі, інакше в JPEG прозоре стає чорним.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Сучасні браузери малюють <img> уже з урахуванням EXIF-орієнтації — фото не «лягає набік».
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
}

export async function compressImageForUpload(
  file: File,
  opts: { maxSide?: number } = {},
): Promise<File> {
  const isHeic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
  if (!file.type.startsWith('image/') && !isHeic) return file;
  if (file.size <= SKIP_BELOW_BYTES && !isHeic) return file;

  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    return file;
  }

  const maxSide = opts.maxSide ?? 2000;
  // Спершу — якісніше; якщо все ще завелике — зменшуємо, доки не вліземо в ліміт.
  const attempts: [number, number][] = [[maxSide, 0.85], [maxSide, 0.7], [Math.round(maxSide * 0.75), 0.7], [1200, 0.6]];
  for (const [side, quality] of attempts) {
    const blob = await toJpeg(img, side, quality);
    if (blob && blob.size <= UPLOAD_MAX_BYTES) {
      const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
      return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
    }
  }
  return file;
}

/** Людський текст, якщо хостинг усе ж відхилив завеликий файл. */
export const PHOTO_TOO_LARGE_MESSAGE = 'Фото завелике. Спробуйте ще раз або зробіть фото з меншою роздільною здатністю.';
