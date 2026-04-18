'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { STATUS_LABELS, STATUS_COLORS, type ParcelStatusType } from '@/lib/constants/statuses';
import { formatDate } from '@/lib/utils/format';

interface ParcelItem {
  id: string;
  internalNumber: string;
  itn: string;
  status: ParcelStatusType;
  totalPlacesCount: number;
  totalWeight: number | null;
  needsPackaging: boolean;
  sender: { firstName: string; lastName: string; phone: string };
  receiver: { firstName: string; lastName: string; phone: string };
  receiverAddress: { city: string } | null;
  createdAt: string;
  // Present only when the aging endpoint is used (at_lviv_warehouse / at_eu_warehouse).
  warehouseSince?: string;
  daysAtWarehouse?: number;
}

interface AgingSummary {
  total: number;
  over7: number;
  over14: number;
  over30: number;
}

function agingTone(days: number): string {
  if (days >= 30) return 'bg-red-100 text-red-700 border-red-300';
  if (days >= 14) return 'bg-orange-100 text-orange-700 border-orange-300';
  if (days >= 7) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
  return 'bg-gray-100 text-gray-600 border-gray-200';
}

export default function WarehousePage() {
  const [parcels, setParcels] = useState<ParcelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState('in_transit_to_ua');
  const [targetStatus, setTargetStatus] = useState('at_lviv_warehouse');
  const [updating, setUpdating] = useState(false);
  const [result, setResult] = useState('');
  const [minDays, setMinDays] = useState<number>(0);
  const [agingSummary, setAgingSummary] = useState<AgingSummary | null>(null);

  const isWarehouseView = statusFilter === 'at_lviv_warehouse' || statusFilter === 'at_eu_warehouse';

  const fetchParcels = useCallback(async () => {
    setLoading(true);
    if (isWarehouseView) {
      // Use aging endpoint — gives us warehouseSince + daysAtWarehouse per parcel.
      const res = await fetch(`/api/warehouse/aging?status=${statusFilter}&minDays=${minDays}&limit=200`);
      if (res.ok) {
        const data = await res.json();
        setParcels(data.parcels);
        setAgingSummary(data.summary);
      }
    } else {
      setAgingSummary(null);
      const res = await fetch(`/api/parcels?status=${statusFilter}&limit=100`);
      if (res.ok) {
        const data = await res.json();
        setParcels(data.parcels);
      }
    }
    setLoading(false);
  }, [statusFilter, minDays, isWarehouseView]);

  useEffect(() => { fetchParcels(); }, [fetchParcels]);

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function selectAll() {
    if (selectedIds.size === parcels.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(parcels.map(p => p.id)));
    }
  }

  async function handleBulkStatusChange() {
    if (selectedIds.size === 0) return;
    setUpdating(true);
    setResult('');

    const res = await fetch('/api/parcels/bulk-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parcelIds: Array.from(selectedIds),
        status: targetStatus,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setResult(`Оновлено ${data.updated} посилок`);
      setSelectedIds(new Set());
      fetchParcels();
    } else {
      setResult('Помилка оновлення');
    }
    setUpdating(false);
  }

  const TARGET_STATUS_LABELS: Record<string, string> = { at_lviv_warehouse: '→ На складі у Львові', at_nova_poshta: '→ На Новій пошті', in_transit_to_eu: '→ В дорозі до Європи', in_transit_to_ua: '→ В дорозі до України', delivered_eu: '→ Доставлено (EU)', delivered_ua: '→ Доставлено (UA)' };

  const WAREHOUSE_STATUS_LABELS: Record<string, string> = { in_transit_to_ua: 'В дорозі до UA (прийом з Європи)', at_lviv_warehouse: 'На складі Львів', in_transit_to_eu: 'В дорозі до EU (прийом з НП)', accepted_for_transport_to_ua: 'Прийнято до перевезення (→UA)', accepted_for_transport_to_eu: 'Прийнято до перевезення (→EU)' };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Склад</h1>
        <Link href="/warehouse/scan">
          <Button>Сканер</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <div className="flex-1">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? 'in_transit_to_ua'); setSelectedIds(new Set()); }}>
            <SelectTrigger>
              <SelectValue>{WAREHOUSE_STATUS_LABELS[statusFilter] || 'Показати посилки зі статусом'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="in_transit_to_ua">В дорозі до UA (прийом з Європи)</SelectItem>
              <SelectItem value="at_lviv_warehouse">На складі Львів</SelectItem>
              <SelectItem value="in_transit_to_eu">В дорозі до EU (прийом з НП)</SelectItem>
              <SelectItem value="accepted_for_transport_to_ua">Прийнято до перевезення (→UA)</SelectItem>
              <SelectItem value="at_eu_warehouse">На складі у Європі</SelectItem>
              <SelectItem value="accepted_for_transport_to_eu">Прийнято до перевезення (→EU)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isWarehouseView && (
          <div className="md:w-56">
            <Select value={String(minDays)} onValueChange={(v) => setMinDays(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Всі посилки</SelectItem>
                <SelectItem value="7">≥ 7 днів на складі</SelectItem>
                <SelectItem value="14">≥ 14 днів на складі</SelectItem>
                <SelectItem value="30">≥ 30 днів на складі</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Aging summary — shown only in warehouse view */}
      {isWarehouseView && agingSummary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <div className="bg-white border rounded-lg p-3">
            <div className="text-xl font-bold">{agingSummary.total}</div>
            <div className="text-xs text-gray-500">На складі</div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="text-xl font-bold text-yellow-700">{agingSummary.over7}</div>
            <div className="text-xs text-yellow-800">≥ 7 днів</div>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
            <div className="text-xl font-bold text-orange-700">{agingSummary.over14}</div>
            <div className="text-xs text-orange-800">≥ 14 днів</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="text-xl font-bold text-red-700">{agingSummary.over30}</div>
            <div className="text-xs text-red-800">≥ 30 днів</div>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex flex-col md:flex-row gap-2 items-start md:items-center">
          <span className="text-sm font-medium">Вибрано: {selectedIds.size}</span>
          <div className="flex gap-2 flex-1 items-center">
            <Select value={targetStatus} onValueChange={(v) => setTargetStatus(v ?? 'at_lviv_warehouse')}>
              <SelectTrigger className="w-60">
                <SelectValue>{TARGET_STATUS_LABELS[targetStatus]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="at_lviv_warehouse">→ На складі у Львові</SelectItem>
                <SelectItem value="at_nova_poshta">→ На Новій пошті</SelectItem>
                <SelectItem value="in_transit_to_eu">→ В дорозі до Європи</SelectItem>
                <SelectItem value="in_transit_to_ua">→ В дорозі до України</SelectItem>
                <SelectItem value="delivered_eu">→ Доставлено (EU)</SelectItem>
                <SelectItem value="delivered_ua">→ Доставлено (UA)</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleBulkStatusChange} disabled={updating} size="sm">
              {updating ? 'Оновлення...' : 'Змінити статус'}
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-2 mb-4 text-sm text-green-700">
          {result}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Завантаження...</div>
      ) : (
        <div className="bg-white rounded-lg border">
          {/* Header */}
          <div className="flex items-center gap-3 px-3 py-2 border-b bg-gray-50">
            <Checkbox
              checked={selectedIds.size === parcels.length && parcels.length > 0}
              onCheckedChange={selectAll}
            />
            <span className="text-xs text-gray-500 font-medium">
              {parcels.length} посилок
            </span>
          </div>

          {/* List */}
          <div className="divide-y">
            {parcels.map(p => (
              <div key={p.id} className="flex items-start gap-3 p-3 hover:bg-gray-50">
                <Checkbox
                  checked={selectedIds.has(p.id)}
                  onCheckedChange={() => toggleSelect(p.id)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-sm font-medium">{p.internalNumber}</span>
                    <Badge className={`text-xs ${STATUS_COLORS[p.status]}`}>
                      {STATUS_LABELS[p.status]}
                    </Badge>
                    {p.needsPackaging && (
                      <Badge variant="secondary" className="text-xs">Пакування</Badge>
                    )}
                  </div>
                  <div className="text-sm">
                    {p.receiver.lastName} {p.receiver.firstName}
                    <span className="text-gray-400 ml-1">{p.receiver.phone}</span>
                  </div>
                  {p.receiverAddress && (
                    <div className="text-xs text-gray-400">{p.receiverAddress.city}</div>
                  )}
                </div>
                <div className="text-right text-sm shrink-0">
                  <div>{p.totalWeight ? `${Number(p.totalWeight).toFixed(1)} кг` : '—'}</div>
                  <div className="text-xs text-gray-400">{p.totalPlacesCount} м.</div>
                  <div className="text-xs text-gray-400">{formatDate(p.createdAt)}</div>
                  {typeof p.daysAtWarehouse === 'number' && (
                    <div className={`text-xs mt-1 px-1.5 py-0.5 rounded border inline-block ${agingTone(p.daysAtWarehouse)}`}>
                      {p.daysAtWarehouse === 0 ? 'сьогодні' : `${p.daysAtWarehouse} дн.`}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {parcels.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                Немає посилок з цим статусом
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
