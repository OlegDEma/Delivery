/**
 * ТЗ docx 09.10.26 (п.3): «При спробі розпізнати номер ТТН з допомогою камери телефону
 * успіху немає. Видає помилку. Треба вдосконалити процес розпізнавання номера ТТН
 * і/або штрихкоду».
 *
 * Чому раніше не читалось: html5-qrcode викликає ZXing з вимкненим TRY_HARDER і на
 * фото 12 Мп шукає тонкий лінійний код у повному розмірі, без поворотів. Тут:
 *  1) спершу — вбудований у браузер BarcodeDetector (Chrome/Android, Safari 17+):
 *     він найкраще читає Code 128 з камери;
 *  2) інакше — ZXing з TRY_HARDER на кількох масштабах (лінійний код на великому
 *     фото «розмазаний» — зменшення допомагає), з поворотом на 90° (накладну могли
 *     сфотографувати боком) і двома бінаризаторами (рівне/нерівне освітлення).
 */

const TTN_RE = /\d{14}/;

/** З розпізнаного тексту — 14 цифр номера ТТН Нової пошти (або null). */
export function extractNpTtn(text: string): string | null {
  return text.replace(/\s/g, '').match(TTN_RE)?.[0] ?? null;
}

type DetectorLike = { detect: (src: CanvasImageSource | ImageBitmap) => Promise<{ rawValue: string }[]> };

let nativeDetector: DetectorLike | null | undefined;
async function getNativeDetector(): Promise<DetectorLike | null> {
  if (nativeDetector !== undefined) return nativeDetector;
  nativeDetector = null;
  const BD = (globalThis as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): DetectorLike; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (!BD) return null;
  try {
    const wanted = ['code_128', 'itf', 'code_39', 'ean_13', 'qr_code'];
    const supported = BD.getSupportedFormats ? await BD.getSupportedFormats() : wanted;
    const formats = wanted.filter((f) => supported.includes(f));
    if (formats.length) nativeDetector = new BD({ formats });
  } catch { /* браузер без підтримки */ }
  return nativeDetector;
}

/** Нативний детектор: усі знайдені коди → перший, що містить ТТН. */
export async function detectNative(src: CanvasImageSource | ImageBitmap): Promise<string | null> {
  const d = await getNativeDetector();
  if (!d) return null;
  try {
    const res = await d.detect(src);
    for (const r of res) if (extractNpTtn(r.rawValue)) return r.rawValue;
    return res[0]?.rawValue ?? null;
  } catch {
    return null;
  }
}

type ZX = typeof import('@zxing/library');
let zxPromise: Promise<ZX> | null = null;
function loadZx(): Promise<ZX> {
  zxPromise ??= import('@zxing/library');
  return zxPromise;
}

/** Канвас (будь-якого розміру) → ZXing TRY_HARDER; null — не знайдено. */
export async function decodeCanvasZx(canvas: HTMLCanvasElement): Promise<string | null> {
  const zx = await loadZx();
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const { width: w, height: h } = canvas;
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const lum = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < lum.length; i++, j += 4) {
    lum[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000;
  }
  const hints = new Map();
  hints.set(zx.DecodeHintType.TRY_HARDER, true);
  hints.set(zx.DecodeHintType.POSSIBLE_FORMATS, [
    zx.BarcodeFormat.CODE_128, zx.BarcodeFormat.ITF, zx.BarcodeFormat.CODE_39,
    zx.BarcodeFormat.EAN_13, zx.BarcodeFormat.QR_CODE,
  ]);
  const reader = new zx.MultiFormatReader();
  reader.setHints(hints);
  const source = new zx.RGBLuminanceSource(lum, w, h);
  for (const Bin of [zx.HybridBinarizer, zx.GlobalHistogramBinarizer]) {
    try {
      return reader.decode(new zx.BinaryBitmap(new Bin(source))).getText();
    } catch { /* NotFound — пробуємо далі */ }
  }
  return null;
}

/** Намалювати джерело в канвас заданої ширини; rotate: 0 | 90 (за год. стрілкою) | -90. */
function drawScaled(src: CanvasImageSource, srcW: number, srcH: number, targetW: number, rotate: 0 | 90 | -90): HTMLCanvasElement {
  const scale = Math.min(1, targetW / srcW);
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const c = document.createElement('canvas');
  c.width = rotate ? h : w;
  c.height = rotate ? w : h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  if (rotate === 90) {
    ctx.translate(c.width, 0);
    ctx.rotate(Math.PI / 2);
  } else if (rotate === -90) {
    ctx.translate(0, c.height);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(src, 0, 0, w, h);
  return c;
}

/** Повний прохід по фото: нативно → ZXing (масштаби × повороти). */
export async function decodeImageFile(file: Blob): Promise<string | null> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
    .catch(() => createImageBitmap(file));
  try {
    const native = await detectNative(bmp);
    if (native) return native;
    for (const rotate of [0, 90, -90] as const) {
      for (const width of [1600, 1000, 2400, 700]) {
        const canvas = drawScaled(bmp, bmp.width, bmp.height, width, rotate);
        const text = await decodeCanvasZx(canvas);
        if (text) return text;
      }
    }
    return null;
  } finally {
    bmp.close?.();
  }
}

/** Один кадр відео: центральна смуга кадру (там рамка прицілу), ± поворот. */
export async function decodeVideoFrame(video: HTMLVideoElement, rotate: boolean): Promise<string | null> {
  const turn = rotate ? 90 : 0;
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return null;
  const native = await detectNative(video);
  if (native) return native;
  // Центральні 90% ширини × 60% висоти — менше шуму, швидше.
  const cw = Math.round(vw * 0.9), ch = Math.round(vh * 0.6);
  const crop = document.createElement('canvas');
  crop.width = cw;
  crop.height = ch;
  crop.getContext('2d')!.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, cw, ch);
  return decodeCanvasZx(drawScaled(crop, cw, ch, 1280, turn));
}
