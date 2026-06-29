'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  COUNTRY_LABELS, COUNTRY_LABELS_ACCUSATIVE, COUNTRY_LABELS_GENITIVE, tripRouteLabel, type CountryCode,
} from '@/lib/constants/countries';
import { WEEKDAYS, WEEKDAY_LABELS_FULL } from '@/lib/constants/collection';
import { formatDateWithWeekday } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
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
  vehicleInfo: string | null;
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

const EU_COUNTRY_LABELS: Record<string, string> = { NL: 'Нідерланди', AT: 'Австрія', DE: 'Німеччина' };

export default function JourneysPage() {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ── Форма СТВОРЕННЯ (ТЗ L3d «перша частина»): лише країна + дати/дні ──
  const [country, setCountry] = useState<string>('NL');
  // ТЗ L3b: режим планування — по датах або по днях тижня.
  const [scheduleMode, setScheduleMode] = useState<'dates' | 'weekdays'>('dates');
  const [departureDate, setDepartureDate] = useState('');
  const [euArrivalDate, setEuArrivalDate] = useState('');
  const [euReturnDate, setEuReturnDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [weekdayStart, setWeekdayStart] = useState('');
  const [wdDeparture, setWdDeparture] = useState('');
  const [wdEuArrival, setWdEuArrival] = useState('');
  const [wdEuReturn, setWdEuReturn] = useState('');
  const [wdEnd, setWdEnd] = useState('');
  // ТЗ L3c: циклічність — щотижневе повторення протягом періоду.
  const [cyclic, setCyclic] = useState(false);
  const [cyclicPeriod, setCyclicPeriod] = useState<'3m' | '6m' | '1y'>('3m');

  // ── Діалог РЕДАГУВАННЯ (ТЗ L3d «друга частина»): водії/транспорт/примітки ──
  const [editJourney, setEditJourney] = useState<Journey | null>(null);
  const [editCourier1, setEditCourier1] = useState('');
  const [editCourier2, setEditCourier2] = useState('');
  const [editVehicle, setEditVehicle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSaving, setEditSaving] = useState(false);

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

  const accusative = COUNTRY_LABELS_ACCUSATIVE[country as CountryCode];
  const genitive = COUNTRY_LABELS_GENITIVE[country as CountryCode];

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    const res = await fetch('/api/journeys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        country, scheduleMode,
        // режим по датах
        departureDate: scheduleMode === 'dates' ? departureDate : undefined,
        euArrivalDate: euArrivalDate || undefined,
        euReturnDate: euReturnDate || undefined,
        endDate: endDate || undefined,
        // режим по днях тижня
        weekdayStart: scheduleMode === 'weekdays' ? (weekdayStart || undefined) : undefined,
        weekdays: scheduleMode === 'weekdays'
          ? { departure: wdDeparture, euArrival: wdEuArrival, euReturn: wdEuReturn, end: wdEnd }
          : undefined,
        // циклічність
        cyclic,
        cyclicPeriod: cyclic ? cyclicPeriod : undefined,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setDialogOpen(false);
      setDepartureDate(''); setEuArrivalDate(''); setEuReturnDate(''); setEndDate('');
      setWeekdayStart(''); setWdDeparture(''); setWdEuArrival(''); setWdEuReturn(''); setWdEnd('');
      setCyclic(false); setScheduleMode('dates');
      toast.success(
        data.count > 1
          ? `Створено ${data.count} поїздок (по 2 рейси кожна)`
          : 'Поїздку створено (2 рейси додано автоматично)'
      );
      fetchJourneys();
    } else {
      const d = await res.json();
      setError(d.error || 'Помилка');
    }
    setSaving(false);
  }

  function openEdit(j: Journey) {
    setEditJourney(j);
    setEditCourier1(j.assignedCourier?.id || '');
    setEditCourier2(j.secondCourier?.id || '');
    setEditVehicle(j.vehicleInfo || '');
    setEditNotes(j.notes || '');
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editJourney) return;
    setEditSaving(true);
    const res = await fetch(`/api/journeys?id=${editJourney.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assignedCourierId: editCourier1 || null,
        secondCourierId: editCourier2 || null,
        vehicleInfo: editVehicle || null,
        notes: editNotes || null,
      }),
    });
    setEditSaving(false);
    if (res.ok) {
      toast.success('Збережено');
      setEditJourney(null);
      fetchJourneys();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || 'Помилка');
    }
  }

  // ТЗ docx 20.06.26: видалення поїздки (з усіма рейсами). Посилки лише
  // відв'язуються від рейсів (бекенд), самі поїздка+рейси зникають.
  async function handleDeleteJourney(j: Journey) {
    if (!confirm('Видалити поїздку разом з усіма її рейсами? Прив\'язані посилки буде відв\'язано (не видалено).')) return;
    const res = await fetch(`/api/journeys?id=${j.id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Поїздку видалено');
      fetchJourneys();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || 'Помилка видалення');
    }
  }

  // Підпис напрямку рейсу з КОНКРЕТНОЮ країною (ТЗ L2 — замість «EU»).
  // ТЗ docx 29.06.26 «Рейси»: країна виїзду першою, стрілка завжди вправо (→).
  function tripLabel(direction: string, c: string) {
    return tripRouteLabel(c, direction);
  }

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
            {/* ТЗ L3d «перша частина»: при створенні — лише країна + дати/дні.
                Водії/транспорт/примітки вносяться пізніше через «Редагувати». */}
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <Label>Країна призначення *</Label>
                <Select value={country} onValueChange={(v) => setCountry(v ?? 'NL')}>
                  <SelectTrigger><SelectValue>{EU_COUNTRY_LABELS[country]}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NL">Нідерланди</SelectItem>
                    <SelectItem value="AT">Австрія</SelectItem>
                    <SelectItem value="DE">Німеччина</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* ТЗ L3b: перемикач режиму планування. */}
              <div className="flex gap-2 border-t pt-3">
                <button
                  type="button"
                  onClick={() => setScheduleMode('dates')}
                  className={cn('text-xs px-3 py-1.5 rounded border transition-colors',
                    scheduleMode === 'dates' ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50')}
                >
                  По датах
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleMode('weekdays')}
                  className={cn('text-xs px-3 py-1.5 rounded border transition-colors',
                    scheduleMode === 'weekdays' ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50')}
                >
                  По днях тижня
                </button>
              </div>

              {scheduleMode === 'dates' ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-700">📅 Дати поїздки</div>
                  <div className="grid grid-cols-2 gap-2">
                    {/* ТЗ L3a: лейбли з назвою країни призначення. */}
                    <div>
                      <Label className="text-xs">Виїзд з України *</Label>
                      <Input type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} required />
                    </div>
                    <div>
                      <Label className="text-xs">Приїзд в {accusative}</Label>
                      <Input type="date" value={euArrivalDate} onChange={(e) => setEuArrivalDate(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Виїзд з {genitive}</Label>
                      <Input type="date" value={euReturnDate} onChange={(e) => setEuReturnDate(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Приїзд в Україну</Label>
                      <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-700">📅 Дні тижня</div>
                  <div>
                    <Label className="text-xs">Перший тиждень з *</Label>
                    <Input type="date" value={weekdayStart} onChange={(e) => setWeekdayStart(e.target.value)} required />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <WeekdaySelect label="Виїзд з України *" value={wdDeparture} onChange={setWdDeparture} />
                    <WeekdaySelect label={`Приїзд в ${accusative}`} value={wdEuArrival} onChange={setWdEuArrival} />
                    <WeekdaySelect label={`Виїзд з ${genitive}`} value={wdEuReturn} onChange={setWdEuReturn} />
                    <WeekdaySelect label="Приїзд в Україну" value={wdEnd} onChange={setWdEnd} />
                  </div>
                </div>
              )}

              {/* ТЗ L3c: циклічність. */}
              <div className="border-t pt-3 space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={cyclic} onCheckedChange={(c) => setCyclic(c === true)} />
                  Циклічність (повторювати щотижня)
                </label>
                {cyclic && (
                  <div>
                    <Label className="text-xs">Період повторення</Label>
                    <Select value={cyclicPeriod} onValueChange={(v) => setCyclicPeriod((v ?? '3m') as '3m' | '6m' | '1y')}>
                      <SelectTrigger>
                        <SelectValue>
                          {cyclicPeriod === '3m' ? 'Три місяці' : cyclicPeriod === '6m' ? 'Півроку' : 'Рік'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3m">Три місяці</SelectItem>
                        <SelectItem value="6m">Півроку</SelectItem>
                        <SelectItem value="1y">Рік</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-400">
                Автоматично створиться 2 рейси на поїздку: UA→{country} та {country}→UA.
                {' '}Водіїв і транспорт можна вказати пізніше, відкривши поїздку («Редагувати»).
              </p>

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
                  {/* ТЗ L1: день тижня + дата. */}
                  <div className="text-xs text-gray-500 space-x-1">
                    <span>Виїзд: {formatDateWithWeekday(j.departureDate)}</span>
                    {j.endDate && <span>→ Повернення: {formatDateWithWeekday(j.endDate)}</span>}
                  </div>
                  {j.assignedCourier && (
                    <div className="text-xs text-gray-600 mt-0.5">
                      👤 {j.assignedCourier.fullName}
                      {j.secondCourier && ` + ${j.secondCourier.fullName}`}
                    </div>
                  )}
                  {j.vehicleInfo && <div className="text-xs text-gray-500 mt-0.5">🚛 {j.vehicleInfo}</div>}
                  {j.notes && <div className="text-xs text-gray-400 italic mt-0.5">{j.notes}</div>}
                </div>
                {/* ТЗ docx 20.06.26: «Видалити» під «Редагувати». */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(j)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800"
                  >
                    Редагувати
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteJourney(j)}
                    className="text-xs font-medium text-red-600 hover:text-red-800"
                  >
                    Видалити
                  </button>
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
                      <span>{tripLabel(t.direction, j.country)}</span>
                      <span className="text-xs text-gray-400">{formatDateWithWeekday(t.departureDate)}</span>
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

      {/* ТЗ L3d «друга частина»: редагування існуючої поїздки. */}
      <Dialog open={!!editJourney} onOpenChange={(o) => { if (!o) setEditJourney(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Редагувати поїздку
              {editJourney && (
                <span className="text-xs font-normal text-gray-500 ml-2">
                  UA → {COUNTRY_LABELS[editJourney.country as CountryCode]} → UA
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {editJourney && (
            <form onSubmit={handleEditSave} className="space-y-3">
              <div className="text-sm font-medium text-gray-700">👤 Водії</div>
              <div>
                <Label className="text-xs">Водій 1</Label>
                <Select value={editCourier1} onValueChange={(v) => setEditCourier1(v === '_none' ? '' : (v ?? ''))}>
                  <SelectTrigger>
                    <SelectValue>{editCourier1 ? (couriers.find(c => c.id === editCourier1)?.fullName || '') : 'Не призначено'}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Не призначено</SelectItem>
                    {couriers.map(c => (<SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Водій 2 (опціонально)</Label>
                <Select value={editCourier2} onValueChange={(v) => setEditCourier2(v === '_none' ? '' : (v ?? ''))}>
                  <SelectTrigger>
                    <SelectValue>{editCourier2 ? (couriers.find(c => c.id === editCourier2)?.fullName || '') : 'Не призначено'}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Не призначено</SelectItem>
                    {couriers.map(c => (<SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Транспорт</Label>
                <Input value={editVehicle} onChange={(e) => setEditVehicle(e.target.value)} placeholder="Мерседес Спринтер АА1234ВВ" />
              </div>
              <div>
                <Label className="text-xs">Примітки</Label>
                <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={editSaving}>
                {editSaving ? 'Збереження...' : 'Зберегти'}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Селектор дня тижня (ТЗ L3b). */
function WeekdaySelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v ?? '')}>
        <SelectTrigger>
          <SelectValue>
            {value ? WEEKDAY_LABELS_FULL[value as keyof typeof WEEKDAY_LABELS_FULL] : <span className="text-gray-400">День…</span>}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {WEEKDAYS.map(w => (
            <SelectItem key={w} value={w}>{WEEKDAY_LABELS_FULL[w]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
