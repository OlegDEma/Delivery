'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';
import { STATUS_LABELS, STATUS_COLORS, type ParcelStatusType } from '@/lib/constants/statuses';
import { formatDate, formatWeight } from '@/lib/utils/format';

const TRIP_STATUSES: Record<string, { label: string; color: string }> = {
  planned: { label: 'Заплановано', color: 'bg-blue-100 text-blue-800' },
  in_progress: { label: 'В дорозі', color: 'bg-yellow-100 text-yellow-800' },
  completed: { label: 'Завершено', color: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Скасовано', color: 'bg-red-100 text-red-800' },
};

interface TripParcel {
  id: string;
  internalNumber: string;
  shortNumber: number | null;
  status: ParcelStatusType;
  totalWeight: number | null;
  totalPlacesCount: number;
  needsPackaging: boolean;
  declaredValue: number | null;
  collectionMethod: string | null;
  collectionAddress: string | null;
  sender: { firstName: string; lastName: string; phone: string };
  receiver: { firstName: string; lastName: string; phone: string };
  receiverAddress: { city: string; street: string | null; building: string | null; npWarehouseNum: string | null } | null;
  collectionPoint: { id: string; name: string | null; city: string; address: string } | null;
}

interface TripDetail {
  id: string;
  direction: string;
  country: string;
  departureDate: string;
  arrivalDate: string | null;
  status: string;
  notes: string | null;
  assignedCourier: { id: string; fullName: string } | null;
  secondCourier: { id: string; fullName: string } | null;
  createdBy: { fullName: string } | null;
  parcels: TripParcel[];
  _count: { parcels: number; routeTasks: number };
}

export default function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [newStatus, setNewStatus] = useState('');
  const [saving, setSaving] = useState(false);

  async function fetchTrip() {
    const res = await fetch(`/api/trips/${id}`);
    if (res.ok) setTrip(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchTrip(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStatusChange() {
    if (!newStatus) return;
    setSaving(true);
    await fetch(`/api/trips/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    setNewStatus('');
    await fetchTrip();
    setSaving(false);
  }

  async function handleRemoveParcel(parcelId: string) {
    await fetch(`/api/trips/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeParcelId: parcelId }),
    });
    fetchTrip();
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Завантаження...</div>;
  if (!trip) return <div className="text-center py-12 text-red-500">Рейс не знайдено</div>;

  const totalWeight = trip.parcels.reduce((s, p) => s + (Number(p.totalWeight) || 0), 0);
  const totalPlaces = trip.parcels.reduce((s, p) => s + p.totalPlacesCount, 0);

  return (
    <div className="max-w-3xl space-y-4">
      <Breadcrumbs items={[{label: 'Рейси', href: '/trips'}, {label: 'Деталі рейсу'}]} />
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-xl font-bold">
            {COUNTRY_LABELS[trip.country as CountryCode]} {trip.direction === 'eu_to_ua' ? '→ UA' : '← UA'}
          </h1>
          <Badge className={TRIP_STATUSES[trip.status]?.color || ''}>
            {TRIP_STATUSES[trip.status]?.label || trip.status}
          </Badge>
        </div>
        <div className="text-sm text-gray-500">
          Відправлення: {formatDate(trip.departureDate)}
          {trip.arrivalDate && ` | Прибуття: ${formatDate(trip.arrivalDate)}`}
          {trip.assignedCourier && ` | ${trip.assignedCourier.fullName}`}
        </div>
        {trip.notes && <div className="text-sm text-gray-400 mt-1">{trip.notes}</div>}
        <div className="flex gap-2 mt-2">
          <Button variant="outline" size="sm" onClick={() => {
            // Open all print pages in one window
            const ids = trip.parcels.map(p => p.id).join(',');
            window.open(`/trips/${id}/print?ids=${ids}`, '_blank');
          }}>
            Друк всіх етикеток ({trip._count.parcels})
          </Button>
        </div>
      </div>

      {/* Customs declaration summary */}
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm">Митна декларація</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-gray-500">Посилок</div>
              <div className="font-bold text-lg">{trip._count.parcels}</div>
            </div>
            <div>
              <div className="text-gray-500">Місць</div>
              <div className="font-bold text-lg">{totalPlaces}</div>
            </div>
            <div>
              <div className="text-gray-500">Загальна вага</div>
              <div className="font-bold text-lg">{totalWeight.toFixed(1)} кг</div>
            </div>
            <div>
              <div className="text-gray-500">Оголошена вартість</div>
              <div className="font-bold text-lg">
                {trip.parcels.reduce((s, p) => s + (Number(p.declaredValue) || 0), 0).toFixed(2)} EUR
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => window.print()}>
            Друкувати для митниці
          </Button>
        </CardContent>
      </Card>

      {/* Status change */}
      <Card>
        <CardContent className="p-3 flex gap-2 items-end">
          <div className="flex-1">
            <Label className="text-xs">Статус рейсу</Label>
            <Select value={newStatus} onValueChange={(v) => setNewStatus(v ?? '')}>
              <SelectTrigger><SelectValue>{newStatus ? (TRIP_STATUSES[newStatus]?.label || newStatus) : 'Змінити статус'}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="planned">Заплановано</SelectItem>
                <SelectItem value="in_progress">В дорозі</SelectItem>
                <SelectItem value="completed">Завершено</SelectItem>
                <SelectItem value="cancelled">Скасовано</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleStatusChange} disabled={!newStatus || saving} size="sm">
            Змінити
          </Button>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-lg border p-3 text-center">
          <div className="text-2xl font-bold">{trip._count.parcels}</div>
          <div className="text-xs text-gray-500">посилок</div>
        </div>
        <div className="bg-white rounded-lg border p-3 text-center">
          <div className="text-2xl font-bold">{totalPlaces}</div>
          <div className="text-xs text-gray-500">місць</div>
        </div>
        <div className="bg-white rounded-lg border p-3 text-center">
          <div className="text-2xl font-bold">{totalWeight.toFixed(1)}</div>
          <div className="text-xs text-gray-500">кг</div>
        </div>
      </div>

      {/* Pickup plan (EU→UA) — group parcels by pickup point + courier pickups */}
      {trip.direction === 'eu_to_ua' && trip.parcels.length > 0 && (() => {
        const byPoint = new Map<string, { name: string; city: string; address: string; pointId: string; items: typeof trip.parcels }>();
        const courierPickups: typeof trip.parcels = [];
        const external: typeof trip.parcels = [];
        const direct: typeof trip.parcels = [];

        for (const p of trip.parcels) {
          if (p.collectionMethod === 'pickup_point' && p.collectionPoint) {
            const key = p.collectionPoint.id;
            const existing = byPoint.get(key);
            if (existing) existing.items.push(p);
            else byPoint.set(key, {
              pointId: p.collectionPoint.id,
              name: p.collectionPoint.name || `${p.collectionPoint.city}, ${p.collectionPoint.address}`,
              city: p.collectionPoint.city,
              address: p.collectionPoint.address,
              items: [p],
            });
          } else if (p.collectionMethod === 'courier_pickup') {
            courierPickups.push(p);
          } else if (p.collectionMethod === 'external_shipping') {
            external.push(p);
          } else if (p.collectionMethod === 'direct_to_driver') {
            direct.push(p);
          }
        }

        if (byPoint.size === 0 && courierPickups.length === 0 && external.length === 0 && direct.length === 0) {
          return null;
        }

        return (
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-base">📍 План забору в Європі</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0 divide-y">
              {Array.from(byPoint.values()).map(g => (
                <div key={g.pointId} className="px-4 py-3">
                  <div className="flex items-start justify-between mb-1">
                    <Link href={`/collection-points/${g.pointId}`} className="hover:underline">
                      <div className="font-medium text-sm">🏢 {g.name}</div>
                      {g.name !== `${g.city}, ${g.address}` && (
                        <div className="text-xs text-gray-500">{g.city}, {g.address}</div>
                      )}
                    </Link>
                    <Badge variant="secondary" className="text-xs shrink-0">{g.items.length} пос.</Badge>
                  </div>
                  <div className="text-xs text-gray-500">
                    {g.items.map(p => (
                      <Link key={p.id} href={`/parcels/${p.id}`} className="inline-block mr-2 hover:underline">
                        {p.internalNumber}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}

              {courierPickups.length > 0 && (
                <div className="px-4 py-3">
                  <div className="flex items-start justify-between mb-1">
                    <div className="font-medium text-sm">🚐 Виклики курʼєра</div>
                    <Badge variant="secondary" className="text-xs shrink-0">{courierPickups.length} пос.</Badge>
                  </div>
                  <div className="space-y-1">
                    {courierPickups.map(p => (
                      <Link key={p.id} href={`/parcels/${p.id}`} className="block text-xs hover:bg-gray-50 rounded px-1">
                        <span className="font-mono">{p.internalNumber}</span>
                        <span className="text-gray-500"> — {p.sender.lastName} {p.sender.firstName}</span>
                        {p.collectionAddress && (
                          <span className="text-gray-400"> · {p.collectionAddress}</span>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {external.length > 0 && (
                <div className="px-4 py-3">
                  <div className="flex items-start justify-between mb-1">
                    <div className="font-medium text-sm">📦 Очікуємо локальної пошти</div>
                    <Badge variant="secondary" className="text-xs shrink-0">{external.length} пос.</Badge>
                  </div>
                  <div className="text-xs text-gray-500">
                    {external.map(p => (
                      <Link key={p.id} href={`/parcels/${p.id}`} className="inline-block mr-2 hover:underline">
                        {p.internalNumber}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {direct.length > 0 && (
                <div className="px-4 py-3">
                  <div className="flex items-start justify-between mb-1">
                    <div className="font-medium text-sm">🤝 Передати водію напряму</div>
                    <Badge variant="secondary" className="text-xs shrink-0">{direct.length} пос.</Badge>
                  </div>
                  <div className="text-xs text-gray-500">
                    {direct.map(p => (
                      <Link key={p.id} href={`/parcels/${p.id}`} className="inline-block mr-2 hover:underline">
                        {p.internalNumber}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Parcels list */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-base">Посилки рейсу</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="divide-y">
            {trip.parcels.map(p => (
              <div key={p.id} className="px-4 py-3 flex items-start justify-between hover:bg-gray-50">
                <Link href={`/parcels/${p.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    {p.shortNumber && (
                      <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">#{p.shortNumber}</span>
                    )}
                    <span className="font-mono text-sm font-medium">{p.internalNumber}</span>
                    <Badge className={`text-xs ${STATUS_COLORS[p.status]}`}>
                      {STATUS_LABELS[p.status]}
                    </Badge>
                  </div>
                  <div className="text-sm">
                    {p.receiver.lastName} {p.receiver.firstName}
                    <span className="text-gray-400 ml-1">{p.receiver.phone}</span>
                  </div>
                  {p.receiverAddress && (
                    <div className="text-xs text-gray-400">
                      {p.receiverAddress.city}
                      {p.receiverAddress.street ? `, ${p.receiverAddress.street}` : ''}
                    </div>
                  )}
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right text-sm">
                    <div>{p.totalWeight ? formatWeight(Number(p.totalWeight)) : '—'}</div>
                    <div className="text-xs text-gray-400">{p.totalPlacesCount} м.</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:text-red-600"
                    onClick={(e) => { e.preventDefault(); handleRemoveParcel(p.id); }}
                  >
                    &times;
                  </Button>
                </div>
              </div>
            ))}
            {trip.parcels.length === 0 && (
              <div className="text-center py-6 text-gray-500 text-sm">
                Немає посилок. Прив&apos;яжіть посилки через сторінку деталей посилки.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
