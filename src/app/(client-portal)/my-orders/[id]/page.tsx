'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { STATUS_COLORS, type ParcelStatusType } from '@/lib/constants/statuses';
import { statusLabel } from '@/lib/parcels/status-label';
import { formatDateTime, formatCurrency } from '@/lib/utils/format';
import { formatWorkingDays, type Weekday } from '@/lib/constants/collection';
import { summarizePartyAddress } from '@/lib/utils/address-summary';
import { CopyButton } from '@/components/shared/copy-button';
import { PhoneLink } from '@/components/shared/phone-link';
import { AddressLink } from '@/components/shared/address-link';
import { ParcelPlacesCard } from '@/components/parcels/parcel-places-card';
import { ParcelDetailsCard } from '@/components/parcels/parcel-details-card';

/**
 * Деталі посилки для Клієнта.
 *
 * ТЗ docx 12.07.26 (п.2): «І ПРАЦІВНИК І КЛІЄНТ МАЮТЬ БАЧИТИ ОДНАКОВИЙ
 * ПІДСУМКОВИЙ ВИГЛЯД» — сторінка відтворює детальну Працівника
 * (/parcels/[id]): блок ОТРИМУВАЧ/ВІДПРАВНИК, «Пункт збору», «Параметри
 * відправлення» з розрахунком вартості (спільні компоненти ParcelPlacesCard/
 * ParcelDetailsCard — гарантія ідентичності), «Деталі», «Оплата». Без
 * staff-контролів: редагування, зміна статусу, приймання оплати, рахунки —
 * лише у Працівника.
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
  declaredValue: number | null;
  declaredValueCurrency: string | null;
  totalWeight: number | null;
  totalCost: number | null;
  deliveryCost: number | null;
  insuranceCost: number | null;
  packagingCost: number | null;
  doorstepCost: number | null;
  parcelMoneyAmount: number | null;
  parcelMoneyCost: number | null;
  isPaid: boolean;
  paidAt: string | null;
  payer: string;
  paymentMethod: string;
  paymentInUkraine: boolean;
  needsPackaging: boolean;
  insuranceApplied: boolean;
  doorstepDelivery: boolean;
  collectionMethod: string | null;
  isMultiParcelPickup: boolean | null;
  estimatedDeliveryStart: string | null;
  estimatedDeliveryEnd: string | null;
  createdAt: string;
  sender: {
    firstName: string; lastName: string; phone: string;
    /** Для fallback-визначення EU-країни (як у staff) — лише country. */
    addresses?: { country: string | null }[];
  };
  receiver: { firstName: string; lastName: string; phone: string };
  receiverAddress: {
    country: string; city: string; street: string | null; building: string | null;
    apartment: string | null; postalCode: string | null; landmark: string | null;
    npWarehouseNum: string | null; pickupPointText: string | null; deliveryMethod: string;
  } | null;
  senderAddress: {
    country: string | null; city: string; street: string | null; building: string | null;
    apartment: string | null; postalCode: string | null; landmark: string | null;
    npWarehouseNum: string | null; pickupPointText: string | null; deliveryMethod: string | null;
  } | null;
  places: {
    id: string; placeNumber: number; weight: number | null;
    length: number | null; width: number | null; height: number | null;
    volumetricWeight: number | null; needsPackaging: boolean;
    packagingDone: boolean; itnPlace: string | null;
  }[];
  statusHistory: { status: string; changedAt: string; notes: string | null }[];
  trip: { departureDate: string; country: string } | null;
  assignedCourier: { id: string; fullName: string } | null;
  collectionPoint: {
    name: string | null; city: string; address: string; country: string;
    postalCode: string | null; workingHours: string | null; workingDays: Weekday[];
  } | null;
}

interface PricingCfg {
  country: string;
  direction: string;
  weightType?: 'actual' | 'volumetric' | 'average' | 'custom';
  weightCustomFactualFraction?: number;
}

