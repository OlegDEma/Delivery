'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';
import { COUNTRY_WIDE_CITY } from '@/lib/utils/logistics-availability';
import { toast } from 'sonner';

interface ServiceCity {
  id: string;
  country: string;
  city: string;
  acceptsCourierPickup: boolean;
  acceptsPostal: boolean;
  /** ТЗ docx 12.07.26: false = «Пункт збору» заборонено. */
  acceptsPickupPoint?: boolean;
  target?: 'sender' | 'receiver' | 'both';
  exceptions?: string[];
  notes: string | null;
}

// ТЗ docx 29.06.26: на кого поширюється обмеження.
const TARGET_LABELS: Record<string, string> = {
  both: 'Обидві сторони',
  sender: 'Відправник',
  receiver: 'Отримувач',
};

/**
 * ТЗ (docx 20.06.26): «Виклик кур'єра» та «Пошта» доступні за замовчуванням
 * усюди. Тут адмін може ЗАБОРОНИТИ опцію для окремого міста або цілої країни.
 * Заборона зберігається рядком ServiceCity з відповідним прапорцем = false.
 */
export default function ServiceCitiesPage() {
  const [rows, setRows] = useState<ServiceCity[]>([]);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState<string>('UA');
  const [city, setCity] = useState('');
  const [wholeCountry, setWholeCountry] = useState(false);
  const [forbidCourier, setForbidCourier] = useState(false);
  const [forbidPostal, setForbidPostal] = useState(false);
  // ТЗ docx 12.07.26: заборона «Пункт збору» — механізм як у Пошти/кур'єра.
  const [forbidPickupPoint, setForbidPickupPoint] = useState(false);
  // ТЗ docx 29.06.26: сторона, на яку діє обмеження.
  const [target, setTarget] = useState<'sender' | 'receiver' | 'both'>('both');
  // ТЗ docx 01.07.26: винятки-міста для правила на всю країну (через кому).
  const [exceptions, setExceptions] = useState('');
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
    const cityValue = wholeCountry ? COUNTRY_WIDE_CITY : city.trim();
    if (!cityValue) return;
    if (!forbidCourier && !forbidPostal && !forbidPickupPoint) {
      toast.error('Оберіть, що саме заборонити (Пункт збору, Виклик кур\'єра і/або Пошта)');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/service-cities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Заборона = прапорець false; дозвіл (дефолт) = true.
      body: JSON.stringify({
        country,
        city: cityValue,
        target,
        acceptsCourierPickup: !forbidCourier,
        acceptsPostal: !forbidPostal,
        // ТЗ docx 12.07.26: заборона «Пункт збору».
        acceptsPickupPoint: !forbidPickupPoint,
        // ТЗ docx 01.07.26: винятки діють лише для «Вся країна».
        exceptions: wholeCountry ? exceptions.split(',').map(s => s.trim()).filter(Boolean) : [],
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success('Збережено');
      setCity('');
      setWholeCountry(false);
      setForbidCourier(false);
      setForbidPostal(false);
      setForbidPickupPoint(false);
      setTarget('both');
      setExceptions('');
      await refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error || 'Помилка');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Зняти це обмеження?')) return;
    const res = await fetch(`/api/service-cities/${id}`, { method: 'DELETE' });
    if (res.ok) await refresh();
    else toast.error('Помилка видалення');
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Завантаження...</div>;

  // Показуємо лише рядки, що дійсно щось забороняють (acceptsX === false).
  const restrictions = rows.filter(r => !r.acceptsCourierPickup || !r.acceptsPostal || r.acceptsPickupPoint === false);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">Обмеження доступності способів</h1>
      <p className="text-sm text-gray-500 mb-4">
        «Пункт збору», «Виклик кур&apos;єра» та «Пошта» доступні <b>за замовчуванням</b> у
        всіх країнах і населених пунктах. Тут можна <b>заборонити</b> опцію для окремого
        міста або цілої країни. (Самі точки «Пунктів збору» додаються в розділі
        «Пункти збору» — тут лише доступність опції.)
      </p>

      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-base">Додати обмеження</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-[8rem_1fr_10rem_auto_auto] gap-2 items-end">
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
              <Label className="text-xs">Населений пункт</Label>
              <Input
                value={wholeCountry ? '' : city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Львів"
                disabled={wholeCountry}
              />
              <label className="flex items-center gap-2 text-xs mt-1 text-gray-600">
                <Checkbox checked={wholeCountry} onCheckedChange={(c) => setWholeCountry(c === true)} />
                Вся країна (всі міста)
              </label>
              {/* ТЗ docx 01.07.26: винятки — міста, де обмеження НЕ діє (через кому). */}
              {wholeCountry && (
                <div className="mt-1">
                  <Label className="text-xs text-gray-500">Винятки (дозволити тут; міста через кому)</Label>
                  <Input
                    value={exceptions}
                    onChange={(e) => setExceptions(e.target.value)}
                    placeholder="Львів, Київ"
                  />
                </div>
              )}
            </div>
            {/* ТЗ docx 29.06.26: на кого діє обмеження. */}
            <div>
              <Label className="text-xs">Кого стосується</Label>
              <Select value={target} onValueChange={(v) => setTarget((v ?? 'both') as 'sender' | 'receiver' | 'both')}>
                <SelectTrigger><SelectValue>{TARGET_LABELS[target]}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Обидві сторони</SelectItem>
                  <SelectItem value="sender">Відправник</SelectItem>
                  <SelectItem value="receiver">Отримувач</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              {/* ТЗ docx 12.07.26: «Заборонити "Пункт збору"» — механізм
                  аналогічний Пошті/Виклику кур'єра (першим у списку, як у ТЗ). */}
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={forbidPickupPoint} onCheckedChange={(c) => setForbidPickupPoint(c === true)} />
                Заборонити «Пункт збору»
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={forbidCourier} onCheckedChange={(c) => setForbidCourier(c === true)} />
                Заборонити «Виклик кур&apos;єра»
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={forbidPostal} onCheckedChange={(c) => setForbidPostal(c === true)} />
                Заборонити «Пошта»
              </label>
            </div>
            <Button type="submit" disabled={saving || (!wholeCountry && !city.trim())}>
              {saving ? '...' : 'Додати'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-base">Чинні обмеження ({restrictions.length})</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {restrictions.length === 0 ? (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">
              Обмежень немає — усі способи доступні всюди.
            </div>
          ) : (
            <div className="divide-y">
              {restrictions.map((r) => (
                <div key={r.id} className="px-4 py-2 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{COUNTRY_LABELS[r.country as CountryCode] || r.country}</span>
                    <span className="text-gray-400 mx-1">·</span>
                    <span>{r.city === COUNTRY_WIDE_CITY ? 'Вся країна' : r.city}</span>
                    {/* ТЗ docx 01.07.26: винятки для country-wide правила. */}
                    {r.city === COUNTRY_WIDE_CITY && r.exceptions && r.exceptions.length > 0 && (
                      <span className="ml-1 text-[10px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                        окрім: {r.exceptions.join(', ')}
                      </span>
                    )}
                    {r.target && r.target !== 'both' && (
                      <span className="ml-2 text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                        {TARGET_LABELS[r.target]}
                      </span>
                    )}
                    {/* ТЗ docx 12.07.26: бейдж заборони «Пункт збору». */}
                    {r.acceptsPickupPoint === false && (
                      <span className="ml-2 text-[10px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded">
                        🚫 Пункт збору
                      </span>
                    )}
                    {!r.acceptsCourierPickup && (
                      <span className="ml-2 text-[10px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded">
                        🚫 Виклик кур&apos;єра
                      </span>
                    )}
                    {!r.acceptsPostal && (
                      <span className="ml-1 text-[10px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded">
                        🚫 Пошта
                      </span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(r.id)}
                    className="text-red-600 hover:text-red-700 text-xs"
                  >
                    Зняти
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
