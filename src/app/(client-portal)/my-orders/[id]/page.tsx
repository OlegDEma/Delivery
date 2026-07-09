'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { STATUS_LABELS, STATUS_COLORS, type ParcelStatusType } from '@/lib/constants/statuses';
import { formatDateTime, formatDate } from '@/lib/utils/format';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';
import { formatWorkingDays, type Weekday } from '@/lib/constants/collection';

/**
 * Деталі посилки для Клієнта (read-only). Створено для виправлення багу
 * з docx 03.06.2026: «Посилки створені клієнтом не клікабельні. Не можу
 * зайти в створену посилку з аккаунту клієнта».
 */
interface ParcelDetail {
  id: string;
  internalNumber: string;
  itn: string;
  npTtn: string | null;
  direction: string;
  status: ParcelStatusType;
  shipmentType: string;
  description: string | null;
  declaredValue: number | string | null;
  declaredValueCurrency: string | null;
  totalWeight: number | string | null;
  totalVolumetricWeight: number | string | null;
  totalPlacesCount: number;
  totalCost: number | string | null;
  deliveryCost: number | string | null;
  insuranceCost: number | string | null;
  packagingCost: number | string | null;
  parcelMoneyAmount: number | string | null;
  parcelMoneyCost: number | string | null;
  isPaid: boolean;
  // ТЗ docx 09.07.26: спосіб забору — для рядка «Пункт збору» в підсумку.
  collectionMethod: string | null;
  // ТЗ docx 02.07.26 (D9): поля для секції «Деталі».
  payer: string | null;
  paymentMethod: string | null;
  paymentInUkraine: boolean;
  needsPackaging: boolean;
  insuranceApplied: boolean;
  doorstepDelivery: boolean;
  createdAt: string;
  sender: { firstName: string; lastName: string; phone: string };
  receiver: { firstName: string; lastName: string; phone: string };
  receiverAddress: {
    country: string; city: string; street: string | null; building: string | null;
    postalCode: string | null; landmark: string | null; npWarehouseNum: string | null; deliveryMethod: string;
  } | null;
  senderAddress: {
    country: string | null; city: string; street: string | null; building: string | null;
    postalCode: string | null; landmark: string | null;
  } | null;
  places: {
    placeNumber: number; weight: number | string | null;
    length: number | string | null; width: number | string | null; height: number | string | null;
    volumetricWeight: number | string | null;
  }[];
  statusHistory: { status: string; changedAt: string; notes: string | null }[];
  trip: { departureDate: string; country: string } | null;
  collectionPoint: {
    name: string | null; city: string; address: string; country: string;
    postalCode: string | null; workingHours: string | null; workingDays: Weekday[];
  } | null;
}

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ТЗ docx 02.07.26 (D9): мітки для секції «Деталі» (read-only у клієнта).
const SHIPMENT_LABELS: Record<string, string> = {
  parcels_cargo: 'Посилки та вантажі', documents: 'Документи', tires_wheels: 'Шини та диски',
};
const PAYER_LABELS: Record<string, string> = { sender: 'Відправник', receiver: 'Отримувач' };
const METHOD_LABELS: Record<string, string> = { cash: 'Готівка', cashless: 'Безготівка' };

