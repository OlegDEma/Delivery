'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';
import { formatDate } from '@/lib/utils/format';
import { ListSkeleton } from '@/components/shared/skeleton';
import { EmptyState } from '@/components/shared/empty-state';

interface Courier {
  id: string;
  fullName: string;
  role: string;
}

interface JourneyTrip {
  id: string;
  direction: string;
  status: string;
  departureDate: string;
  _count: { parcels: number };
}

interface Journey {
  id: string;
  country: string;
  departureDate: string;
  euArrivalDate: string | null;
  euReturnDate: string | null;
  endDate: string | null;
  status: string;
  notes: string | null;
  assignedCourier: { id: string; fullName: string } | null;
  secondCourier: { id: string; fullName: string } | null;
  trips: JourneyTrip[];
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  planned: { label: 'Заплановано', color: 'bg-blue-100 text-blue-800' },
  in_progress: { label: 'В дорозі', color: 'bg-yellow-100 text-yellow-800' },
  completed: { label: 'Завершено', color: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Скасовано', color: 'bg-red-100 text-red-800' },
};

export default function JourneysPage() {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form
  const [country, setCountry] = useState<string>('NL');
  const [departureDate, setDepartureDate] = useState('');
  const [euArrivalDate, setEuArrivalDate] = useState('');
  const [euReturnDate, setEuReturnDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [courier1, setCourier1] = useState('');
  const [courier2, setCourier2] = useState('');
  const [vehicleInfo, setVehicleInfo] = useState('');
  const [notes, setNotes] = useState('');

  async function fetchJourneys() {
    setLoading(true);
    const res = await fetch('/api/journeys');
    if (res.ok) setJourneys(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    fetchJourneys();
    fetch('/api/users').then(r => r.ok ? r.json() : []).then((users: Courier[]) => {
      setCouriers(users.filter(u => u.role === 'driver_courier'));
    });
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    const res = await fetch('/api/journeys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        country, departureDate,
        euArrivalDate: euArrivalDate || undefined,
        euReturnDate: euReturnDate || undefined,
        endDate: endDate || undefined,
        assignedCourierId: courier1 || undefined,
        secondCourierId: courier2 || undefined,
        vehicleInfo: vehicleInfo || undefined,
        notes: notes || undefined,
      }),
    });

    if (res.ok) {
      setDialogOpen(false);
      setDepartureDate(''); setEuArrivalDate(''); setEuReturnDate(''); setEndDate('');
      setCourier1(''); setCourier2(''); setVehicleInfo(''); setNotes('');
      toast.success('Поїздку створено (2 рейси додано автоматично)');
      fetchJourneys();
    } else {
      const d = await res.json();
      setError(d.error || 'Помилка');
    }
    setSaving(false);
  }

  const COUNTRY_LABELS_LOCAL: Record<string, string> = { NL: 'Нідерланди', AT: 'Австрія', DE: 'Німеччина' };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Поїздки</h1>
          <p className="text-sm text-gray-500">Повний цикл: UA → країна → UA</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button>+ Нова поїздка</Button>} />
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Нова поїздка</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <Label>Країна призначення *</Label>
                <Select value={country} onValueChange={(v) => setCountry(v ?? 'NL')}>
                  <SelectTrigger><SelectValue>{COUNTRY_LABELS_LOCAL[country]}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NL">Нідерланди</SelectItem>
                    <SelectItem value="AT">Австрія</SelectItem>
                    <SelectItem value="DE">Німеччина</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="border-t pt-3 space-y-2">
                <div className="text-sm font-medium text-gray-700">📅 Дати поїздки</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Виїзд з України *</Label>
                    <Input type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} required />
                  </div>
                  <div>
                    <Label className="text-xs">Приїзд в країну</Label>
                    <Input type="date" value={euArrivalDate} onChange={(e) => setEuArrivalDate(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Виїзд з країни</Label>
                    <Input type="date" value={euReturnDate} onChange={(e) => setEuReturnDate(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Приїзд в Україну</Label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  Автоматично створиться 2 рейси: UA→{country} та {country}→UA
                </p>
              </div>

              <div className="border-t pt-3 space-y-2">
                <div className="text-sm font-medium text-gray-700">👤 Водії</div>
                <div>
                  <Label className="text-xs">Водій 1</Label>
                  <Select value={courier1} onValueChange={(v) => setCourier1(v === '_none' ? '' : (v ?? ''))}>
                    <SelectTrigger>
                      <SelectValue>{courier1 ? (couriers.find(c => c.id === courier1)?.fullName || '') : 'Не призначено'}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Не призначено</SelectItem>
                      {couriers.map(c => (<SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Водій 2 (опціонально)</Label>
                  <Select value={courier2} onValueChange={(v) => setCourier2(v === '_none' ? '' : (v ?? ''))}>
                    <SelectTrigger>
                      <SelectValue>{courier2 ? (couriers.find(c => c.id === courier2)?.fullName || '') : 'Не призначено'}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Не призначено</SelectItem>
                      {couriers.map(c => (<SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs">Транспорт</Label>
                <Input value={vehicleInfo} onChange={(e) => setVehicleInfo(e.target.value)} placeholder="Мерседес Спринтер АА1234ВВ" />
              </div>
              <div>
                <Label className="text-xs">Примітки</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? 'Створення...' : 'Створити поїздку'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <ListSkeleton />
      ) : journeys.length === 0 ? (
        <EmptyState title="Ще немає поїздок" description="Створіть першу поїздку — автоматично додасться 2 рейси" />
      ) : (
        <div className="space-y-3">
          {journeys.map(j => (
            <div key={j.id} className="bg-white rounded-lg border overflow-hidden">
              {/* Journey header */}
              <div className="p-3 flex items-start justify-between bg-gradient-to-r from-blue-50 to-transparent">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold">
                      🚐 UA → {COUNTRY_LABELS[j.country as CountryCode]} → UA
                    </span>
                    <Badge className={STATUS_MAP[j.status]?.color || ''}>
                      {STATUS_MAP[j.status]?.label || j.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-gray-500 space-x-1">
                    <span>Виїзд: {formatDate(j.departureDate)}</span>
                    {j.endDate && <span>→ Повернення: {formatDate(j.endDate)}</span>}
                  </div>
                  {j.assignedCourier && (
                    <div className="text-xs text-gray-600 mt-0.5">
                      👤 {j.assignedCourier.fullName}
                      {j.secondCourier && ` + ${j.secondCourier.fullName}`}
                    </div>
                  )}
                  {j.notes && <div className="text-xs text-gray-400 italic mt-0.5">{j.notes}</div>}
                </div>
              </div>

              {/* Child trips */}
              <div className="divide-y border-t">
                {j.trips.map(t => (
                  <Link
                    key={t.id}
                    href={`/trips/${t.id}`}
                    className="block px-4 py-2 hover:bg-gray-50 flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span>{t.direction === 'ua_to_eu' ? '➡️ UA → EU' : '⬅️ EU → UA'}</span>
                      <span className="text-xs text-gray-400">{formatDate(t.departureDate)}</span>
                      <Badge variant="secondary" className="text-xs">
                        {STATUS_MAP[t.status]?.label || t.status}
                      </Badge>
                    </div>
                    <span className="text-xs text-gray-500">📦 {t._count.parcels}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
