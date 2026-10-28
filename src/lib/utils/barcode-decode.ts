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

/**
 * Намалювати джерело в канвас заданої ширини; rotate: 0 | 90 (за год. стрілкою) | -90.
 * maxScale > 1 — дозволити збільшення (для OCR малих фото).
 */
function drawScaled(src: CanvasImageSource, srcW: number, srcH: number, targetW: number, rotate: 0 | 90 | -90, maxScale = 1): HTMLCanvasElement {
  const scale = Math.min(maxScale, targetW / srcW);
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const c = document.createElement('canvas');
  c.width = rotate ? h : w;
  c.height = rotate ? w : h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
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

/**
 * ТЗ docx 26.10.26: «Було б дуже добре мати можливість фотографувати номер ТТН з подальшим
 * його розпізнаванням… При фотографуванні ТТН останній повинен бути розпізнаний і
 * відображатися в цифровому форматі, а не у графічному».
 *
 * З тексту, розпізнаного на фото, — номер ТТН: 14 цифр, які на накладній друкують групами
 * («20 4512 3456 7890»). Беремо послідовні групи цифр одного рядка, що разом дають рівно
 * 14 цифр (так відсікаються сусідні числа, які OCR «приклеїв» до номера); номери НП
 * починаються з 20 або 59 — такі в пріоритеті.
 */
export function extractTtnFromText(text: string): string | null {
  const found: string[] = [];
  for (const line of text.split('\n')) {
    for (const run of line.match(/\d+(?:[ \-–]\d+)*/g) ?? []) {
      const groups = run.split(/[ \-–]/);
      for (let i = 0; i < groups.length; i++) {
        let digits = '';
        for (let j = i; j < groups.length && digits.length < 14; j++) {
          digits += groups[j];
          if (digits.length === 14) found.push(digits);
        }
      }
    }
  }
  return found.find((d) => /^(20|59)/.test(d)) ?? found[0] ?? null;
}

type Tess = typeof import('tesseract.js');
let tessPromise: Promise<Tess> | null = null;

/** Фото для OCR: довша сторона ~2000 px (цифри накладної — 20–40 px заввишки), відтінки сірого. */
function drawForOcr(src: ImageBitmap, rotate: 0 | 90 | -90): HTMLCanvasElement {
  const k = 2000 / Math.max(src.width, src.height);
  return toGray(drawScaled(src, src.width, src.height, Math.round(src.width * k), rotate, 2));
}

function toGray(c: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    d[i] = d[i + 1] = d[i + 2] = y;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Розпізнати надрукований номер ТТН на фото (OCR, tesseract.js). Модель і рушій
 * завантажуються з CDN лише при першому використанні, далі — з кешу браузера.
 * Порядок спроб: як є → розріджений текст → фото боком (±90°).
 */
export async function recognizeTtnDigits(src: ImageBitmap): Promise<string | null> {
  const T = await (tessPromise ??= import('tesseract.js'));
  const worker = await T.createWorker('eng', T.OEM.LSTM_ONLY);
  try {
    const attempts: { rotate: 0 | 90 | -90; psm: string }[] = [
      { rotate: 0, psm: T.PSM.AUTO },
      { rotate: 0, psm: T.PSM.SPARSE_TEXT },
      { rotate: 90, psm: T.PSM.AUTO },
      { rotate: -90, psm: T.PSM.AUTO },
    ];
    for (const a of attempts) {
      await worker.setParameters({ tessedit_pageseg_mode: a.psm as never });
      const { data } = await worker.recognize(drawForOcr(src, a.rotate));
      const ttn = extractTtnFromText(data.text);
      if (ttn) return ttn;
    }
    return null;
  } finally {
    await worker.terminate().catch(() => {});
  }
}

/**
 * Повний прохід по фото: штрихкод (нативно → ZXing, масштаби × повороти), а якщо його
 * не видно чи не читається — надрукований номер ТТН цифрами (OCR, ТЗ docx 26.10.26).
 * onStage — щоб показати Клієнту, що зараз триває довше розпізнавання цифр.
 */
export async function decodeImageFile(file: Blob, onStage?: (stage: 'barcode' | 'ocr') => void): Promise<string | null> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
    .catch(() => createImageBitmap(file));
  try {
    onStage?.('barcode');
    const native = await detectNative(bmp);
    if (native && extractNpTtn(native)) return native;
    for (const rotate of [0, 90, -90] as const) {
      for (const width of [1600, 1000, 2400, 700]) {
        const canvas = drawScaled(bmp, bmp.width, bmp.height, width, rotate);
        const text = await decodeCanvasZx(canvas);
        if (text && extractNpTtn(text)) return text;
      }
    }
    onStage?.('ocr');
    return await recognizeTtnDigits(bmp);
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
