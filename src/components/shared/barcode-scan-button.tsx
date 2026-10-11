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
 */
export function BarcodeScanButton({ onResult, label = 'Сканувати ТТН' }: { onResult: (ttn: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
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
        if (!stopped) setError('Не вдалось відкрити камеру. Дозвольте доступ до камери в браузері або скористайтесь «Фото накладної».');
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const decoded = await decodeImageFile(file);
      if (decoded) accept(decoded);
      else setError('На фото не вдалось розпізнати штрихкод. Сфотографуйте лише штрихкод накладної — рівно, з 15–20 см, без відблисків — або введіть номер вручну.');
    } catch {
      setError('Не вдалось обробити фото. Спробуйте ще раз або введіть номер вручну.');
    } finally {
      setBusy(false);
    }
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
              <div className="font-medium text-sm">Наведіть камеру на штрихкод накладної Нової пошти</div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Закрити" className="p-1 text-gray-500 hover:text-gray-800">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="relative w-full bg-black rounded overflow-hidden" style={{ aspectRatio: '4 / 3' }}>
              <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted autoPlay />
              {/* Приціл: штрихкод має бути всередині смуги. */}
              <div className="absolute left-[5%] right-[5%] top-[20%] bottom-[20%] border-2 border-white/80 rounded pointer-events-none" />
            </div>
            <p className="text-xs text-gray-500">Тримайте штрихкод горизонтально в рамці, 15–20 см від камери.</p>
            {hint && !error && <p className="text-xs text-amber-700">{hint}</p>}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <label className="inline-flex items-center gap-1.5 text-sm text-blue-700 cursor-pointer">
              <Camera className="w-4 h-4" /> {busy ? 'Розпізнаю фото…' : 'Фото накладної'}
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
      )}
    </>
  );
}
