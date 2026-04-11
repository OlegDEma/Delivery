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
import { STATUS_LABELS, STATUS_COLORS, STATUS_FLOW_EU_TO_UA, STATUS_FLOW_UA_TO_EU, type ParcelStatusType } from '@/lib/constants/statuses';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';
import { formatDateTime, formatWeight } from '@/lib/utils/format';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import { CopyButton } from '@/components/shared/copy-button';
import { PhoneLink } from '@/components/shared/phone-link';
import { AddressLink } from '@/components/shared/address-link';
import { Textarea } from '@/components/ui/textarea';
import { ShareButton } from '@/components/shared/share-button';

interface ParcelDetail {
  id: string;
  itn: string;
  internalNumber: string;
  sequentialNumber: number;
  shortNumber: number | null;
  direction: string;
  status: ParcelStatusType;
  shipmentType: string;
  description: string | null;
  declaredValue: number | null;
  totalWeight: number | null;
  totalVolumetricWeight: number | null;
  totalPlacesCount: number;
  payer: string;
  paymentMethod: string;
  paymentInUkraine: boolean;
  needsPackaging: boolean;
  npTtn: string | null;
  npTrackingStatus: string | null;
  estimatedDeliveryStart: string | null;
  estimatedDeliveryEnd: string | null;
  isPaid: boolean;
  totalCost: number | null;
  createdAt: string;
  sender: {
    firstName: string; lastName: string; phone: string;
    addresses: { city: string; street: string | null; country: string }[];
  };
  senderAddress: { city: string; street: string | null; building: string | null; landmark: string | null } | null;
  receiver: {
    firstName: string; lastName: string; phone: string;
    addresses: { city: string; street: string | null; country: string }[];
  };
  receiverAddress: {
    city: string; street: string | null; building: string | null; apartment: string | null;
    landmark: string | null; npWarehouseNum: string | null; deliveryMethod: string; country: string;
  } | null;
  places: {
    placeNumber: number; weight: number | null; length: number | null;
    width: number | null; height: number | null; volumetricWeight: number | null;
    needsPackaging: boolean; packagingDone: boolean; itnPlace: string | null;
  }[];
  statusHistory: {
    status: string; changedAt: string; notes: string | null;
    changedBy: { fullName: string } | null;
  }[];
  trip: { id: string; departureDate: string; country: string; direction: string } | null;
  assignedCourier: { id: string; fullName: string } | null;
  createdBy: { fullName: string } | null;
}

