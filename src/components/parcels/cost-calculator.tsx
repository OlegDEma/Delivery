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
  needsPackaging: boolean;
  isAddressDelivery: boolean;
}

interface CostBreakdown {
  deliveryCost: number;
  insuranceCost: number;
  packagingCost: number;
  addressDeliveryCost: number;
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

  useEffect(() => {
    if (!country || props.actualWeight <= 0) {
      setCost(null);
      setError('');
      return;
    }

    // For eu_to_ua we need an EU country, for ua_to_eu also an EU country on the
    // receiver side. UA pricing configs don't exist by design.
    if (country === 'UA') {
      setCost(null);
      setError(
        props.direction === 'eu_to_ua'
          ? 'Не визначено європейську країну збору. Привʼяжіть рейс або пункт збору.'
          : 'Не визначено країну отримувача.'
      );
      return;
    }

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
            needsPackaging: props.needsPackaging,
            isAddressDelivery: props.isAddressDelivery,
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
  }, [country, props.direction, props.actualWeight, props.volumetricWeight, props.declaredValue, props.needsPackaging, props.isAddressDelivery]);

  if (!cost && !error) return null;

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
        <span className="text-gray-600">Доставка ({cost.pricePerKg} EUR/кг):</span>
        <span>{formatCurrency(cost.deliveryCost, 'EUR')}</span>
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
      {cost.addressDeliveryCost > 0 && (
        <div className="flex justify-between">
          <span className="text-gray-600">Адресна доставка:</span>
          <span>{formatCurrency(cost.addressDeliveryCost, 'EUR')}</span>
        </div>
      )}
      <div className="flex justify-between font-bold border-t border-blue-200 pt-1 mt-1">
        <span>Всього:</span>
        <span className="text-blue-800">{formatCurrency(cost.totalCost, 'EUR')}</span>
      </div>
    </div>
  );
}
