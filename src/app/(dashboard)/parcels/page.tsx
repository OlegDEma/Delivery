'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/hooks/use-auth';
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
import { parcelParties } from '@/lib/parcels/party-snapshot';
import { formatDate } from '@/lib/utils/format';
import { tripRouteLabel } from '@/lib/constants/countries';
import { displayParcelNumber } from '@/lib/parcels/display-number';
import { rememberOpenedParcel, useReturnToParcel, readListState, saveListState } from '@/lib/hooks/use-return-to-parcel';
import { ListSkeleton } from '@/components/shared/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ParcelListItem {
  id: string;
  itn: string;
  internalNumber: string;
  /** ТЗ docx 03.10.26 (п.4): ТТН Нової пошти має бути видно і в списку Працівника. */
  npTtn: string | null;
  direction: string;
  status: ParcelStatusType;
  totalPlacesCount: number;
  totalWeight: number | null;
  totalCost: number | null;
  isPaid: boolean;
  createdAt: string;
  /** ТЗ docx 04.10.26: «Створена клієнтом/водієм/…». */
  createdSource?: string | null;
  createdBy?: { role: string } | null;
  sender: { phone: string; firstName: string; lastName: string };
  receiver: { phone: string; firstName: string; lastName: string };
  receiverAddress: { country: string | null; city: string; street: string | null; building: string | null; postalCode: string | null; landmark: string | null; npWarehouseNum: string | null; deliveryMethod: string } | null;
  senderAddress: { country: string | null; city: string; street: string | null; building: string | null; postalCode: string | null; landmark: string | null; npWarehouseNum: string | null; deliveryMethod: string } | null;
  // ТЗ docx 26.07.26 (п.1): знімок сторін для accepted+ (див. parcelParties).
  senderSnapshot: unknown;
  receiverSnapshot: unknown;
  // ТЗ docx 08.08.26 (G7): помітка «яким рейсом їхала» — потрібні напрямок+дата.
  trip?: { id: string; country: string | null; direction: string | null; departureDate: string | null } | null;
  /** Хто прийняв посилку (collectedBy) — для відображення поряд з посилкою. */
  collectedBy?: { id: string; fullName: string } | null;
  /** Хто призначений на доставку (assignedCourier) — для контексту. */
  assignedCourier?: { id: string; fullName: string } | null;
}

// ТЗ docx 04.10.26: повернення до відкритої посилки + збережений стан списку.
const RETURN_KEY = 'parcels:lastOpened';
const LIST_STATE_KEY = 'parcels:listState';
interface ParcelsListState {
  search: string; statusFilter: string; dateFrom: string; courierFilter: string; page: number;
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
  // ТЗ docx 04.10.26: після виходу з посилки список має відкритись у тому ж стані
  // (фільтри + сторінка), інакше посилки з 2-ї сторінки вже не буде видно.
  // Deep-link з дашборду (параметри в URL) має пріоритет над збереженим станом.
  const hasUrlFilters = ['status', 'dateFrom', 'q'].some((k) => searchParams.has(k));
  const saved = hasUrlFilters ? null : readListState<ParcelsListState>(LIST_STATE_KEY);
  const initialStatus = searchParams.get('status') || saved?.statusFilter || 'all';
  const initialDateFrom = searchParams.get('dateFrom') || saved?.dateFrom || '';
  const initialSearch = searchParams.get('q') || saved?.search || '';
  const { role } = useAuth();
  // ТЗ docx 04.10.26: прийняти оплату пакетом може лише Суперадмін.
  const isSuperAdmin = role === 'super_admin';

