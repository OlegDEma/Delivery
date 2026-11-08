'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldHint } from '@/components/shared/field-hint';
import { PlaceVolumeInputs } from '@/components/parcels/place-volume-inputs';
import { draftVolumetricWeight, draftVolumePayload, placeHasVolumeSource } from '@/lib/parcels/place-volume';
import { getBillableWeight } from '@/lib/utils/volumetric';

/**
 * ТЗ docx 04.11.26 (п.8): «При відкритті посилки для редагування повинна відкриватись
 * така сама форма (з тими самими механізмами) як і при створенні … Зокрема має бути
 * можливість додавання місця так як у формі створення». Раніше у формі редагування
 * були лише копіювання наявних місць, а нові місця сервер мовчки відкидав (посилка 301).
 * Тепер блок «Параметри відправлення» — один компонент для обох форм: «Загальні
 * параметри», «+ Додати місце», копіювання, видалення, підсумок ваг.
 */

export interface PlaceDraft {
  /** id наявного місця (у формі редагування); нове місце — без id. */
  id?: string;
  weight: string;
  length: string;
  width: string;
  height: string;
  volume: string;
  /** ТЗ docx 28.10.26: віконце «Об'ємна вага» (пов'язане з «Або об'єм»). */
  volWeight: string;
  needsPackaging: boolean;
}

export const emptyPlace = (): PlaceDraft => ({
  weight: '', length: '', width: '', height: '', volume: '', volWeight: '', needsPackaging: false,
});

export const MAX_PLACES = 10;

/** Помилка заповнення з віконцем, куди поставити курсор (ТЗ docx 04.11.26, п.3). */
export interface PlacesValidationError {
  message: string;
  field: string;
}

export function usePlacesDraft(initial?: PlaceDraft[]) {
  const [places, setPlaces] = useState<PlaceDraft[]>(() => (initial && initial.length ? initial : [emptyPlace()]));
  const [useGeneralParams, setUseGeneralParams] = useState(false);
  const [generalWeight, setGeneralWeight] = useState('');
  const [generalVolume, setGeneralVolume] = useState('');
  const [generalPlaces, setGeneralPlaces] = useState('1');

  const totalWeight = useGeneralParams
    ? (Number(generalWeight) || 0)
    : places.reduce((s, p) => s + (Number(p.weight) || 0), 0);
  const totalVolWeight = useGeneralParams
    ? (Number(generalVolume) || 0) * 250
    : places.reduce((s, p) => s + draftVolumetricWeight(p), 0);

  /** ТЗ (docx 13.06.26 / 28.10.26): вага обовʼязкова, об'ємна вага не може бути нульовою. */
  function validate(): PlacesValidationError | null {
    if (useGeneralParams) {
      if (!generalWeight || Number(generalWeight) <= 0) {
        return { message: 'Вкажіть загальну вагу', field: '[data-field="general-weight"]' };
      }
      if (!generalVolume || Number(generalVolume) <= 0) {
        return { message: 'Вкажіть загальний об\'єм (м³) — об\'ємна вага не може бути нульовою', field: '[data-field="general-volume"]' };
      }
      return null;
    }
    if (!places.some((p) => Number(p.weight) > 0)) {
      return { message: 'Вкажіть вагу хоча б одного місця — це обов\'язково', field: '[data-field="place-0-weight"]' };
    }
    const bad = places.findIndex((p) => Number(p.weight) > 0 && !placeHasVolumeSource(p));
    if (bad !== -1) {
      return {
        message: `Місце ${bad + 1}: вкажіть довжину/ширину/висоту, об'ємну вагу АБО об'єм (м³) — об'ємна вага не може бути нульовою`,
        field: `[data-field="place-${bad}-volweight"]`,
      };
    }
    return null;
  }

  /** Місця для API (POST створення / PATCH редагування — у PATCH з id наявних). */
  function payload() {
    if (useGeneralParams) {
      const n = Number(generalPlaces) || 1;
      return Array.from({ length: n }, () => ({
        weight: (Number(generalWeight) || 0) / n,
        volume: Number(generalVolume) > 0 ? Number(generalVolume) / n : undefined,
      }));
    }
    return places.map((p) => ({
      ...(p.id ? { id: p.id } : {}),
      weight: Number(p.weight) || 0,
      length: Number(p.length) || undefined,
      width: Number(p.width) || undefined,
      height: Number(p.height) || undefined,
      ...draftVolumePayload(p),
      needsPackaging: p.needsPackaging,
    }));
  }

  return {
    places, setPlaces,
    useGeneralParams, setUseGeneralParams,
    generalWeight, setGeneralWeight,
    generalVolume, setGeneralVolume,
    generalPlaces, setGeneralPlaces,
    totalWeight, totalVolWeight,
    validate, payload,
  };
}

export type PlacesDraft = ReturnType<typeof usePlacesDraft>;

