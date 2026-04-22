'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STATUS_LABELS, STATUS_COLORS, type ParcelStatusType } from '@/lib/constants/statuses';
import { statusLabel } from '@/lib/parcels/status-label';
import { formatDate } from '@/lib/utils/format';
import { ListSkeleton } from '@/components/shared/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ParcelListItem {
  id: string;
  itn: string;
  internalNumber: string;
  direction: string;
  status: ParcelStatusType;
  totalPlacesCount: number;
  totalWeight: number | null;
  totalCost: number | null;
  isPaid: boolean;
  createdAt: string;
  sender: { phone: string; firstName: string; lastName: string };
  receiver: { phone: string; firstName: string; lastName: string };
  receiverAddress: { city: string; street: string | null; npWarehouseNum: string | null; deliveryMethod: string } | null;
  trip?: { id: string; country: string | null } | null;
}

// Спец-значення для фільтра по кур'єру: «всі» / «без кур'єра».
const COURIER_ALL = '__all__';
const COURIER_UNASSIGNED = '__unassigned__';

// Virtual filter values (combine both directions) — supported in /api/parcels.
const VIRTUAL_STATUS_LABELS: Record<string, string> = {
  in_transit: 'В дорозі (обидва напрямки)',
  at_warehouse: 'На складі (Львів + ЄС)',
  delivered: 'Доставлено (обидва напрямки)',
};

const BULK_STATUS_OPTIONS: ParcelStatusType[] = [
  'draft',
  'accepted_for_transport_to_ua',
  'in_transit_to_ua',
  'at_lviv_warehouse',
  'at_nova_poshta',
  'delivered_ua',
  'accepted_for_transport_to_eu',
  'in_transit_to_eu',
  'at_eu_warehouse',
  'delivered_eu',
  'not_received',
];

// Top-level page wrapper — useSearchParams() requires a Suspense boundary in Next 15+
// because it opts the subtree out of static prerendering.
export default function ParcelsPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <ParcelsContent />
    </Suspense>
  );
}

