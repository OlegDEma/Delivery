'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';
import { formatDate, formatDateTime, formatWeight } from '@/lib/utils/format';
import {
  formatWorkingDays,
  nextWorkingDay,
  WEEKDAY_LABELS_FULL,
  weekdayFromDate,
  type Weekday,
} from '@/lib/constants/collection';
import { STATUS_LABELS, STATUS_COLORS, type ParcelStatusType } from '@/lib/constants/statuses';
import { EmptyState } from '@/components/shared/empty-state';

interface CollectionPointDetail {
  id: string;
  name: string | null;
  country: string;
  city: string;
  address: string;
  postalCode: string | null;
  contactPhone: string | null;
  workingHours: string | null;
  workingDays: Weekday[];
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  maxCapacity: number | null;
  isActive: boolean;
}

interface ParcelAtPoint {
  id: string;
  itn: string;
  internalNumber: string;
  status: ParcelStatusType;
  totalWeight: number | null;
  totalPlacesCount: number;
  createdAt: string;
  collectedAt: string | null;
  sender: { firstName: string; lastName: string; phone: string };
  receiver: { firstName: string; lastName: string; phone: string };
  trip: { id: string; departureDate: string; country: string } | null;
  collectedBy: { fullName: string } | null;
}

export default function CollectionPointDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [point, setPoint] = useState<CollectionPointDetail | null>(null);
  const [parcels, setParcels] = useState<ParcelAtPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // Accept-parcel dialog
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [acceptQuery, setAcceptQuery] = useState('');
  const [acceptNotes, setAcceptNotes] = useState('');
  const [accepting, setAccepting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [pRes, parcelsRes] = await Promise.all([
      fetch(`/api/collection-points/${id}`),
      fetch(`/api/collection-points/${id}/parcels`),
    ]);
    if (pRes.ok) setPoint(await pRes.json());
    if (parcelsRes.ok) setParcels(await parcelsRes.json());
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleAcceptParcel(e: React.FormEvent) {
    e.preventDefault();
    const q = acceptQuery.trim();
    if (!q) {
      toast.error('Введіть ІТН, номер посилки або ТТН');
      return;
    }

    setAccepting(true);
    try {
      // Search parcel by query (ITN, internal number, short TTN etc.)
      const searchRes = await fetch(`/api/parcels?q=${encodeURIComponent(q)}&limit=5`);
      if (!searchRes.ok) {
        toast.error('Помилка пошуку');
        return;
      }
      const searchData = await searchRes.json();
      const found: { id: string; internalNumber: string; direction: string }[] = searchData.parcels || [];

      if (found.length === 0) {
        toast.error('Посилку не знайдено');
        return;
      }
      if (found.length > 1) {
        toast.error(`Знайдено ${found.length} посилок. Уточніть запит.`);
        return;
      }

      const parcel = found[0];
      if (parcel.direction !== 'eu_to_ua') {
        toast.error('На пункт збору приймаються тільки посилки EU→UA');
        return;
      }

      const acceptRes = await fetch(`/api/parcels/${parcel.id}/accept-at-point`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionPointId: id,
          notes: acceptNotes || undefined,
        }),
      });

      if (acceptRes.ok) {
        toast.success(`Посилку ${parcel.internalNumber} прийнято`);
        setAcceptOpen(false);
        setAcceptQuery('');
        setAcceptNotes('');
        fetchData();
      } else {
        const err = await acceptRes.json().catch(() => ({}));
        toast.error(err.error || 'Помилка прийому');
      }
    } finally {
      setAccepting(false);
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Завантаження...</div>;
  if (!point) return <div className="text-center py-12 text-red-500">Пункт не знайдено</div>;

  const next = point.workingDays?.length ? nextWorkingDay(point.workingDays) : null;
  const isTodayWorking = point.workingDays?.includes(weekdayFromDate(new Date())) ?? false;

  // Group parcels by trip for the second section
  const waiting = parcels.filter(p => p.status === 'at_collection_point');
  const draftHere = parcels.filter(p => p.status === 'draft');

  const waitingByTrip = new Map<string, { trip: ParcelAtPoint['trip']; items: ParcelAtPoint[] }>();
  for (const p of waiting) {
    const key = p.trip?.id || 'no-trip';
    const existing = waitingByTrip.get(key);
    if (existing) existing.items.push(p);
    else waitingByTrip.set(key, { trip: p.trip, items: [p] });
  }

  const totalWeight = waiting.reduce((s, p) => s + (Number(p.totalWeight) || 0), 0);
  const capacityUsed = point.maxCapacity ? Math.min(100, (waiting.length / point.maxCapacity) * 100) : null;

  return (
    <div className="max-w-4xl space-y-4">
      <Breadcrumbs
        items={[
          { label: 'Пункти збору', href: '/admin/collection-points' },
          { label: point.name || `${point.city}, ${point.address}` },
        ]}
      />

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <h1 className="text-2xl font-bold">
            {point.name || `${point.city}, ${point.address}`}
          </h1>
          <Badge variant="secondary">
            {COUNTRY_LABELS[point.country as CountryCode] || point.country}
          </Badge>
          {!point.isActive && <Badge variant="outline">Неактивний</Badge>}
        </div>
        <div className="text-sm text-gray-500">
          {point.name && <>📍 {point.city}, {point.address} · </>}
          {point.contactPhone && <>📞 {point.contactPhone} · </>}
          {point.workingHours}
        </div>
      </div>

      {/* Schedule + Stats summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-gray-500 mb-1">Приймає посилки</div>
            <div className="text-sm font-medium">
              {point.workingDays?.length ? formatWorkingDays(point.workingDays) : '— не вказано —'}
            </div>
            {point.workingDays?.length > 0 && (
              <div className="text-xs mt-1">
                {isTodayWorking ? (
                  <span className="text-green-600 font-medium">✓ Сьогодні приймає</span>
                ) : next ? (
                  <span className="text-gray-500">
                    Наступний день: <b>{WEEKDAY_LABELS_FULL[weekdayFromDate(next)]}</b>, {formatDate(next)}
                  </span>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-gray-500 mb-1">Зараз на пункті</div>
            <div className="text-2xl font-bold">{waiting.length}</div>
            <div className="text-xs text-gray-400">
              {totalWeight > 0 && `${formatWeight(totalWeight)} сумарно`}
            </div>
            {capacityUsed != null && (
              <div className="mt-1.5">
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full ${
                      capacityUsed >= 90 ? 'bg-red-500' : capacityUsed >= 70 ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${capacityUsed}%` }}
                  />
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {waiting.length}/{point.maxCapacity} ({Math.round(capacityUsed)}%)
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-gray-500 mb-1">Очікують привозу</div>
            <div className="text-2xl font-bold">{draftHere.length}</div>
            <div className="text-xs text-gray-400">
              Клієнти обрали цей пункт, але ще не принесли
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {point.notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
          <div className="text-xs font-semibold text-amber-900 mb-1">Інструкції:</div>
          <div className="text-amber-800 whitespace-pre-wrap">{point.notes}</div>
        </div>
      )}

      {/* Action: accept parcel */}
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Прийом посилки</CardTitle>
            <Dialog open={acceptOpen} onOpenChange={setAcceptOpen}>
              <Button onClick={() => setAcceptOpen(true)}>
                ✅ Прийняти посилку
              </Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Прийняти посилку на пункті</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAcceptParcel} className="space-y-3">
                  <div>
                    <Label>ІТН, номер посилки або ТТН</Label>
                    <Input
                      value={acceptQuery}
                      onChange={(e) => setAcceptQuery(e.target.value)}
                      autoFocus
                      placeholder="260000..., 287 Іванівці 1/3..., 20600..."
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Скануйте QR або введіть номер з документа клієнта
                    </p>
                  </div>
                  <div>
                    <Label>Примітка (опціонально)</Label>
                    <Textarea
                      rows={2}
                      value={acceptNotes}
                      onChange={(e) => setAcceptNotes(e.target.value)}
                      placeholder="Напр.: клієнт прийшов о 11:30, посилка в хорошому стані"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={accepting}>
                    {accepting ? 'Прийом...' : '✓ Прийняти'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 text-xs text-gray-500">
          Статус посилки зміниться на «На пункті збору». Далі коли поїде рейс — автоматично перейде у «В дорозі».
        </CardContent>
      </Card>

      {/* Parcels waiting at point (grouped by trip) */}
      <div>
        <h2 className="text-lg font-semibold mb-2">
          Посилки на пункті ({waiting.length})
        </h2>
        {waiting.length === 0 ? (
          <EmptyState
            title="На пункті зараз немає посилок"
            description="Коли клієнт принесе посилку, прийміть її кнопкою вище"
          />
        ) : (
          <div className="space-y-3">
            {Array.from(waitingByTrip.entries()).map(([key, { trip, items }]) => (
              <Card key={key}>
                <CardHeader className="py-2 px-3 bg-gradient-to-r from-blue-50 to-transparent">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>
                      {trip ? (
                        <Link href={`/trips/${trip.id}`} className="hover:underline">
                          🚐 Рейс {COUNTRY_LABELS[trip.country as CountryCode]} · {formatDate(trip.departureDate)}
                        </Link>
                      ) : (
                        '❓ Без рейсу'
                      )}
                    </span>
                    <span className="text-xs text-gray-500">{items.length} посилок</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {items.map(p => (
                      <Link
                        key={p.id}
                        href={`/parcels/${p.id}`}
                        className="block px-3 py-2 hover:bg-gray-50 text-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-medium">{p.internalNumber}</span>
                              <Badge className={`text-xs ${STATUS_COLORS[p.status]}`}>
                                {STATUS_LABELS[p.status]}
                              </Badge>
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              Від {p.sender.lastName} {p.sender.firstName} → {p.receiver.lastName} {p.receiver.firstName}
                            </div>
                            {p.collectedAt && (
                              <div className="text-xs text-gray-400 mt-0.5">
                                Прийнято: {formatDateTime(p.collectedAt)}
                                {p.collectedBy && ` · ${p.collectedBy.fullName}`}
                              </div>
                            )}
                          </div>
                          <div className="text-right text-xs text-gray-500 shrink-0">
                            {p.totalPlacesCount} м. · {p.totalWeight ? formatWeight(Number(p.totalWeight)) : '—'}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Draft parcels (clients selected this point but haven't delivered yet) */}
      {draftHere.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-2">
            Очікують привозу ({draftHere.length})
          </h2>
          <Card>
            <CardContent className="p-0 divide-y">
              {draftHere.map(p => (
                <Link
                  key={p.id}
                  href={`/parcels/${p.id}`}
                  className="block px-3 py-2 hover:bg-gray-50 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">{p.internalNumber}</span>
                        <Badge variant="secondary" className="text-xs">
                          {STATUS_LABELS[p.status]}
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Від {p.sender.lastName} {p.sender.firstName} · {p.sender.phone}
                      </div>
                    </div>
                    <div className="text-right text-xs text-gray-400 shrink-0">
                      створено {formatDate(p.createdAt)}
                    </div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Link to Google Maps */}
      {point.latitude != null && point.longitude != null && (
        <div>
          <a
            href={`https://www.google.com/maps?q=${point.latitude},${point.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            🗺 Відкрити на мапі
          </a>
        </div>
      )}
    </div>
  );
}
