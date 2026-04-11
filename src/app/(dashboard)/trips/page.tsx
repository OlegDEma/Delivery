'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';
import { formatDate } from '@/lib/utils/format';

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

  async function fetchTrips() {
    setLoading(true);
    const res = await fetch('/api/trips');
    if (res.ok) setTrips(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchTrips(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    const res = await fetch('/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction, country, departureDate, notes: notes || undefined }),
    });

    if (res.ok) {
      setDialogOpen(false);
      setDepartureDate('');
      setNotes('');
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
        <div className="text-center py-12 text-gray-500">Завантаження...</div>
      ) : (
        <div className="bg-white rounded-lg border divide-y">
          {trips.map(trip => (
            <Link key={trip.id} href={`/trips/${trip.id}`} className="block p-3 hover:bg-gray-50">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium">
                      {COUNTRY_LABELS[trip.country as CountryCode]} {trip.direction === 'eu_to_ua' ? '→ UA' : '← UA'}
                    </span>
                    <Badge className={STATUS_MAP[trip.status]?.color || ''}>
                      {STATUS_MAP[trip.status]?.label || trip.status}
                    </Badge>
                  </div>
                  <div className="text-sm text-gray-600">
                    {formatDate(trip.departureDate)}
                    {trip.assignedCourier && ` | ${trip.assignedCourier.fullName}`}
                  </div>
                  {trip.notes && <div className="text-xs text-gray-400 mt-0.5">{trip.notes}</div>}
                </div>
                <div className="text-right text-sm">
                  <div className="font-medium">{trip._count.parcels} посилок</div>
                  <div className="text-xs text-gray-400">{trip._count.routeTasks} заїздів</div>
                </div>
              </div>
            </Link>
          ))}
          {trips.length === 0 && (
            <div className="text-center py-8 text-gray-500">Немає рейсів</div>
          )}
        </div>
      )}
    </div>
  );
}
