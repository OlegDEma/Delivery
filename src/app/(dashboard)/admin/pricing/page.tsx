'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';

interface PricingConfig {
  id: string;
  country: string;
  direction: string;
  pricePerKg: number;
  weightType: string;
  insuranceEnabled: boolean;
  packagingEnabled: boolean;
  addressDeliveryPrice: number;
  collectionDays: string[];
}

export default function PricingPage() {
  const [configs, setConfigs] = useState<PricingConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  async function fetchConfigs() {
    setLoading(true);
    const res = await fetch('/api/pricing');
    if (res.ok) setConfigs(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchConfigs(); }, []);

  async function handleSave(config: PricingConfig) {
    setSaving(config.id);
    await fetch('/api/pricing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: config.id,
        pricePerKg: config.pricePerKg,
        weightType: config.weightType,
        insuranceEnabled: config.insuranceEnabled,
        packagingEnabled: config.packagingEnabled,
        addressDeliveryPrice: config.addressDeliveryPrice,
      }),
    });
    setSaving(null);
  }

  function updateConfig(id: string, field: string, value: unknown) {
    setConfigs(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  }

  const WEIGHT_TYPE_LABELS: Record<string, string> = { actual: 'Фактична (max)', volumetric: "Об'ємна", average: 'Середня' };

  if (loading) return <div className="text-center py-12 text-gray-500">Завантаження...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Тарифи</h1>

      <div className="space-y-4">
        {configs.map(config => (
          <Card key={config.id}>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-base">
                {COUNTRY_LABELS[config.country as CountryCode] || config.country}
                {' '}
                {config.direction === 'eu_to_ua' ? '→ Україна' : '← Україна'}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Ціна за кг (EUR)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={config.pricePerKg}
                    onChange={(e) => updateConfig(config.id, 'pricePerKg', Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Адресна доставка (EUR)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={config.addressDeliveryPrice}
                    onChange={(e) => updateConfig(config.id, 'addressDeliveryPrice', Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Тип ваги</Label>
                  <Select
                    value={config.weightType}
                    onValueChange={(v) => updateConfig(config.id, 'weightType', v ?? 'actual')}
                  >
                    <SelectTrigger><SelectValue>{WEIGHT_TYPE_LABELS[config.weightType]}</SelectValue></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="actual">Фактична (max)</SelectItem>
                      <SelectItem value="volumetric">Об&apos;ємна</SelectItem>
                      <SelectItem value="average">Середня</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={config.insuranceEnabled}
                    onCheckedChange={(c) => updateConfig(config.id, 'insuranceEnabled', c === true)}
                  />
                  Страхування
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={config.packagingEnabled}
                    onCheckedChange={(c) => updateConfig(config.id, 'packagingEnabled', c === true)}
                  />
                  Пакування
                </label>
              </div>
              <div className="text-xs text-gray-400">
                Дні збору: {config.collectionDays.join(', ') || '—'}
              </div>
              <Button
                size="sm"
                onClick={() => handleSave(config)}
                disabled={saving === config.id}
              >
                {saving === config.id ? 'Збереження...' : 'Зберегти'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
