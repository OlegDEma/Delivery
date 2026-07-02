'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COUNTRY_LABELS, tripRouteLabel, type CountryCode } from '@/lib/constants/countries';
import { formatDateWithWeekday } from '@/lib/utils/format';
import { ListSkeleton } from '@/components/shared/skeleton';
import { EmptyState } from '@/components/shared/empty-state';

interface Trip {
  id: string;
  direction: string;
  country: string;
  departureDate: string;
  arrivalDate: string | null;
  status: string;
  assignedCourier: { id: string; fullName: string } | null;
  secondCourier: { id: string; fullName: string } | null;
  notes: string | null;
  _count: { parcels: number; routeTasks: number };
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  planned: { label: 'Заплановано', color: 'bg-blue-100 text-blue-800' },
  in_progress: { label: 'В дорозі', color: 'bg-yellow-100 text-yellow-800' },
  completed: { label: 'Завершено', color: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Скасовано', color: 'bg-red-100 text-red-800' },
};

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form
  const [direction, setDirection] = useState('eu_to_ua');
  const [country, setCountry] = useState('NL');
  const [departureDate, setDepartureDate] = useState('');
  const [notes, setNotes] = useState('');
  const [passengerCapacity, setPassengerCapacity] = useState('');

  // ТЗ docx 01.07.26: inline «Редагувати(дата)»/«Видалити» на кожному рейсі
  // (візуально як у вкладці Поїздки).
  const [editTrip, setEditTrip] = useState<Trip | null>(null);
  const [editDep, setEditDep] = useState('');
  const [editArr, setEditArr] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  async function fetchTrips() {
    setLoading(true);
    const res = await fetch('/api/trips');
    if (res.ok) setTrips(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchTrips(); }, []);

  function openEditTrip(trip: Trip) {
    setEditTrip(trip);
    setEditDep(trip.departureDate ? String(trip.departureDate).slice(0, 10) : '');
    setEditArr(trip.arrivalDate ? String(trip.arrivalDate).slice(0, 10) : '');
  }

  async function handleEditDatesSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editTrip || !editDep) { toast.error('Вкажіть дату виїзду'); return; }
    setEditSaving(true);
    const res = await fetch(`/api/trips/${editTrip.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ departureDate: editDep, arrivalDate: editArr || null }),
    });
    setEditSaving(false);
    if (res.ok) { toast.success('Дати рейсу оновлено'); setEditTrip(null); fetchTrips(); }
    else { const d = await res.json().catch(() => ({})); toast.error(d.error || 'Помилка'); }
  }

  async function handleDeleteTrip(trip: Trip) {
    if (!confirm('Видалити цей рейс? Посилки буде відв\'язано від рейсу (вони залишаться в системі), а маршрутні задачі та пасажирів — видалено.')) return;
    const res = await fetch(`/api/trips/${trip.id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Рейс видалено'); fetchTrips(); }
    else { const d = await res.json().catch(() => ({})); toast.error(d.error || 'Не вдалося видалити'); }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    const res = await fetch('/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        direction, country, departureDate,
        notes: notes || undefined,
        passengerCapacity: passengerCapacity ? Number(passengerCapacity) : 0,
      }),
    });

    if (res.ok) {
      setDialogOpen(false);
      setDepartureDate('');
      setNotes('');
      setPassengerCapacity('');
      fetchTrips();
    } else {
      const data = await res.json();
      setError(data.error || 'Помилка');
    }
    setSaving(false);
  }

  const DIRECTION_LABELS: Record<string, string> = { eu_to_ua: 'Європа → Україна', ua_to_eu: 'Україна → Європа' };
  const TRIP_COUNTRY_LABELS: Record<string, string> = { NL: 'Нідерланди', AT: 'Австрія', DE: 'Німеччина' };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Рейси</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button>+ Новий рейс</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Новий рейс</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <Label>Напрямок</Label>
                <Select value={direction} onValueChange={(v) => setDirection(v ?? '')}>
                  <SelectTrigger><SelectValue>{DIRECTION_LABELS[direction]}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eu_to_ua">Європа → Україна</SelectItem>
                    <SelectItem value="ua_to_eu">Україна → Європа</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Країна</Label>
                <Select value={country} onValueChange={(v) => setCountry(v ?? '')}>
                  <SelectTrigger><SelectValue>{TRIP_COUNTRY_LABELS[country]}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NL">Нідерланди</SelectItem>
                    <SelectItem value="AT">Австрія</SelectItem>
                    <SelectItem value="DE">Німеччина</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Дата відправлення</Label>
                <Input type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} required />
              </div>
              <div>
                <Label>Місткість пасажирів</Label>
                <Input
                  type="number" min={0} max={99}
                  value={passengerCapacity}
                  onChange={(e) => setPassengerCapacity(e.target.value)}
                  placeholder="0 — не возимо пасажирів"
                />
              </div>
              <div>
                <Label>Примітки</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? 'Збереження...' : 'Створити'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <ListSkeleton />
      ) : trips.length === 0 ? (
        <EmptyState title="Ще немає рейсів" />
      ) : (
        <div className="bg-white rounded-lg border divide-y">
          {trips.map(trip => (
            <div key={trip.id} className="p-3 hover:bg-gray-50 flex items-start justify-between gap-2">
              {/* Клікабельна частина — деталі рейсу. Кнопки поза Link (не вкладаються). */}
              <Link href={`/trips/${trip.id}`} className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium">
                    {tripRouteLabel(trip.country, trip.direction)}
                  </span>
                  <Badge className={STATUS_MAP[trip.status]?.color || ''}>
                    {STATUS_MAP[trip.status]?.label || trip.status}
                  </Badge>
                </div>
                <div className="text-sm text-gray-600">
                  {/* ТЗ L1/01.07.26: день тижня + дата. */}
                  {formatDateWithWeekday(trip.departureDate)}
                  {trip.arrivalDate && ` → ${formatDateWithWeekday(trip.arrivalDate)}`}
                  {trip.assignedCourier && ` | ${trip.assignedCourier.fullName}`}
                </div>
                {trip.notes && <div className="text-xs text-gray-400 mt-0.5">{trip.notes}</div>}
              </Link>
              <div className="text-right text-sm shrink-0">
                <div className="font-medium">{trip._count.parcels} посилок</div>
                <div className="text-xs text-gray-400">{trip._count.routeTasks} заїздів</div>
                {/* ТЗ docx 01.07.26: inline «Редагувати(дата)»/«Видалити» як у Поїздках. */}
                <div className="flex flex-col items-end gap-0.5 mt-1">
                  <button
                    type="button"
                    onClick={() => openEditTrip(trip)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800"
                  >
                    Редагувати
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTrip(trip)}
                    className="text-xs font-medium text-red-600 hover:text-red-800"
                  >
                    Видалити
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ТЗ docx 01.07.26: редагування дат рейсу (як у Поїздках). */}
      <Dialog open={!!editTrip} onOpenChange={(o) => { if (!o) setEditTrip(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Редагувати дати рейсу
              {editTrip && (
                <span className="text-xs font-normal text-gray-500 ml-2">
                  {tripRouteLabel(editTrip.country, editTrip.direction)}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditDatesSave} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Дата виїзду *</Label>
                <Input type="date" value={editDep} onChange={(e) => setEditDep(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Дата прибуття</Label>
                <Input type="date" value={editArr} onChange={(e) => setEditArr(e.target.value)} />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={editSaving || !editDep}>
              {editSaving ? 'Збереження…' : 'Зберегти дати'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
