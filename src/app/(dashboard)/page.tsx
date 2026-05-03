'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { STATUS_LABELS, STATUS_COLORS, type ParcelStatusType } from '@/lib/constants/statuses';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';
import { formatDateTime, formatCurrency, formatDate } from '@/lib/utils/format';
import { kyivYmd } from '@/lib/utils/tz';
import { useAuth } from '@/lib/hooks/use-auth';
import { ROLES } from '@/lib/constants/roles';

interface Activity {
  id: string;
  parcelId: string;
  parcelNumber: string;
  status: ParcelStatusType;
  changedBy: string;
  changedAt: string;
  notes: string | null;
}

interface Stats {
  totalParcels: number;
  todayParcels: number;
  atWarehouse: number;
  inTransit: number;
  delivered: number;
  totalClients: number;
  activeTrips: number;
  unpaidCount: number;
  unpaidTotal: number;
  pendingOrders: number;
  upcomingTrip: { id: string; departureDate: string; country: string; direction: string; _count: { parcels: number } } | null;
  recentParcels: {
    id: string;
    internalNumber: string;
    status: ParcelStatusType;
    createdAt: string;
    receiver: { lastName: string; firstName: string };
  }[];
  recentActivity: Activity[];
}

export default function DashboardPage() {
  const { role } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.ok ? r.json().catch(() => null) : null)
      .then(data => { setStats(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-gray-500">Завантаження...</div>;
  if (!stats) return <div className="text-center py-12 text-gray-500">Помилка завантаження</div>;

  // Admin/cashier widgets — drivers see only trip-related actions on home
  const isDriver = role === ROLES.DRIVER_COURIER;
  const showPendingOrders = !isDriver && stats.pendingOrders > 0;
  const showUnpaid = !isDriver && stats.unpaidCount > 0;
  const showUpcomingTrip = !!stats.upcomingTrip;
  const hasActions = showPendingOrders || showUnpaid || showUpcomingTrip;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Головна</h1>

      {/* Action items — what to do NOW */}
      {hasActions && (
        <div className="mb-6 space-y-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Потрібна увага</h2>

          {showPendingOrders && (
            <Link href="/parcels/pending-orders" className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-lg p-3 hover:bg-yellow-100 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-yellow-200 rounded-full flex items-center justify-center text-yellow-800 font-bold">{stats.pendingOrders}</div>
                <div>
                  <div className="font-medium text-yellow-900">Замовлення клієнтів чекають підтвердження</div>
                  <div className="text-xs text-yellow-700">Перевірте та підтвердіть</div>
                </div>
              </div>
              <span className="text-yellow-600">→</span>
            </Link>
          )}

          {showUnpaid && (
            <Link href="/debts" className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg p-3 hover:bg-red-100 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-200 rounded-full flex items-center justify-center text-red-800 font-bold">{stats.unpaidCount}</div>
                <div>
                  <div className="font-medium text-red-900">Неоплачених посилок: борг {formatCurrency(stats.unpaidTotal, 'EUR')}</div>
                  <div className="text-xs text-red-700">Перегляньте боржників</div>
                </div>
              </div>
              <span className="text-red-600">→</span>
            </Link>
          )}

          {showUpcomingTrip && stats.upcomingTrip && (
            <Link href={`/trips/${stats.upcomingTrip.id}`} className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3 hover:bg-blue-100 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center text-blue-800 font-bold">{stats.upcomingTrip._count.parcels}</div>
                <div>
                  <div className="font-medium text-blue-900">
                    Найближчий рейс: {COUNTRY_LABELS[stats.upcomingTrip.country as CountryCode]} {stats.upcomingTrip.direction === 'eu_to_ua' ? '→UA' : '←UA'}
                  </div>
                  <div className="text-xs text-blue-700">{formatDate(stats.upcomingTrip.departureDate)} • {stats.upcomingTrip._count.parcels} посилок</div>
                </div>
              </div>
              <span className="text-blue-600">→</span>
            </Link>
          )}
        </div>
      )}

      {/* Stats grid — every card is a deep link into the parcels list or
          warehouse screen, pre-filtered to the matching slice. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Link href="/parcels" className="bg-white rounded-lg border p-4 hover:shadow transition-shadow">
          <div className="text-sm text-gray-500">Всього посилок</div>
          <div className="text-3xl font-bold mt-1">{stats.totalParcels}</div>
        </Link>
        <Link
          href={`/parcels?dateFrom=${kyivYmd()}`}
          className="bg-white rounded-lg border p-4 hover:shadow transition-shadow"
        >
          <div className="text-sm text-gray-500">Сьогодні</div>
          <div className="text-3xl font-bold mt-1 text-blue-600">{stats.todayParcels}</div>
        </Link>
        <Link href="/warehouse" className="bg-white rounded-lg border p-4 hover:shadow transition-shadow">
          <div className="text-sm text-gray-500">На складі</div>
          <div className="text-3xl font-bold mt-1 text-purple-600">{stats.atWarehouse}</div>
        </Link>
        <Link
          href="/parcels?status=in_transit"
          className="bg-white rounded-lg border p-4 hover:shadow transition-shadow"
        >
          <div className="text-sm text-gray-500">В дорозі</div>
          <div className="text-3xl font-bold mt-1 text-indigo-600">{stats.inTransit}</div>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recent activity */}
        <div className="bg-white rounded-lg border">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="font-medium">Останні дії</h2>
          </div>
          <div className="divide-y max-h-80 overflow-y-auto">
            {stats.recentActivity.map(a => (
              <Link key={a.id} href={`/parcels/${a.parcelId}`} className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 text-sm">
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${STATUS_COLORS[a.status]?.split(' ')[0] || 'bg-gray-300'}`} />
                <div className="min-w-0 flex-1">
                  <div>
                    <span className="font-medium">{a.changedBy}</span>
                    <span className="text-gray-500"> → </span>
                    <span className="font-mono text-xs">{a.parcelNumber}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {STATUS_LABELS[a.status]}
                    {a.notes && ` • ${a.notes}`}
                  </div>
                  <div className="text-xs text-gray-400">{formatDateTime(a.changedAt)}</div>
                </div>
              </Link>
            ))}
            {stats.recentActivity.length === 0 && (
              <div className="text-center py-6 text-gray-400 text-sm">Ще немає активності</div>
            )}
          </div>
        </div>

        {/* Recent parcels + quick actions */}
        <div className="bg-white rounded-lg border">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="font-medium">Останні посилки</h2>
            <Link href="/parcels/new">
              <Button size="sm">+ Нова</Button>
            </Link>
          </div>
          <div className="divide-y">
            {stats.recentParcels.map(p => (
              <Link key={p.id} href={`/parcels/${p.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50">
                <div>
                  <span className="font-mono text-sm font-medium">{p.internalNumber}</span>
                  <span className="text-sm text-gray-500 ml-2">{p.receiver.lastName} {p.receiver.firstName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={`text-xs ${STATUS_COLORS[p.status]}`}>{STATUS_LABELS[p.status]}</Badge>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
