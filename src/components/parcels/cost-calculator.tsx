'use client';

import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/utils/format';

interface CostCalculatorProps {
  direction: string;
  senderCountry: string | null;
  receiverCountry: string | null;
  actualWeight: number;
  volumetricWeight: number;
  declaredValue: number;
  /** Currency of declaredValue (EUR | UAH). Default EUR. */
  declaredValueCurrency?: 'EUR' | 'UAH';
  /** Insurance opt-in checkbox state. */
  insurance?: boolean;
  /** Packaging opt-in checkbox state. */
  needsPackaging: boolean;
  isAddressDelivery: boolean;
  /** Hand-off via pickup point — впливає на мінімальний тариф. */
  isPickupPoint?: boolean;
  /** Виклик кур'єра (sender side, EU→UA). */
  isCourierPickup?: boolean;
  /** При courier_pickup — 2+ посилок з цієї локації (per ТЗ). */
  isMultiParcelPickup?: boolean;
  /** Туди-сюди з однієї локації (детектується на бекенді). */
  isBothDirections?: boolean;
  /** «Пакет» — money sender transfers (drives the % fee row). */
  parcelMoneyAmount?: number;
  /** Населений пункт Отримувача — для Львів-винятку (§49/§50). */
  receiverCity?: string | null;
}

interface CostBreakdown {
  pricePerKgApplied: number;
  lvivExceptionApplied: boolean;
  baseDeliveryCost: number;
  minimumApplied: number;
  minimumLabel: string | null;
  deliveryCost: number;
  insuranceCost: number;
  packagingCost: number;
  /** @deprecated тепер 0 (мінімум вкладено в deliveryCost). */
  addressDeliveryCost: number;
  /** @deprecated тепер 0 (мінімум вкладено в deliveryCost). */
  pickupPointCost: number;
  parcelMoneyCost: number;
  totalCost: number;
  billableWeight: number;
  pricePerKg: number;
  weightType: string;
}

// Hoisted constant — label map is pure data, no reason to recreate every render.
const WEIGHT_TYPE_LABELS: Record<string, string> = {
  actual: 'max(факт., об\'ємна)',
  volumetric: 'об\'ємна',
  average: 'середня',
};

export function CostCalculator(props: CostCalculatorProps) {
  const [cost, setCost] = useState<CostBreakdown | null>(null);
  const [error, setError] = useState('');

  const country = props.direction === 'eu_to_ua'
    ? props.senderCountry
    : props.receiverCountry;

  // The "skip" branches (no country / no weight / UA-only) used to setState
  // synchronously inside useEffect — that triggers cascading renders and
  // is now flagged by react-hooks/set-state-in-effect. Instead we derive
  // those branches at render time below; the effect only handles the
  // network fetch when it's actually needed.
  const shouldFetch = !!country && country !== 'UA' && props.actualWeight > 0;
  const inlineErrorMessage = country === 'UA'
    ? (props.direction === 'eu_to_ua'
        ? 'Не визначено європейську країну збору. Привʼяжіть рейс або пункт збору.'
        : 'Не визначено країну отримувача.')
    : '';

  useEffect(() => {
    if (!shouldFetch) return;

    // AbortController pairs with the debounce timer so in-flight requests are
    // cancelled when the user keeps typing or the component unmounts.
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/parcels/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            direction: props.direction,
            country,
            actualWeight: props.actualWeight,
            volumetricWeight: props.volumetricWeight,
            declaredValue: props.declaredValue,
            declaredValueCurrency: props.declaredValueCurrency ?? 'EUR',
            insurance: props.insurance ?? false,
            needsPackaging: props.needsPackaging,
            isAddressDelivery: props.isAddressDelivery,
            isPickupPoint: props.isPickupPoint ?? false,
            isCourierPickup: props.isCourierPickup ?? false,
            isMultiParcelPickup: props.isMultiParcelPickup ?? false,
            isBothDirections: props.isBothDirections ?? false,
            parcelMoneyAmount: props.parcelMoneyAmount ?? 0,
            receiverCity: props.receiverCity ?? null,
          }),
        });
        if (res.ok) {
          setCost(await res.json());
          setError('');
        } else {
          setCost(null);
          setError(`Тариф для ${country} ${props.direction === 'eu_to_ua' ? '→' : '←'} UA не знайдено. Створіть його у «Адміністрування → Тарифи».`);
        }
      } catch (err) {
        // Ignore aborts — they're expected when inputs keep changing.
        if ((err as { name?: string })?.name === 'AbortError') return;
        setCost(null);
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    shouldFetch,
    country, props.direction,
    props.actualWeight, props.volumetricWeight, props.declaredValue,
    props.declaredValueCurrency,
    props.insurance, props.needsPackaging, props.isAddressDelivery,
    props.isPickupPoint, props.isCourierPickup, props.isMultiParcelPickup,
    props.isBothDirections, props.parcelMoneyAmount, props.receiverCity,
  ]);

  // Inline error has priority over fetched state (UA / no country picked yet).
  if (inlineErrorMessage) {
    return (
      <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-2">
        ⚠️ {inlineErrorMessage}
      </div>
    );
  }
  // Nothing to show until a fetch is possible. Stale cost from a previous
  // input combination is intentionally NOT rendered: shouldFetch guards both
  // the effect and the render path.
  if (!shouldFetch) return null;

  if (error) {
    return (
      <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-2">
        ⚠️ {error}
      </div>
    );
  }

  if (!cost) return null;

  return (
    <div className="bg-blue-50 rounded-lg p-3 text-sm space-y-1">
      <div className="font-medium text-blue-800 mb-1">Розрахунок вартості</div>
      <div className="flex justify-between">
        <span className="text-gray-600">Розрахункова вага ({WEIGHT_TYPE_LABELS[cost.weightType] || cost.weightType}):</span>
        <span>{cost.billableWeight.toFixed(2)} кг</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-600">
          Доставка ({cost.pricePerKg} EUR/кг
          {cost.lvivExceptionApplied && (
            <span className="text-green-700"> · Львів</span>
          )}):
        </span>
        <span>
          {formatCurrency(cost.deliveryCost, 'EUR')}
          {cost.minimumApplied > 0 && cost.minimumLabel && (
            <span className="ml-1 text-[10px] text-amber-700" title={`Базова ${cost.baseDeliveryCost} EUR замінена мінімумом «${cost.minimumLabel}» = ${cost.minimumApplied} EUR`}>
              (мін. {cost.minimumLabel})
            </span>
          )}
        </span>
      </div>
      {cost.insuranceCost > 0 && (
        <div className="flex justify-between">
          <span className="text-gray-600">Страхування:</span>
          <span>{formatCurrency(cost.insuranceCost, 'EUR')}</span>
        </div>
      )}
      {cost.packagingCost > 0 && (
        <div className="flex justify-between">
          <span className="text-gray-600">Пакування:</span>
          <span>{formatCurrency(cost.packagingCost, 'EUR')}</span>
        </div>
      )}
      {cost.parcelMoneyCost > 0 && (
        <div className="flex justify-between">
          <span className="text-gray-600">Пакет ({props.parcelMoneyAmount} €):</span>
          <span>{formatCurrency(cost.parcelMoneyCost, 'EUR')}</span>
        </div>
      )}
      <div className="flex justify-between font-bold border-t border-blue-200 pt-1 mt-1">
        <span>Всього:</span>
        <span className="text-blue-800">{formatCurrency(cost.totalCost, 'EUR')}</span>
      </div>
    </div>
  );
}
