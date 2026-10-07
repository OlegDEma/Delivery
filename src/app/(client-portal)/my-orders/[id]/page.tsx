'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { STATUS_COLORS, type ParcelStatusType } from '@/lib/constants/statuses';
import { statusLabel } from '@/lib/parcels/status-label';
import { formatDateTime, formatDate, formatCurrency } from '@/lib/utils/format';
import { displayParcelNumber } from '@/lib/parcels/display-number';
import { NO_TRIP_MESSAGE, OPERATOR_PHONE } from '@/lib/parcels/no-trip';
import { formatWorkingDays, type Weekday } from '@/lib/constants/collection';
import { summarizePartyAddress } from '@/lib/utils/address-summary';
import { parcelParties } from '@/lib/parcels/party-snapshot';
import { CopyButton } from '@/components/shared/copy-button';
import { PhoneLink } from '@/components/shared/phone-link';
import { AddressLink } from '@/components/shared/address-link';
import { ParcelPlacesCard } from '@/components/parcels/parcel-places-card';
import { ParcelDetailsCard } from '@/components/parcels/parcel-details-card';
import { isPickupPointPricing } from '@/lib/utils/pricing-flags';

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
  /** ТЗ docx 04.10.26: рейсу до країни посилки в базі немає взагалі (з API). */
  noTripForCountry?: boolean;
  /** ТЗ docx 04.10.26 (п.3): нотатка, яку Клієнт залишив при створенні. */
  clientNote: string | null;
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
  /** ТЗ docx 04.10.26: «Створена клієнтом/…». */
  createdSource: string | null;
  createdBy: { role: string } | null;
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
  // ТЗ docx 26.07.26 (п.1): знімок сторін для accepted+ (див. parcelParties).
  senderSnapshot: unknown;
  receiverSnapshot: unknown;
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
  // ТЗ docx 03.10.26 (п.2): Клієнт може додати або змінити номер ТТН.
  const [editTtn, setEditTtn] = useState(false);
  const [ttnDraft, setTtnDraft] = useState('');
  const [savingTtn, setSavingTtn] = useState(false);
  const [ttnError, setTtnError] = useState('');

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

  // ТЗ docx 03.10.26 (п.2, п.4): зберегти ТТН і одразу показати його Клієнту
  // (Працівник бачить те саме поле у своїй детальній).
  async function saveTtn() {
    setSavingTtn(true);
    setTtnError('');
    try {
      const res = await fetch(`/api/client-portal/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ npTtn: ttnDraft.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setTtnError(data?.error || 'Не вдалося зберегти ТТН');
        return;
      }
      setEditTtn(false);
      fetchParcel();
    } catch {
      setTtnError('Немає звʼязку з сервером. Спробуйте ще раз.');
    } finally {
      setSavingTtn(false);
    }
  }
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
  // ТЗ docx 26.07.26 (п.1): сторони — зі знімка для accepted+, живі для «Створена».
  const parties = parcelParties(parcel);

  return (
    <div className="space-y-4 max-w-2xl">
      <Link href="/my-orders" className="text-sm text-blue-600 hover:underline">← Назад до моїх замовлень</Link>

      {/* Header — ІТН та ТТН поряд у самому верху (як у Працівника). */}
      <div>
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          {/* ТЗ docx 04.10.26: дату створення з шапки прибрано — замість неї номер
              рейсу, до якого автоматично прив'язана посилка. */}
          <h1 className="text-xl font-bold font-mono">
            {displayParcelNumber(parcel.internalNumber)}
            {parcel.trip && <>, Рейс: {formatDate(parcel.trip.departureDate)}({parcel.trip.country})</>}
          </h1>
          <Badge className={STATUS_COLORS[parcel.status]}>
            {statusLabel(parcel.status, {
              tripCountry: parcel.trip?.country, direction: parcel.direction,
              createdSource: parcel.createdSource, createdByRole: parcel.createdBy?.role,
            })}
          </Badge>
        </div>
        {/* ТЗ docx 04.10.26: рейсу до вибраної країни в базі немає взагалі.
            Якщо рейс є, але посилку ще не прив'язано, — нейтральний рядок. */}
        {!parcel.trip && !parcel.noTripForCountry && (
          <div className="text-sm text-gray-500 mb-1">Рейс ще не призначено — оператор призначить найближчий.</div>
        )}
        {!parcel.trip && parcel.noTripForCountry && (
          <div className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1 mb-1">
            {NO_TRIP_MESSAGE.replace(OPERATOR_PHONE, '')}
            <a href={`tel:${OPERATOR_PHONE}`} className="font-medium underline">{OPERATOR_PHONE}</a>
          </div>
        )}
        <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
          {/* ТЗ docx 03.10.26 (п.1): ІТН Клієнту не показуємо — правила його
              формування ще не розроблені. (п.4) Замість нього — ТТН. */}
          {/* ТЗ docx 03.10.26 (п.2): номер ТТН Клієнт може додати і змінити. */}
          {editTtn ? (
            <span className="inline-flex items-center gap-1">
              <input
                value={ttnDraft}
                onChange={(e) => setTtnDraft(e.target.value)}
                placeholder="Номер ТТН"
                className="border rounded px-2 py-0.5 text-xs font-mono w-44"
                autoFocus
              />
              <Button size="sm" className="h-6 text-xs px-2" onClick={saveTtn} disabled={savingTtn}>
                {savingTtn ? '…' : 'Зберегти'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs px-2"
                onClick={() => { setEditTtn(false); setTtnError(''); }}
                disabled={savingTtn}
              >
                Скасувати
              </Button>
            </span>
          ) : parcel.npTtn ? (
            <>
              <span>ТТН: <span className="font-mono">{parcel.npTtn}</span></span>
              <CopyButton text={parcel.npTtn} />
              <button
                type="button"
                onClick={() => { setTtnDraft(parcel.npTtn || ''); setEditTtn(true); }}
                className="text-blue-600 hover:underline"
              >
                змінити
              </button>
              <span className="text-gray-300">|</span>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { setTtnDraft(''); setEditTtn(true); }}
                className="text-blue-600 hover:underline"
              >
                + Додати номер ТТН
              </button>
              <span className="text-gray-300">|</span>
            </>
          )}
          <span>{formatDateTime(parcel.createdAt)}</span>
        </div>
        {ttnError && <div className="text-xs text-red-600 mt-1">{ttnError}</div>}
        {/* ТЗ docx 04.10.26 (п.3): нотатка Клієнта до замовлення. */}
        {parcel.clientNote && (
          <div className="mt-1 text-sm bg-amber-50 border border-amber-200 rounded px-2 py-1">
            <span className="text-amber-800 font-medium">Ваша нотатка:</span>{' '}
            <span className="whitespace-pre-wrap break-words">{parcel.clientNote}</span>
          </div>
        )}
      </div>

      {/* Відправник / Отримувач — той самий компактний блок, що й у Працівника
          (без олівця редагування та іконки рахунку — це staff-контролі). */}
      <div className="text-sm space-y-1.5 py-2 border-y">
        <div className="flex items-baseline gap-2">
          <span className="text-blue-600 font-bold shrink-0 w-24 text-xs uppercase tracking-wide">Отримувач</span>
          <div className="min-w-0 flex-1">
            <span className="font-medium">{parties.receiver.lastName} {parties.receiver.firstName}</span>
            <span className="text-gray-400 mx-1">·</span>
            <PhoneLink phone={parties.receiver.phone} />
            {parties.receiver.address && (() => {
              // ТЗ docx 15.07.26 (п.2): лише дані поточного способу. ТЗ docx
              // 26.07.26 (п.1): для accepted+ — зі знімка.
              const s = summarizePartyAddress(parties.receiver.address);
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
            <span className="font-medium">{parties.sender.lastName} {parties.sender.firstName}</span>
            <span className="text-gray-400 mx-1">·</span>
            <PhoneLink phone={parties.sender.phone} />
            {parties.sender.address && (() => {
              // ТЗ docx 15.07.26 (п.2): лише дані поточного способу; країну UA у
              // Відправника не показуємо. ТЗ docx 26.07.26 (п.1): accepted+ — зі знімка.
              const s = summarizePartyAddress(parties.sender.address, { hideCountryForUA: true });
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
        isPickupPoint={isPickupPointPricing({ direction: parcel.direction, collectionMethod: parcel.collectionMethod, receiverDeliveryMethod: parcel.receiverAddress?.deliveryMethod })}
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

      {/* ТЗ docx 04.10.26: рядок «Рейс: … | Кур'єр: …» прибрано — рейс тепер у шапці. */}

      <Card>
        <CardHeader className="py-2 px-3"><CardTitle className="text-sm">Історія статусів</CardTitle></CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          <div className="space-y-2">
            {parcel.statusHistory.map((h, i) => (
              <div key={i} className="text-sm">
                <div className="font-medium">
                  {statusLabel(h.status, { tripCountry: parcel.trip?.country, direction: parcel.direction, createdSource: parcel.createdSource, createdByRole: parcel.createdBy?.role })}
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
