'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
  // ТЗ docx 02.07.26 (D11): кількість місць для пасажирів + лічильник призначених.
  passengerCapacity: number;
  _count: { parcels: number; routeTasks: number; passengers: number };
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  planned: { label: 'Заплановано', color: 'bg-blue-100 text-blue-800' },
  in_progress: { label: 'В дорозі', color: 'bg-yellow-100 text-yellow-800' },
  completed: { label: 'Завершено', color: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Скасовано', color: 'bg-red-100 text-red-800' },
};

const DIRECTION_LABELS: Record<string, string> = { eu_to_ua: 'Європа → Україна', ua_to_eu: 'Україна → Європа' };
const TRIP_COUNTRY_LABELS: Record<string, string> = { NL: 'Нідерланди', AT: 'Австрія', DE: 'Німеччина' };

type GroupBy = 'none' | 'country' | 'direction';

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

  // ТЗ docx 01.07.26: inline «Редагувати(дата)»/«Видалити» на кожному рейсі.
  const [editTrip, setEditTrip] = useState<Trip | null>(null);
  const [editDep, setEditDep] = useState('');
  const [editArr, setEditArr] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // ТЗ docx 02.07.26 (D11): груповий вибір + групування + масова «кількість місць».
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  // ТЗ docx 09.07.26: фільтри за країною та напрямком. На відміну від
  // групування ПРИХОВУЮТЬ нерелевантні рейси (показують лише відповідні).
  const [filterCountry, setFilterCountry] = useState<string>('');
  const [filterDirection, setFilterDirection] = useState<string>('');
  // ТЗ docx 09.07.26: авто-фокус на рейс поточної дати при відкритті вкладки
  // + повернення «курсора» на щойно відредагований рейс після reload.
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const didInitialFocus = useRef(false);
  const pendingFocusId = useRef<string | null>(null);
  const [capDialogOpen, setCapDialogOpen] = useState(false);
  const [bulkCapacity, setBulkCapacity] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  async function fetchTrips() {
    setLoading(true);
    const res = await fetch('/api/trips');
    if (res.ok) setTrips(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchTrips(); }, []);

  // ── ТЗ docx 09.07.26: авто-фокус на найближчий рейс ─────────────
  // Рейс, найближчий до сьогодні за датою виїзду (серед переданого списку).
  function nearestTripId(list: Trip[]): string | null {
    if (list.length === 0) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let bestId: string | null = null;
    let bestDiff = Infinity;
    for (const t of list) {
      if (!t.departureDate) continue;
      const d = new Date(t.departureDate); d.setHours(0, 0, 0, 0);
      const diff = Math.abs(d.getTime() - today.getTime());
      if (diff < bestDiff) { bestDiff = diff; bestId = t.id; }
    }
    return bestId;
  }

  // Прокрутити рядок рейсу в центр екрана + короткий підсвіт («курсор»).
  // behavior:'auto' (миттєво) — надійно спрацьовує навіть коли вкладку ще не
  // видно (smooth-скрол у прихованій вкладці браузер не виконує).
  function focusRow(id: string | null) {
    if (!id) return;
    const el = rowRefs.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'auto', block: 'center' });
    el.classList.add('ring-2', 'ring-blue-400', 'ring-offset-1');
    setTimeout(() => el.classList.remove('ring-2', 'ring-blue-400', 'ring-offset-1'), 2200);
  }

  // Один раз після першого завантаження — фокус на рейс поточної дати.
  // setTimeout (а не requestAnimationFrame): rAF призупиняється у прихованій/
  // фоновій вкладці, тож автофокус би не спрацював при відкритті в новій вкладці.
  useEffect(() => {
    if (loading || trips.length === 0 || didInitialFocus.current) return;
    didInitialFocus.current = true;
    setTimeout(() => focusRow(nearestTripId(trips)), 60);
  }, [loading, trips]);

  // Після редагування дат рейсу список перезавантажується — повертаємо
  // «курсор» на той самий рейс (ТЗ docx 09.07.26).
  useEffect(() => {
    const id = pendingFocusId.current;
    if (id && trips.some(t => t.id === id)) {
      pendingFocusId.current = null;
      setTimeout(() => focusRow(id), 60);
    }
  }, [trips]);

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
    if (res.ok) {
      // ТЗ docx 09.07.26: після reload повернути курсор на цей же рейс.
      pendingFocusId.current = editTrip.id;
      toast.success('Дати рейсу оновлено');
      setEditTrip(null);
      fetchTrips();
    }
    else { const d = await res.json().catch(() => ({})); toast.error(d.error || 'Помилка'); }
  }

  async function handleDeleteTrip(trip: Trip) {
    if (!confirm('Видалити цей рейс? Посилки буде відв\'язано від рейсу (вони залишаться в системі), а маршрутні задачі та пасажирів — видалено.')) return;
    const res = await fetch(`/api/trips/${trip.id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Рейс видалено'); fetchTrips(); }
    else { const d = await res.json().catch(() => ({})); toast.error(d.error || 'Не вдалося видалити'); }
  }

  // ── Груповий вибір ──────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAllVisible() {
    // «Вибрати всі» діє на ВИДИМІ рейси (з урахуванням фільтрів).
    const visible = trips.filter(t =>
      (!filterCountry || t.country === filterCountry) &&
      (!filterDirection || t.direction === filterDirection)
    );
    setSelectedIds(prev => {
      const allSel = visible.length > 0 && visible.every(t => prev.has(t.id));
      const next = new Set(prev);
      if (allSel) visible.forEach(t => next.delete(t.id));
      else visible.forEach(t => next.add(t.id));
      return next;
    });
  }
  function clearSelection() { setSelectedIds(new Set()); }

  const selectedTrips = trips.filter(t => selectedIds.has(t.id));

  async function handleBulkDelete() {
    if (selectedTrips.length === 0) return;
    if (!confirm(`Видалити вибрані рейси (${selectedTrips.length})? Посилки буде відв'язано (лишаться в системі), маршрутні задачі та пасажирів — видалено.`)) return;
    setBulkSaving(true);
    const results = await Promise.all(selectedTrips.map(t =>
      fetch(`/api/trips/${t.id}`, { method: 'DELETE' }).then(r => r.ok).catch(() => false)
    ));
    setBulkSaving(false);
    const ok = results.filter(Boolean).length;
    if (ok === results.length) toast.success(`Видалено рейсів: ${ok}`);
    else toast.error(`Видалено ${ok}/${results.length}; частину не вдалося видалити`);
    clearSelection();
    fetchTrips();
  }

  async function handleBulkSetCapacity(e: React.FormEvent) {
    e.preventDefault();
    if (selectedTrips.length === 0) return;
    const cap = Number(bulkCapacity);
    if (!Number.isFinite(cap) || cap < 0) { toast.error('Вкажіть невідʼємне число місць'); return; }
    // ТЗ docx 02.07.26 (D11): попереджаємо (але дозволяємо), якщо занижуємо нижче
    // вже призначених пасажирів у якомусь із рейсів.
    const conflicting = selectedTrips.filter(t => cap < t._count.passengers);
    if (conflicting.length > 0) {
      const ok = confirm(
        `У ${conflicting.length} рейс(ах) уже призначено більше пасажирів, ніж ${cap} місць. ` +
        `Все одно встановити ${cap}? (наявні пасажири залишаться, але місць буде менше)`
      );
      if (!ok) return;
    }
    setBulkSaving(true);
    const results = await Promise.all(selectedTrips.map(t =>
      fetch(`/api/trips/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passengerCapacity: cap }),
      }).then(r => r.ok).catch(() => false)
    ));
    setBulkSaving(false);
    const ok = results.filter(Boolean).length;
    if (ok === results.length) toast.success(`Оновлено місць у рейсах: ${ok}`);
    else toast.error(`Оновлено ${ok}/${results.length}`);
    setCapDialogOpen(false);
    setBulkCapacity('');
    clearSelection();
    fetchTrips();
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
      setDepartureDate(''); setNotes(''); setPassengerCapacity('');
      fetchTrips();
    } else {
      const data = await res.json();
      setError(data.error || 'Помилка');
    }
    setSaving(false);
  }

  // ── ТЗ docx 09.07.26: спершу ФІЛЬТР (ховає інші), потім групування ──
  const filteredTrips = trips.filter(t =>
    (!filterCountry || t.country === filterCountry) &&
    (!filterDirection || t.direction === filterDirection)
  );
  const groups: { key: string; label: string; items: Trip[] }[] = (() => {
    if (groupBy === 'none') return [{ key: '', label: '', items: filteredTrips }];
    const map = new Map<string, Trip[]>();
    for (const t of filteredTrips) {
      const key = groupBy === 'country' ? t.country : t.direction;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return [...map.entries()].map(([key, items]) => ({
      key,
      label: groupBy === 'country'
        ? (COUNTRY_LABELS[key as CountryCode] || key)
        : (DIRECTION_LABELS[key] || key),
      items,
    }));
  })();

  const allSelected = filteredTrips.length > 0 && filteredTrips.every(t => selectedIds.has(t.id));

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

      {/* ТЗ docx 02.07.26 (D11): панель групового вибору + групування. */}
      {!loading && trips.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={allSelected} onCheckedChange={() => toggleAllVisible()} />
            Вибрати всі
          </label>
          {selectedIds.size > 0 && (
            <span className="text-gray-500">Вибрано: {selectedIds.size}</span>
          )}
          <div className="flex items-center gap-1">
            <span className="text-gray-500">Групувати:</span>
            <Select value={groupBy} onValueChange={(v) => setGroupBy((v ?? 'none') as GroupBy)}>
              <SelectTrigger className="h-8 w-40">
                <SelectValue>
                  {groupBy === 'none' ? 'Без групування' : groupBy === 'country' ? 'За країною' : 'За напрямком'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Без групування</SelectItem>
                <SelectItem value="country">За країною</SelectItem>
                <SelectItem value="direction">За напрямком</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* ТЗ docx 09.07.26: фільтри за країною та напрямком — ховають
              нерелевантні рейси (на відміну від групування). */}
          <div className="flex items-center gap-1">
            <span className="text-gray-500">Країна:</span>
            <Select value={filterCountry || 'all'} onValueChange={(v) => setFilterCountry(v === 'all' ? '' : (v ?? ''))}>
              <SelectTrigger className="h-8 w-36">
                <SelectValue>{filterCountry ? (TRIP_COUNTRY_LABELS[filterCountry] || filterCountry) : 'Усі країни'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Усі країни</SelectItem>
                <SelectItem value="NL">Нідерланди</SelectItem>
                <SelectItem value="AT">Австрія</SelectItem>
                <SelectItem value="DE">Німеччина</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500">Напрямок:</span>
            <Select value={filterDirection || 'all'} onValueChange={(v) => setFilterDirection(v === 'all' ? '' : (v ?? ''))}>
              <SelectTrigger className="h-8 w-44">
                <SelectValue>{filterDirection ? (DIRECTION_LABELS[filterDirection] || filterDirection) : 'Усі напрямки'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Усі напрямки</SelectItem>
                <SelectItem value="eu_to_ua">Європа → Україна</SelectItem>
                <SelectItem value="ua_to_eu">Україна → Європа</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <Button size="sm" variant="outline" onClick={() => { setBulkCapacity(''); setCapDialogOpen(true); }} disabled={bulkSaving}>
                Задати місця
              </Button>
              <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={handleBulkDelete} disabled={bulkSaving}>
                Видалити вибрані
              </Button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <ListSkeleton />
      ) : trips.length === 0 ? (
        <EmptyState title="Ще немає рейсів" />
      ) : filteredTrips.length === 0 ? (
        <div className="text-sm text-gray-500 py-6 text-center">
          Немає рейсів за обраними фільтрами.{' '}
          <button type="button" onClick={() => { setFilterCountry(''); setFilterDirection(''); }} className="text-blue-600 hover:underline">Скинути фільтри</button>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => (
            <div key={group.key || 'all'}>
              {groupBy !== 'none' && (
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 px-1">
                  {group.label} ({group.items.length})
                </div>
              )}
              <div className="bg-white rounded-lg border divide-y">
                {group.items.map(trip => (
                  <div
                    key={trip.id}
                    ref={(el) => { if (el) rowRefs.current.set(trip.id, el); else rowRefs.current.delete(trip.id); }}
                    className="p-3 hover:bg-gray-50 flex items-start gap-2 rounded transition-shadow"
                  >
                    {/* ТЗ docx 02.07.26 (D11): чекбокс вибору рядка. */}
                    <div className="pt-0.5">
                      <Checkbox checked={selectedIds.has(trip.id)} onCheckedChange={() => toggleSelect(trip.id)} />
                    </div>
                    {/* Клікабельна частина — деталі рейсу. */}
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
                      {/* ТЗ docx 02.07.26 (D11): місць/пасажирів. */}
                      <div className="text-xs text-gray-400">
                        {trip._count.passengers}/{trip.passengerCapacity} пасаж.
                      </div>
                      {/* ТЗ docx 01.07.26: inline «Редагувати(дата)»/«Видалити». */}
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
            </div>
          ))}
        </div>
      )}

      {/* ТЗ docx 01.07.26: редагування дат рейсу. */}
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

      {/* ТЗ docx 02.07.26 (D11): масове задання кількості місць для пасажирів. */}
      <Dialog open={capDialogOpen} onOpenChange={setCapDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Кількість місць для пасажирів</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleBulkSetCapacity} className="space-y-3">
            <p className="text-sm text-gray-500">
              Застосувати до вибраних рейсів: {selectedTrips.length}
            </p>
            <div>
              <Label className="text-xs">Кількість місць</Label>
              <Input
                type="number" min={0} max={99}
                value={bulkCapacity}
                onChange={(e) => setBulkCapacity(e.target.value)}
                placeholder="0 — не возимо пасажирів"
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={bulkSaving || bulkCapacity === ''}>
              {bulkSaving ? 'Збереження…' : 'Застосувати'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