export default function MyOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [parcel, setParcel] = useState<ParcelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // ТЗ docx 15.07.26 (п.3): тарифи — для рядка «Розрахункова вага» (як у staff).
  // Клієнту дозволено GET /api/pricing (докс 12.07.26 middleware-виняток).
  const [pricingConfigs, setPricingConfigs] = useState<PricingCfg[]>([]);

  const fetchParcel = useCallback(() => {
    fetch(`/api/client-portal/orders/${id}`)
      .then(async r => {
        if (r.ok) return r.json();
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || 'Не вдалося завантажити');
      })
      .then((d: ParcelDetail) => { setParcel(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [id]);

  useEffect(() => { fetchParcel(); }, [fetchParcel]);
  useEffect(() => {
    fetch('/api/pricing').then(r => (r.ok ? r.json() : [])).then(setPricingConfigs).catch(() => {});
  }, []);

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

  // ТЗ docx 15.07.26 (п.3): EU-країна, що визначає тариф (той самий ланцюжок,
  // що й staff-детальна). eu_to_ua → відправник; ua_to_eu → отримувач.
  const senderCountryChain =
    (parcel.trip?.country && parcel.trip.country !== 'UA' ? parcel.trip.country : null)
    || parcel.collectionPoint?.country
    || parcel.senderAddress?.country
    || parcel.sender.addresses?.[0]?.country
    || null;
  const billedCountry = parcel.direction === 'eu_to_ua'
    ? senderCountryChain
    : (parcel.receiverAddress?.country || null);
  const weightCfg = pricingConfigs.find(c => c.country === billedCountry && c.direction === parcel.direction);

  return (
    <div className="space-y-4 max-w-2xl">
      <Link href="/my-orders" className="text-sm text-blue-600 hover:underline">← Назад до моїх замовлень</Link>

      {/* Header — ІТН та ТТН поряд у самому верху (як у Працівника). */}
      <div>
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <h1 className="text-xl font-bold font-mono">{parcel.internalNumber}</h1>
          <Badge className={STATUS_COLORS[parcel.status]}>
            {statusLabel(parcel.status, { tripCountry: parcel.trip?.country, direction: parcel.direction })}
          </Badge>
        </div>
        <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
          <span>ІТН: <span className="font-mono">{parcel.itn}</span></span>
          <CopyButton text={parcel.itn} />
          {parcel.npTtn && (
            <>
              <span className="text-gray-300">|</span>
              <span>ТТН: <span className="font-mono">{parcel.npTtn}</span></span>
              <CopyButton text={parcel.npTtn} />
            </>
          )}
          <span className="text-gray-300">|</span>
          <span>{formatDateTime(parcel.createdAt)}</span>
        </div>
      </div>

      {/* Відправник / Отримувач — той самий компактний блок, що й у Працівника
          (без олівця редагування та іконки рахунку — це staff-контролі). */}
      <div className="text-sm space-y-1.5 py-2 border-y">
        <div className="flex items-baseline gap-2">
          <span className="text-blue-600 font-bold shrink-0 w-24 text-xs uppercase tracking-wide">Отримувач</span>
          <div className="min-w-0 flex-1">
            <span className="font-medium">{parcel.receiver.lastName} {parcel.receiver.firstName}</span>
            <span className="text-gray-400 mx-1">·</span>
            <PhoneLink phone={parcel.receiver.phone} />
            {parcel.receiverAddress && (() => {
              // ТЗ docx 15.07.26 (п.2): лише дані поточного способу доставки.
              const s = summarizePartyAddress(parcel.receiverAddress);
              return (
                <span className="text-xs text-gray-500 ml-2">
                  <AddressLink address={s.main} />{s.suffix}
                </span>
              );
            })()}
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-green-600 font-bold shrink-0 w-24 text-xs uppercase tracking-wide">Відправник</span>
          <div className="min-w-0 flex-1">
            <span className="font-medium">{parcel.sender.lastName} {parcel.sender.firstName}</span>
            <span className="text-gray-400 mx-1">·</span>
            <PhoneLink phone={parcel.sender.phone} />
            {parcel.senderAddress && (() => {
              // ТЗ docx 15.07.26 (п.2): лише дані поточного способу; країну UA у
              // Відправника не показуємо (як і раніше).
              const s = summarizePartyAddress(parcel.senderAddress, { hideCountryForUA: true });
              return (
                <span className="text-xs text-gray-500 ml-2">
                  <AddressLink address={s.main} />{s.suffix}
                </span>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Пункт збору — як у Працівника (ТЗ docx 01.07.26 C4 / 09.07.26). */}
      {parcel.direction === 'eu_to_ua' && parcel.collectionMethod === 'pickup_point' && parcel.collectionPoint && (
        <div className="text-sm py-1 border-b">
          <span className="text-gray-500">Пункт збору:</span>{' '}
          <span className="font-medium">
            {parcel.collectionPoint.name
              ? `${parcel.collectionPoint.name} (${parcel.collectionPoint.city}, ${parcel.collectionPoint.address})`
              : `${parcel.collectionPoint.city}, ${parcel.collectionPoint.address}`}
          </span>
          {(parcel.collectionPoint.postalCode || parcel.senderAddress?.postalCode) && (
            <span className="text-gray-400 ml-1">· Індекс: {parcel.collectionPoint.postalCode || parcel.senderAddress?.postalCode}</span>
          )}
          {parcel.collectionPoint.workingDays?.length > 0 && (
            <div className="text-xs text-gray-400">
              📅 {formatWorkingDays(parcel.collectionPoint.workingDays)}
              {parcel.collectionPoint.workingHours ? ` · ${parcel.collectionPoint.workingHours}` : ''}
            </div>
          )}
        </div>
      )}

      {/* Параметри відправлення + «Розрахунок вартості» — СПІЛЬНИЙ компонент
          зі staff-детальної (гарантує однаковий вигляд). readOnly — клієнт
          не редагує. */}
      <ParcelPlacesCard
        parcelId={parcel.id}
        places={parcel.places}
        totalWeight={parcel.totalWeight}
        direction={parcel.direction}
        senderCountry={senderCountryChain}
        receiverCountry={parcel.receiverAddress?.country || null}
        receiverCity={parcel.receiverAddress?.city || null}
        receiverDeliveryMethod={parcel.receiverAddress?.deliveryMethod || null}
        declaredValue={parcel.declaredValue}
        declaredValueCurrency={parcel.declaredValueCurrency}
        needsPackaging={parcel.needsPackaging}
        doorstepDelivery={parcel.doorstepDelivery}
        insuranceEnabled={parcel.insuranceApplied ?? (Number(parcel.insuranceCost) > 0)}
        parcelMoneyAmount={parcel.parcelMoneyAmount}
        isPickupPoint={parcel.direction === 'eu_to_ua' && parcel.collectionMethod === 'pickup_point'}
        isCourierPickup={parcel.direction === 'eu_to_ua' && parcel.collectionMethod === 'courier_pickup'}
        isMultiParcelPickup={!!parcel.isMultiParcelPickup}
        onUpdate={fetchParcel}
        readOnly
        // ТЗ docx 12.07.26: клієнт бачить ЗБЕРЕЖЕНУ розбивку (ту саму суму,
        // що й «До оплати») — без розбіжностей із живим перерахунком і без
        // staff-текстів помилок. Якщо вартість ще не пораховано — жива оцінка.
        clientFacing
        savedBreakdown={{
          deliveryCost: parcel.deliveryCost,
          insuranceCost: parcel.insuranceCost,
          packagingCost: parcel.packagingCost,
          doorstepCost: parcel.doorstepCost,
          parcelMoneyCost: parcel.parcelMoneyCost,
          totalCost: parcel.totalCost,
          // ТЗ docx 15.07.26 (п.3): weightType з тарифу → «Розрахункова вага»
          // рахується так само, як у staff (той самий getBillableWeight).
          weightType: weightCfg?.weightType,
          weightFraction: weightCfg?.weightCustomFactualFraction,
        }}
      />

      {/* Деталі — той самий компонент, що й у Працівника; readOnly. */}
      <ParcelDetailsCard parcel={parcel} onUpdate={fetchParcel} readOnly />

      {/* Оплата — вигляд як у Працівника («До оплати (вартість послуг)» +
          статус), але без прийняття/скасування оплати (staff-дії). */}
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm">💰 Оплата</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">До оплати (вартість послуг)</span>
            <span className="font-semibold">
              {parcel.totalCost
                ? formatCurrency(Number(parcel.totalCost), 'EUR')
                : 'не розраховано'}
            </span>
          </div>
          {parcel.isPaid && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-2">
              <div className="text-sm font-medium text-green-800">✅ Оплачено</div>
              {parcel.paidAt && (
                <div className="text-xs text-green-700">{formatDateTime(parcel.paidAt)}</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Рейс + кур'єр — як у Працівника (read-only, без редагування). */}
      <div className="text-sm py-1 border-y">
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

      <Card>
        <CardHeader className="py-2 px-3"><CardTitle className="text-sm">Історія статусів</CardTitle></CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          <div className="space-y-2">
            {parcel.statusHistory.map((h, i) => (
              <div key={i} className="text-sm">
                <div className="font-medium">
                  {statusLabel(h.status, { tripCountry: parcel.trip?.country, direction: parcel.direction })}
                </div>
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