export default function MyOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [parcel, setParcel] = useState<ParcelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/client-portal/orders/${id}`)
      .then(async r => {
        if (r.ok) return r.json();
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || 'Не вдалося завантажити');
      })
      .then((d: ParcelDetail) => { setParcel(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [id]);

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Завантаження...</div>;
  }
  if (error || !parcel) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-3">{error || 'Посилку не знайдено'}</div>
        <Link href="/my-orders"><Button variant="outline">Назад до моїх замовлень</Button></Link>
      </div>
    );
  }

  const cur = parcel.declaredValueCurrency === 'UAH' ? 'грн' : 'EUR';
  const totalCost = num(parcel.totalCost);

  return (
    <div className="space-y-4 max-w-2xl">
      <Link href="/my-orders" className="text-sm text-blue-600 hover:underline">← Назад до моїх замовлень</Link>

      <div>
        <div className="flex items-center gap-3 flex-wrap mb-1">
          <h1 className="text-xl font-bold font-mono">{parcel.internalNumber}</h1>
          <Badge className={STATUS_COLORS[parcel.status]}>
            {STATUS_LABELS[parcel.status]}
          </Badge>
        </div>
        <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
          <span>ІТН: <span className="font-mono">{parcel.itn}</span></span>
          {parcel.npTtn && (
            <>
              <span className="text-gray-300">|</span>
              <span>ТТН: <span className="font-mono">{parcel.npTtn}</span></span>
            </>
          )}
          <span className="text-gray-300">|</span>
          <span>{formatDateTime(parcel.createdAt)}</span>
        </div>
      </div>

      <Card>
        <CardHeader className="py-2 px-3"><CardTitle className="text-sm">Відправлення</CardTitle></CardHeader>
        <CardContent className="px-3 pb-3 pt-0 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Напрямок</span>
            <span>{parcel.direction === 'eu_to_ua' ? 'Європа → Україна' : 'Україна → Європа'}</span>
          </div>
          {parcel.description && (
            <div className="flex justify-between gap-2">
              <span className="text-gray-500 shrink-0">Опис</span>
              <span className="text-right">{parcel.description}</span>
            </div>
          )}
          {parcel.declaredValue && (
            <div className="flex justify-between">
              <span className="text-gray-500">Оголошена вартість</span>
              <span>{num(parcel.declaredValue).toFixed(2)} {cur}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">Місць</span>
            <span>{parcel.totalPlacesCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Вага</span>
            <span>{num(parcel.totalWeight).toFixed(2)} кг</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Сплачено</span>
            <span className={parcel.isPaid ? 'text-green-600 font-medium' : 'text-red-600'}>
              {parcel.isPaid ? '✅ Так' : '❌ Ні'}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-2 px-3"><CardTitle className="text-sm">Сторони</CardTitle></CardHeader>
        <CardContent className="px-3 pb-3 pt-0 text-sm space-y-2">
          <div>
            <div className="text-xs text-gray-500">Відправник</div>
            <div>
              {parcel.sender.lastName} {parcel.sender.firstName} · <span className="text-gray-600">{parcel.sender.phone}</span>
            </div>
            {parcel.senderAddress && (
              <div className="text-xs text-gray-500">
                {parcel.senderAddress.country ? `${COUNTRY_LABELS[parcel.senderAddress.country as CountryCode] || parcel.senderAddress.country}, ` : ''}
                {parcel.senderAddress.city}
                {parcel.senderAddress.street ? `, ${parcel.senderAddress.street}` : ''}
                {parcel.senderAddress.building ? ` ${parcel.senderAddress.building}` : ''}
                {/* ТЗ docx 01.07.26: індекс для не-UA сторони. */}
                {parcel.senderAddress.country !== 'UA' && parcel.senderAddress.postalCode ? `, ${parcel.senderAddress.postalCode}` : ''}
                {/* ТЗ docx 02.07.26 (D1): орієнтир (коли вказано). */}
                {parcel.senderAddress.landmark ? ` (${parcel.senderAddress.landmark})` : ''}
              </div>
            )}
          </div>
          <div className="border-t pt-2">
            <div className="text-xs text-gray-500">Отримувач</div>
            <div>
              {parcel.receiver.lastName} {parcel.receiver.firstName} · <span className="text-gray-600">{parcel.receiver.phone}</span>
            </div>
            {parcel.receiverAddress && (
              <div className="text-xs text-gray-500">
                {COUNTRY_LABELS[parcel.receiverAddress.country as CountryCode] || parcel.receiverAddress.country},
                {' '}{parcel.receiverAddress.city}
                {parcel.receiverAddress.street ? `, ${parcel.receiverAddress.street}` : ''}
                {parcel.receiverAddress.building ? ` ${parcel.receiverAddress.building}` : ''}
                {/* ТЗ docx 01.07.26: індекс для не-UA сторони. */}
                {parcel.receiverAddress.country !== 'UA' && parcel.receiverAddress.postalCode ? `, ${parcel.receiverAddress.postalCode}` : ''}
                {/* ТЗ docx 02.07.26 (D1): орієнтир (коли вказано). */}
                {parcel.receiverAddress.landmark ? ` (${parcel.receiverAddress.landmark})` : ''}
                {parcel.receiverAddress.npWarehouseNum ? ` | НП №${parcel.receiverAddress.npWarehouseNum}` : ''}
              </div>
            )}
          </div>
          {/* ТЗ docx 09.07.26: підсумок Клієнта = підсумок Працівника. Рядок
              «Пункт збору» з КОНКРЕТНОЮ адресою, індексом і годинами — так само,
              як у детальній посилки Працівника. */}
          {parcel.direction === 'eu_to_ua' && parcel.collectionMethod === 'pickup_point' && parcel.collectionPoint && (
            <div className="border-t pt-2">
              <div className="text-xs text-gray-500">Спосіб забору</div>
              <div>
                Пункт збору — <span className="font-medium">
                  {parcel.collectionPoint.name
                    ? `${parcel.collectionPoint.name} (${parcel.collectionPoint.city}, ${parcel.collectionPoint.address})`
                    : `${parcel.collectionPoint.city}, ${parcel.collectionPoint.address}`}
                </span>
              </div>
              {(parcel.collectionPoint.postalCode || parcel.senderAddress?.postalCode) && (
                <div className="text-xs text-gray-500">
                  Індекс: {parcel.collectionPoint.postalCode || parcel.senderAddress?.postalCode}
                </div>
              )}
              {parcel.collectionPoint.workingDays?.length > 0 && (
                <div className="text-xs text-gray-400">
                  📅 {formatWorkingDays(parcel.collectionPoint.workingDays)}
                  {parcel.collectionPoint.workingHours ? ` · ${parcel.collectionPoint.workingHours}` : ''}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-2 px-3"><CardTitle className="text-sm">Параметри відправлення ({parcel.places.length})</CardTitle></CardHeader>
        <CardContent className="px-3 pb-3 pt-0 text-sm space-y-1">
          {parcel.places.map(p => (
            <div key={p.placeNumber} className="flex justify-between border-b last:border-0 pb-1">
              <span>#{p.placeNumber}</span>
              <span className="text-xs text-gray-600">
                {num(p.weight).toFixed(2)} кг
                {p.length && p.width && p.height && (
                  <span className="ml-2">{num(p.length)}×{num(p.width)}×{num(p.height)} см</span>
                )}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ТЗ docx 02.07.26 (D9): секція «Деталі» (read-only у клієнта). */}
      <Card>
        <CardHeader className="py-2 px-3"><CardTitle className="text-sm">Деталі</CardTitle></CardHeader>
        <CardContent className="px-3 pb-3 pt-0 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Вид відправлення</span>
            <span>{SHIPMENT_LABELS[parcel.shipmentType] || parcel.shipmentType}</span>
          </div>
          {parcel.payer && (
            <div className="flex justify-between">
              <span className="text-gray-500">Платник</span>
              <span>{PAYER_LABELS[parcel.payer] || parcel.payer}</span>
            </div>
          )}
          {parcel.paymentMethod && (
            <div className="flex justify-between">
              <span className="text-gray-500">Оплата</span>
              <span>
                {METHOD_LABELS[parcel.paymentMethod] || parcel.paymentMethod}
                {parcel.paymentInUkraine ? ' (в Україні)' : ''}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">Страхування</span>
            <span>{parcel.insuranceApplied ? 'Так' : 'Ні'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Пакування</span>
            <span>{parcel.needsPackaging ? 'Так' : 'Ні'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Доставка до порога</span>
            <span>{parcel.doorstepDelivery ? 'Так' : 'Ні'}</span>
          </div>
          {!!num(parcel.parcelMoneyAmount) && (
            <div className="flex justify-between">
              <span className="text-gray-500">Пакет (передача)</span>
              <span>{num(parcel.parcelMoneyAmount).toFixed(2)}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {(totalCost > 0 || parcel.deliveryCost) && (
        <Card>
          <CardHeader className="py-2 px-3"><CardTitle className="text-sm">💰 Вартість</CardTitle></CardHeader>
          <CardContent className="px-3 pb-3 pt-0 text-sm space-y-1">
            {!!num(parcel.deliveryCost) && (
              <div className="flex justify-between"><span className="text-gray-500">Доставка</span><span>{num(parcel.deliveryCost).toFixed(2)} EUR</span></div>
            )}
            {!!num(parcel.insuranceCost) && (
              <div className="flex justify-between"><span className="text-gray-500">Страхування</span><span>{num(parcel.insuranceCost).toFixed(2)} EUR</span></div>
            )}
            {!!num(parcel.packagingCost) && (
              <div className="flex justify-between"><span className="text-gray-500">Пакування</span><span>{num(parcel.packagingCost).toFixed(2)} EUR</span></div>
            )}
            {!!num(parcel.parcelMoneyCost) && (
              <div className="flex justify-between"><span className="text-gray-500">Пакет</span><span>{num(parcel.parcelMoneyCost).toFixed(2)} EUR</span></div>
            )}
            <div className="flex justify-between font-bold border-t pt-1 mt-1">
              <span>Всього</span>
              <span className="text-blue-700">{totalCost.toFixed(2)} EUR</span>
            </div>
          </CardContent>
        </Card>
      )}

      {parcel.trip && (
        <div className="text-sm border-y py-2">
          <span className="text-gray-500">Рейс:</span>{' '}
          <span className="font-medium">{formatDate(parcel.trip.departureDate)}</span>
          <span className="text-gray-400 ml-1">({parcel.trip.country})</span>
        </div>
      )}

      <Card>
        <CardHeader className="py-2 px-3"><CardTitle className="text-sm">Історія статусів</CardTitle></CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          <div className="space-y-2">
            {parcel.statusHistory.map((h, i) => (
              <div key={i} className="text-sm">
                <div className="font-medium">{STATUS_LABELS[h.status as ParcelStatusType] || h.status}</div>
                <div className="text-xs text-gray-400">{formatDateTime(h.changedAt)}</div>
                {h.notes && <div className="text-xs text-gray-500 mt-0.5">{h.notes}</div>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