function ParcelsContent() {
  // Read initial filter state from URL so deep-links from the dashboard cards
  // (e.g. "?status=in_transit", "?dateFrom=2026-04-16") pre-filter the list.
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get('status') || 'all';
  const initialDateFrom = searchParams.get('dateFrom') || '';
  const initialSearch = searchParams.get('q') || '';

  const [parcels, setParcels] = useState<ParcelListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  // За ТЗ клієнта: замість фільтра «дата/вага/номер» — фільтр «по кур'єру,
  // який приймав посилку». Дефолт — «Без кур'єра» (прибрати розгорнутий
  // загальний список, показувати ще не прив'язані).
  const [courierFilter, setCourierFilter] = useState<string>(COURIER_UNASSIGNED);
  const [couriers, setCouriers] = useState<{ id: string; fullName: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string>('');
  const [bulkWorking, setBulkWorking] = useState(false);

  // Load available couriers for the filter dropdown (once).
  useEffect(() => {
    fetch('/api/users').then((r) => r.ok ? r.json() : []).then(
      (users: { id: string; fullName: string; role: string }[]) => {
        setCouriers(users.filter((u) => u.role === 'driver_courier'));
      }
    );
  }, []);

  const fetchParcels = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (dateFrom) { params.set('dateFrom', dateFrom); params.set('dateTo', dateFrom); }
    if (courierFilter === COURIER_UNASSIGNED) {
      params.set('unassigned', '1');
    } else if (courierFilter !== COURIER_ALL) {
      params.set('courierId', courierFilter);
    }
    params.set('page', String(page));
    params.set('limit', '20');
    params.set('sortBy', 'createdAt');
    params.set('sortOrder', 'desc');

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
  }, [search, statusFilter, dateFrom, courierFilter, page]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => fetchParcels(controller.signal), 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [fetchParcels]);

  function toggleSelection(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleBulkPaid() {
    if (selectedIds.size === 0) return;
    setBulkWorking(true);
    try {
      const res = await fetch('/api/parcels/bulk-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parcelIds: Array.from(selectedIds), isPaid: true }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Оновлено: ${data.updated}`);
        clearSelection();
        fetchParcels();
      } else {
        toast.error('Помилка оновлення');
      }
    } catch {
      toast.error('Помилка оновлення');
    } finally {
      setBulkWorking(false);
    }
  }

  async function handleBulkStatus(newStatus: string) {
    if (selectedIds.size === 0 || !newStatus) return;
    setBulkWorking(true);
    try {
      const res = await fetch('/api/parcels/bulk-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parcelIds: Array.from(selectedIds), status: newStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Статус змінено: ${data.updated}`);
        clearSelection();
        setBulkStatus('');
        fetchParcels();
      } else {
        toast.error('Помилка зміни статусу');
      }
    } catch {
      toast.error('Помилка зміни статусу');
    } finally {
      setBulkWorking(false);
    }
  }

  async function handleQuickPaid(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await fetch('/api/parcels/bulk-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parcelIds: [id], isPaid: true }),
      });
      if (res.ok) {
        toast.success('Позначено оплаченим');
        fetchParcels();
      } else {
        toast.error('Помилка');
      }
    } catch {
      toast.error('Помилка');
    }
  }

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
      {(() => {
        // Активні фільтри — візуально виділяємо блакитною рамкою, щоб було видно
        // «що зараз включено», як вимагає клієнт.
        const isStatusActive = statusFilter !== 'all';
        const isDateActive = !!dateFrom;
        const isCourierActive = courierFilter !== COURIER_UNASSIGNED; // дефолт — unassigned
        const activeCls = 'ring-2 ring-blue-200 border-blue-400';
        return (
          <div className="flex flex-col md:flex-row gap-2 mb-4">
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Пошук: ІТН, прізвище, телефон..."
              className={cn('text-base md:max-w-xs', search && activeCls)}
            />
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? 'all'); setPage(1); }}>
              <SelectTrigger className={cn('md:w-56', isStatusActive && activeCls)}>
                <SelectValue>{
                  statusFilter === 'all'
                    ? 'Всі статуси'
                    : VIRTUAL_STATUS_LABELS[statusFilter]
                      || STATUS_LABELS[statusFilter as ParcelStatusType]
                      || statusFilter
                }</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Всі статуси</SelectItem>
                <SelectItem value="draft">Створена</SelectItem>
                <SelectItem value="in_transit">В дорозі (обидва напрямки)</SelectItem>
                <SelectItem value="in_transit_to_ua">В дорозі (→ UA)</SelectItem>
                <SelectItem value="in_transit_to_eu">В дорозі (→ EU)</SelectItem>
                <SelectItem value="at_warehouse">На складі (Львів + ЄС)</SelectItem>
                <SelectItem value="at_lviv_warehouse">На складі у Львові</SelectItem>
                <SelectItem value="at_eu_warehouse">На складі в ЄС</SelectItem>
                <SelectItem value="at_nova_poshta">На Новій пошті</SelectItem>
                <SelectItem value="delivered_ua">Доставлено (UA)</SelectItem>
                <SelectItem value="delivered_eu">Доставлено (EU)</SelectItem>
                <SelectItem value="not_received">Не отримано</SelectItem>
              </SelectContent>
            </Select>

            {/* Фільтр дати з inline-кнопкою «Очистити» (ТЗ: на мобілі теж). */}
            <div className={cn(
              'relative md:w-44 flex items-center border rounded-md bg-white',
              isDateActive && activeCls
            )}>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="border-0 focus-visible:ring-0 pr-8"
              />
              {dateFrom && (
                <button
                  type="button"
                  onClick={() => { setDateFrom(''); setPage(1); }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"
                  aria-label="Очистити фільтр дати"
                  title="Очистити"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Фільтр по кур'єру, який приймав посилку. Дефолт — «Без кур'єра». */}
            <Select value={courierFilter} onValueChange={(v) => { setCourierFilter(v ?? COURIER_UNASSIGNED); setPage(1); }}>
              <SelectTrigger className={cn('md:w-56', isCourierActive && activeCls)}>
                <SelectValue>{
                  courierFilter === COURIER_UNASSIGNED
                    ? 'Без кур\'єра'
                    : courierFilter === COURIER_ALL
                      ? 'Всі посилки'
                      : couriers.find((c) => c.id === courierFilter)?.fullName || 'Кур\'єр'
                }</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={COURIER_UNASSIGNED}>Без кур&apos;єра</SelectItem>
                <SelectItem value={COURIER_ALL}>Всі посилки</SelectItem>
                {couriers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })()}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Вибрано: {selectedIds.size}</span>
          <Button size="sm" variant="outline" onClick={handleBulkPaid} disabled={bulkWorking}>
            Позначити оплаченим
          </Button>
          <Select value={bulkStatus} onValueChange={(v) => { const s = v ?? ''; setBulkStatus(s); if (s) handleBulkStatus(s); }}>
            <SelectTrigger className="w-52 h-8">
              <SelectValue placeholder="Змінити статус" />
            </SelectTrigger>
            <SelectContent>
              {BULK_STATUS_OPTIONS.map(s => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" onClick={clearSelection} disabled={bulkWorking}>
            Зняти все
          </Button>
        </div>
      )}

      {loading ? (
        <ListSkeleton />
      ) : parcels.length === 0 ? (
        search || statusFilter !== 'all' || dateFrom ? (
          <div className="bg-white rounded-lg border">
            <div className="text-center py-8 text-gray-500">Нічого не знайдено</div>
          </div>
        ) : (
          <EmptyState title="Ще немає посилок" actionLabel="Створити посилку" actionHref="/parcels/new" />
        )
      ) : (
        <>
          <div className="bg-white rounded-lg border divide-y">
            {parcels.map((p) => {
              const checked = selectedIds.has(p.id);
              return (
                <div key={p.id} className="flex items-start gap-2 p-3 hover:bg-gray-50 transition-colors">
                  <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleSelection(p.id)}
                    />
                  </div>
                  <Link href={`/parcels/${p.id}`} className="block flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-sm font-medium">{p.internalNumber}</span>
                          <Badge className={`text-xs ${STATUS_COLORS[p.status]}`}>
                            {statusLabel(p.status, { tripCountry: p.trip?.country, direction: p.direction })}
                          </Badge>
                          {p.isPaid && <Badge className="text-xs bg-green-100 text-green-800">Оплачено</Badge>}
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
                  {!p.isPaid && (
                    <button
                      type="button"
                      onClick={(e) => handleQuickPaid(e, p.id)}
                      title="Позначити оплаченим"
                      className="shrink-0 px-2 py-1 rounded hover:bg-green-100 text-lg leading-none"
                    >
                      💰
                    </button>
                  )}
                </div>
              );
            })}
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
