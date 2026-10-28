'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, X } from 'lucide-react';
import { extractNpTtn, decodeImageFile, decodeVideoFrame } from '@/lib/utils/barcode-decode';

export { extractNpTtn };

/**
 * ТЗ docx 08.10.26 (Створення посилки Працівником, Україна→Європа): номер ТТН з
 * паперової декларації НП вводиться без ручного набору — камерою телефону.
 *
 * ТЗ docx 09.10.26 (п.3): «успіху немає, видає помилку» — розпізнавання переписано
 * (lib/utils/barcode-decode): камера у високій роздільності (лінійний код має тонкі
 * смуги), вбудований у браузер BarcodeDetector, ZXing з TRY_HARDER, повороти й
 * кілька масштабів для фото. Запасний варіант — «Фото накладної» (знімок або файл).
 *
 * ТЗ docx 26.10.26: «фотографувати номер ТТН з подальшим його розпізнаванням… повинен бути
 * розпізнаний і відображатися в цифровому форматі». На фото (знімок телефоном, файл або
 * кадр з камери) спершу шукаємо штрихкод, а якщо його немає чи він не читається —
 * розпізнаємо надруковані цифри номера (OCR). Результат — 14 цифр у віконці ТТН.
 */
export function BarcodeScanButton({ onResult, label = 'Сканувати ТТН' }: { onResult: (ttn: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  // ТЗ docx 26.10.26: розпізнавання цифр (OCR) триває довше за штрихкод — показуємо етап.
  const [stage, setStage] = useState<'barcode' | 'ocr'>('barcode');
  const videoRef = useRef<HTMLVideoElement | null>(null);

  function accept(text: string): boolean {
    const ttn = extractNpTtn(text);
    if (!ttn) {
      setError(`Розпізнано «${text.slice(0, 40)}», але це не номер ТТН (14 цифр). Спробуйте ще раз.`);
      return false;
    }
    onResult(ttn);
    setOpen(false);
    return true;
  }

  // Живе сканування: власний потік камери + цикл розпізнавання кадрів.
  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let frame = 0;

    async function loop() {
      if (stopped) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        // Чергуємо звичайний і повернутий на 90° кадр — накладну могли тримати боком.
        const text = await decodeVideoFrame(video, frame % 3 === 2).catch(() => null);
        frame++;
        if (stopped) return;
        if (text && extractNpTtn(text)) { accept(text); return; }
        if (text) setHint(`Бачу код «${text.slice(0, 30)}», але це не ТТН — наведіть на штрихкод з номером накладної.`);
      }
      timer = setTimeout(loop, 250);
    }

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no-media');
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        // Безперервний автофокус, якщо камера вміє (Android Chrome).
        const track = stream.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as { focusMode?: string[] };
        if (caps.focusMode?.includes('continuous')) {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {});
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        loop();
      } catch {
        if (!stopped) setError('Не вдалось відкрити камеру. Дозвольте доступ до камери в браузері або скористайтесь «Сфотографувати номер ТТН».');
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onPhoto(file: Blob | null | undefined) {
    if (!file) return;
    setError('');
    setHint('');
    setBusy(true);
    try {
      const decoded = await decodeImageFile(file, setStage);
      if (decoded) accept(decoded);
      else setError('На фото не вдалось розпізнати номер ТТН. Сфотографуйте номер накладної (14 цифр) або її штрихкод ближче — рівно, без відблисків — або введіть номер вручну.');
    } catch {
      setError('Не вдалось обробити фото. Перевірте інтернет і спробуйте ще раз або введіть номер вручну.');
    } finally {
      setBusy(false);
    }
  }

  // Кадр з живої камери → той самий розбір, що й для фото (штрихкод, потім цифри).
  function captureFrame() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext('2d')!.drawImage(video, 0, 0);
    c.toBlob((b) => onPhoto(b), 'image/jpeg', 0.95);
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => { setError(''); setHint(''); setOpen(true); }}>
        <Camera className="w-4 h-4 mr-1" /> {label}
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-label="Сканування ТТН">
          <div className="bg-white rounded-lg p-3 w-full max-w-md space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-medium text-sm">Наведіть камеру на штрихкод або номер накладної Нової пошти</div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Закрити" className="p-1 text-gray-500 hover:text-gray-800">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="relative w-full bg-black rounded overflow-hidden" style={{ aspectRatio: '4 / 3' }}>
              <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted autoPlay />
              {/* Приціл: штрихкод має бути всередині смуги. */}
              <div className="absolute left-[5%] right-[5%] top-[20%] bottom-[20%] border-2 border-white/80 rounded pointer-events-none" />
            </div>
            <p className="text-xs text-gray-500">
              Штрихкод зчитується сам — тримайте його горизонтально в рамці, 15–20 см від камери.
              Номер (14 цифр) — натисніть «Зняти кадр» або «Сфотографувати номер ТТН».
            </p>
            {busy && (
              <p className="text-xs text-blue-700">
                {stage === 'ocr' ? 'Розпізнаю цифри номера… (уперше — до півхвилини)' : 'Шукаю штрихкод на фото…'}
              </p>
            )}
            {hint && !error && !busy && <p className="text-xs text-amber-700">{hint}</p>}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button type="button" onClick={captureFrame} disabled={busy} className="inline-flex items-center gap-1.5 text-sm text-blue-700 disabled:opacity-50">
                📸 Зняти кадр
              </button>
              <label className={`inline-flex items-center gap-1.5 text-sm text-blue-700 ${busy ? 'opacity-50' : 'cursor-pointer'}`}>
                <Camera className="w-4 h-4" /> Сфотографувати номер ТТН
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }}
                  data-testid="ttn-photo-input"
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