export function PlacesEditor({
  draft,
  weightRule,
}: {
  draft: PlacesDraft;
  /** Правило тарифу для «Розрахункової ваги» (ТЗ §E11, Bug 5) — як у CostCalculator. */
  weightRule?: { weightType?: 'actual' | 'volumetric' | 'average' | 'custom'; weightCustomFactualFraction?: number } | null;
}) {
  const { places, setPlaces } = draft;

  function addPlace() {
    setPlaces((prev) => (prev.length >= MAX_PLACES ? prev : [...prev, emptyPlace()]));
  }
  function copyPlace(index: number) {
    // Копія — нове місце (без id наявного).
    setPlaces((prev) => (prev.length >= MAX_PLACES ? prev : [...prev, { ...prev[index], id: undefined }]));
  }
  function removePlace(index: number) {
    setPlaces((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }
  function patchPlace(index: number, patch: Partial<PlaceDraft>) {
    setPlaces((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  const billable = getBillableWeight(
    draft.totalWeight,
    draft.totalVolWeight,
    weightRule?.weightType || 'custom',
    weightRule?.weightCustomFactualFraction ?? 0.5,
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Checkbox checked={draft.useGeneralParams} onCheckedChange={(c) => draft.setUseGeneralParams(c === true)} />
        <Label className="text-sm">Загальні параметри <FieldHint text="Відмітьте для введення загальної ваги, об'єму та кількості місць замість детальних параметрів кожного місця." /></Label>
      </div>

      {draft.useGeneralParams ? (
        <div className="border rounded-lg p-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Загальна вага (кг)</Label>
              {/* ТЗ docx 04.11.26 (п.2): на смартфоні — цифрова клавіатура. */}
              <Input
                type="number" inputMode="decimal" step="0.01" min="0" className="text-base"
                value={draft.generalWeight} onChange={(e) => draft.setGeneralWeight(e.target.value)}
                data-field="general-weight" data-flow="" enterKeyHint="next"
              />
            </div>
            <div>
              <Label className="text-xs">Загальний об&apos;єм (м&sup3;)</Label>
              <Input
                type="number" inputMode="decimal" step="any" min="0"
                value={draft.generalVolume} onChange={(e) => draft.setGeneralVolume(e.target.value)}
                data-field="general-volume" data-flow="" enterKeyHint="next"
              />
            </div>
            <div>
              <Label className="text-xs">Кількість місць</Label>
              <Input
                type="number" inputMode="numeric" step="1" min="1" max={MAX_PLACES}
                value={draft.generalPlaces} onChange={(e) => draft.setGeneralPlaces(e.target.value)}
              />
            </div>
          </div>
          {Number(draft.generalVolume) > 0 && (
            <div className="text-xs text-gray-500">
              Об&apos;ємна вага: <span className="font-medium">{(Number(draft.generalVolume) * 250).toFixed(2)} кг</span> (об&apos;єм &times; 250)
            </div>
          )}
        </div>
      ) : (
        <>
          {places.map((place, i) => (
            <div key={place.id || `new-${i}`} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Місце {i + 1}</span>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => copyPlace(i)} title="Копіювати місце" disabled={places.length >= MAX_PLACES}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </Button>
                  {places.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => removePlace(i)} className="text-red-500 hover:text-red-700" title="Видалити місце">
                      &times;
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div>
                  <Label className="text-xs">Вага (кг)</Label>
                  {/* ТЗ docx 04.11.26 (п.1–2): цифрова клавіатура; Вага першого місця — у
                      ланцюжку курсору (після «Оголошеної вартості»). */}
                  <Input
                    type="number" inputMode="decimal" step="0.01" min="0" className="text-base"
                    value={place.weight} onChange={(e) => patchPlace(i, { weight: e.target.value })}
                    data-field={`place-${i}-weight`} data-flow={i === 0 ? '' : undefined} enterKeyHint="next"
                  />
                </div>
                <div>
                  <Label className="text-xs">Довжина (см)</Label>
                  <Input type="number" inputMode="decimal" step="1" min="0" value={place.length} onChange={(e) => patchPlace(i, { length: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Ширина (см)</Label>
                  <Input type="number" inputMode="decimal" step="1" min="0" value={place.width} onChange={(e) => patchPlace(i, { width: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Висота (см)</Label>
                  <Input type="number" inputMode="decimal" step="1" min="0" value={place.height} onChange={(e) => patchPlace(i, { height: e.target.value })} />
                </div>
              </div>
              {/* ТЗ docx 28.10.26: «Об'ємна вага» під «Вага», «Або об'єм» — правіше. */}
              <PlaceVolumeInputs place={place} onChange={(patch) => patchPlace(i, patch)} fieldPrefix={`place-${i}`} flow={i === 0} />
            </div>
          ))}
          {/* ТЗ docx 23.08.26: «+ Додати місце» завжди під останнім місцем. */}
          <Button
            type="button" variant="outline" size="sm" onClick={addPlace}
            disabled={places.length >= MAX_PLACES} className="w-full"
          >
            + Додати місце
          </Button>
        </>
      )}

      {/* Підсумок — Розрахункова вага за правилом тарифу (Bug 5 docx). */}
      <div className="bg-gray-50 rounded-lg p-3 text-sm">
        <div className="flex justify-between">
          <span>Фактична вага:</span>
          <span className="font-medium">{draft.totalWeight.toFixed(2)} кг</span>
        </div>
        {draft.totalVolWeight > 0 && (
          <div className="flex justify-between">
            <span>Об&apos;ємна вага:</span>
            <span className="font-medium">{draft.totalVolWeight.toFixed(2)} кг</span>
          </div>
        )}
        <div className="flex justify-between font-medium border-t mt-1 pt-1">
          <span>Розрахункова вага:</span>
          <span>{billable.toFixed(2)} кг</span>
        </div>
      </div>
    </div>
  );
}
