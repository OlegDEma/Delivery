'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS, STATUS_COLORS, type ParcelStatusType } from '@/lib/constants/statuses';
import { formatDate } from '@/lib/utils/format';

interface ParcelItem {
  id: string;
  internalNumber: string;
  status: ParcelStatusType;
  direction: string;
  totalPlacesCount: number;
  totalWeight: number | null;
  totalCost: number | null;
  createdAt: string;
  createdSource: string;
  sender: { firstName: string; lastName: string; phone: string };
  receiver: { firstName: string; lastName: string; phone: string };
  receiverAddress: { city: string; street: string | null } | null;
}

export default function AvailableParcelsPage() {
  const [parcels, setParcels] = useState<ParcelItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const fetchParcels = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('unassigned', '1');
    params.set('limit', '50');
    if (search) params.set('q', search);
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
  }, [search, dateFrom, dateTo, senderPhone, receiverPhone]);

  useEffect(() => {
    const timer = setTimeout(fetchParcels, 300);
    return () => clearTimeout(timer);
  }, [fetchParcels]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Доступні посилки</h1>
          <p className="text-sm text-gray-500">{total} незакріплених</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            Фільтри {showFilters ? '▲' : '▼'}
          </Button>
          <Link href="/parcels/new"><Button>+ Створити</Button></Link>
        </div>
      </div>

      <div className="mb-4">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Пошук: прізвище, телефон, ІТН..." className="text-base max-w-md" />
      </div>

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
        <div className="text-center py-12 text-gray-500">Завантаження...</div>
      ) : (
        <div className="bg-white rounded-lg border divide-y">
          {parcels.map(p => (
            <Link key={p.id} href={`/parcels/${p.id}`} className="block p-3 hover:bg-gray-50">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-sm font-medium">{p.internalNumber}</span>
                    <Badge className={`text-xs ${STATUS_COLORS[p.status]}`}>{STATUS_LABELS[p.status]}</Badge>
                    {p.createdSource === 'client_web' && <Badge variant="secondary" className="text-xs">Сайт</Badge>}
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-500">Від:</span> {p.sender.lastName} {p.sender.firstName} <span className="text-gray-400">{p.sender.phone}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-500">Кому:</span> {p.receiver.lastName} {p.receiver.firstName} <span className="text-gray-400">{p.receiver.phone}</span>
                  </div>
                  {p.receiverAddress && <div className="text-xs text-gray-400">{p.receiverAddress.city}{p.receiverAddress.street ? `, ${p.receiverAddress.street}` : ''}</div>}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-gray-400">{formatDate(p.createdAt)}</div>
                  <div className="text-sm font-medium">{p.totalWeight ? `${Number(p.totalWeight).toFixed(1)} кг` : '—'}</div>
                </div>
              </div>
            </Link>
          ))}
          {parcels.length === 0 && <div className="text-center py-8 text-gray-500">Всі посилки закріплені</div>}
        </div>
      )}
    </div>
  );
}
