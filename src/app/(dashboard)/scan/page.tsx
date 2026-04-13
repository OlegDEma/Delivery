'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';

export default function ScanPage() {
  const router = useRouter();
  const [manualInput, setManualInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState('');
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<unknown>(null);

  async function startScanner() {
    setError('');
    setScanning(true);

    try {
      // Dynamic import to avoid SSR issues
      const { Html5Qrcode } = await import('html5-qrcode');

      const scanner = new Html5Qrcode('qr-reader');
      html5QrCodeRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        (decodedText) => {
          // QR decoded!
          handleQRResult(decodedText);
          scanner.stop().catch(() => {});
          setScanning(false);
        },
        () => {
          // Scan error (not found yet) — ignore
        }
      );
    } catch (err) {
      setError('Не вдалось відкрити камеру. Перевірте дозвіл на використання камери.');
      setScanning(false);
    }
  }

  function stopScanner() {
    if (html5QrCodeRef.current) {
      (html5QrCodeRef.current as { stop: () => Promise<void> }).stop().catch(() => {});
    }
    setScanning(false);
  }

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (html5QrCodeRef.current) {
        (html5QrCodeRef.current as { stop: () => Promise<void> }).stop().catch(() => {});
      }
    };
  }, []);

  function handleQRResult(text: string) {
    setLastResult(text);

    // If it's a URL from our site — extract the query and navigate
    try {
      const url = new URL(text);
      if (url.pathname.includes('/tracking')) {
        const q = url.searchParams.get('q');
        if (q) {
          navigateToParcel(q);
          return;
        }
      }
    } catch {
      // Not a URL — treat as ITN directly
    }

    // Raw ITN/number — search for it
    navigateToParcel(text);
  }

  async function navigateToParcel(query: string) {
    // Search parcel by ITN or internal number
    const res = await fetch(`/api/parcels?q=${encodeURIComponent(query)}&limit=1`);
    if (res.ok) {
      const data = await res.json();
      if (data.parcels?.length > 0) {
        router.push(`/parcels/${data.parcels[0].id}`);
        return;
      }
    }
    // If not found in our parcels — go to tracking
    router.push(`/tracking?q=${encodeURIComponent(query)}`);
  }

  function handleManualSearch(e: React.FormEvent) {
    e.preventDefault();
    if (manualInput.trim()) {
      navigateToParcel(manualInput.trim());
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <Breadcrumbs items={[{ label: 'Головна', href: '/' }, { label: 'Сканер QR' }]} />
      <h1 className="text-2xl font-bold mb-4">Сканер QR</h1>

      {/* Camera scanner */}
      <Card className="mb-4">
        <CardContent className="p-4">
          {!scanning ? (
            <div className="text-center">
              <div className="mb-3">
                <svg className="w-16 h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <Button onClick={startScanner} className="w-full h-12 text-base">
                Відкрити камеру
              </Button>
              <p className="text-xs text-gray-400 mt-2">Наведіть камеру на QR-код етикетки</p>
            </div>
          ) : (
            <div>
              <div id="qr-reader" ref={scannerRef} className="rounded-lg overflow-hidden" />
              <Button variant="outline" onClick={stopScanner} className="w-full mt-2">
                Закрити камеру
              </Button>
            </div>
          )}

          {error && (
            <div className="mt-3 text-sm text-red-600 bg-red-50 rounded p-2">{error}</div>
          )}

          {lastResult && (
            <div className="mt-3 text-sm text-green-600 bg-green-50 rounded p-2">
              Знайдено: {lastResult}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual input fallback */}
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-gray-500 mb-2">Або введіть номер вручну:</p>
          <form onSubmit={handleManualSearch} className="flex gap-2">
            <Input
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="ІТН або внутрішній номер..."
              className="text-base font-mono"
            />
            <Button type="submit">Знайти</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
