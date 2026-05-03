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
import { Users2, ArrowLeft, UserPlus, Phone, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PhoneLink } from '@/components/shared/phone-link';
import { PhoneInput } from '@/components/shared/phone-input';
import { formatCurrency } from '@/lib/utils/format';

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

const DIR_LABEL: Record<string, string> = {
  eu_to_ua: 'ЄС → Україна',
  ua_to_eu: 'Україна → ЄС',
};

export default function PassengersPage() {
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);

  // Drill-down стан: якщо вибрано — показуємо деталі рейсу.
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<TripDetail | null>(null);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Add form
  const [formOpen, setFormOpen] = useState(false);
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
    setForm({
      firstName: '', lastName: '', phone: '',
      seatNumber: '', pickupAddress: '', dropoffAddress: '',
      price: '', currency: 'EUR', isPaid: false, notes: '',
    });
  }

  async function handleCreate() {
    if (!selectedTripId) return;
    if (!form.firstName.trim() || !form.lastName.trim() || !form.phone.trim()) {
      toast.error('Імʼя, прізвище і телефон обовʼязкові');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/passengers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tripId: selectedTripId,
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
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success('Пасажира додано');
      resetForm();
      setFormOpen(false);
      fetchTripDetail(selectedTripId);
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Помилка створення');
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
                Рейс {DIR_LABEL[trip.direction] || trip.direction} · {trip.country}
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
              <Dialog open={formOpen} onOpenChange={setFormOpen}>
                <DialogTrigger render={
                  <Button disabled={capacity === 0 && free <= 0}>
                    <UserPlus className="w-4 h-4 mr-1" /> Додати пасажира
                  </Button>
                } />
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Новий пасажир</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Прізвище</Label>
                        <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs">Імʼя</Label>
                        <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                      </div>
                    </div>
                    <PhoneInput
                      label="Телефон"
                      value={form.phone}
                      onChange={(v) => setForm({ ...form, phone: v })}
                      defaultCountry="UA"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Місце №</Label>
                        <Input
                          type="number" min={1} max={capacity || 99}
                          value={form.seatNumber}
                          onChange={(e) => setForm({ ...form, seatNumber: e.target.value })}
                          placeholder="1-N"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Ціна</Label>
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
                      <Label className="text-xs">Місце посадки</Label>
                      <Input value={form.pickupAddress} onChange={(e) => setForm({ ...form, pickupAddress: e.target.value })} placeholder="Адреса / орієнтир" />
                    </div>
                    <div>
                      <Label className="text-xs">Місце висадки</Label>
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
                        {p.isPaid ? (
                          <Badge className="text-xs bg-green-100 text-green-800">Оплачено</Badge>
                        ) : (
                          <Badge className="text-xs bg-yellow-100 text-yellow-800">Не оплачено</Badge>
                        )}
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
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => handleDelete(p.id)}
                        className="text-red-600 hover:text-red-800 hover:bg-red-50 h-7 px-2 mt-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
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
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Пасажири</h1>
      <p className="text-sm text-gray-500 mb-4">
        Перевезення пасажирів по рейсах. Натисніть на рейс щоб побачити пасажирів, вільні та зайняті місця.
      </p>

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
          {trips.map((t) => (
            <Card key={t.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedTripId(t.id)}>
              <CardHeader className="py-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">
                    {DIR_LABEL[t.direction] || t.direction} · {t.country}
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
                    Місткість не задана. Встановіть у редагуванні рейсу.
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
