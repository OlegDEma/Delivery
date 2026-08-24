'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users2, ArrowLeft, UserPlus, Phone, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { PhoneLink } from '@/components/shared/phone-link';
import { PhoneInput } from '@/components/shared/phone-input';
import { CapitalizeInput } from '@/components/shared/capitalize-input';
import { formatCurrency } from '@/lib/utils/format';
import { tripRouteLabel } from '@/lib/constants/countries';
import { MinibusSeating } from '@/components/passengers/minibus-seating';
import { PassengerShareButtons } from '@/components/passengers/passenger-share-buttons';
import { useAuth } from '@/lib/hooks/use-auth';
import { ROLES } from '@/lib/constants/roles';

interface TripSummary {
  id: string;
  direction: string;
  country: string;
  departureDate: string;
  arrivalDate: string | null;
  status: string;
  passengerCapacity: number;
  occupied: number;
  free: number;
  assignedCourier: { fullName: string } | null;
}

interface Passenger {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  seatNumber: number | null;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  price: number | null;
  currency: string;
  isPaid: boolean;
  notes: string | null;
  createdAt: string;
  createdBy?: { fullName: string } | null;
}

interface TripDetail {
  id: string;
  direction: string;
  country: string;
  departureDate: string;
  arrivalDate: string | null;
  status: string;
  passengerCapacity: number;
  assignedCourier: { fullName: string } | null;
}


const PASSENGER_COUNTRY_LABELS: Record<string, string> = { NL: 'Нідерланди', AT: 'Австрія', DE: 'Німеччина' };

/**
 * ТЗ docx 23.08.26 (п.2): рейси у вкладці «Пасажири» підсвічуються так само, як
 * Поїздки — поточний/найближчий ОКРЕМО для кожної країни.
 */
