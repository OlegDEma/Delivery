'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';
import { PhoneInput } from '@/components/shared/phone-input';
import { WEEKDAYS, WEEKDAY_LABELS, formatWorkingDays, type Weekday } from '@/lib/constants/collection';

interface CollectionPoint {
  id: string;
  name: string | null;
  country: string;
  city: string;
  address: string;
  postalCode: string | null;
  contactPhone: string | null;
  workingHours: string | null;
  workingDays: Weekday[];
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  maxCapacity: number | null;
  isActive: boolean;
}

interface PointFormState {
  id: string | null;
  name: string;
  country: string;
  city: string;
  address: string;
  postalCode: string;
  contactPhone: string;
  workingHours: string;
  workingDays: Weekday[];
  latitude: string;
  longitude: string;
  notes: string;
  maxCapacity: string;
  isActive: boolean;
}

const emptyForm: PointFormState = {
  id: null,
  name: '',
  country: 'NL',
  city: '',
  address: '',
  postalCode: '',
  contactPhone: '',
  workingHours: '',
  workingDays: [],
  latitude: '',
  longitude: '',
  notes: '',
  maxCapacity: '',
  isActive: true,
};

const CP_COUNTRY_LABELS: Record<string, string> = {
  NL: 'Нідерланди',
  AT: 'Австрія',
  DE: 'Німеччина',
};

