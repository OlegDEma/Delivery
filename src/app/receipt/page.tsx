'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS, STATUS_COLORS, type ParcelStatusType } from '@/lib/constants/statuses';
import { formatDateTime } from '@/lib/utils/format';

interface ReceiptData {
  internalNumber: string;
  status: ParcelStatusType;
  direction: string;
  totalPlacesCount: number;
  createdAt: string;
  receiverCity: string | null;
  statusHistory: { status: ParcelStatusType; changedAt: string; notes: string | null }[];
}

function ReceiptContent() {
  const searchParams = useSearchParams();
  const q = searchParams.get('q') || '';
  const [data, setData] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(!!q);

  useEffect(() => {
    if (!q) return;
    fetch(`/api/tracking?q=${encodeURIComponent(q)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [q]);

  if (!q) return <div className="text-center py-12 text-gray-500">Невірне посилання</div>;
  if (loading) return <div className="text-center py-12 text-gray-500">Завантаження...</div>;
  if (!data) return <div className="text-center py-12 text-gray-500">Посилку не знайдено</div>;

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-blue-700">Delivery</h1>
          <p className="text-sm text-gray-500">Електронна квитанція</p>
        </div>

        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="text-center">
              <div className="text-xl font-mono font-bold">{data.internalNumber}</div>
              <Badge className={`mt-2 ${STATUS_COLORS[data.status]}`}>
                {STATUS_LABELS[data.status]}
              </Badge>
            </div>

            <div className="border-t pt-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Напрямок:</span>
                <span>{data.direction === 'eu_to_ua' ? 'Європа → Україна' : 'Україна → Європа'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Місць:</span>
                <span>{data.totalPlacesCount}</span>
              </div>
              {data.receiverCity && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Місто доставки:</span>
                  <span>{data.receiverCity}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Створено:</span>
                <span>{formatDateTime(data.createdAt)}</span>
              </div>
            </div>

            <div className="border-t pt-3">
              <div className="text-sm font-medium mb-2">Історія</div>
              <div className="space-y-2">
                {data.statusHistory.map((h, i) => (
                  <div key={i} className="flex gap-2 text-sm">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${i === 0 ? 'bg-blue-500' : 'bg-gray-300'}`} />
                    <div>
                      <div className="font-medium">{STATUS_LABELS[h.status] || h.status}</div>
                      <div className="text-xs text-gray-400">{formatDateTime(h.changedAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t pt-3 text-center">
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                Друкувати
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400 mt-4">
          Відстежити посилку: delivery.vercel.app/tracking
        </p>
      </div>
    </div>
  );
}

export default function ReceiptPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-500">Завантаження...</div>}>
      <ReceiptContent />
    </Suspense>
  );
}
