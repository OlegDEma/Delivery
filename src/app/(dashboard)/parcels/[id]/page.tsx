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
import { STATUS_LABELS, STATUS_COLORS, type ParcelStatusType } from '@/lib/constants/statuses';
import { STATUS_TRANSITIONS, isTerminal } from '@/lib/parcels/status-transitions';
import { useAuth } from '@/lib/hooks/use-auth';
import { Camera, StickyNote, Lock, Pencil } from 'lucide-react';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';
import { formatDateTime } from '@/lib/utils/format';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import { CopyButton } from '@/components/shared/copy-button';
import { PhoneLink } from '@/components/shared/phone-link';
import { AddressLink } from '@/components/shared/address-link';
import { ShareButton } from '@/components/shared/share-button';
import { ParcelDetailsCard } from '@/components/parcels/parcel-details-card';
import { ParcelPaymentCard } from '@/components/parcels/parcel-payment-card';
import { ParcelPlacesCard } from '@/components/parcels/parcel-places-card';
import { TripSelector, type TripOption } from '@/components/parcels/trip-selector';
import { toast } from 'sonner';

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
  createdSource: string | null;
  sender: {
    firstName: string; lastName: string; phone: string;
    addresses: { city: string; street: string | null; country: string }[];
  };
  senderAddress: { city: string; street: string | null; building: string | null; landmark: string | null; country: string | null } | null;
  receiver: {
    firstName: string; lastName: string; phone: string;
    addresses: { city: string; street: string | null; country: string }[];
  };
  receiverAddress: {
    city: string; street: string | null; building: string | null; apartment: string | null;
    landmark: string | null; npWarehouseNum: string | null; deliveryMethod: string; country: string;
  } | null;
  places: {
    id: string; placeNumber: number; weight: number | null; length: number | null;
    width: number | null; height: number | null; volumetricWeight: number | null;
    needsPackaging: boolean; packagingDone: boolean; itnPlace: string | null;
  }[];
  statusHistory: {
    status: string; changedAt: string; notes: string | null;
    changedBy: { fullName: string } | null;
  }[];
  auditLog?: {
    id: string; event: string; actor: string | null;
    payload: unknown; createdAt: string;
  }[];
  trip: { id: string; departureDate: string; country: string; direction: string } | null;
  assignedCourier: { id: string; fullName: string } | null;
  createdBy: { fullName: string } | null;
  // Collection
  collectionMethod: string | null;
  collectionPointId: string | null;
  collectionDate: string | null;
  collectionAddress: string | null;
  collectedAt: string | null;
  collectionPoint: {
    id: string; name: string | null; country: string; city: string; address: string;
    contactPhone: string | null; workingHours: string | null; workingDays: string[];
  } | null;
  collectedBy: { id: string; fullName: string } | null;
}

