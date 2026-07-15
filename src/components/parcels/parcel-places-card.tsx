'use client';

import { useImperativeHandle, useState, type Ref } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatWeight } from '@/lib/utils/format';
import { CostCalculator } from '@/components/parcels/cost-calculator';

interface Place {
  id: string;
  placeNumber: number;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  volumetricWeight: number | null;
  needsPackaging: boolean;
  packagingDone: boolean;
  itnPlace: string | null;
}

/**
 * Imperative handle — дозволяє детальній сторінці відкрити редагування
 * однією кнопкою «Редагувати» (ТЗ §E4: «При натисканні кнопки 'Редагувати'
 * вертаємось до вкладок 'Відправлення' і 'Параметри відправлення'»).
 */
export interface ParcelEditHandle {
  startEdit: () => void;
}

interface ParcelPlacesCardProps {
  ref?: Ref<ParcelEditHandle>;
  parcelId: string;
  places: Place[];
  totalWeight: number | null;
  /** For live cost calculation */
  direction?: string;
  senderCountry?: string | null;
  receiverCountry?: string | null;
  /** Населений пункт Отримувача — для Львів-винятку (§49/§50). */
  receiverCity?: string | null;
  receiverDeliveryMethod?: string | null;
  declaredValue?: number | null;
  /** Currency of declaredValue (EUR | UAH). Default EUR. */
  declaredValueCurrency?: 'EUR' | 'UAH' | string | null;
  needsPackaging?: boolean;
  /** ТЗ docx 01.07.26: opt-in «Доставка до порога будинку». */
  doorstepDelivery?: boolean;
  /** Whether the parcel has insurance opted in (saved value > 0). */
  insuranceEnabled?: boolean;
  /** «Пакет» сума — для коректної live-оцінки фактично збереженого розрахунку. */
  parcelMoneyAmount?: number | null;
  /** Чи передача через пункт збору — впливає на додатковий компонент вартості. */
  isPickupPoint?: boolean;
  /** Чи виклик кур'єра (collectionMethod=courier_pickup) — впливає на мінімум. */
  isCourierPickup?: boolean;
  /** Multi-parcel pickup flag — впливає на мінімальний тариф. */
  isMultiParcelPickup?: boolean;
  /** Блокує редагування ваги/розмірів — після accepted_for_transport_* */
  readOnly?: boolean;
  /** ТЗ docx 12.07.26: картка показується і Клієнту — нейтральні тексти
      помилок у CostCalculator (без staff-інструкцій). */
  clientFacing?: boolean;
  /** ТЗ docx 12.07.26: збережена розбивка вартості — коли передана,
      CostCalculator рендерить її замість живого перерахунку. */
  savedBreakdown?: {
    deliveryCost: number | string | null;
    insuranceCost: number | string | null;
    packagingCost: number | string | null;
    doorstepCost: number | string | null;
    parcelMoneyCost: number | string | null;
    totalCost: number | string | null;
  } | null;
  onUpdate: () => void;
}

interface PlaceDraft {
  id: string;
  placeNumber: number;
  weight: string;
  length: string;
  width: string;
  height: string;
  itnPlace: string | null;
  needsPackaging: boolean;
  packagingDone: boolean;
}

function volWeight(l: string, w: string, h: string): number {
  const L = Number(l) || 0;
  const W = Number(w) || 0;
  const H = Number(h) || 0;
  if (L > 0 && W > 0 && H > 0) return Number(((L * W * H) / 4000).toFixed(2));
  return 0;
}