export default function CollectionPointsPage() {
  const [points, setPoints] = useState<CollectionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PointFormState>(emptyForm);

  async function fetchPoints() {
    setLoading(true);
    const res = await fetch('/api/collection-points');
    if (res.ok) setPoints(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    fetchPoints();
  }, []);

  function openCreate() {
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(p: CollectionPoint) {
    setForm({
      id: p.id,
      name: p.name || '',
      country: p.country,
      city: p.city,
      address: p.address,
      postalCode: p.postalCode || '',
      contactPhone: p.contactPhone || '',
      workingHours: p.workingHours || '',
      workingDays: p.workingDays || [],
      latitude: p.latitude != null ? String(p.latitude) : '',
      longitude: p.longitude != null ? String(p.longitude) : '',
      notes: p.notes || '',
      maxCapacity: p.maxCapacity != null ? String(p.maxCapacity) : '',
      isActive: p.isActive,
    });
    setDialogOpen(true);
  }

  function toggleDay(day: Weekday) {
    setForm(prev => ({
      ...prev,
      workingDays: prev.workingDays.includes(day)
        ? prev.workingDays.filter(d => d !== day)
        : [...prev.workingDays, day],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.city || !form.address) {
      toast.error('Місто і адреса обовʼязкові');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        country: form.country,
        city: form.city,
        address: form.address,
        postalCode: form.postalCode,
        contactPhone: form.contactPhone,
        workingHours: form.workingHours,
        workingDays: form.workingDays,
        latitude: form.latitude,
        longitude: form.longitude,
        notes: form.notes,
        maxCapacity: form.maxCapacity,
        isActive: form.isActive,
      };
      const url = form.id ? `/api/collection-points/${form.id}` : '/api/collection-points';
      const method = form.id ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success(form.id ? 'Збережено' : 'Пункт створено');
        setDialogOpen(false);
        fetchPoints();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Помилка');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(point: CollectionPoint) {
    if (!confirm(`Видалити пункт «${point.city}, ${point.address}»?`)) return;
    const res = await fetch(`/api/collection-points/${point.id}`, { method: 'DELETE' });
    if (res.ok) {
      const data = await res.json();
      toast.success(data.deactivated ? 'Пункт деактивовано (має повʼязані посилки)' : 'Видалено');
      fetchPoints();
    } else {
      toast.error('Помилка видалення');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold">Пункти збору</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button onClick={openCreate}>+ Додати</Button>} />
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{form.id ? 'Редагувати пункт' : 'Новий пункт збору'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label>Назва (опціонально)</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Amsterdam Centraal"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Країна *</Label>
                  <Select value={form.country} onValueChange={(v) => setForm({ ...form, country: v ?? 'NL' })}>
                    <SelectTrigger>
                      <SelectValue>{CP_COUNTRY_LABELS[form.country]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NL">Нідерланди</SelectItem>
                      <SelectItem value="AT">Австрія</SelectItem>
                      <SelectItem value="DE">Німеччина</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Місто *</Label>
                  <Input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div>
                <Label>Адреса *</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  required
                  placeholder="Damstraat 12"
                />
              </div>
              <div>
                <Label>Поштовий код</Label>
                <Input
                  value={form.postalCode}
                  onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                />
              </div>
              <PhoneInput
                label="Телефон"
                value={form.contactPhone}
                onChange={(v) => setForm({ ...form, contactPhone: v })}
                defaultCountry={(form.country as CountryCode) || 'NL'}
              />

              <div className="border-t pt-3">
                <Label className="block mb-1">Дні прийому *</Label>
                <div className="grid grid-cols-7 gap-1">
                  {WEEKDAYS.map(d => {
                    const on = form.workingDays.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(d)}
                        className={`py-1.5 text-xs font-medium rounded border transition-colors ${
                          on
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        {WEEKDAY_LABELS[d]}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  У які дні тижня пункт приймає посилки
                </p>
              </div>

              <div>
                <Label>Години роботи</Label>
                <Input
                  value={form.workingHours}
                  onChange={(e) => setForm({ ...form, workingHours: e.target.value })}
                  placeholder="10:00-19:00"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Широта</Label>
                  <Input
                    type="number"
                    step="0.0000001"
                    value={form.latitude}
                    onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                    placeholder="52.3702"
                  />
                </div>
                <div>
                  <Label>Довгота</Label>
                  <Input
                    type="number"
                    step="0.0000001"
                    value={form.longitude}
                    onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                    placeholder="4.8952"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400 -mt-1">
                Заповніть координати для відкриття у Google Maps / на мапі клієнта
              </p>

              <div>
                <Label>Інструкції для клієнтів</Label>
                <Textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Наприклад: вхід з двору, попередьте телефоном за 30 хв"
                />
              </div>

              <div>
                <Label>Макс. посилок на рейс (опціонально)</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.maxCapacity}
                  onChange={(e) => setForm({ ...form, maxCapacity: e.target.value })}
                  placeholder="Немає ліміту"
                />
              </div>

              {form.id && (
                <label className="flex items-center gap-2 text-sm pt-2 border-t">
                  <Checkbox
                    checked={form.isActive}
                    onCheckedChange={(c) => setForm({ ...form, isActive: c === true })}
                  />
                  Активний пункт
                </label>
              )}

              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? 'Збереження...' : form.id ? 'Зберегти зміни' : 'Створити пункт'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Пункти, куди клієнти привозять посилки для відправки. Клацніть на пункт щоб побачити посилки які там зараз.
      </p>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Завантаження...</div>
      ) : points.length === 0 ? (
        <div className="bg-white rounded-lg border p-8 text-center">
          <div className="text-4xl mb-2">🏢</div>
          <div className="text-gray-500 mb-4">Немає пунктів збору</div>
          <Button onClick={openCreate}>Створити перший пункт</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {points.map(p => (
            <div
              key={p.id}
              className={`bg-white rounded-lg border p-3 ${p.isActive ? '' : 'opacity-60'}`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <Link
                  href={`/collection-points/${p.id}`}
                  className="flex-1 min-w-0 hover:underline"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {COUNTRY_LABELS[p.country as CountryCode] || p.country}
                    </Badge>
                    <span className="font-medium text-sm truncate">
                      {p.name || `${p.city}, ${p.address}`}
                    </span>
                    {!p.isActive && (
                      <Badge variant="outline" className="text-xs">Неактивний</Badge>
                    )}
                  </div>
                </Link>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(p)}>
                    ✏️
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-red-600 hover:text-red-700"
                    onClick={() => handleDelete(p)}
                  >
                    🗑
                  </Button>
                </div>
              </div>
              <Link href={`/collection-points/${p.id}`} className="block">
                <div className="text-xs text-gray-500 space-y-0.5">
                  {p.name && (
                    <div>📍 {p.city}, {p.address}</div>
                  )}
                  {p.postalCode && <div>🏷 {p.postalCode}</div>}
                  {p.contactPhone && <div>📞 {p.contactPhone}</div>}
                  {p.workingDays && p.workingDays.length > 0 && (
                    <div>📅 {formatWorkingDays(p.workingDays)} {p.workingHours ? `· ${p.workingHours}` : ''}</div>
                  )}
                  {p.maxCapacity != null && (
                    <div>📦 Ліміт: {p.maxCapacity} посилок на рейс</div>
                  )}
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