  const [parcels, setParcels] = useState<ParcelListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [page, setPage] = useState(saved?.page || 1);
  const [pages, setPages] = useState(1);
  // За ТЗ клієнта: замість фільтра «дата/вага/номер» — фільтр «по кур'єру,
  // який приймав посилку». Дефолт — «Без кур'єра» (прибрати розгорнутий
  // загальний список, показувати ще не прив'язані).
  const [courierFilter, setCourierFilter] = useState<string>(saved?.courierFilter || COURIER_ALL);
  const [couriers, setCouriers] = useState<{ id: string; fullName: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string>('');
  const [bulkWorking, setBulkWorking] = useState(false);
  const [bulkPayOpen, setBulkPayOpen] = useState(false);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    saveListState<ParcelsListState>(LIST_STATE_KEY, { search, statusFilter, dateFrom, courierFilter, page });
  }, [search, statusFilter, dateFrom, courierFilter, page]);

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
    // ТЗ: фільтр «по кур'єру, який приймав посилку» — це хто фізично
    // забрав посилку (collectedBy), а не призначений на доставку.
    if (courierFilter === COURIER_UNASSIGNED) {
      params.set('acceptedUnassigned', '1');
    } else if (courierFilter !== COURIER_ALL) {
      params.set('acceptedById', courierFilter);
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
        setSearchError('');
      } else {
        // ТЗ docx 07.10.26: «Невірний формат номера» (ІТН не пройшов перевірку Луна).
        const data = await res.json().catch(() => null);
        setParcels([]);
        setTotal(0);
        setPages(1);
        setSearchError(data?.error || 'Помилка пошуку');
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

  // ТЗ docx 04.10.26: посилка, з якої щойно повернулись, — по центру екрана і підсвічена.
  const highlightedId = useReturnToParcel(RETURN_KEY, !loading && parcels.length > 0);

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

  // ТЗ docx 04.10.26: пакетна оплата — лише Суперадмін; на кожну посилку
  // створюється прихід у Касі (спосіб оплати обирається тут же).
  async function handleBulkPaid(paymentMethod: 'cash' | 'cashless') {
    if (selectedIds.size === 0) return;
    setBulkWorking(true);
    try {
      const res = await fetch('/api/parcels/bulk-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parcelIds: Array.from(selectedIds), paymentMethod }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(
          `Оплату прийнято: ${data.updated}` + (data.skipped ? ` (вже оплачені пропущено: ${data.skipped})` : ''),
        );
        setBulkPayOpen(false);
        clearSelection();
        fetchParcels();
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error || 'Помилка прийому оплати');
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
        const isCourierActive = courierFilter !== COURIER_ALL; // ТЗ docx 23.08.26: дефолт — «Всі посилки»
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

            {/* ТЗ: фільтр «по кур'єру, який приймав посилку» — це хто фізично
                забрав посилку (collectedBy), не призначений на доставку.
                ТЗ docx 23.08.26: дефолт — «Всі посилки» (раніше було «Не прийняті кур'єром» — клієнт просив змінити). */}
            <Select value={courierFilter} onValueChange={(v) => { setCourierFilter(v ?? COURIER_ALL); setPage(1); }}>
              <SelectTrigger className={cn('md:w-64', isCourierActive && activeCls)}>
                <SelectValue>{
                  courierFilter === COURIER_UNASSIGNED
                    ? 'Не прийняті кур\'єром'
                    : courierFilter === COURIER_ALL
                      ? 'Всі посилки'
                      : `Прийняв: ${couriers.find((c) => c.id === courierFilter)?.fullName || ''}`
                }</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={COURIER_UNASSIGNED}>Не прийняті кур&apos;єром</SelectItem>
                <SelectItem value={COURIER_ALL}>Всі посилки</SelectItem>
                {couriers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>Прийняв: {c.fullName}</SelectItem>
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
          {isSuperAdmin && (
            bulkPayOpen ? (
              <span className="inline-flex flex-wrap items-center gap-1">
                <span className="text-xs text-gray-600">Оплата:</span>
                <Button size="sm" variant="outline" onClick={() => handleBulkPaid('cash')} disabled={bulkWorking}>
                  💵 Готівка
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleBulkPaid('cashless')} disabled={bulkWorking}>
                  💳 Безготівково
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setBulkPayOpen(false)} disabled={bulkWorking}>
                  Скасувати
                </Button>
              </span>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setBulkPayOpen(true)} disabled={bulkWorking}>
                Прийняти оплату ({selectedIds.size})
              </Button>
            )
          )}
          <Select value={bulkStatus} onValueChange={(v) => { const s = v ?? ''; setBulkStatus(s); if (s) handleBulkStatus(s); }}>
            <SelectTrigger className="w-52 h-8">
              <SelectValue placeholder="Змінити статус" />
            </SelectTrigger>
            <SelectContent className="min-w-[18rem]">
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
            <div className="text-center py-8 text-gray-500">{searchError || 'Нічого не знайдено'}</div>
          </div>
        ) : (
          <EmptyState title="Ще немає посилок" actionLabel="Створити посилку" actionHref="/parcels/new" />
        )
      ) : (
        <>
          <div className="bg-white rounded-lg border divide-y">
            {parcels.map((p) => {
              const checked = selectedIds.has(p.id);
              // ТЗ docx 26.07.26 (п.1): сторони — зі знімка для accepted+.
              const pt = parcelParties(p);
              return (
                <div
                  key={p.id}
                  data-parcel-id={p.id}
                  className={cn(
                    'flex items-start gap-2 p-3 hover:bg-gray-50 transition-colors',
                    highlightedId === p.id && 'bg-amber-50 ring-2 ring-inset ring-amber-300',
                  )}
                >
                  <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleSelection(p.id)}
                    />
                  </div>
                  <Link href={`/parcels/${p.id}`} onClick={() => rememberOpenedParcel(RETURN_KEY, p.id)} className="block flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {/* flex-wrap so long status badges don't overflow on mobile */}
                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                          <span className="font-mono text-sm font-medium">{displayParcelNumber(p.internalNumber)}</span>
                          <Badge className={`text-xs whitespace-normal text-left h-auto py-0.5 ${STATUS_COLORS[p.status]}`}>
                            {statusLabel(p.status, { tripCountry: p.trip?.country, direction: p.direction, createdSource: p.createdSource, createdByRole: p.createdBy?.role })}
                          </Badge>
                          {/* ТЗ docx 03.10.26 (п.4): «Після введення ТТН Клієнтом він
                              повинен відображатись … і тут у будь-якого працівника» —
                              у ТЗ червоним позначено саме рядок списку. */}
                          {p.npTtn && (
                            <Badge variant="secondary" className="text-xs whitespace-nowrap font-mono">
                              ТТН {p.npTtn}
                            </Badge>
                          )}
                          {/* ТЗ docx 28.09.26 (зауваження «Неоплата в посилках коряво
                              відображається»): оплачена посилка мала зрозумілий бейдж, а
                              неоплачена — лише самотній значок 💰 у кінці рядка без підпису.
                              Тепер стан оплати показується однаково в обох випадках. */}
                          {p.isPaid
                            ? <Badge className="text-xs bg-green-100 text-green-800">Оплачено</Badge>
                            : <Badge className="text-xs bg-amber-100 text-amber-800">Не сплачено</Badge>}
                          {/* ТЗ docx 08.08.26 (G7): помітка — яким рейсом посилка перевозилася. */}
                          {p.trip && (
                            <Badge variant="secondary" className="text-xs whitespace-nowrap">
                              🚌 {tripRouteLabel(p.trip.country ?? '', p.trip.direction ?? '', { mode: 'code' })}
                              {p.trip.departureDate ? ` · ${formatDate(p.trip.departureDate)}` : ''}
                            </Badge>
                          )}
                        </div>
                        {/* Кому/Куди (ТЗ). */}
                        <div className="text-sm">
                          <span className="text-gray-500 font-medium">Кому:</span>{' '}
                          <span>{pt.receiver.lastName} {pt.receiver.firstName}</span>
                          <span className="text-gray-400 ml-1">{pt.receiver.phone}</span>
                        </div>
                        {pt.receiver.address && (
                          <div className="text-xs text-gray-500">
                            <span className="text-gray-400">Куди:</span>{' '}
                            {pt.receiver.address.city}
                            {pt.receiver.address.street ? `, ${pt.receiver.address.street}` : ''}
                            {pt.receiver.address.building ? ` ${pt.receiver.address.building}` : ''}
                            {/* ТЗ docx 01.07.26: індекс для не-UA сторони. */}
                            {pt.receiver.address.postalCode ? `, ${pt.receiver.address.postalCode}` : ''}
                            {/* ТЗ docx 02.07.26 (D1): орієнтир (коли вказано). */}
                            {pt.receiver.address.landmark ? ` (${pt.receiver.address.landmark})` : ''}
                            {pt.receiver.address.npWarehouseNum ? ` (НП №${pt.receiver.address.npWarehouseNum})` : ''}
                          </div>
                        )}
                        {/* ТЗ docx 04.10.26: «в цілях економії місця (особливо у смартфоні)
                            не відображай „Від кого“» — лишаємо шапку посилки та «Кому». */}
                        {/* ТЗ — поряд з посилкою показуємо хто її прийняв
                            (collectedBy). Допомагає розуміти контекст без
                            переходу в деталі. */}
                        {p.collectedBy && (
                          <div className="text-xs text-blue-600 mt-1">
                            ✓ Прийняв: <span className="font-medium">{p.collectedBy.fullName}</span>
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
                  {/* ТЗ docx 04.10.26: кнопку «💰 Оплачено» в рядку прибрано — оплату
                      кожної посилки приймають окремо, у самій посилці. */}
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