export function ParcelPlacesCard({
  ref,
  parcelId,
  places,
  totalWeight,
  direction,
  senderCountry,
  receiverCountry,
  receiverCity,
  receiverDeliveryMethod,
  declaredValue,
  declaredValueCurrency,
  needsPackaging,
  doorstepDelivery,
  insuranceEnabled,
  parcelMoneyAmount,
  isPickupPoint,
  isCourierPickup,
  isMultiParcelPickup,
  readOnly = false,
  clientFacing = false,
  savedBreakdown = null,
  onUpdate,
}: ParcelPlacesCardProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<PlaceDraft[]>([]);

  function startEdit() {
    setDrafts(
      places.map(p => ({
        id: p.id,
        placeNumber: p.placeNumber,
        weight: p.weight != null ? String(p.weight) : '',
        length: p.length != null ? String(p.length) : '',
        width: p.width != null ? String(p.width) : '',
        height: p.height != null ? String(p.height) : '',
        itnPlace: p.itnPlace,
        needsPackaging: p.needsPackaging,
        packagingDone: p.packagingDone,
      }))
    );
    setEditing(true);
  }

  // ТЗ §E4: детальна сторінка відкриває редагування однією кнопкою.
  // Imperative-handle лишає внутрішній стан картки незмінним — батьківська
  // сторінка лише запускає startEdit(). readOnly блокує (locked-посилки).
  useImperativeHandle(ref, () => ({
    startEdit: () => { if (!readOnly) startEdit(); },
  }));

  function updateDraft(i: number, patch: Partial<PlaceDraft>) {
    setDrafts(prev => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        places: drafts.map(d => ({
          id: d.id,
          placeNumber: d.placeNumber,
          weight: Number(d.weight) || 0,
          length: d.length ? Number(d.length) : null,
          width: d.width ? Number(d.width) : null,
          height: d.height ? Number(d.height) : null,
        })),
      };
      const res = await fetch(`/api/parcels/${parcelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success('Місця збережено');
        setEditing(false);
        onUpdate();
      } else {
        toast.error('Помилка збереження');
      }
    } finally {
      setSaving(false);
    }
  }

  // Totals for live preview in edit mode
  const totalDraftWeight = editing
    ? drafts.reduce((s, d) => s + (Number(d.weight) || 0), 0)
    : 0;
  const totalDraftVolWeight = editing
    ? drafts.reduce((s, d) => s + volWeight(d.length, d.width, d.height), 0)
    : 0;

  // Weight/vol weight to feed into CostCalculator
  const calcActualWeight = editing ? totalDraftWeight : Number(totalWeight) || 0;
  const calcVolWeight = editing
    ? totalDraftVolWeight
    : places.reduce((s, p) => s + (Number(p.volumetricWeight) || 0), 0);
  const canCalculate = !!direction && !!(senderCountry || receiverCountry);

  return (
    <Card>
      <CardHeader className="py-2 px-3 flex flex-row items-center justify-between">
        {/* ТЗ §E11/§E4: вкладка зветься «Параметри відправлення». */}
        <CardTitle className="text-sm">Параметри відправлення ({places.length})</CardTitle>
        {/* ТЗ §E4: редагування відкривається ЄДИНОЮ кнопкою «Редагувати»
            у шапці посилки — окрема кнопка на картці прибрана. Тут лишаються
            тільки «Зберегти»/«Скасувати», коли картка вже в режимі редагування. */}
        {editing && (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} className="text-xs h-7" disabled={saving}>
              Скасувати
            </Button>
            <Button size="sm" onClick={handleSave} className="text-xs h-7" disabled={saving}>
              {saving ? '...' : 'Зберегти'}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        {editing ? (
          <div className="space-y-3">
            {drafts.map((d, i) => (
              <div key={d.id} className="border rounded-md p-2 bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Місце #{d.placeNumber}</span>
                  {d.itnPlace && (
                    <span className="text-xs text-gray-400 font-mono">{d.itnPlace}</span>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-1">
                  <div>
                    <Label className="text-[10px] text-gray-500">Вага (кг) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={d.weight}
                      onChange={(e) => updateDraft(i, { weight: e.target.value })}
                      className="text-sm h-8"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-gray-500">Д (см)</Label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      value={d.length}
                      onChange={(e) => updateDraft(i, { length: e.target.value })}
                      className="text-sm h-8"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-gray-500">Ш (см)</Label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      value={d.width}
                      onChange={(e) => updateDraft(i, { width: e.target.value })}
                      className="text-sm h-8"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-gray-500">В (см)</Label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      value={d.height}
                      onChange={(e) => updateDraft(i, { height: e.target.value })}
                      className="text-sm h-8"
                    />
                  </div>
                </div>
                {(() => {
                  const vw = volWeight(d.length, d.width, d.height);
                  if (vw > 0) {
                    return (
                      <div className="text-xs text-gray-500 mt-1">
                        Об&apos;ємна вага: {vw.toFixed(2)} кг
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            ))}
            <div className="pt-2 border-t flex justify-between text-sm font-medium">
              <span>Загальна вага (нова)</span>
              <span>{totalDraftWeight.toFixed(2)} кг</span>
            </div>
            {canCalculate && totalDraftWeight > 0 && (
              <CostCalculator
                direction={direction!}
                senderCountry={senderCountry || null}
                receiverCountry={receiverCountry || null}
                actualWeight={totalDraftWeight}
                volumetricWeight={totalDraftVolWeight}
                declaredValue={Number(declaredValue) || 0}
                declaredValueCurrency={(declaredValueCurrency === 'UAH' ? 'UAH' : 'EUR') as 'EUR' | 'UAH'}
                needsPackaging={!!needsPackaging}
                isDoorstepDelivery={!!doorstepDelivery}
                isAddressDelivery={receiverDeliveryMethod === 'address'}
                insurance={insuranceEnabled}
                isPickupPoint={!!isPickupPoint}
                isCourierPickup={!!isCourierPickup}
                isMultiParcelPickup={!!isMultiParcelPickup}
                parcelMoneyAmount={parcelMoneyAmount ? Number(parcelMoneyAmount) : 0}
                receiverCity={receiverCity ?? null}
              />
            )}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {places.map(place => (
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
            {/* ТЗ E4: «Слова 'Загальна вага' забрати». Сумарна вага видно
                у блоці «Розрахунок вартості» нижче — окремий рядок
                непотрібен. */}
            {((canCalculate && calcActualWeight > 0) || savedBreakdown) && (
              <div className="mt-2">
                <CostCalculator
                  direction={direction!}
                  senderCountry={senderCountry || null}
                  receiverCountry={receiverCountry || null}
                  actualWeight={calcActualWeight}
                  volumetricWeight={calcVolWeight}
                  declaredValue={Number(declaredValue) || 0}
                  declaredValueCurrency={(declaredValueCurrency === 'UAH' ? 'UAH' : 'EUR') as 'EUR' | 'UAH'}
                  needsPackaging={!!needsPackaging}
                  isDoorstepDelivery={!!doorstepDelivery}
                  isAddressDelivery={receiverDeliveryMethod === 'address'}
                  insurance={insuranceEnabled}
                  isPickupPoint={!!isPickupPoint}
                  isCourierPickup={!!isCourierPickup}
                  isMultiParcelPickup={!!isMultiParcelPickup}
                  parcelMoneyAmount={parcelMoneyAmount ? Number(parcelMoneyAmount) : 0}
                  receiverCity={receiverCity ?? null}
                  // ТЗ docx 12.07.26: клієнтський контекст + збережена розбивка.
                  clientFacing={clientFacing}
                  saved={savedBreakdown}
                />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
