'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, X } from 'lucide-react';

/**
 * ТЗ docx 08.10.26 (Створення посилки Працівником, Україна→Європа): «Йому необхідно
 * ввести номер ТТН, присутній на паперовій декларації. Як можливо це зробити без
 * ручного введення? Наприклад камерою телефону».
 *
 * Кнопка відкриває камеру і читає штрихкод з накладної Нової пошти (лінійний код
 * з номером ТТН; підтримуємо Code 128 / ITF / Code 39 / EAN-13 і QR). З розпізнаного
 * тексту беремо 14 цифр — це номер ТТН НП. Запасний варіант — «Фото накладної»:
 * знімок камерою (або файл) розпізнається тим самим декодером.
 */
const TTN_RE = /\d{14}/;

export function extractNpTtn(text: string): string | null {
  return text.replace(/\s/g, '').match(TTN_RE)?.[0] ?? null;
}

type Html5QrcodeT = import('html5-qrcode').Html5Qrcode;

async function makeScanner(elementId: string): Promise<Html5QrcodeT> {
  const { Html5Qrcode, Html5QrcodeSupportedFormats: F } = await import('html5-qrcode');
  return new Html5Qrcode(elementId, {
    formatsToSupport: [F.CODE_128, F.ITF, F.CODE_39, F.EAN_13, F.QR_CODE],
    verbose: false,
  });
}

export function BarcodeScanButton({ onResult, label = 'Сканувати ТТН' }: { onResult: (ttn: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const scannerRef = useRef<Html5QrcodeT | null>(null);
  const runningRef = useRef(false);
  const elementId = useRef(`ttn-scan-${Math.random().toString(36).slice(2)}`).current;

  async function stop() {
    const s = scannerRef.current;
    if (s && runningRef.current) {
      runningRef.current = false;
      try { await s.stop(); } catch { /* вже зупинено */ }
    }
  }

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

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const scanner = await makeScanner(elementId);
        if (cancelled) return;
        scannerRef.current = scanner;
        runningRef.current = true;
        await scanner.start(
          { facingMode: 'environment' },
          // Широка рамка — під лінійний штрихкод накладної.
          { fps: 10, qrbox: { width: 300, height: 140 } },
          (decoded) => { if (accept(decoded)) void stop(); },
          () => {},
        );
      } catch {
        runningRef.current = false;
        if (!cancelled) setError('Не вдалось відкрити камеру. Дозвольте доступ до камери або скористайтесь «Фото накладної».');
      }
    })();
    return () => { cancelled = true; void stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setError('');
    await stop();
    try {
      const scanner = scannerRef.current ?? await makeScanner(elementId);
      scannerRef.current = scanner;
      const decoded = await scanner.scanFile(file, false);
      accept(decoded);
    } catch {
      setError('На фото не вдалось розпізнати штрихкод. Сфотографуйте штрихкод накладної ближче й рівніше.');
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => { setError(''); setOpen(true); }}>
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
            <div id={elementId} className="w-full min-h-[200px] bg-gray-100 rounded" />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <label className="inline-flex items-center gap-1.5 text-sm text-blue-700 cursor-pointer">
              <Camera className="w-4 h-4" /> Фото накладної
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => onPhoto(e.target.files?.[0])}
                data-testid="ttn-photo-input"
              />
            </label>
          </div>
        </div>
      )}
    </>
  );
}
