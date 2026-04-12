'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CapitalizeInput } from '@/components/shared/capitalize-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';

interface ClientCreateFormProps {
  onSuccess: (client: {
    id: string;
    phone: string;
    firstName: string;
    lastName: string;
    middleName: string | null;
    country: string | null;
    addresses: {
      id: string;
      country: string;
      city: string;
      street: string | null;
      building: string | null;
      apartment: string | null;
      postalCode: string | null;
      landmark: string | null;
      npWarehouseNum: string | null;
      npPoshtamatNum: string | null;
      deliveryMethod: string;
      usageCount: number;
    }[];
  }) => void;
  onCancel?: () => void;
  initialPhone?: string;
}

export function ClientCreateForm({ onSuccess, onCancel, initialPhone }: ClientCreateFormProps) {
  const [phone, setPhone] = useState(initialPhone || '+');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [country, setCountry] = useState<CountryCode>('UA');
  const [deliveryMethod, setDeliveryMethod] = useState<string>('address');
  const [city, setCity] = useState('');
  const [street, setStreet] = useState('');
  const [building, setBuilding] = useState('');
  const [landmark, setLandmark] = useState('');
  const [npWarehouseNum, setNpWarehouseNum] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    // Validate delivery method fields
    if (deliveryMethod === 'np_warehouse') {
      if (!city.trim() || !npWarehouseNum.trim()) {
        setError('Для відділення потрібно вказати населений пункт та номер складу/поштомату');
        setSaving(false);
        return;
      }
    } else {
      if (!city.trim() || !street.trim() || !building.trim()) {
        setError('Для адреси потрібно вказати населений пункт, вулицю та будинок');
        setSaving(false);
        return;
      }
    }

    try {
      const address = deliveryMethod === 'np_warehouse'
        ? { country, city, deliveryMethod, npWarehouseNum: npWarehouseNum || undefined }
        : { country, city, deliveryMethod, street: street || undefined, building: building || undefined, landmark: landmark || undefined };

      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          firstName,
          lastName,
          middleName: middleName || undefined,
          country,
          address,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success('Клієнта створено');
        onSuccess(data);
      } else {
        const data = await res.json();
        setError(data.error || 'Помилка створення клієнта');
      }
    } catch {
      setError('Помилка мережі');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <Label>Телефон *</Label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+380..." className="text-base" required />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Прізвище *</Label>
          <CapitalizeInput value={lastName} onChange={setLastName} required />
        </div>
        <div>
          <Label>Ім&apos;я *</Label>
          <CapitalizeInput value={firstName} onChange={setFirstName} required />
        </div>
      </div>
      <div>
        <Label>По батькові</Label>
        <CapitalizeInput value={middleName} onChange={setMiddleName} />
      </div>
      <div>
        <Label>Країна</Label>
        <Select value={country} onValueChange={(v) => setCountry((v ?? '') as CountryCode)}>
          <SelectTrigger><SelectValue>{COUNTRY_LABELS[country]}</SelectValue></SelectTrigger>
          <SelectContent>
            {(Object.entries(COUNTRY_LABELS) as [CountryCode, string][]).map(([code, name]) => (
              <SelectItem key={code} value={code}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Метод доставки *</Label>
        <Select value={deliveryMethod} onValueChange={(v) => setDeliveryMethod(v ?? 'address')}>
          <SelectTrigger><SelectValue>{deliveryMethod === 'np_warehouse' ? 'Відділення' : 'Адреса'}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="address">Адреса</SelectItem>
            <SelectItem value="np_warehouse">Відділення</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="border-t pt-3">
        <p className="text-sm font-medium mb-2">Адреса доставки</p>
        <div className="space-y-2">
          <div>
            <Label>Населений пункт *</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} required />
          </div>
          {deliveryMethod === 'np_warehouse' ? (
            <div>
              <Label>Номер складу/поштомату *</Label>
              <Input value={npWarehouseNum} onChange={(e) => setNpWarehouseNum(e.target.value)} required />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Вулиця *</Label>
                  <Input value={street} onChange={(e) => setStreet(e.target.value)} required />
                </div>
                <div>
                  <Label>Будинок *</Label>
                  <Input value={building} onChange={(e) => setBuilding(e.target.value)} required />
                </div>
              </div>
              <div>
                <Label>Орієнтир</Label>
                <Input value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="Біля магазину..." />
              </div>
            </>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        {onCancel && (
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
            Скасувати
          </Button>
        )}
        <Button type="submit" className={onCancel ? 'flex-1' : 'w-full'} disabled={saving}>
          {saving ? 'Збереження...' : 'Зберегти'}
        </Button>
      </div>
    </form>
  );
}
