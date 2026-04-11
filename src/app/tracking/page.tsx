'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { STATUS_LABELS, STATUS_COLORS, type ParcelStatusType } from '@/lib/constants/statuses';
import { formatDateTime } from '@/lib/utils/format';

interface TrackingResult {
  internalNumber: string;
  npTtn: string | null;
  status: ParcelStatusType;
  direction: string;
  totalPlacesCount: number;
  createdAt: string;
  receiverCity: string | null;
  statusHistory: {
    status: ParcelStatusType;
    changedAt: string;
    notes: string | null;
  }[];
}

export default function TrackingPage() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    setResult(null);
    setSearched(true);

    const res = await fetch(`/api/tracking?q=${encodeURIComponent(query.trim())}`);
    if (res.ok) {
      setResult(await res.json());
    } else {
      const data = await res.json();
      setError(data.error || 'Посилку не знайдено');
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center px-4 pt-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-700 mb-2">Delivery</h1>
          <p className="text-gray-500">Відстеження посилки</p>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Номер посилки або ІТН..."
            className="text-base"
            autoFocus
          />
          <Button type="submit" disabled={loading}>
            {loading ? '...' : 'Знайти'}
          </Button>
        </form>

        {error && searched && (
          <div className="text-center text-gray-500 py-8">{error}</div>
        )}

        {result && (
          <Card>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-mono">{result.internalNumber}</CardTitle>
                <Badge className={STATUS_COLORS[result.status]}>
                  {STATUS_LABELS[result.status]}
                </Badge>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {result.direction === 'eu_to_ua' ? 'Європа → Україна' : 'Україна → Європа'}
                {result.receiverCity && ` | ${result.receiverCity}`}
                {' | '}{result.totalPlacesCount} {result.totalPlacesCount === 1 ? 'місце' : 'місць'}
              </div>
              {result.npTtn && (
                <div className="mt-2 bg-orange-50 border border-orange-200 rounded px-3 py-1.5 text-sm font-medium text-orange-800">
                  ТТН Нової Пошти: {result.npTtn}
                </div>
              )}
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="space-y-3">
                {result.statusHistory.map((h, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full ${i === 0 ? 'bg-blue-500' : 'bg-gray-300'}`} />
                      {i < result.statusHistory.length - 1 && (
                        <div className="w-0.5 flex-1 bg-gray-200 mt-1" />
                      )}
                    </div>
                    <div className="pb-2">
                      <div className="text-sm font-medium">
                        {STATUS_LABELS[h.status] || h.status}
                      </div>
                      <div className="text-xs text-gray-400">{formatDateTime(h.changedAt)}</div>
                      {h.notes && <div className="text-xs text-gray-500">{h.notes}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
