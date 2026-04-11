'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS, STATUS_COLORS, type ParcelStatusType } from '@/lib/constants/statuses';
import { formatDateTime } from '@/lib/utils/format';

interface Stats {
  totalParcels: number;
  todayParcels: number;
  atWarehouse: number;
  inTransit: number;
  delivered: number;
  totalClients: number;
  activeTrips: number;
  recentParcels: {
    id: string;
    internalNumber: string;
    status: ParcelStatusType;
    createdAt: string;
    receiver: { lastName: string; firstName: string };
  }[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/stats')
      .then(r => {
        if (!r.ok) return null;
        return r.json().catch(() => null);
      })
      .then(data => { setStats(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-gray-500">Завантаження...</div>;
  if (!stats) return <div className="text-center py-12 text-gray-500">Помилка завантаження</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Головна</h1>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Link href="/parcels" className="bg-white rounded-lg border p-4 hover:shadow transition-shadow">
          <div className="text-sm text-gray-500">Всього посилок</div>
          <div className="text-3xl font-bold mt-1">{stats.totalParcels}</div>
        </Link>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-500">Сьогодні</div>
          <div className="text-3xl font-bold mt-1 text-blue-600">{stats.todayParcels}</div>
        </div>
        <Link href="/warehouse" className="bg-white rounded-lg border p-4 hover:shadow transition-shadow">
          <div className="text-sm text-gray-500">На складі</div>
          <div className="text-3xl font-bold mt-1 text-purple-600">{stats.atWarehouse}</div>
        </Link>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-500">В дорозі</div>
          <div className="text-3xl font-bold mt-1 text-indigo-600">{stats.inTransit}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-500">Доставлено</div>
          <div className="text-3xl font-bold mt-1 text-green-600">{stats.delivered}</div>
        </div>
        <Link href="/clients" className="bg-white rounded-lg border p-4 hover:shadow transition-shadow">
          <div className="text-sm text-gray-500">Клієнти</div>
          <div className="text-3xl font-bold mt-1">{stats.totalClients}</div>
        </Link>
        <Link href="/trips" className="bg-white rounded-lg border p-4 hover:shadow transition-shadow">
          <div className="text-sm text-gray-500">Активні рейси</div>
          <div className="text-3xl font-bold mt-1 text-yellow-600">{stats.activeTrips}</div>
        </Link>
        <Link href="/parcels/new" className="bg-blue-600 text-white rounded-lg p-4 hover:bg-blue-700 transition-colors flex items-center justify-center">
          <div className="text-center">
            <div className="text-2xl font-bold">+</div>
            <div className="text-sm">Нова посилка</div>
          </div>
        </Link>
      </div>

      {/* Recent parcels */}
      <div className="bg-white rounded-lg border">
        <div className="px-4 py-3 border-b">
          <h2 className="font-medium">Останні посилки</h2>
        </div>
        <div className="divide-y">
          {stats.recentParcels.map(p => (
            <Link key={p.id} href={`/parcels/${p.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
              <div>
                <span className="font-mono text-sm font-medium">{p.internalNumber}</span>
                <span className="text-sm text-gray-500 ml-2">
                  {p.receiver.lastName} {p.receiver.firstName}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`text-xs ${STATUS_COLORS[p.status]}`}>
                  {STATUS_LABELS[p.status]}
                </Badge>
                <span className="text-xs text-gray-400">{formatDateTime(p.createdAt)}</span>
              </div>
            </Link>
          ))}
          {stats.recentParcels.length === 0 && (
            <div className="text-center py-6 text-gray-500 text-sm">Ще немає посилок</div>
          )}
        </div>
      </div>
    </div>
  );
}