export default function ParcelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [parcel, setParcel] = useState<ParcelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [newStatus, setNewStatus] = useState('');
  const [npTtn, setNpTtn] = useState('');
  const [saving, setSaving] = useState(false);
  const [trips, setTrips] = useState<{ id: string; departureDate: string; country: string; direction: string }[]>([]);
  const [couriers, setCouriers] = useState<{ id: string; fullName: string }[]>([]);

  useEffect(() => {
    fetch('/api/trips').then(r => r.ok ? r.json() : []).then(setTrips);
    fetch('/api/users').then(r => r.ok ? r.json() : []).then((users: { id: string; fullName: string; role: string }[]) =>
      setCouriers(users.filter((u: { role: string }) => u.role === 'driver_courier' || u.role === 'warehouse_worker'))
    );
  }, []);

  async function handleAssignTrip(tripId: string) {
    await fetch(`/api/parcels/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId: tripId || null }),
    });
    fetchParcel();
  }

  async function handleAssignCourier(courierId: string) {
    await fetch(`/api/parcels/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedCourierId: courierId || null }),
    });
    fetchParcel();
  }

  async function fetchParcel() {
    const res = await fetch(`/api/parcels/${id}`);
    if (res.ok) {
      const data = await res.json();
      setParcel(data);
      setNpTtn(data.npTtn || '');
    }
    setLoading(false);
  }

  useEffect(() => { fetchParcel(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStatusChange() {
    if (!newStatus) return;
    setSaving(true);
    await fetch(`/api/parcels/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    setNewStatus('');
    await fetchParcel();
    setSaving(false);
  }

  async function handleSaveNpTtn() {
    setSaving(true);
    await fetch(`/api/parcels/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ npTtn }),
    });
    await fetchParcel();
    setSaving(false);
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Завантаження...</div>;
  if (!parcel) return <div className="text-center py-12 text-red-500">Посилку не знайдено</div>;

  const statusFlow = parcel.direction === 'eu_to_ua' ? STATUS_FLOW_EU_TO_UA : STATUS_FLOW_UA_TO_EU;
  const currentIdx = statusFlow.indexOf(parcel.status);
  const nextStatuses = currentIdx >= 0 ? statusFlow.slice(currentIdx + 1) : [];

  return (
    <div className="max-w-2xl space-y-4">
      <Breadcrumbs items={[
        { label: 'Посилки', href: '/parcels' },
        { label: parcel.internalNumber },
      ]} />

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-xl font-bold font-mono">{parcel.internalNumber}</h1>
          <Badge className={STATUS_COLORS[parcel.status]}>
            {STATUS_LABELS[parcel.status]}
          </Badge>
        </div>
        <div className="text-xs text-gray-400">
          ІТН: {parcel.itn} <CopyButton text={parcel.itn} />{parcel.npTtn && <> | ТТН: {parcel.npTtn} <CopyButton text={parcel.npTtn} /></>} | Створено: {formatDateTime(parcel.createdAt)}
          {parcel.createdBy && ` | ${parcel.createdBy.fullName}`}
        </div>
        <div className="flex gap-2 mt-2">
          <Link href={`/parcels/${parcel.id}/print`}>
            <Button variant="outline" size="sm">Друк етикетки</Button>
          </Link>
          <Link href={`/parcels/new?repeat=${parcel.id}`}>
            <Button variant="outline" size="sm">Повторити</Button>
          </Link>
          <ShareButton parcelNumber={parcel.internalNumber} />
        </div>
      </div>

      {/* Status change */}
      {nextStatuses.length > 0 && (
        <Card>
          <CardContent className="p-3 flex gap-2 items-end">
            <div className="flex-1">
              <Label className="text-xs">Змінити статус</Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v ?? '')}>
                <SelectTrigger><SelectValue>{newStatus ? (STATUS_LABELS[newStatus as ParcelStatusType] || newStatus) : 'Виберіть статус'}</SelectValue></SelectTrigger>
                <SelectContent>
                  {nextStatuses.map(s => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                  {parcel.direction === 'ua_to_eu' && (
                    <SelectItem value="not_received">Не отримано</SelectItem>
                  )}
                  <SelectItem value="refused">Відмова від отримання</SelectItem>
                  <SelectItem value="returned">Повернено</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleStatusChange} disabled={!newStatus || saving} size="sm">
              {saving ? '...' : 'Змінити'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Sender & Receiver */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-sm text-green-600">Відправник</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <div className="font-medium text-sm">{parcel.sender.lastName} {parcel.sender.firstName}</div>
            <div className="text-sm"><PhoneLink phone={parcel.sender.phone} /></div>
            {parcel.senderAddress && (
              <div className="text-xs text-gray-400 mt-1">
                <AddressLink address={`${parcel.senderAddress.city}${parcel.senderAddress.street ? `, ${parcel.senderAddress.street}` : ''}${parcel.senderAddress.building ? ` ${parcel.senderAddress.building}` : ''}`} />
                {parcel.senderAddress.landmark ? ` (${parcel.senderAddress.landmark})` : ''}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-sm text-blue-600">Отримувач</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <div className="font-medium text-sm">{parcel.receiver.lastName} {parcel.receiver.firstName}</div>
            <div className="text-sm"><PhoneLink phone={parcel.receiver.phone} /></div>
            {parcel.receiverAddress && (
              <div className="text-xs text-gray-400 mt-1">
                <AddressLink address={`${COUNTRY_LABELS[parcel.receiverAddress.country as CountryCode] || parcel.receiverAddress.country}, ${parcel.receiverAddress.city}${parcel.receiverAddress.street ? `, ${parcel.receiverAddress.street}` : ''}${parcel.receiverAddress.building ? ` ${parcel.receiverAddress.building}` : ''}`} />
                {parcel.receiverAddress.apartment ? `, кв. ${parcel.receiverAddress.apartment}` : ''}
                {parcel.receiverAddress.npWarehouseNum ? ` | НП №${parcel.receiverAddress.npWarehouseNum}` : ''}
                {parcel.receiverAddress.landmark ? ` (${parcel.receiverAddress.landmark})` : ''}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Places */}
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm">Місця ({parcel.totalPlacesCount})</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          <div className="space-y-2">
            {parcel.places.map(place => (
              <div key={place.placeNumber} className="flex items-center justify-between text-sm border-b pb-1 last:border-0">
                <div>
                  <span className="font-medium">#{place.placeNumber}</span>
                  {place.itnPlace && (
                    <span className="text-xs text-gray-400 ml-2 font-mono">{place.itnPlace}</span>
                  )}
                  {place.needsPackaging && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {place.packagingDone ? 'Запаковано' : 'Пакування'}
                    </Badge>
                  )}
                </div>
                <div className="text-right text-xs text-gray-600">
                  {place.weight ? formatWeight(Number(place.weight)) : '—'}
                  {place.length && place.width && place.height && (
                    <span className="ml-2">{Number(place.length)}x{Number(place.width)}x{Number(place.height)} см</span>
                  )}
                  {place.volumetricWeight && Number(place.volumetricWeight) > 0 && (
                    <span className="ml-2 text-gray-400">(об. {formatWeight(Number(place.volumetricWeight))})</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t flex justify-between text-sm font-medium">
            <span>Загальна вага</span>
            <span>{parcel.totalWeight ? formatWeight(Number(parcel.totalWeight)) : '—'}</span>
          </div>
        </CardContent>
      </Card>

      {/* Payment & Details */}
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm">Деталі</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Напрямок</span>
            <span>{parcel.direction === 'eu_to_ua' ? 'Європа → Україна' : 'Україна → Європа'}</span>
          </div>
          {parcel.description && (
            <div className="flex justify-between">
              <span className="text-gray-500">Опис</span>
              <span>{parcel.description}</span>
            </div>
          )}
          {parcel.declaredValue && (
            <div className="flex justify-between">
              <span className="text-gray-500">Оголошена вартість</span>
              <span>{Number(parcel.declaredValue).toFixed(2)} EUR</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">Платник</span>
            <span>{parcel.payer === 'sender' ? 'Відправник' : 'Отримувач'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Оплата</span>
            <span>
              {parcel.paymentMethod === 'cash' ? 'Готівка' : 'Безготівка'}
              {parcel.paymentInUkraine ? ' (в Україні)' : ''}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Сплачено</span>
            <span>{parcel.isPaid ? 'Так' : 'Ні'}</span>
          </div>
          {parcel.assignedCourier && (
            <div className="flex justify-between">
              <span className="text-gray-500">Кур&apos;єр</span>
              <span>{parcel.assignedCourier.fullName}</span>
            </div>
          )}
          {parcel.estimatedDeliveryStart && parcel.estimatedDeliveryEnd && (
            <div className="flex justify-between">
              <span className="text-gray-500">Вікно доставки</span>
              <span>
                {new Date(parcel.estimatedDeliveryStart).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                {' — '}
                {new Date(parcel.estimatedDeliveryEnd).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mark as paid */}
      {!parcel.isPaid && parcel.totalCost && (
        <Button
          variant="outline"
          className="w-full text-green-600 border-green-200 hover:bg-green-50"
          onClick={async () => {
            await fetch(`/api/parcels/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ isPaid: true }),
            });
            fetchParcel();
          }}
        >
          Позначити як оплачено ({parcel.totalCost} EUR)
        </Button>
      )}

      {/* Estimated delivery window */}
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm">Вікно доставки (4 години)</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          <div className="flex gap-2 items-end">
            <div>
              <Label className="text-xs">Дата</Label>
              <Input
                type="date"
                defaultValue={parcel.estimatedDeliveryStart ? new Date(parcel.estimatedDeliveryStart).toISOString().split('T')[0] : ''}
                id="delivery-date"
              />
            </div>
            <div>
              <Label className="text-xs">З</Label>
              <Input
                type="time"
                defaultValue={parcel.estimatedDeliveryStart ? new Date(parcel.estimatedDeliveryStart).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''}
                id="delivery-from"
              />
            </div>
            <div>
              <Label className="text-xs">До</Label>
              <Input
                type="time"
                defaultValue={parcel.estimatedDeliveryEnd ? new Date(parcel.estimatedDeliveryEnd).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''}
                id="delivery-to"
              />
            </div>
            <Button size="sm" onClick={async () => {
              const date = (document.getElementById('delivery-date') as HTMLInputElement).value;
              const from = (document.getElementById('delivery-from') as HTMLInputElement).value;
              const to = (document.getElementById('delivery-to') as HTMLInputElement).value;
              if (!date || !from || !to) return;
              await fetch(`/api/parcels/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  estimatedDeliveryStart: `${date}T${from}:00`,
                  estimatedDeliveryEnd: `${date}T${to}:00`,
                }),
              });
              fetchParcel();
            }}>
              Зберегти
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Assign trip & courier */}
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm">Рейс та кур&apos;єр</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0 space-y-2">
          <div>
            <Label className="text-xs">Рейс</Label>
            <Select
              value={parcel.trip?.id || '_none'}
              onValueChange={(v) => handleAssignTrip(v === '_none' ? '' : (v ?? ''))}
            >
              <SelectTrigger>
                <SelectValue>
                  {parcel.trip
                    ? `${parcel.trip.country} ${parcel.trip.direction === 'eu_to_ua' ? '→UA' : '←UA'} ${new Date(parcel.trip.departureDate).toLocaleDateString('uk-UA')}`
                    : "Не прив'язано"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Не прив&apos;язано</SelectItem>
                {trips.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.country} {t.direction === 'eu_to_ua' ? '→UA' : '←UA'} {new Date(t.departureDate).toLocaleDateString('uk-UA')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Кур&apos;єр</Label>
            <Select
              value={parcel.assignedCourier?.id || '_none'}
              onValueChange={(v) => handleAssignCourier(v === '_none' ? '' : (v ?? ''))}
            >
              <SelectTrigger>
                <SelectValue>
                  {parcel.assignedCourier ? parcel.assignedCourier.fullName : 'Не призначено'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Не призначено</SelectItem>
                {couriers.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* NP Integration */}
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm">Нова Пошта</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0 space-y-3">
          {/* Manual TTN input */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label className="text-xs">ТТН Нової Пошти</Label>
              <Input
                value={npTtn}
                onChange={(e) => setNpTtn(e.target.value)}
                placeholder="20000000000000"
                className="font-mono"
              />
            </div>
            <Button size="sm" onClick={handleSaveNpTtn} disabled={saving}>
              Зберегти
            </Button>
          </div>

          {/* Auto-create TTN */}
          {!parcel.npTtn && (
            <div className="border-t pt-2">
              <Label className="text-xs text-gray-500 mb-1 block">Або створити ТТН автоматично через API НП</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  setSaving(true);
                  const res = await fetch('/api/nova-poshta/ttn', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ parcelId: parcel.id }),
                  });
                  const data = await res.json();
                  if (res.ok) {
                    setNpTtn(data.ttn);
                    fetchParcel();
                  } else {
                    alert(data.error || 'Помилка створення ТТН');
                  }
                  setSaving(false);
                }}
                disabled={saving}
              >
                Створити ТТН на НП
              </Button>
            </div>
          )}

          {/* Track status */}
          {parcel.npTtn && (
            <div className="border-t pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-500">Статус на НП:</div>
                  <div className="text-sm font-medium">{parcel.npTrackingStatus || 'Невідомо'}</div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const res = await fetch(`/api/nova-poshta/tracking?ttn=${parcel.npTtn}`);
                    if (res.ok) {
                      fetchParcel();
                    }
                  }}
                >
                  Оновити
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Photos */}
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm">Фото посилки</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          {(parcel as unknown as { photos?: string[] }).photos && (parcel as unknown as { photos: string[] }).photos.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-2">
              {(parcel as unknown as { photos: string[] }).photos.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <img src={url} alt={`Фото ${i + 1}`} className="w-20 h-20 object-cover rounded-lg border hover:opacity-80" />
                </a>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer text-sm text-blue-600 hover:text-blue-800">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Додати фото
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const formData = new FormData();
                formData.append('file', file);
                await fetch(`/api/parcels/${id}/photos`, { method: 'POST', body: formData });
                fetchParcel();
              }}
            />
          </label>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm">Нотатки</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          <Textarea
            placeholder="Додати нотатку..."
            defaultValue=""
            id="parcel-note"
            rows={2}
          />
          <Button size="sm" className="mt-2" onClick={async () => {
            const note = (document.getElementById('parcel-note') as HTMLTextAreaElement).value;
            if (!note.trim()) return;
            await fetch(`/api/parcels/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: parcel.status, statusNote: note }),
            });
            (document.getElementById('parcel-note') as HTMLTextAreaElement).value = '';
            fetchParcel();
          }}>
            Додати нотатку
          </Button>
        </CardContent>
      </Card>

      {/* Status Timeline */}
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm">Історія статусів</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          <div className="space-y-3">
            {parcel.statusHistory.map((h, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full ${i === 0 ? 'bg-blue-500' : 'bg-gray-300'}`} />
                  {i < parcel.statusHistory.length - 1 && (
                    <div className="w-0.5 flex-1 bg-gray-200 mt-1" />
                  )}
                </div>
                <div className="pb-3">
                  <div className="text-sm font-medium">
                    {STATUS_LABELS[h.status as ParcelStatusType] || h.status}
                  </div>
                  <div className="text-xs text-gray-400">
                    {formatDateTime(h.changedAt)}
                    {h.changedBy && ` — ${h.changedBy.fullName}`}
                  </div>
                  {h.notes && <div className="text-xs text-gray-500 mt-0.5">{h.notes}</div>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