function pickFocusPassengerTripIds(list: TripSummary[]): Set<string> {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t0 = today.getTime();
  const day = (s: string | null) => {
    if (!s) return null;
    const d = new Date(s); d.setHours(0, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  };
  const byCountry = new Map<string, TripSummary[]>();
  for (const t of list) {
    const arr = byCountry.get(t.country) ?? [];
    arr.push(t);
    byCountry.set(t.country, arr);
  }
  const ids = new Set<string>();
  for (const group of byCountry.values()) {
    let picked: string | null = null;
    for (const t of group) {
      const dep = day(t.departureDate);
      if (dep === null) continue;
      const end = day(t.arrivalDate) ?? dep;
      if (dep <= t0 && t0 <= end) { picked = t.id; break; }
    }
    if (!picked) {
      let best = Infinity;
      for (const t of group) {
        const dep = day(t.departureDate);
        if (dep !== null && dep >= t0 && dep < best) { best = dep; picked = t.id; }
      }
    }
    if (!picked) {
      let best = -Infinity;
      for (const t of group) {
        const dep = day(t.departureDate);
        if (dep !== null && dep < t0 && dep > best) { best = dep; picked = t.id; }
      }
    }
    if (picked) ids.add(picked);
  }
  return ids;
}

export default function PassengersPage() {
  // ТЗ docx 18.08.26: Водію заборонено видаляти пасажирів (API вже 403 —
  // ховаємо й кнопку). Видаляти може лише адмін/суперадмін.
  const { role } = useAuth();
  const canDeletePassenger = role === ROLES.SUPER_ADMIN || role === ROLES.ADMIN;
  // ТЗ docx 23.08.26 (п.1): фільтри рейсів — для Суперадміна/Адміна.
  const canFilterTrips = role === ROLES.SUPER_ADMIN || role === ROLES.ADMIN;
  // ТЗ docx 23.08.26 (п.4): Водій (як і касир/адмін) може прийняти оплату у пасажира.
  const canAcceptPayment = role === ROLES.SUPER_ADMIN || role === ROLES.ADMIN
    || role === ROLES.CASHIER || role === ROLES.DRIVER_COURIER;
  const [filterCountry, setFilterCountry] = useState<string>('');
  const [filterDirection, setFilterDirection] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);

  // Drill-down стан: якщо вибрано — показуємо деталі рейсу.
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<TripDetail | null>(null);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Add form
  const [formOpen, setFormOpen] = useState(false);
  // ТЗ docx 20.08.26: режим редагування пасажира (null = додавання).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: '', lastName: '', phone: '',
    seatNumber: '', pickupAddress: '', dropoffAddress: '',
    price: '', currency: 'EUR', isPaid: false, notes: '',
  });

  const fetchTrips = useCallback(async () => {
    setLoadingTrips(true);
    const res = await fetch('/api/passengers');
    if (res.ok) {
      const data = await res.json();
      setTrips(data.trips || []);
    }
    setLoadingTrips(false);
  }, []);

  const fetchTripDetail = useCallback(async (tripId: string) => {
    setLoadingDetail(true);
    const res = await fetch(`/api/passengers?tripId=${tripId}`);
    if (res.ok) {
      const data = await res.json();
      setSelectedTrip(data.trip);
      setPassengers(data.passengers || []);
    }
    setLoadingDetail(false);
  }, []);

  useEffect(() => {
    if (selectedTripId) fetchTripDetail(selectedTripId);
    else fetchTrips();
  }, [selectedTripId, fetchTrips, fetchTripDetail]);

  function resetForm() {
    setEditingId(null);
    setForm({
      firstName: '', lastName: '', phone: '',
      seatNumber: '', pickupAddress: '', dropoffAddress: '',
      price: '', currency: 'EUR', isPaid: false, notes: '',
    });
  }

  async function handleCreate() {
    if (!editingId && !selectedTripId) return;
    // ТЗ docx 23.08.26 (п.3): обовʼязкові — Прізвище, Імʼя, телефон, місце,
    // вартість, місце посадки, місце висадки.
    const missing: string[] = [];
    if (!form.lastName.trim()) missing.push('Прізвище');
    if (!form.firstName.trim()) missing.push('Імʼя');
    if (!form.phone.trim()) missing.push('Телефон');
    if (!form.seatNumber) missing.push('Місце');
    if (!form.price.trim()) missing.push('Вартість');
    if (!form.pickupAddress.trim()) missing.push('Місце посадки');
    if (!form.dropoffAddress.trim()) missing.push('Місце висадки');
    if (missing.length > 0) {
      toast.error(`Заповніть обовʼязкові поля: ${missing.join(', ')}`);
      return;
    }
    setSaving(true);
    // Спільне тіло; при створенні додаємо tripId.
    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim(),
      seatNumber: form.seatNumber ? Number(form.seatNumber) : null,
      pickupAddress: form.pickupAddress.trim() || null,
      dropoffAddress: form.dropoffAddress.trim() || null,
      price: form.price ? Number(form.price) : null,
      currency: form.currency,
      isPaid: form.isPaid,
      notes: form.notes.trim() || null,
    };
    // ТЗ docx 20.08.26: редагування наявного пасажира (PATCH) або додавання (POST).
    const res = editingId
      ? await fetch(`/api/passengers?id=${editingId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
      : await fetch('/api/passengers', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tripId: selectedTripId, ...payload }),
        });
    setSaving(false);
    if (res.ok) {
      toast.success(editingId ? 'Пасажира оновлено' : 'Пасажира додано');
      resetForm();
      setFormOpen(false);
      if (selectedTripId) fetchTripDetail(selectedTripId);
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Помилка');
    }
  }

  // ТЗ docx 20.08.26: відкрити форму в режимі редагування, заповнену даними пасажира.
  function openEdit(p: Passenger) {
    setEditingId(p.id);
    setForm({
      firstName: p.firstName, lastName: p.lastName, phone: p.phone,
      seatNumber: p.seatNumber != null ? String(p.seatNumber) : '',
      pickupAddress: p.pickupAddress || '', dropoffAddress: p.dropoffAddress || '',
      price: p.price != null ? String(p.price) : '', currency: p.currency || 'EUR',
      isPaid: p.isPaid, notes: p.notes || '',
    });
    setFormOpen(true);
  }

  /**
   * ТЗ docx 23.08.26 (п.4): прийом оплати у пасажира. Водію API дозволяє змінити
   * лише `isPaid` — решта полів лишається за адміністратором.
   */
  async function togglePaid(p: Passenger) {
    const next = !p.isPaid;
    if (next && !confirm(`Підтвердити отримання оплати від ${p.lastName} ${p.firstName}?`)) return;
    const res = await fetch(`/api/passengers?id=${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPaid: next }),
    });
    if (res.ok) {
      toast.success(next ? 'Оплату прийнято' : 'Позначку про оплату знято');
      if (selectedTripId) fetchTripDetail(selectedTripId);
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || 'Помилка');
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Видалити запис пасажира?')) return;
    const res = await fetch(`/api/passengers?id=${id}`, { method: 'DELETE' });
    if (res.ok && selectedTripId) {
      toast.success('Видалено');
      fetchTripDetail(selectedTripId);
    }
  }

  // ---------- DETAIL VIEW ----------
  if (selectedTripId) {
    const trip = selectedTrip;
    const capacity = trip?.passengerCapacity || 0;
    const occupied = passengers.length;
    const free = Math.max(0, capacity - occupied);
    // ТЗ docx 08.08.26: зайняті місця (для плану мікроавтобуса) — щоб їх заблокувати.
    const occupiedSeats = passengers
      .map((p) => p.seatNumber)
      .filter((n): n is number => typeof n === 'number');

    return (
      <div>
        <Button variant="ghost" size="sm" onClick={() => { setSelectedTripId(null); setSelectedTrip(null); }} className="mb-3">
          <ArrowLeft className="w-4 h-4 mr-1" /> До списку рейсів
        </Button>

        {loadingDetail || !trip ? (
          <div className="text-center py-12 text-gray-500">Завантаження...</div>
        ) : (
          <>
            <div className="mb-4">
              <h1 className="text-2xl font-bold">
                {/* ТЗ docx 08.08.26: назва рейсу — лише країни виїзду→приїзду (без «ЄС»/«Європа»). */}
                Рейс {tripRouteLabel(trip.country, trip.direction)}
              </h1>
              <p className="text-sm text-gray-500">
                Відправлення: {new Date(trip.departureDate).toLocaleDateString('uk-UA')}
                {trip.assignedCourier ? ` · Кур'єр: ${trip.assignedCourier.fullName}` : ''}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-white border rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{capacity}</div>
                <div className="text-xs text-gray-500">Місць всього</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-700">{occupied}</div>
                <div className="text-xs text-blue-800">Зайнято</div>
              </div>
              <div className={`border rounded-lg p-3 text-center ${free > 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className={`text-2xl font-bold ${free > 0 ? 'text-green-700' : 'text-red-700'}`}>{free}</div>
                <div className={`text-xs ${free > 0 ? 'text-green-800' : 'text-red-800'}`}>Вільно</div>
              </div>
            </div>

            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-semibold">Пасажири ({occupied})</h2>
              <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) resetForm(); }}>
                <DialogTrigger render={
                  <Button disabled={capacity === 0 && free <= 0}>
                    <UserPlus className="w-4 h-4 mr-1" /> Додати пасажира
                  </Button>
                } />
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingId ? 'Редагувати пасажира' : 'Новий пасажир'}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Прізвище *</Label>
                        {/* ТЗ docx 20.08.26: ПІБ пасажира — з великої літери за замовчуванням. */}
                        <CapitalizeInput value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} />
                      </div>
                      <div>
                        <Label className="text-xs">Імʼя *</Label>
                        <CapitalizeInput value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} />
                      </div>
                    </div>
                    <PhoneInput
                      label="Телефон *"
                      value={form.phone}
                      onChange={(v) => setForm({ ...form, phone: v })}
                      defaultCountry="UA"
                    />
                    {/* ТЗ docx 08.08.26: вибір місця кліком по схематичному плану салону. */}
                    <div>
                      <Label className="text-xs">Місце в салоні *</Label>
                      <div className="mt-1">
                        <MinibusSeating
                          capacity={capacity}
                          occupiedSeats={occupiedSeats}
                          value={form.seatNumber ? Number(form.seatNumber) : null}
                          onChange={(seat) => setForm({ ...form, seatNumber: String(seat) })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Місце № (вручну)</Label>
                        <Input
                          type="number" min={1} max={capacity || 99}
                          value={form.seatNumber}
                          onChange={(e) => setForm({ ...form, seatNumber: e.target.value })}
                          placeholder="1-N"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Вартість *</Label>
                        <div className="flex gap-1">
                          <Input
                            type="number" min={0} step={0.01}
                            value={form.price}
                            onChange={(e) => setForm({ ...form, price: e.target.value })}
                            className="flex-1"
                          />
                          <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v ?? 'EUR' })}>
                            <SelectTrigger className="w-20"><SelectValue>{form.currency}</SelectValue></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="EUR">EUR</SelectItem>
                              <SelectItem value="UAH">UAH</SelectItem>
                              <SelectItem value="USD">USD</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Місце посадки *</Label>
                      <Input value={form.pickupAddress} onChange={(e) => setForm({ ...form, pickupAddress: e.target.value })} placeholder="Адреса / орієнтир" />
                    </div>
                    <div>
                      <Label className="text-xs">Місце висадки *</Label>
                      <Input value={form.dropoffAddress} onChange={(e) => setForm({ ...form, dropoffAddress: e.target.value })} placeholder="Адреса / орієнтир" />
                    </div>
                    <div>
                      <Label className="text-xs">Нотатки</Label>
                      <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                    </div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={form.isPaid} onCheckedChange={(v) => setForm({ ...form, isPaid: v === true })} />
                      Оплачено
                    </label>
                    <div className="flex gap-2 justify-end pt-2 border-t">
                      <Button variant="ghost" onClick={() => { resetForm(); setFormOpen(false); }}>
                        Скасувати
                      </Button>
                      <Button onClick={handleCreate} disabled={saving}>
                        {saving ? 'Збереження...' : 'Додати'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {passengers.length === 0 ? (
              <div className="bg-white border rounded-lg p-8 text-center text-gray-500">
                Ще немає пасажирів на цьому рейсі
              </div>
            ) : (
              <div className="bg-white rounded-lg border divide-y">
                {passengers.map((p) => (
                  <div key={p.id} className="p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {p.seatNumber != null && (
                          <Badge variant="outline" className="text-xs font-mono">місце {p.seatNumber}</Badge>
                        )}
                        <span className="font-medium">{p.lastName} {p.firstName}</span>
                        <PhoneLink phone={p.phone} />
                        {/* ТЗ docx 23.08.26 (п.4): бейдж оплати клікабельний — прийом оплати. */}
                        {canAcceptPayment ? (
                          <button type="button" onClick={() => togglePaid(p)} title={p.isPaid ? 'Зняти позначку оплати' : 'Прийняти оплату'}>
                            <Badge className={`text-xs cursor-pointer ${p.isPaid ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'}`}>
                              {p.isPaid ? 'Оплачено' : 'Прийняти оплату'}
                            </Badge>
                          </button>
                        ) : p.isPaid ? (
                          <Badge className="text-xs bg-green-100 text-green-800">Оплачено</Badge>
                        ) : (
                          <Badge className="text-xs bg-yellow-100 text-yellow-800">Не оплачено</Badge>
                        )}
                      </div>
                      {/* ТЗ docx 23.08.26 (п.5-6): надіслати пасажиру підтвердження або рахунок. */}
                      <div className="flex items-center gap-3 flex-wrap mt-1.5">
                        <span className="inline-flex items-center gap-1">
                          <span className="text-[11px] text-gray-500">Підтвердження:</span>
                          <PassengerShareButtons passengerId={p.id} kind="confirmation" phone={p.phone} />
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="text-[11px] text-gray-500">Рахунок:</span>
                          <PassengerShareButtons passengerId={p.id} kind="invoice" phone={p.phone} />
                        </span>
                      </div>
                      {(p.pickupAddress || p.dropoffAddress) && (
                        <div className="text-xs text-gray-500 mt-1">
                          {p.pickupAddress && <span>Посадка: {p.pickupAddress}</span>}
                          {p.pickupAddress && p.dropoffAddress && <span className="mx-1">→</span>}
                          {p.dropoffAddress && <span>Висадка: {p.dropoffAddress}</span>}
                        </div>
                      )}
                      {p.notes && <div className="text-xs text-gray-400 mt-1 italic">{p.notes}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      {p.price != null && (
                        <div className="text-sm font-medium">{formatCurrency(p.price, p.currency)}</div>
                      )}
                      {canDeletePassenger && (
                        <div className="flex items-center gap-1 mt-1 justify-end">
                          {/* ТЗ docx 20.08.26: редагування наявного пасажира (admin). */}
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => openEdit(p)}
                            title="Редагувати пасажира"
                            className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 h-7 px-2"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => handleDelete(p.id)}
                            className="text-red-600 hover:text-red-800 hover:bg-red-50 h-7 px-2"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ---------- LIST VIEW ----------
  // ТЗ docx 23.08.26 (п.1-2): фільтри (дати/країни/напрямки) + хронологічне
  // сортування і підсвітка поточного/найближчого рейсу — як у вкладці «Поїздки».
  const filteredTrips = trips
    .filter((t) => (!filterCountry || t.country === filterCountry)
      && (!filterDirection || t.direction === filterDirection)
      && (!filterDateFrom || String(t.departureDate).slice(0, 10) >= filterDateFrom)
      && (!filterDateTo || String(t.departureDate).slice(0, 10) <= filterDateTo))
    .slice()
    .sort((a, b) => new Date(a.departureDate).getTime() - new Date(b.departureDate).getTime());
  const focusTripIds = pickFocusPassengerTripIds(filteredTrips);
  const filtersActive = !!(filterCountry || filterDirection || filterDateFrom || filterDateTo);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Пасажири</h1>
      <p className="text-sm text-gray-500 mb-4">
        Перевезення пасажирів по рейсах. Натисніть на рейс щоб побачити пасажирів, вільні та зайняті місця.
      </p>

      {/* ТЗ docx 23.08.26: фільтр рейсів по датах / країнах / напрямках. */}
      {canFilterTrips && trips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 text-sm">
          <Select value={filterCountry || 'all'} onValueChange={(v) => setFilterCountry((v ?? 'all') === 'all' ? '' : (v ?? ''))}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue>{filterCountry ? (PASSENGER_COUNTRY_LABELS[filterCountry] || filterCountry) : 'Усі країни'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Усі країни</SelectItem>
              <SelectItem value="NL">Нідерланди</SelectItem>
              <SelectItem value="AT">Австрія</SelectItem>
              <SelectItem value="DE">Німеччина</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterDirection || 'all'} onValueChange={(v) => setFilterDirection((v ?? 'all') === 'all' ? '' : (v ?? ''))}>
            <SelectTrigger className="h-9 w-48">
              <SelectValue>
                {filterDirection === 'ua_to_eu' ? 'З України' : filterDirection === 'eu_to_ua' ? 'До України' : 'Усі напрямки'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Усі напрямки</SelectItem>
              <SelectItem value="ua_to_eu">З України</SelectItem>
              <SelectItem value="eu_to_ua">До України</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <span className="text-gray-500 text-xs">з</span>
            <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="h-9 w-36" />
            <span className="text-gray-500 text-xs">по</span>
            <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="h-9 w-36" />
          </div>
          {filtersActive && (
            <button
              type="button"
              onClick={() => { setFilterCountry(''); setFilterDirection(''); setFilterDateFrom(''); setFilterDateTo(''); }}
              className="text-xs text-blue-600 hover:underline"
            >
              Скинути фільтри
            </button>
          )}
        </div>
      )}

      {loadingTrips ? (
        <div className="text-center py-12 text-gray-500">Завантаження...</div>
      ) : trips.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Users2 className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Немає рейсів</h2>
            <p className="text-sm text-gray-500">Створіть рейс у розділі «Рейси» і встановіть йому місткість пасажирів.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredTrips.length === 0 && (
            <div className="text-sm text-gray-500 py-6 text-center md:col-span-2">
              Немає рейсів за обраними фільтрами.
            </div>
          )}
          {filteredTrips.map((t) => (
            <Card
              key={t.id}
              className={`cursor-pointer hover:shadow-md transition-shadow${
                // ТЗ docx 23.08.26: поточний/найближчий рейс — виділений, як у Поїздках.
                focusTripIds.has(t.id) ? ' bg-amber-50 border-amber-400 ring-2 ring-amber-400 ring-offset-1' : ''
              }`}
              onClick={() => setSelectedTripId(t.id)}
            >
              <CardHeader className="py-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">
                    {/* ТЗ docx 08.08.26: назва рейсу — лише країни (без «ЄС»/«Європа»). */}
                    {tripRouteLabel(t.country, t.direction)}
                  </CardTitle>
                  <Badge className="text-xs">{t.status}</Badge>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {new Date(t.departureDate).toLocaleDateString('uk-UA')}
                  {t.assignedCourier && <> · {t.assignedCourier.fullName}</>}
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                {t.passengerCapacity === 0 ? (
                  <div className="text-xs text-gray-400">
                    Місткість не задана. Встановіть кількість пасажирських місць у редагуванні ПОЇЗДКИ.
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-sm">
                    <Users2 className="w-4 h-4 text-gray-400" />
                    <span>
                      <span className="font-semibold">{t.occupied}</span>
                      <span className="text-gray-400"> / {t.passengerCapacity}</span>
                    </span>
                    {t.free > 0 ? (
                      <Badge className="text-xs bg-green-100 text-green-800">{t.free} вільних</Badge>
                    ) : (
                      <Badge className="text-xs bg-red-100 text-red-800">Заповнено</Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// Silence unused import warnings — `Phone` is reserved for future inline call action.
void Phone;
