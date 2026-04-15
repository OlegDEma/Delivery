'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';
import { formatCurrency, formatDate, formatWeight } from '@/lib/utils/format';

interface ComparisonData {
  parcels: number;
  revenue: number;
  clients: number;
  weight: number;
}

interface TopClient {
  id: string;
  name: string;
  phone: string;
  parcelsCount: number;
  totalCost: number;
  totalWeight: number;
}

interface TripCapacity {
  id: string;
  country: string;
  direction: string;
  departureDate: string;
  status: string;
  courier: string | null;
  parcelsCount: number;
  currentWeight: number;
  currentPlaces: number;
  maxWeight: number;
  usagePercent: number;
}

interface MonthlyEntry {
  month: string;
  parcels: number;
  revenue: number;
}

interface Analytics {
  comparison: { thisMonth: ComparisonData; lastMonth: ComparisonData };
  topClients: TopClient[];
  tripCapacity: TripCapacity[];
  monthly: MonthlyEntry[];
}

function ChangeIndicator({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null;
  const change = ((current - previous) / previous) * 100;
  const isPositive = change >= 0;
  return (
    <span className={`text-xs font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
      {isPositive ? '↑' : '↓'} {Math.abs(change).toFixed(0)}%
    </span>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/analytics')
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-gray-500">Завантаження...</div>;
  if (!data) return <div className="text-center py-12 text-gray-500">Помилка</div>;

  const { thisMonth, lastMonth } = data.comparison;
  const monthNames = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
  const now = new Date();
  const thisMonthName = monthNames[now.getMonth()];
  const lastMonthName = monthNames[now.getMonth() - 1] || monthNames[11];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Аналітика</h1>

      {/* Month comparison */}
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">{thisMonthName} vs {lastMonthName}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Посилок</span>
              <ChangeIndicator current={thisMonth.parcels} previous={lastMonth.parcels} />
            </div>
            <div className="text-2xl font-bold">{thisMonth.parcels}</div>
            <div className="text-xs text-gray-400">Мин. місяць: {lastMonth.parcels}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Дохід</span>
              <ChangeIndicator current={thisMonth.revenue} previous={lastMonth.revenue} />
            </div>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(thisMonth.revenue, 'EUR')}</div>
            <div className="text-xs text-gray-400">Мин.: {formatCurrency(lastMonth.revenue, 'EUR')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Нових клієнтів</span>
              <ChangeIndicator current={thisMonth.clients} previous={lastMonth.clients} />
            </div>
            <div className="text-2xl font-bold">{thisMonth.clients}</div>
            <div className="text-xs text-gray-400">Мин.: {lastMonth.clients}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Вага</span>
              <ChangeIndicator current={thisMonth.weight} previous={lastMonth.weight} />
            </div>
            <div className="text-2xl font-bold">{formatWeight(thisMonth.weight)}</div>
            <div className="text-xs text-gray-400">Мин.: {formatWeight(lastMonth.weight)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly chart — last 6 months */}
      {data.monthly && data.monthly.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base">Останні 6 місяців</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {(() => {
              const max = Math.max(1, ...data.monthly.map(m => m.parcels));
              return (
                <div className="space-y-2">
                  {data.monthly.map(m => (
                    <div key={m.month}>
                      <div className="flex justify-between text-xs mb-1">
                        <span>{m.month}</span>
                        <span>{m.parcels} пос. / {m.revenue} EUR</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded">
                        <div className="h-2 bg-blue-500 rounded" style={{ width: `${(m.parcels / max) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top clients */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base">Топ клієнтів</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="divide-y">
              {data.topClients.map((c, i) => (
                <Link key={c.id} href={`/clients/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i < 3 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{c.name}</div>
                    <div className="text-xs text-gray-400">{c.phone}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-medium">{c.parcelsCount} пос.</div>
                    <div className="text-xs text-gray-500">{formatCurrency(c.totalCost, 'EUR')}</div>
                  </div>
                </Link>
              ))}
              {data.topClients.length === 0 && (
                <div className="text-center py-6 text-gray-400 text-sm">Немає даних</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Trip capacity */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base">Завантаженість рейсів</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="divide-y">
              {data.tripCapacity.map(t => (
                <Link key={t.id} href={`/trips/${t.id}`} className="block px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="font-medium text-sm">
                      {COUNTRY_LABELS[t.country as CountryCode]} {t.direction === 'eu_to_ua' ? '→UA' : '←UA'}
                    </div>
                    <div className="text-xs text-gray-400">{formatDate(t.departureDate)}</div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-gray-200 rounded-full h-3 mb-1">
                    <div
                      className={`h-3 rounded-full transition-all ${
                        t.usagePercent >= 90 ? 'bg-red-500' :
                        t.usagePercent >= 70 ? 'bg-yellow-500' :
                        'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(t.usagePercent, 100)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{t.currentWeight} / {t.maxWeight} кг ({t.usagePercent}%)</span>
                    <span>{t.parcelsCount} пос. / {t.currentPlaces} м.</span>
                  </div>
                  {t.usagePercent >= 90 && (
                    <Badge variant="destructive" className="text-xs mt-1">Майже повний!</Badge>
                  )}
                  {t.courier && <div className="text-xs text-gray-400 mt-0.5">{t.courier}</div>}
                </Link>
              ))}
              {data.tripCapacity.length === 0 && (
                <div className="text-center py-6 text-gray-400 text-sm">Немає активних рейсів</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