export default function ParcelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { role } = useAuth();
  const isSuperAdmin = role === 'super_admin';
  const [parcel, setParcel] = useState<ParcelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [newStatus, setNewStatus] = useState('');
  const [npTtn, setNpTtn] = useState('');
  const [editTtn, setEditTtn] = useState(false);
  const [editTrip, setEditTrip] = useState(false);
  const [saving, setSaving] = useState(false);
  const [trips, setTrips] = useState<TripOption[]>([]);
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

  async function handleConfirmClientOrder() {
    if (!parcel) return;
    const targetStatus = parcel.direction === 'eu_to_ua'
      ? 'accepted_for_transport_to_ua'
      : 'accepted_for_transport_to_eu';
    setSaving(true);
    const res = await fetch(`/api/parcels/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: targetStatus,
        statusNote: 'Замовлення клієнта підтверджено',
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success('Замовлення підтверджено і прийнято до перевезення');
      fetchParcel();
    } else {
      toast.error('Помилка підтвердження');
    }
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

  // Допустимі наступні статуси з матриці переходів.
  const nextStatuses = STATUS_TRANSITIONS[parcel.status] ?? [];

  // Після статусу "Прийнято до перевезення" редагування блоків «Місця»
  // (вага/розміри) та «Деталі» заборонене всім, окрім Суперадміна.
  // Базою для "locked" — всі статуси після прийому включно.
  const LOCKED_STATUSES: ParcelStatusType[] = [
    'accepted_for_transport_to_ua', 'in_transit_to_ua', 'at_lviv_warehouse', 'at_nova_poshta', 'delivered_ua',
    'accepted_for_transport_to_eu', 'in_transit_to_eu', 'at_eu_warehouse', 'delivered_eu',
  ];
  const isAccepted = LOCKED_STATUSES.includes(parcel.status);
  const isEditLocked = isAccepted && !isSuperAdmin;

  const isClientOrderPending =
    parcel.status === 'draft' &&
    (parcel.createdSource === 'client_web' || parcel.createdSource === 'client_telegram');

  return (
    <div className="max-w-2xl space-y-4">
      <Breadcrumbs items={[
        { label: 'Посилки', href: '/parcels' },
        { label: parcel.internalNumber },
      ]} />

      {/* Client order — awaiting confirmation */}
      {isClientOrderPending && (
        <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-300 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="text-2xl">⚠️</div>
            <div className="flex-1">
              <div className="font-semibold text-yellow-900 mb-1">
                Замовлення клієнта — очікує підтвердження
              </div>
              <div className="text-sm text-yellow-800 mb-3">
                Перевірте дані (адреси, вагу, розміри, опис), внесіть корективи і натисніть «Підтвердити».
                Статус зміниться на «Прийнято до перевезення» і посилка буде автоматично прив&apos;язана до найближчого рейсу.
              </div>
              <Button
                onClick={handleConfirmClientOrder}
                disabled={saving}
                className="bg-yellow-600 hover:bg-yellow-700 text-white"
              >
                {saving ? 'Підтвердження...' : '✓ Підтвердити замовлення'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header — ІТН та ТТН поряд у самому верху (за ТЗ). */}
      <div>
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <h1 className="text-xl font-bold font-mono">{parcel.internalNumber}</h1>
          <Badge className={STATUS_COLORS[parcel.status]}>
            {STATUS_LABELS[parcel.status]}
          </Badge>
        </div>
        <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
          <span>ІТН: <span className="font-mono">{parcel.itn}</span></span>
          <CopyButton text={parcel.itn} />
          <span className="text-gray-300">|</span>
          {parcel.npTtn ? (
            <>
              <span>ТТН: <span className="font-mono">{parcel.npTtn}</span></span>
              <CopyButton text={parcel.npTtn} />
              <button
                type="button"
                onClick={() => setEditTtn((v) => !v)}
                className="text-blue-600 hover:underline inline-flex items-center gap-0.5"
                aria-label="Редагувати ТТН"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditTtn((v) => !v)}
              className="text-blue-600 hover:underline"
            >
              + ТТН
            </button>
          )}
          <span className="text-gray-300">|</span>
          <span>{formatDateTime(parcel.createdAt)}</span>
          {parcel.createdBy && <span className="text-gray-400">· {parcel.createdBy.fullName}</span>}
        </div>

        {/* Inline TTN editor */}
        {editTtn && (
          <div className="mt-2 flex gap-2 items-center">
            <Input
              value={npTtn}
              onChange={(e) => setNpTtn(e.target.value)}
              placeholder="20000000000000"
              className="font-mono max-w-xs"
            />
            <Button size="sm" onClick={async () => { await handleSaveNpTtn(); setEditTtn(false); }} disabled={saving}>
              Зберегти
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setNpTtn(parcel.npTtn || ''); setEditTtn(false); }}>
              Скасувати
            </Button>
          </div>
        )}

        <div className="flex gap-2 mt-2 flex-wrap">
          <Link href={`/parcels/${parcel.id}/print`}>
            <Button variant="outline" size="sm">Друк етикетки</Button>
          </Link>
          <Link href={`/parcels/new?repeat=${parcel.id}`}>
            <Button variant="outline" size="sm">Повторити</Button>
          </Link>
          <ShareButton
            parcelNumber={parcel.internalNumber}
            receiverName={`${parcel.receiver.lastName} ${parcel.receiver.firstName}`}
            receiverPhone={parcel.receiver.phone}
          />
        </div>
      </div>

      {/* Банер блокування редагування */}
      {isAccepted && (
        <div className={`rounded-lg border px-3 py-2 flex items-start gap-2 text-sm ${
          isSuperAdmin ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-gray-50 border-gray-200 text-gray-700'
        }`}>
          <Lock className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            {isSuperAdmin ? (
              <>Посилка прийнята до перевезення. Редагування місць і деталей доступне тільки вам як Суперадміну.</>
            ) : (
              <>Посилка прийнята до перевезення. Редагування ваги, розмірів і деталей заборонено — зверніться до Суперадміна.</>
            )}
          </div>
        </div>
      )}

      {/* Остання нотатка — за ТЗ видно зразу як заходиш в посилку. */}
      {(() => {
        const latestNote = parcel.statusHistory.find((h) => h.notes && h.notes.trim());
        if (!latestNote) return null;
        return (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 rounded-r px-3 py-2 flex items-start gap-2">
            <StickyNote className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-yellow-900 whitespace-pre-wrap">{latestNote.notes}</div>
              <div className="text-xs text-yellow-700 mt-0.5">
                {formatDateTime(latestNote.changedAt)}
                {latestNote.changedBy && ` · ${latestNote.changedBy.fullName}`}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ТЗ: після «Доставлено» статус міняти не можна нікому. */}
      {isTerminal(parcel.status) && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center gap-2 text-sm text-green-800">
          <Lock className="w-4 h-4 shrink-0" />
          Посилка доставлена. Зміна статусу неможлива.
        </div>
      )}

      {/* Змінити статус — список обмежено правилами переходу (status-transitions.ts). */}
      {nextStatuses.length > 0 && !isTerminal(parcel.status) && (
        <Card>
          <CardContent className="p-3 flex gap-2 items-end">
            <div className="flex-1">
              <Label className="text-xs">Змінити статус</Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v ?? '')}>
                <SelectTrigger>
                  <SelectValue>{newStatus ? (STATUS_LABELS[newStatus as ParcelStatusType] || newStatus) : 'Виберіть статус'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {nextStatuses.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleStatusChange} disabled={!newStatus || saving} size="sm">
              {saving ? '...' : 'Змінити'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Відправник / Отримувач — компактно, без карток (ТЗ: максимально
          стиснути інфо-блоки). Label-color відрізняє сторони. */}
      <div className="text-sm space-y-1.5 py-2 border-y">
        <div className="flex items-baseline gap-2">
          <span className="text-green-600 font-medium shrink-0 w-16">Від:</span>
          <div className="min-w-0 flex-1">
            <span className="font-medium">{parcel.sender.lastName} {parcel.sender.firstName}</span>
            <span className="text-gray-400 mx-1">·</span>
            <PhoneLink phone={parcel.sender.phone} />
            {parcel.senderAddress && (
              <span className="text-xs text-gray-500 ml-2">
                <AddressLink address={`${parcel.senderAddress.city}${parcel.senderAddress.street ? `, ${parcel.senderAddress.street}` : ''}${parcel.senderAddress.building ? ` ${parcel.senderAddress.building}` : ''}`} />
                {parcel.senderAddress.landmark ? ` (${parcel.senderAddress.landmark})` : ''}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-blue-600 font-medium shrink-0 w-16">Кому:</span>
          <div className="min-w-0 flex-1">
            <span className="font-medium">{parcel.receiver.lastName} {parcel.receiver.firstName}</span>
            <span className="text-gray-400 mx-1">·</span>
            <PhoneLink phone={parcel.receiver.phone} />
            {parcel.receiverAddress && (
              <span className="text-xs text-gray-500 ml-2">
                <AddressLink address={`${COUNTRY_LABELS[parcel.receiverAddress.country as CountryCode] || parcel.receiverAddress.country}, ${parcel.receiverAddress.city}${parcel.receiverAddress.street ? `, ${parcel.receiverAddress.street}` : ''}${parcel.receiverAddress.building ? ` ${parcel.receiverAddress.building}` : ''}`} />
                {parcel.receiverAddress.apartment ? `, кв. ${parcel.receiverAddress.apartment}` : ''}
                {parcel.receiverAddress.npWarehouseNum ? ` | НП №${parcel.receiverAddress.npWarehouseNum}` : ''}
                {parcel.receiverAddress.landmark ? ` (${parcel.receiverAddress.landmark})` : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Places (editable) */}
      <ParcelPlacesCard
        parcelId={parcel.id}
        places={parcel.places}
        totalWeight={parcel.totalWeight}
        direction={parcel.direction}
        // For pricing lookup: the EU country is determined by (in order)
        // trip.country → collectionPoint.country → sender's address country.
        // Sender's registered address may be in UA (e.g. Ukrainian living in NL),
        // so we prefer actual logistics data.
        senderCountry={
          (parcel.trip?.country && parcel.trip.country !== 'UA' ? parcel.trip.country : null)
          || parcel.collectionPoint?.country
          || parcel.senderAddress?.country
          || parcel.sender.addresses[0]?.country
          || null
        }
        receiverCountry={parcel.receiverAddress?.country || null}
        receiverDeliveryMethod={parcel.receiverAddress?.deliveryMethod || null}
        declaredValue={parcel.declaredValue}
        needsPackaging={parcel.needsPackaging}
        onUpdate={fetchParcel}
        readOnly={isEditLocked}
      />

      {/* Details — після accepted редагування заборонено всім крім super_admin */}
      <ParcelDetailsCard parcel={parcel} onUpdate={fetchParcel} readOnly={isEditLocked} />

      {/* Payment card */}
      <ParcelPaymentCard parcel={parcel} onUpdate={fetchParcel} />

      {/* «Вікно доставки (4 години)» прибрано — за ТЗ це поле
          потрібне лише в Маршрутах, а не в тілі посилки. */}

      {/* Рейс — показуємо лише дату фактичного рейсу + кур'єра. Редагування
          під кнопкою олівця (щоб не захаращувати картку) */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm">
              <span className="text-gray-500">Рейс:</span>{' '}
              {parcel.trip ? (
                <span className="font-medium">
                  {new Date(parcel.trip.departureDate).toLocaleDateString('uk-UA')}
                  <span className="text-gray-400 ml-1">({parcel.trip.country})</span>
                </span>
              ) : (
                <span className="text-gray-400">Не прив&apos;язано</span>
              )}
              <span className="text-gray-300 mx-2">|</span>
              <span className="text-gray-500">Кур&apos;єр:</span>{' '}
              <span className="font-medium">
                {parcel.assignedCourier?.fullName || <span className="text-gray-400">Не призначено</span>}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setEditTrip((v) => !v)}
              className="text-blue-600 hover:underline text-xs inline-flex items-center gap-1"
            >
              <Pencil className="w-3 h-3" /> Редагувати
            </button>
          </div>
          {editTrip && (
            <div className="mt-3 space-y-2 border-t pt-3">
              <TripSelector
                trips={trips}
                direction={parcel.direction}
                selectedTripId={parcel.trip?.id || ''}
                onChange={(tripId) => handleAssignTrip(tripId)}
                compact
              />
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
                    {couriers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Фото і нотатки — компактні кнопки-дії (замість повноцінних карток). */}
      <div className="flex gap-2 flex-wrap">
        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md bg-white cursor-pointer hover:bg-gray-50 transition-colors">
          <Camera className="w-4 h-4 text-gray-500" />
          Додати фото
          {(parcel as unknown as { photos?: string[] }).photos?.length ? (
            <span className="ml-1 text-xs bg-blue-100 text-blue-700 px-1.5 rounded-full">
              {(parcel as unknown as { photos: string[] }).photos.length}
            </span>
          ) : null}
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
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const note = window.prompt('Додати нотатку до посилки:');
            if (!note || !note.trim()) return;
            fetch(`/api/parcels/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: parcel.status, statusNote: note }),
            }).then(fetchParcel);
          }}
        >
          <StickyNote className="w-4 h-4 mr-1" /> Додати нотатку
        </Button>
      </div>

      {/* Галерея фото (якщо є) — під кнопкою */}
      {(parcel as unknown as { photos?: string[] }).photos?.length ? (
        <div className="flex gap-2 flex-wrap">
          {(parcel as unknown as { photos: string[] }).photos.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
              <img
                src={url}
                alt={`Фото ${i + 1}`}
                className="w-16 h-16 object-cover rounded-lg border hover:opacity-80"
              />
            </a>
          ))}
        </div>
      ) : null}

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

      {/* Audit Journal — other operations (deletions, cost overrides, etc.) */}
      {parcel.auditLog && parcel.auditLog.length > 0 && (
        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-sm">Журнал операцій</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <div className="divide-y">
              {parcel.auditLog.map((a) => (
                <div key={a.id} className="py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-900">{a.event}</span>
                    <span className="text-gray-400">{formatDateTime(a.createdAt)}</span>
                  </div>
                  <div className="text-gray-500">{a.actor || 'Система'}</div>
                  {a.payload != null && typeof a.payload === 'object' && (
                    <div className="text-gray-400 font-mono break-all line-clamp-2 mt-0.5">
                      {JSON.stringify(a.payload)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
