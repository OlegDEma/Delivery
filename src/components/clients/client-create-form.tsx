'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CapitalizeInput } from '@/components/shared/capitalize-input';
import { PhoneInput } from '@/components/shared/phone-input';
import { FieldHint } from '@/components/shared/field-hint';
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
  /** Direction of the parcel — drives default country and phone code. */
  direction?: 'eu_to_ua' | 'ua_to_eu';
  /** Whether this client will be sender or receiver — affects default country. */
  role?: 'sender' | 'receiver';
  /** Default country preselected (overrides direction-based default). */
  defaultCountry?: CountryCode;
}

function getDefaultCountry(
  direction: 'eu_to_ua' | 'ua_to_eu' | undefined,
  role: 'sender' | 'receiver' | undefined,
  override: CountryCode | undefined,
): CountryCode {
  if (override) return override;
  if (!direction || !role) return 'UA';
  // Per ТЗ: ua_to_eu uses «та країна, що була вибрана Працівником раніше» —
  // remember last selected EU country in localStorage.
  const lastEU = (typeof window !== 'undefined'
    && (localStorage.getItem('parcel:lastEuCountry') as CountryCode | null))
    || 'NL';
  if (direction === 'eu_to_ua') return role === 'receiver' ? 'UA' : lastEU;
  return role === 'sender' ? 'UA' : lastEU;
}

