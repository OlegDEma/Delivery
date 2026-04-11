'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { STATUS_LABELS, type ParcelStatusType } from '@/lib/constants/statuses';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';

interface ScanResult {
  id: string;
  internalNumber: string;
  itn: string;
  status: ParcelStatusType;
  totalPlacesCount: number;
  totalWeight: number | null;
  needsPackaging: boolean;
  receiver: { firstName: string; lastName: string; phone: string };
}

// Audio context for beep sounds
function playBeep(success: boolean) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = success ? 800 : 300;
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + (success ? 0.15 : 0.4));
  } catch {
    // Audio not available
  }
}

export default function WarehouseScanPage() {
  const [scanInput, setScanInput] = useState('');
  const [scannedParcels, setScannedParcels] = useState<ScanResult[]>([]);
  const [lastError, setLastError] = useState('');
  const [targetStatus, setTargetStatus] = useState('at_lviv_warehouse');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    if (!scanInput.trim()) return;

    setLastError('');
    const query = scanInput.trim();
    setScanInput('');

    // Check if already scanned
    if (scannedParcels.some(p => p.itn === query || p.internalNumber.includes(query))) {
      setLastError('Вже відскановано!');
      playBeep(false);
      return;
    }

    // Search parcel
    const res = await fetch(`/api/parcels?q=${encodeURIComponent(query)}&limit=1`);
    if (!res.ok) {
      setLastError('Помилка пошуку');
      playBeep(false);
      return;
    }

    const data = await res.json();
    if (!data.parcels || data.parcels.length === 0) {
      setLastError(`Посилку "${query}" не знайдено`);
      playBeep(false);
      return;
    }

    const parcel = data.parcels[0];
    setScannedParcels(prev => [parcel, ...prev]);
    playBeep(true);

    // Auto-change status
    await fetch(`/api/parcels/${parcel.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: targetStatus }),
    });

    inputRef.current?.focus();
  }

  return (
    <div className="max-w-lg mx-auto">
      <Breadcrumbs items={[{label: 'Склад', href: '/warehouse'}, {label: 'Сканер'}]} />
      <h1 className="text-2xl font-bold mb-4">Сканер складу</h1>

      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="mb-3">
            <label className="text-sm text-gray-500">Статус після сканування:</label>
            <div className="flex gap-2 mt-1">
              <Button
                variant={targetStatus === 'at_lviv_warehouse' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTargetStatus('at_lviv_warehouse')}
              >
                На складі
              </Button>
              <Button
                variant={targetStatus === 'at_nova_poshta' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTargetStatus('at_nova_poshta')}
              >
                На НП
              </Button>
              <Button
                variant={targetStatus === 'in_transit_to_eu' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTargetStatus('in_transit_to_eu')}
              >
                В дорозі (EU)
              </Button>
            </div>
          </div>

          <form onSubmit={handleScan} className="flex gap-2">
            <Input
              ref={inputRef}
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              placeholder="Скануйте або введіть ІТН..."
              className="text-lg font-mono"
              autoFocus
            />
            <Button type="submit">OK</Button>
          </form>

          {lastError && (
            <div className="mt-2 text-sm text-red-600 bg-red-50 rounded p-2">{lastError}</div>
          )}
        </CardContent>
      </Card>

      {/* Scanned list */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-gray-500">Відскановано: {scannedParcels.length}</span>
        {scannedParcels.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setScannedParcels([])}>Очистити</Button>
        )}
      </div>

      <div className="bg-white rounded-lg border divide-y">
        {scannedParcels.map((p, i) => (
          <div key={p.id} className={`p-3 ${p.needsPackaging ? 'bg-red-50 border-l-4 border-l-red-500' : ''}`}>
            {p.needsPackaging && (
              <div className="bg-red-100 text-red-800 font-bold text-sm px-3 py-2 rounded mb-2 flex items-center gap-2">
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                ПОТРЕБУЄ ПАКУВАННЯ!
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">{scannedParcels.length - i}</span>
                  <span className="font-mono text-sm font-medium">{p.internalNumber}</span>
                </div>
                <div className="text-sm text-gray-600 mt-0.5">
                  {p.receiver.lastName} {p.receiver.firstName} | {p.receiver.phone}
                </div>
              </div>
              <div className="text-right text-sm">
                {p.totalWeight ? `${Number(p.totalWeight).toFixed(1)} кг` : '—'}
                <div className="text-xs text-gray-400">{p.totalPlacesCount} м.</div>
              </div>
            </div>
          </div>
        ))}
        {scannedParcels.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            Наведіть камеру на QR-код або введіть номер вручну
          </div>
        )}
      </div>
    </div>
  );
}
