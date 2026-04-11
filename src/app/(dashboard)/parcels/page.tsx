'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STATUS_LABELS, STATUS_COLORS, type ParcelStatusType } from '@/lib/constants/statuses';
import { formatDate } from '@/lib/utils/format';

interface ParcelListItem {
  id: string;
  itn: string;
  internalNumber: string;
  direction: string;
  status: ParcelStatusType;
  totalPlacesCount: number;
  totalWeight: number | null;
  totalCost: number | null;
  createdAt: string;
  sender: { phone: string; firstName: string; lastName: string };
  receiver: { phone: string; firstName: string; lastName: string };
  receiverAddress: { city: string; street: string | null; npWarehouseNum: string | null; deliveryMethod: string } | null;
}

export default function ParcelsPage() {
  const [parcels, setParcels] = useState<ParcelListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  const fetchParcels = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    params.set('page', String(page));
    params.set('limit', '20');

    try {
      const res = await fetch(`/api/parcels?${params}`, { signal });
      if (res.ok) {
        const data = await res.json();
        setParcels(data.parcels);
        setTotal(data.total);
        setPages(data.pages);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
    setLoading(false);
  }, [search, statusFilter, page]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => fetchParcels(controller.signal), 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [fetchParcels]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Посилки</h1>
          <p className="text-sm text-gray-500">{total} всього</p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/parcels/export?${statusFilter !== 'all' ? `status=${statusFilter}` : ''}`}
            download
          >
            <Button variant="outline" size="sm">Експорт Excel</Button>
          </a>
          <Link href="/parcels/new">
            <Button>+ Створити</Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Пошук: ІТН, прізвище, телефон..."
          className="text-base md:max-w-xs"
        />
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? 'all'); setPage(1); }}>
          <SelectTrigger className="md:w-64">
            <SelectValue>{statusFilter === 'all' ? 'Всі статуси' : (STATUS_LABELS[statusFilter as ParcelStatusType] || statusFilter)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Всі статуси</SelectItem>
            <SelectItem value="draft">Чернетка</SelectItem>
            <SelectItem value="accepted_for_transport_to_ua">Прийнято (→ UA)</SelectItem>
            <SelectItem value="in_transit_to_ua">В дорозі (→ UA)</SelectItem>
            <SelectItem value="at_lviv_warehouse">На складі Львів</SelectItem>
            <SelectItem value="at_nova_poshta">На Новій пошті</SelectItem>
            <SelectItem value="delivered_ua">Доставлено (UA)</SelectItem>
            <SelectItem value="accepted_for_transport_to_eu">Прийнято (→ EU)</SelectItem>
            <SelectItem value="in_transit_to_eu">В дорозі (→ EU)</SelectItem>
            <SelectItem value="delivered_eu">Доставлено (EU)</SelectItem>
            <SelectItem value="not_received">Не отримано</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Завантаження...</div>
      ) : (
        <>
          <div className="bg-white rounded-lg border divide-y">
            {parcels.map((p) => (
              <Link
                key={p.id}
                href={`/parcels/${p.id}`}
                className="block p-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-sm font-medium">{p.internalNumber}</span>
                      <Badge className={`text-xs ${STATUS_COLORS[p.status]}`}>
                        {STATUS_LABELS[p.status]}
                      </Badge>
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-500">Від:</span>{' '}
                      <span>{p.sender.lastName} {p.sender.firstName}</span>
                      <span className="text-gray-400 ml-1">{p.sender.phone}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-500">Кому:</span>{' '}
                      <span>{p.receiver.lastName} {p.receiver.firstName}</span>
                      <span className="text-gray-400 ml-1">{p.receiver.phone}</span>
                    </div>
                    {p.receiverAddress && (
                      <div className="text-xs text-gray-400">
                        {p.receiverAddress.city}
                        {p.receiverAddress.street ? `, ${p.receiverAddress.street}` : ''}
                        {p.receiverAddress.npWarehouseNum ? ` (НП №${p.receiverAddress.npWarehouseNum})` : ''}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-gray-400">{formatDate(p.createdAt)}</div>
                    <div className="text-sm font-medium mt-0.5">
                      {p.totalWeight ? `${Number(p.totalWeight).toFixed(1)} кг` : '—'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {p.totalPlacesCount} {p.totalPlacesCount === 1 ? 'місце' : p.totalPlacesCount < 5 ? 'місця' : 'місць'}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
            {parcels.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                {search || statusFilter !== 'all' ? 'Нічого не знайдено' : 'Немає посилок'}
              </div>
            )}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                ← Назад
              </Button>
              <span className="flex items-center text-sm text-gray-500">
                {page} / {pages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>
                Далі →
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
