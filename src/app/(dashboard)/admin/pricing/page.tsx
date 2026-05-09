'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';
import { VOLUMETRIC_DIVISOR } from '@/lib/utils/volumetric';
import { FieldHint } from '@/components/shared/field-hint';

/**
 * State model: all numeric fields are kept as RAW strings so that the user can
 * temporarily clear an input (e.g. erase the leading 0 to type a new value).
 * If we stored them as numbers, `Number('') === 0` would snap the field back
 * to 0 on every keystroke, which is the bug ТЗ flags as «неможливо забрати 0».
 */
interface ConfigForm {
  id: string;
  country: string;
  direction: string;
  pricePerKg: string;
  weightType: string;
  /** Per ТЗ §8 — частка фактичної ваги при weightType=custom (0..1). */
  weightCustomFactualFraction: string;
  insuranceEnabled: boolean;
  insurancePercent: string;        // displayed as whole-percent (1 = 1%)
  packagingEnabled: boolean;
  packagingPer10kg: string;
  parcelMoneyPercent: string;
  pickupPointPrice: string;
  addressDeliveryPrice: string;
  /** Per ТЗ — мін. вартість при 2+ посилок з однієї локації на різні адреси. */
  minMultiPerAddress: string;
  /** Per ТЗ — мін. вартість при одночасному UA→EU + EU→UA з однієї локації. */
  minBothDirections: string;
  collectionDays: string[];
}

interface ApiPricingConfig {
  id: string;
  country: string;
  direction: string;
  pricePerKg: string | number;
  weightType: string;
  weightCustomFactualFraction: string | number;
  insuranceEnabled: boolean;
  insuranceRate: string | number;
  packagingEnabled: boolean;
  packagingPer10kg: string | number;
  parcelMoneyPercent: string | number;
  pickupPointPrice: string | number;
  addressDeliveryPrice: string | number;
  minMultiPerAddress: string | number;
  minBothDirections: string | number;
  collectionDays: string[];
}

function toForm(c: ApiPricingConfig): ConfigForm {
  return {
    id: c.id,
    country: c.country,
    direction: c.direction,
    pricePerKg: String(c.pricePerKg ?? '0'),
    weightType: c.weightType,
    weightCustomFactualFraction: String(c.weightCustomFactualFraction ?? '0.5'),
    insuranceEnabled: !!c.insuranceEnabled,
    // DB stores fraction (0..1), UI shows percent (0..100). Round to avoid
    // floating-point noise like 0.029999... → 2.9999999%.
    insurancePercent: ((Number(c.insuranceRate) || 0) * 100).toFixed(2).replace(/\.?0+$/, '') || '0',
    packagingEnabled: !!c.packagingEnabled,
    packagingPer10kg: String(c.packagingPer10kg ?? '0'),
    parcelMoneyPercent: String(c.parcelMoneyPercent ?? '0'),
    pickupPointPrice: String(c.pickupPointPrice ?? '0'),
    addressDeliveryPrice: String(c.addressDeliveryPrice ?? '0'),
    minMultiPerAddress: String(c.minMultiPerAddress ?? '0'),
    minBothDirections: String(c.minBothDirections ?? '0'),
    collectionDays: c.collectionDays ?? [],
  };
}

/**
 * Parse a user-typed numeric string. Empty / non-numeric → null (treated as
 * «do not change» on save when paired with a clear validation message).
 */