export function ClientCreateForm({
  onSuccess,
  onCancel,
  initialPhone,
  direction,
  role,
  defaultCountry,
}: ClientCreateFormProps) {
  const initialCountry = getDefaultCountry(direction, role, defaultCountry);
  // For eu_to_ua + receiver — country is locked to UA per ТЗ.
  const countryLocked = direction === 'eu_to_ua' && role === 'receiver';

  const [phone, setPhone] = useState(initialPhone || '');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [country, setCountry] = useState<CountryCode>(initialCountry);
  const [deliveryMethod, setDeliveryMethod] = useState<'address' | 'np_warehouse' | 'pickup_point'>('address');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [street, setStreet] = useState('');
  const [building, setBuilding] = useState('');
  const [landmark, setLandmark] = useState('');
  const [npWarehouseNum, setNpWarehouseNum] = useState('');
  const [pickupPointText, setPickupPointText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    // Per ТЗ (Client section): «Вулиця, номер дому, або номер складу Нової
    // пошти важливі лише для Отримувачів в Україні. Для Отримувачів у Європі
    // обов'язковими є: телефон, прізвище, ім'я, країна, населений пункт.»
    // Worker section: «Вулиця і Номер будинку ... для Отримувача обов'язкові,
    // для Відправника — ні». Combine both: strict only for receiver+UA.
    const strict = role === 'receiver' && country === 'UA';

    if (!city.trim()) {
      setError('Вкажіть населений пункт');
      setSaving(false);
      return;
    }

    if (deliveryMethod === 'np_warehouse') {
      if (strict && !npWarehouseNum.trim()) {
        setError('Для відділення в Україні вкажіть номер складу/поштомату');
        setSaving(false);
        return;
      }
    } else if (deliveryMethod === 'pickup_point') {
      // Pickup point text — обов'язкове в усіх випадках бо без нього метод
      // не має сенсу.
      if (!pickupPointText.trim()) {
        setError('Вкажіть опис пункту збору');
        setSaving(false);
        return;
      }
    } else {
      if (strict && (!street.trim() || !building.trim())) {
        setError('Для отримувача в Україні вулиця та будинок обов\'язкові');
        setSaving(false);
        return;
      }
    }

    try {
      const baseAddress = {
        country,
        city,
        deliveryMethod,
        postalCode: postalCode || undefined,
      };
      const address =
        deliveryMethod === 'np_warehouse'
          ? { ...baseAddress, npWarehouseNum: npWarehouseNum || undefined }
          : deliveryMethod === 'pickup_point'
            ? { ...baseAddress, pickupPointText: pickupPointText || undefined }
            : {
                ...baseAddress,
                street: street || undefined,
                building: building || undefined,
                landmark: landmark || undefined,
              };

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

  // Bold/underlined section title for visual distinction (per ТЗ — назви полів виразніші).
  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <p className="text-sm font-bold text-blue-700 underline underline-offset-4 mb-2">{children}</p>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <PhoneInput
        label="Телефон"
        required
        value={phone}
        onChange={setPhone}
        defaultCountry={initialCountry}
      />
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
        <Label>Країна {countryLocked && <span className="text-xs text-gray-500">(за напрямком)</span>}</Label>
        <Select
          value={country}
          onValueChange={(v) => {
            const next = (v ?? 'UA') as CountryCode;
            setCountry(next);
            // Per ТЗ: remember last EU country selected.
            if (next !== 'UA' && typeof window !== 'undefined') {
              localStorage.setItem('parcel:lastEuCountry', next);
            }
          }}
          disabled={countryLocked}
        >
          <SelectTrigger><SelectValue>{COUNTRY_LABELS[country]}</SelectValue></SelectTrigger>
          <SelectContent>
            {(Object.entries(COUNTRY_LABELS) as [CountryCode, string][])
              // Per ТЗ: «Інші країни відсутні» when country is locked by direction.
              .filter(([code]) => !countryLocked || code === country)
              .map(([code, name]) => (
                <SelectItem key={code} value={code}>{name}</SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border-t pt-3">
        <SectionTitle>Адреса</SectionTitle>
        <Select
          value={deliveryMethod}
          onValueChange={(v) => setDeliveryMethod((v ?? 'address') as 'address' | 'np_warehouse' | 'pickup_point')}
        >
          <SelectTrigger>
            <SelectValue>
              {deliveryMethod === 'np_warehouse' ? 'Відділення' : deliveryMethod === 'pickup_point' ? 'Пункт збору' : 'Адресна доставка'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="address">Адресна доставка</SelectItem>
            <SelectItem value="np_warehouse">Відділення</SelectItem>
            <SelectItem value="pickup_point">Пункт збору</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border-t pt-3 space-y-2">
        {deliveryMethod === 'address' && <SectionTitle>Адресна доставка</SectionTitle>}
        {deliveryMethod === 'np_warehouse' && <SectionTitle>Відділення</SectionTitle>}
        {deliveryMethod === 'pickup_point' && <SectionTitle>Пункт збору</SectionTitle>}

        <div>
          <Label>
            Індекс <FieldHint text="Поштовий код, призначений даній адресі." />
          </Label>
          <Input
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            placeholder="00-000"
          />
        </div>
        <div>
          <Label>Населений пункт *</Label>
          <CapitalizeInput value={city} onChange={setCity} required />
        </div>

        {deliveryMethod === 'np_warehouse' && (
          <div>
            <Label>Номер складу/поштомату *</Label>
            <Input value={npWarehouseNum} onChange={(e) => setNpWarehouseNum(e.target.value)} required />
          </div>
        )}

        {deliveryMethod === 'pickup_point' && (
          <div>
            <Label>Опис пункту збору *</Label>
            <Input
              value={pickupPointText}
              onChange={(e) => setPickupPointText(e.target.value)}
              placeholder="Назва, орієнтир, контакт..."
              required
            />
          </div>
        )}

        {deliveryMethod === 'address' && (() => {
          // Per ТЗ: street + building required only for Receiver in UA.
          const strict = role === 'receiver' && country === 'UA';
          return (
            <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Вулиця {strict && '*'}</Label>
                <CapitalizeInput value={street} onChange={setStreet} required={strict} />
              </div>
              <div>
                <Label>Будинок {strict && '*'}</Label>
                <Input value={building} onChange={(e) => setBuilding(e.target.value)} required={strict} />
              </div>
            </div>
            <div>
              <Label>Орієнтир</Label>
              <Input value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="Біля магазину..." />
            </div>
            </>
          );
        })()}
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
