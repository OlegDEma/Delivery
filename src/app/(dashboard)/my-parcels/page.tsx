'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STATUS_LABELS, STATUS_COLORS, type ParcelStatusType } from '@/lib/constants/statuses';
import { formatDate, formatWeight, formatCurrency } from '@/lib/utils/format';
import { ListSkeleton } from '@/components/shared/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface ParcelItem {
  id: string;
  internalNumber: string;
  direction: string;
  status: ParcelStatusType;
  totalPlacesCount: number;
  totalWeight: number | null;
  totalCost: number | null;
  isPaid: boolean;
  createdAt: string;
  createdSource: string | null;
  createdById: string | null;
  sender: { phone: string; firstName: string; lastName: string };
  receiver: { phone: string; firstName: string; lastName: string };
  receiverAddress: { city: string; street: string | null; npWarehouseNum: string | null } | null;
}

// 3 відра за ТЗ «Логіка Кур'єр»:
// - mine       — кур'єр оформив з нуля (createdById === user.id)
// - clientOrders — клієнтські (веб/telegram), прив'язані до його поїздки
// - toDeliver  — ті, які він має віддати (ua_to_eu на його поїздці або
//                у фазі доставки в UA: at_lviv_warehouse / at_nova_poshta)
type Bucket = 'all' | 'mine' | 'clientOrders' | 'toDeliver';

const DELIVERY_PHASE: ParcelStatusType[] = [
  'at_lviv_warehouse', 'at_nova_poshta', 'at_eu_warehouse',
  'delivered_ua', 'delivered_eu',
];

