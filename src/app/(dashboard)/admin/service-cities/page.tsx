'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';
import { toast } from 'sonner';

interface ServiceCity {
  id: string;
  country: string;
  city: string;
  acceptsCourierPickup: boolean;
  acceptsPostal: boolean;
  notes: string | null;
}

/**
 * Список міст, де доступний «Виклик кур'єра» для клієнта (per ТЗ §5).
 * В UA — лише Львів за замовчуванням; адмін може додати інші коли
 * з'явиться відповідна можливість.
 */
export default function ServiceCitiesPage() {
  const [rows, setRows] = useState<ServiceCity[]>([]);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState<string>('UA');
  const [city, setCity] = useState('');
  const [accepts, setAccepts] = useState(true);
  const [postal, setPostal] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/service-cities');
      if (cancelled) return;
      if (res.ok) {
        const data: ServiceCity[] = await res.json();
        if (!cancelled) setRows(data);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  async function refresh() {
    const res = await fetch('/api/service-cities');
    if (res.ok) setRows(await res.json());
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!city.trim()) return;
    setSaving(true);
    const res = await fetch('/api/service-cities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country, city: city.trim(), acceptsCourierPickup: accepts, acceptsPostal: postal }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success('Збережено');
      setCity('');
      setAccepts(true);
      setPostal(false);
      await refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error || 'Помилка');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Видалити це місто зі списку?')) return;
    const res = await fetch(`/api/service-cities/${id}`, { method: 'DELETE' });
    if (res.ok) await refresh();
    else toast.error('Помилка видалення');
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Завантаження...</div>;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">Міста обслуговування</h1>
      <p className="text-sm text-gray-500 mb-4">
        Список міст, у яких клієнт може обирати «Виклик кур&apos;єра» при оформленні
        посилки. У EU зазвичай дозволено в усіх містах обслуговуваних країн —
        але цей список можна звузити. В Україні — лише місто(а) з цього списку.
      </p>

      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-base">Додати / оновити місто</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-[8rem_1fr_auto_auto] gap-2 items-end">
            <div>
              <Label className="text-xs">Країна</Label>
              <Select value={country} onValueChange={(v) => setCountry(v ?? 'UA')}>
                <SelectTrigger><SelectValue>{COUNTRY_LABELS[country as CountryCode]}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UA">Україна</SelectItem>
                  <SelectItem value="NL">Нідерланди</SelectItem>
                  <SelectItem value="AT">Австрія</SelectItem>
                  <SelectItem value="DE">Німеччина</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Місто</Label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Львів"
              />
            </div>
            {/* ТЗ docx 14.05.26: два прапорці — «Виклик кур'єра» (по місту) та
                «Пошта» (агрегується по країні). Керують показом опцій у формах. */}
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={accepts} onCheckedChange={(c) => setAccepts(c === true)} />
                «Виклик кур&apos;єра» доступний
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={postal} onCheckedChange={(c) => setPostal(c === true)} />
                «Пошта» доступна (по країні)
              </label>
            </div>
            <Button type="submit" disabled={saving || !city.trim()}>
              {saving ? '...' : 'Зберегти'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-base">Список ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {rows.length === 0 ? (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">Список порожній</div>
          ) : (
            <div className="divide-y">
              {rows.map((r) => (
                <div key={r.id} className="px-4 py-2 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{COUNTRY_LABELS[r.country as CountryCode] || r.country}</span>
                    <span className="text-gray-400 mx-1">·</span>
                    <span>{r.city}</span>
                    {r.acceptsCourierPickup ? (
                      <span className="ml-2 text-[10px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                        Виклик кур&apos;єра ✓
                      </span>
                    ) : (
                      <span className="ml-2 text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                        Виклик кур&apos;єра вимкнено
                      </span>
                    )}
                    {r.acceptsPostal ? (
                      <span className="ml-1 text-[10px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                        Пошта ✓
                      </span>
                    ) : (
                      <span className="ml-1 text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                        Пошта вимкнено
                      </span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(r.id)}
                    className="text-red-600 hover:text-red-700 text-xs"
                  >
                    Видалити
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
