'use client';

import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { tripRouteLabel } from '@/lib/constants/countries';

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
  /** ТЗ docx 01.07.26: чекбокс «Доставка до порога будинку». */
  isDoorstepDelivery?: boolean;
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
  /**
   * ТЗ docx 12.07.26 (п.2): блок показується і Клієнту. clientFacing вмикає
   * нейтральні тексти помилок (без staff-інструкцій «створіть тариф» тощо).
   */
  clientFacing?: boolean;
  /**
   * Збережена в БД розбивка вартості. Якщо передана (і totalCost порахований)
   * — рендеримо ЇЇ замість живого перерахунку: клієнт бачить саме ту суму,
   * яку йому виставлено (без розбіжності з «До оплати»), і блок не залежить
   * від поточної наявності тарифу. Якщо totalCost ще не розраховано —
   * повертаємось до живої оцінки.
   */
  saved?: {
    deliveryCost: number | string | null;
    insuranceCost: number | string | null;
    packagingCost: number | string | null;
    doorstepCost: number | string | null;
    parcelMoneyCost: number | string | null;
    totalCost: number | string | null;
  } | null;
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
  /** ТЗ docx 29.06.26: надбавка «Доставка до порога будинку». */
  doorstepCost: number;
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

  // ТЗ docx 12.07.26: якщо передана збережена розбивка з порахованим
  // totalCost — рендеримо її без живого запиту (див. коментар до props.saved).
  const useSaved = !!props.saved && props.saved.totalCost != null && Number(props.saved.totalCost) > 0;

  // The "skip" branches (no country / no weight / UA-only) used to setState
  // synchronously inside useEffect — that triggers cascading renders and
  // is now flagged by react-hooks/set-state-in-effect. Instead we derive
  // those branches at render time below; the effect only handles the
  // network fetch when it's actually needed.
  const shouldFetch = !useSaved && !!country && country !== 'UA' && props.actualWeight > 0;
  // ТЗ docx 12.07.26: для Клієнта — нейтральні тексти без staff-інструкцій.
  const inlineErrorMessage = !useSaved && country === 'UA'
    ? (props.clientFacing
        ? 'Вартість буде уточнена працівником.'
        : (props.direction === 'eu_to_ua'
            ? 'Не визначено європейську країну збору. Привʼяжіть рейс або пункт збору.'
            : 'Не визначено країну отримувача.'))
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
            isDoorstepDelivery: props.isDoorstepDelivery ?? false,
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
          // ТЗ docx 12.07.26: Клієнту — нейтральний текст; staff'у — 404
          // (тарифу нема) відрізняємо від інших помилок (500/400 тощо).
          setError(
            props.clientFacing
              ? 'Вартість буде розрахована працівником.'
              : res.status === 404
                ? `Тариф для ${tripRouteLabel(country ?? '', props.direction, { mode: 'code' })} не знайдено. Створіть його у «Адміністрування → Тарифи».`
                : 'Не вдалося розрахувати вартість. Спробуйте пізніше.'
          );
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
    props.insurance, props.needsPackaging, props.isDoorstepDelivery, props.isAddressDelivery,
    props.isPickupPoint, props.isCourierPickup, props.isMultiParcelPickup,
    props.isBothDirections, props.parcelMoneyAmount, props.receiverCity,
    props.clientFacing,
  ]);

  // ── ТЗ docx 12.07.26: збережена розбивка (без живого перерахунку) ──
  if (useSaved && props.saved) {
    const s = props.saved;
    const n = (v: number | string | null) => Number(v) || 0;
    return (
      <div className="bg-blue-50 rounded-lg p-3 text-sm space-y-1">
        <div className="font-medium text-blue-800 mb-1">Розрахунок вартості</div>
        <div className="flex justify-between">
          <span className="text-gray-600">Фактична вага:</span>
          <span>{props.actualWeight.toFixed(2)} кг</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Об&apos;ємна вага:</span>
          <span>{props.volumetricWeight.toFixed(2)} кг</span>
        </div>
        {/* ТЗ docx 12.07.26: рядок «Розрахункова вага» тут НЕ показуємо —
            у збереженому режимі точний weightType недоступний, а наближення
            max(факт., об'ємна) суперечить staff-значенню для тарифів
            'average'/'custom' (порушує парність). Показуємо лише фактичну/
            об'ємну + підсумкові суми з БД (вони точні). */}
        <div className="flex justify-between border-t border-blue-200 pt-1">
          <span className="text-gray-600">Вартість доставки:</span>
          <span>{formatCurrency(n(s.deliveryCost), 'EUR')}</span>
        </div>
        {n(s.insuranceCost) > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-600">Страхування:</span>
            <span>{formatCurrency(n(s.insuranceCost), 'EUR')}</span>
          </div>
        )}
        {n(s.packagingCost) > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-600">Пакування:</span>
            <span>{formatCurrency(n(s.packagingCost), 'EUR')}</span>
          </div>
        )}
        {n(s.doorstepCost) > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-600">Доставка до порога будинку:</span>
            <span>{formatCurrency(n(s.doorstepCost), 'EUR')}</span>
          </div>
        )}
        {(props.parcelMoneyAmount ?? 0) > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-600">Пакет:</span>
            <span>{formatCurrency(n(s.parcelMoneyCost), 'EUR')}</span>
          </div>
        )}
        <div className="flex justify-between font-bold border-t border-blue-200 pt-1 mt-1">
          <span>Всього:</span>
          <span className="text-blue-800">{formatCurrency(n(s.totalCost), 'EUR')}</span>
        </div>
      </div>
    );
  }

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
      {/* ТЗ §E4: фактична / об'ємна / розрахункова — окремими рядками. */}
      <div className="flex justify-between">
        <span className="text-gray-600">Фактична вага:</span>
        <span>{props.actualWeight.toFixed(2)} кг</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-600">Об&apos;ємна вага:</span>
        <span>{props.volumetricWeight.toFixed(2)} кг</span>
      </div>
      <div className="flex justify-between border-t border-blue-200 pt-1">
        <span className="text-gray-600">Розрахункова вага ({WEIGHT_TYPE_LABELS[cost.weightType] || cost.weightType}):</span>
        <span className="font-medium">{cost.billableWeight.toFixed(2)} кг</span>
      </div>
      {/* ТЗ §E4/§E14: «вартість доставки (слова в дужках забрати)» —
          лейбл і значення без жодних дужкових приміток. */}
      <div className="flex justify-between">
        <span className="text-gray-600">Вартість доставки:</span>
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
      {/* ТЗ docx 29.06.26 «Тарифи»: «Доставка до порога будинку» — надбавка
          при адресній доставці. */}
      {cost.doorstepCost > 0 && (
        <div className="flex justify-between">
          <span className="text-gray-600">Доставка до порога будинку:</span>
          <span>{formatCurrency(cost.doorstepCost, 'EUR')}</span>
        </div>
      )}
      {/* ТЗ §E4: «пакет, якщо він був відмічений — має бути відображений
          і у переліку і у сумуванні». Показуємо рядок щойно введено суму
          Пакета (а не лише коли є ненульова комісія). «Слова в дужках» —
          прибрано (ТЗ §E4/§E14). */}
      {(props.parcelMoneyAmount ?? 0) > 0 && (
        <div className="flex justify-between">
          <span className="text-gray-600">Пакет:</span>
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