function parseNum(s: string): number | null {
  const trimmed = s.trim().replace(',', '.');
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export default function PricingPage() {
  const [configs, setConfigs] = useState<ConfigForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  // Initial load. We deliberately avoid wrapping in a separate function that
  // calls setState synchronously in the effect body — the loading flag is
  // already `true` from the initial state, so no sync setState is needed
  // before the awaited fetch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/pricing');
      if (cancelled) return;
      if (res.ok) {
        const data: ApiPricingConfig[] = await res.json();
        if (cancelled) return;
        setConfigs(data.map(toForm));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  function update(id: string, field: keyof ConfigForm, value: unknown) {
    setConfigs(prev => prev.map(c => c.id === id ? { ...c, [field]: value as never } : c));
  }

  async function handleSave(c: ConfigForm) {
    setError(null);

    // Validate. Negative or non-numeric values are rejected client-side so the
    // operator gets a clear message instead of a generic 400.
    const fields: Array<{ key: keyof ConfigForm; label: string; min: number; max: number }> = [
      { key: 'pricePerKg',                  label: 'Ціна за кг',                   min: 0, max: 1000 },
      { key: 'addressDeliveryPrice',        label: 'Адресна доставка',             min: 0, max: 1000 },
      { key: 'pickupPointPrice',            label: 'Пункт збору',                  min: 0, max: 1000 },
      { key: 'minMultiPerAddress',          label: '2+ посилок з локації (мін.)',  min: 0, max: 1000 },
      { key: 'minBothDirections',           label: 'Туди-сюди з локації (мін.)',   min: 0, max: 1000 },
      { key: 'packagingPer10kg',            label: 'Пакування (€/10кг)',           min: 0, max: 1000 },
      { key: 'insurancePercent',            label: 'Страхування (%)',              min: 0, max: 100 },
      { key: 'parcelMoneyPercent',          label: 'Пакет (%)',                    min: 0, max: 100 },
      { key: 'weightCustomFactualFraction', label: 'Частка фактичної ваги',        min: 0, max: 1   },
    ];
    for (const f of fields) {
      const n = parseNum(c[f.key] as string);
      if (n === null) { setError(`${f.label}: введіть число`); return; }
      if (n < f.min || n > f.max) { setError(`${f.label}: допустимий діапазон ${f.min}..${f.max}`); return; }
    }

    setSaving(c.id);
    const res = await fetch('/api/pricing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: c.id,
        pricePerKg:                  parseNum(c.pricePerKg),
        weightType:                  c.weightType,
        weightCustomFactualFraction: parseNum(c.weightCustomFactualFraction),
        addressDeliveryPrice: parseNum(c.addressDeliveryPrice),
        pickupPointPrice:     parseNum(c.pickupPointPrice),
        minMultiPerAddress:   parseNum(c.minMultiPerAddress),
        minBothDirections:    parseNum(c.minBothDirections),
        insuranceEnabled:     c.insuranceEnabled,
        // UI is whole-percent; DB stores 0..1 fraction.
        insuranceRate:        (parseNum(c.insurancePercent) ?? 0) / 100,
        packagingEnabled:     c.packagingEnabled,
        packagingPer10kg:     parseNum(c.packagingPer10kg),
        parcelMoneyPercent:   parseNum(c.parcelMoneyPercent),
      }),
    });
    setSaving(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'Помилка збереження');
      return;
    }
    setSavedAt(prev => ({ ...prev, [c.id]: Date.now() }));
    // Auto-clear "Збережено" indicator after 2.5s.
    setTimeout(() => setSavedAt(prev => {
      const copy = { ...prev };
      delete copy[c.id];
      return copy;
    }), 2500);
  }

  const WEIGHT_TYPE_LABELS: Record<string, string> = {
    actual: 'Фактична (max)',
    volumetric: "Об'ємна",
    average: 'Середня',
    custom: 'Власна частка',
  };

  if (loading) return <div className="text-center py-12 text-gray-500">Завантаження...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Тарифи</h1>

      {/* Правила розрахункової ваги (per ТЗ — окрема секція) */}
      <Card className="mb-4 border-blue-200 bg-blue-50/30">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-base text-blue-900">Правила розрахункової ваги</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 text-sm text-gray-700 space-y-2">
          <p>
            <span className="font-semibold">Об&apos;ємна вага</span>{' '}
            = (Довжина × Ширина × Висота) ÷ <span className="font-mono">{VOLUMETRIC_DIVISOR}</span>{' '}
            (у см → кг). Або: об&apos;єм (м³) × 250.
          </p>
          <p>
            <span className="font-semibold">Розрахункова вага</span> — обирається типом ваги нижче для кожної країни:
          </p>
          <ul className="list-disc pl-5 space-y-0.5 text-gray-600">
            <li><span className="font-medium">Фактична (max)</span> — береться більша з фактичної та об&apos;ємної (рекомендовано).</li>
            <li><span className="font-medium">Об&apos;ємна</span> — завжди об&apos;ємна, незалежно від фактичної.</li>
            <li><span className="font-medium">Середня</span> — (фактична + об&apos;ємна) ÷ 2.</li>
          </ul>
          <p className="text-xs text-amber-700 pt-1">
            Дільник 4000 та коефіцієнт 250 — глобальні константи (`src/lib/utils/volumetric.ts`).
            Зміна потребує деплою. Тип ваги (нижче) — налаштовується вільно для кожної країни/напрямку.
          </p>
        </CardContent>
      </Card>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-4">
        {configs.map(config => (
          <Card key={config.id}>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-base">
                {/* ТЗ: «у назві поля завжди першою іде країна з якої
                    відправляють, друга — країна призначення». */}
                {config.direction === 'eu_to_ua'
                  ? `${COUNTRY_LABELS[config.country as CountryCode] || config.country} → Україна`
                  : `Україна → ${COUNTRY_LABELS[config.country as CountryCode] || config.country}`}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0 space-y-3">
              {/* Базові поля */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Ціна за кг (EUR)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={config.pricePerKg}
                    onChange={(e) => update(config.id, 'pricePerKg', e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">
                    Адресна доставка (EUR){' '}
                    <FieldHint text="Мінімальна вартість однієї посилки при заїзді кур'єра на адресу відправника (одна посилка від цього відправника)." />
                  </Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={config.addressDeliveryPrice}
                    onChange={(e) => update(config.id, 'addressDeliveryPrice', e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">
                    Пункт збору (EUR){' '}
                    <FieldHint text="Мінімальна вартість однієї посилки при здачі/отриманні посилки на Пункті збору." />
                  </Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={config.pickupPointPrice}
                    onChange={(e) => update(config.id, 'pickupPointPrice', e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">
                    2+ посилок з локації (EUR){' '}
                    <FieldHint text="Мінімальна вартість КОЖНОЇ посилки коли від одного відправника забираємо 2+ посилок на різні адреси одержувачів." />
                  </Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={config.minMultiPerAddress}
                    onChange={(e) => update(config.id, 'minMultiPerAddress', e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">
                    Туди-сюди з локації (EUR){' '}
                    <FieldHint text="Мінімальна вартість посилки коли клієнт ОДНОЧАСНО і відправляє в Україну, і отримує з України з тієї ж локації." />
                  </Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={config.minBothDirections}
                    onChange={(e) => update(config.id, 'minBothDirections', e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">
                    Тип розрахункової ваги{' '}
                    <FieldHint text="Якщо фактична вага більша від об'ємної — завжди береться фактична (per ТЗ §8). Тип ваги визначає поведінку лише коли об'ємна > фактичної: брати більшу (max), об'ємну, середню чи власну частку." />
                  </Label>
                  <Select
                    value={config.weightType}
                    onValueChange={(v) => update(config.id, 'weightType', v ?? 'actual')}
                  >
                    <SelectTrigger><SelectValue>{WEIGHT_TYPE_LABELS[config.weightType]}</SelectValue></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="actual">Фактична (max)</SelectItem>
                      <SelectItem value="volumetric">Об&apos;ємна</SelectItem>
                      <SelectItem value="average">Середня</SelectItem>
                      <SelectItem value="custom">Власна частка</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* ТЗ §8: коли тип ваги = custom — показуємо поле для частки. */}
                {config.weightType === 'custom' && (
                  <div>
                    <Label className="text-xs">
                      Частка фактичної ваги (0..1){' '}
                      <FieldHint text="Розрахункова вага = частка × фактична + (1 − частка) × об'ємна. Діє лише коли об'ємна > фактичної. 0 = тільки об'ємна, 1 = тільки фактична, 0.5 = середня." />
                    </Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      max="1"
                      value={config.weightCustomFactualFraction}
                      onChange={(e) => update(config.id, 'weightCustomFactualFraction', e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Послуги */}
              <div className="border-t pt-3 space-y-3">
                <div className="text-sm font-semibold text-gray-700">Додаткові послуги</div>

                {/* Страхування */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={config.insuranceEnabled}
                      onCheckedChange={(c) => update(config.id, 'insuranceEnabled', c === true)}
                    />
                    Страхування
                  </label>
                  <div>
                    <Label className="text-xs">
                      % від оголошеної вартості{' '}
                      <FieldHint text="Скільки % від оголошеної вартості додається при відмічанні чекбокса 'Страхування' у формі посилки." />
                    </Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      max="100"
                      value={config.insurancePercent}
                      onChange={(e) => update(config.id, 'insurancePercent', e.target.value)}
                      disabled={!config.insuranceEnabled}
                    />
                  </div>
                </div>

                {/* Пакування */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={config.packagingEnabled}
                      onCheckedChange={(c) => update(config.id, 'packagingEnabled', c === true)}
                    />
                    Пакування
                  </label>
                  <div>
                    <Label className="text-xs">
                      EUR за кожні (повні і неповні) 10 кг{' '}
                      <FieldHint text="Сума, яка береться за кожні 10 кг ваги при відмічанні чекбокса 'Пакування' у формі посилки." />
                    </Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={config.packagingPer10kg}
                      onChange={(e) => update(config.id, 'packagingPer10kg', e.target.value)}
                      disabled={!config.packagingEnabled}
                    />
                  </div>
                </div>

                {/* Пакет */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div className="text-sm">Пакет (передача готівки)</div>
                  <div>
                    <Label className="text-xs">
                      % від суми Пакета{' '}
                      <FieldHint text="Скільки % береться від числа, яке клієнт вводить у віконце 'Пакет' при оформленні посилки. 0 — опція вимкнена." />
                    </Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      max="100"
                      value={config.parcelMoneyPercent}
                      onChange={(e) => update(config.id, 'parcelMoneyPercent', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="text-xs text-gray-400">
                Дні збору: {config.collectionDays.join(', ') || '—'}
              </div>

              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  onClick={() => handleSave(config)}
                  disabled={saving === config.id}
                >
                  {saving === config.id ? 'Збереження...' : 'Зберегти'}
                </Button>
                {savedAt[config.id] && (
                  <span className="text-xs text-green-600">Збережено</span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