export default function MyParcelsPage() {
  const { user } = useAuth();
  const [parcels, setParcels] = useState<ParcelItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [bucket, setBucket] = useState<Bucket>('all');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const fetchParcels = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const params = new URLSearchParams();
    params.set('courierId', user.id);
    params.set('limit', '50');
    if (search) params.set('q', search);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (senderPhone) params.set('senderPhone', senderPhone);
    if (receiverPhone) params.set('receiverPhone', receiverPhone);

    const res = await fetch(`/api/parcels?${params}`);
    if (res.ok) {
      const data = await res.json();
      setParcels(data.parcels);
      setTotal(data.total);
    }
    setLoading(false);
  }, [user, search, statusFilter, dateFrom, dateTo, senderPhone, receiverPhone]);

  useEffect(() => {
    const timer = setTimeout(fetchParcels, 300);
    return () => clearTimeout(timer);
  }, [fetchParcels]);

  // Bucket filtering — клієнт-сайдом, щоб не переробляти /api/parcels.
  // API вже віддає лише посилки, прив'язані до цього кур'єра (`courierId`),
  // тож нам залишається розсортувати їх на 3 відра.
  const visibleParcels = parcels.filter((p) => {
    if (bucket === 'all') return true;
    if (bucket === 'mine') return p.createdById === user?.id;
    if (bucket === 'clientOrders') {
      return p.createdSource === 'client_web' || p.createdSource === 'client_telegram';
    }
    if (bucket === 'toDeliver') {
      return p.direction === 'ua_to_eu' || DELIVERY_PHASE.includes(p.status);
    }
    return true;
  });

  // Counters — для бейджів на табах.
  const counts = {
    all: parcels.length,
    mine: parcels.filter((p) => p.createdById === user?.id).length,
    clientOrders: parcels.filter((p) =>
      p.createdSource === 'client_web' || p.createdSource === 'client_telegram'
    ).length,
    toDeliver: parcels.filter((p) =>
      p.direction === 'ua_to_eu' || DELIVERY_PHASE.includes(p.status)
    ).length,
  };

  // Totals — по видимим в активному відрі.
  const totalWeight = visibleParcels.reduce((s, p) => s + (Number(p.totalWeight) || 0), 0);
  const totalMoney = visibleParcels.reduce((s, p) => s + (Number(p.totalCost) || 0), 0);
  const paidMoney = visibleParcels.filter(p => p.isPaid).reduce((s, p) => s + (Number(p.totalCost) || 0), 0);
  const unpaidMoney = totalMoney - paidMoney;

  const STATUS_FILTER_LABELS: Record<string, string> = {
    all: 'Всі статуси',
    accepted_for_transport_to_ua: 'Прийнято (→UA)',
    in_transit_to_ua: 'В дорозі (→UA)',
    accepted_for_transport_to_eu: 'Прийнято (→EU)',
    in_transit_to_eu: 'В дорозі (→EU)',
    delivered_eu: 'Доставлено (EU)',
    not_received: 'Не отримано',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-2xl font-bold">Мої посилки</h1>
          <p className="text-sm text-gray-500">{total} всього</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            Фільтри {showFilters ? '▲' : '▼'}
          </Button>
          <Link href="/parcels/new"><Button>+ Створити</Button></Link>
        </div>
      </div>

      {/* 3 відра за ТЗ «Логіка Кур'єр»: з нуля мною / клієнтські / на віддачу */}
      <Tabs value={bucket} onValueChange={(v) => setBucket((v as Bucket) ?? 'all')}>
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="all">
            Всі <span className={cn('ml-1.5 text-xs', bucket === 'all' ? 'opacity-70' : 'text-gray-400')}>{counts.all}</span>
          </TabsTrigger>
          <TabsTrigger value="mine">
            Оформив сам <span className={cn('ml-1.5 text-xs', bucket === 'mine' ? 'opacity-70' : 'text-gray-400')}>{counts.mine}</span>
          </TabsTrigger>
          <TabsTrigger value="clientOrders">
            До прийому <span className={cn('ml-1.5 text-xs', bucket === 'clientOrders' ? 'opacity-70' : 'text-gray-400')}>{counts.clientOrders}</span>
          </TabsTrigger>
          <TabsTrigger value="toDeliver">
            На видачу <span className={cn('ml-1.5 text-xs', bucket === 'toDeliver' ? 'opacity-70' : 'text-gray-400')}>{counts.toDeliver}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <div className="bg-white rounded-lg border p-3">
          <div className="text-xs text-gray-500">Вага</div>
          <div className="text-lg font-bold">{formatWeight(totalWeight)}</div>
        </div>
        <div className="bg-white rounded-lg border p-3">
          <div className="text-xs text-gray-500">Всього до оплати</div>
          <div className="text-lg font-bold">{formatCurrency(totalMoney, 'EUR')}</div>
        </div>
        <div className="bg-white rounded-lg border p-3">
          <div className="text-xs text-gray-500">Отримано</div>
          <div className="text-lg font-bold text-green-600">{formatCurrency(paidMoney, 'EUR')}</div>
        </div>
        <div className="bg-white rounded-lg border p-3">
          <div className="text-xs text-gray-500">Не оплачено</div>
          <div className="text-lg font-bold text-red-600">{formatCurrency(unpaidMoney, 'EUR')}</div>
        </div>
      </div>

      {/* Search + status filter */}
      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Пошук..." className="text-base md:max-w-xs" />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? 'all')}>
          <SelectTrigger className="md:w-56"><SelectValue>{STATUS_FILTER_LABELS[statusFilter]}</SelectValue></SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_FILTER_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Extended filters */}
      {showFilters && (
        <div className="bg-white rounded-lg border p-3 mb-4 grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <Label className="text-xs">Дата від</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Дата до</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Тел. відправника</Label>
            <Input value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} placeholder="380..." />
          </div>
          <div>
            <Label className="text-xs">Тел. отримувача</Label>
            <Input value={receiverPhone} onChange={(e) => setReceiverPhone(e.target.value)} placeholder="380..." />
          </div>
        </div>
      )}

      {loading ? (
        <ListSkeleton />
      ) : (
        <div className="bg-white rounded-lg border divide-y">
          {visibleParcels.map((p) => (
            <Link key={p.id} href={`/parcels/${p.id}`} className="block p-3 hover:bg-gray-50">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-sm font-medium">{p.internalNumber}</span>
                    <Badge className={`text-xs ${STATUS_COLORS[p.status]}`}>{STATUS_LABELS[p.status]}</Badge>
                    {!p.isPaid && p.totalCost && <Badge variant="destructive" className="text-xs">Не оплачено</Badge>}
                  </div>
                  <div className="text-sm">
                    {p.receiver.lastName} {p.receiver.firstName}
                    <span className="text-gray-400 ml-1">{p.receiver.phone}</span>
                  </div>
                  {p.receiverAddress && (
                    <div className="text-xs text-gray-400">
                      {p.receiverAddress.city}{p.receiverAddress.street ? `, ${p.receiverAddress.street}` : ''}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-gray-400">{formatDate(p.createdAt)}</div>
                  <div className="text-sm font-medium">{p.totalWeight ? `${Number(p.totalWeight).toFixed(1)} кг` : '—'}</div>
                  {p.totalCost && <div className="text-xs text-gray-500">{formatCurrency(Number(p.totalCost), 'EUR')}</div>}
                </div>
              </div>
            </Link>
          ))}
          {visibleParcels.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              {bucket === 'mine' && 'Ще немає посилок, які ви оформили самі'}
              {bucket === 'clientOrders' && 'На ваших поїздках немає клієнтських замовлень'}
              {bucket === 'toDeliver' && 'Немає посилок на видачу'}
              {bucket === 'all' && 'Немає закріплених посилок'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
