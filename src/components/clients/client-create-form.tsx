'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CapitalizeInput } from '@/components/shared/capitalize-input';
import { AddressInput } from '@/components/parcels/address-input';
import { PhoneInput } from '@/components/shared/phone-input';
import { FieldHint } from '@/components/shared/field-hint';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';
import { isCourierAllowed, isPostalAllowed } from '@/lib/utils/logistics-availability';

/**
 * ТЗ (docx 14.05.26 §a): при «Виклик кур'єра» у формі Відправника оператор
 * відповідає «Це буде єдина посилка?». Відповідь — per-посилка (впливає на
 * мінімальний тариф), тож повертаємо її окремим meta-аргументом разом із
 * клієнтом, а батьківська форма /parcels/new кладе її у collection-стан.
 */
export interface ClientCreateMeta {
  isMultiParcelPickup?: boolean | null;
}

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
  }, meta?: ClientCreateMeta) => void;
  onCancel?: () => void;
  initialPhone?: string;
  /** Direction of the parcel — drives default country and phone code. */
  direction?: 'eu_to_ua' | 'ua_to_eu';
  /** Whether this client will be sender or receiver — affects default country. */
  role?: 'sender' | 'receiver';
  /** Default country preselected (overrides direction-based default). */
  defaultCountry?: CountryCode;
  /**
   * If present, the form opens in EDIT mode for an existing client (per ТЗ:
   * «При знаходженні потрібного Клієнта в пошуку, всі його дані відкриваються
   * у тій самій формі ... заповнена даними Клієнта, взятими з останньої
   * відправки. Якщо всі дані незмінні, Працівник має підтвердити актуальність
   * даних (кнопка "Зберегти")»). Submit PATCHes the existing client+address
   * instead of creating a new one.
   */
  initialData?: {
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
  };
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
  initialData,
}: ClientCreateFormProps) {
  const isEditMode = !!initialData;
  const initialCountry: CountryCode = (initialData?.addresses[0]?.country as CountryCode)
    || (initialData?.country as CountryCode)
    || getDefaultCountry(direction, role, defaultCountry);
  // For eu_to_ua + receiver — country is locked to UA per ТЗ.
  const countryLocked = direction === 'eu_to_ua' && role === 'receiver';
  const initialAddr = initialData?.addresses[0] as
    (NonNullable<typeof initialData>['addresses'][number] & { pickupPointText?: string | null })
    | undefined;

  const [phone, setPhone] = useState(initialData?.phone || initialPhone || '');
  const [firstName, setFirstName] = useState(initialData?.firstName || '');
  const [lastName, setLastName] = useState(initialData?.lastName || '');
  const [middleName, setMiddleName] = useState(initialData?.middleName || '');
  const [country, setCountry] = useState<CountryCode>(initialCountry);
  const [deliveryMethod, setDeliveryMethod] = useState<'address' | 'np_warehouse' | 'pickup_point'>(
    (initialAddr?.deliveryMethod as 'address' | 'np_warehouse' | 'pickup_point') || 'address'
  );
  const [postalCode, setPostalCode] = useState(initialAddr?.postalCode || '');
  const [city, setCity] = useState(initialAddr?.city || '');
  const [street, setStreet] = useState(initialAddr?.street || '');
  const [building, setBuilding] = useState(initialAddr?.building || '');
  const [landmark, setLandmark] = useState(initialAddr?.landmark || '');
  const [npWarehouseNum, setNpWarehouseNum] = useState(initialAddr?.npWarehouseNum || '');
  const [pickupPointText, setPickupPointText] = useState(initialAddr?.pickupPointText || '');
  // ТЗ §a: «Це буде єдина посилка?» — лише для Відправника при «Виклик
  // кур'єра» (deliveryMethod='address'). null = ще не відповіли.
  const [isMultiParcelPickup, setIsMultiParcelPickup] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Чи показувати питання про кількість посилок: відправник + «Виклик
  // кур'єра» (для нього address = виклик кур'єра, а не адресна доставка).
  const showMultiParcelQuestion = role === 'sender' && deliveryMethod === 'address';

  // ТЗ (docx 13.06.26 §4/§5): «Пункт видачі/збору» — це вибір зі СПИСКУ
  // реальних точок з розділу Логістика для країни/міста, а не вільний текст.
  // Якщо для країни/міста точок немає — опція ховається.
  const [points, setPoints] = useState<{ id: string; name: string | null; country: string; city: string; address: string }[]>([]);
  const [selectedPointId, setSelectedPointId] = useState<string>('');
  // ТЗ (docx 14.05.26 §a): доступність «Виклик кур'єра»/«Пошта» для Відправника
  // визначається Логістикою (ServiceCity), а не хардкодом.
  const [serviceCities, setServiceCities] = useState<{ country: string; city: string; acceptsCourierPickup: boolean; acceptsPostal: boolean }[]>([]);

  useEffect(() => {
    if (!country) { setPoints([]); return; }
    let cancelled = false;
    fetch(`/api/collection-points?country=${encodeURIComponent(country)}`)
      .then(r => (r.ok ? r.json() : []))
      .then((list: { id: string; name: string | null; country: string; city: string; address: string }[]) => {
        if (!cancelled) setPoints(Array.isArray(list) ? list : []);
      })
      .catch(() => { if (!cancelled) setPoints([]); });
    return () => { cancelled = true; };
  }, [country]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/service-cities')
      .then(r => (r.ok ? r.json() : []))
      .then((list: { country: string; city: string; acceptsCourierPickup: boolean; acceptsPostal: boolean }[]) => {
        if (!cancelled) setServiceCities(Array.isArray(list) ? list : []);
      })
      .catch(() => { if (!cancelled) setServiceCities([]); });
    return () => { cancelled = true; };
  }, []);

  // ТЗ (docx 14.05.26 §a): Пункти збору/видачі — САМЕ для вибраного
  // населеного пункту, без fallback на всю країну. Приклад: Венло (Venlo) —
  // у NL є точка в Amsterdam, але не у Венло, тож опція «Пункт збору» для
  // Венло НЕДОСТУПНА (список порожній → опцію ховаємо).
  const cityNorm = city.trim().toLowerCase();
  const cityPoints = cityNorm ? points.filter(p => p.city.trim().toLowerCase() === cityNorm) : [];
  const pointsToShow = cityPoints;
  const hasAnyPoints = cityPoints.length > 0;

  // ТЗ (docx 20.06.26): «Виклик кур'єра» доступний ЗА ЗАМОВЧУВАННЯМ усюди;
  // заборонити можна для міста/країни в Логістиці (ServiceCity). Для
  // отримувача address = «Адресна доставка» — завжди доступно.
  const courierAvailable =
    role !== 'sender' ? true : isCourierAllowed(serviceCities, country, city);

  // ТЗ (docx 20.06.26): «Пошта» (np_warehouse) для Відправника — теж default
  // available; заборона через Логістику. Для отримувача — завжди доступна.
  const postalAvailable =
    role !== 'sender' ? true : isPostalAllowed(serviceCities, country, city);

  // Авто-корекція способу для Відправника: якщо поточний спосіб став
  // недоступним у Логістиці (зміна міста/країни), перемикаємось на перший
  // доступний — щоб дефолтний «Виклик кур'єра» не «залипав» у недоступному
  // місті. Якщо доступних способів немає — лишаємо як є (нижче покажемо
  // підказку «місто не обслуговується»).
  useEffect(() => {
    if (role !== 'sender') return;
    const avail = ([
      courierAvailable ? 'address' : null,
      postalAvailable ? 'np_warehouse' : null,
      hasAnyPoints ? 'pickup_point' : null,
    ].filter(Boolean)) as ('address' | 'np_warehouse' | 'pickup_point')[];
    if (avail.length > 0 && !avail.includes(deliveryMethod)) {
      setDeliveryMethod(avail[0]);
    }
  }, [role, courierAvailable, postalAvailable, hasAnyPoints, deliveryMethod]);

  // Чи є для Відправника хоч один доступний спосіб (інакше місто не
  // обслуговується — треба додати його в Логістику).
  const senderHasNoMethod = role === 'sender' && !courierAvailable && !postalAvailable && !hasAnyPoints;

  // ТЗ (docx 13.06.26): «Назва міста автоматично починається з великої
  // букви». Капіталізуємо лише першу літеру, решту лишаємо як ввели (щоб не
  // ламати назви типу "San Marino"). Працює і для ручного вводу, і для
  // вибору з автокомпліту.
  const capCity = (v: string) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : v);

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

    // ТЗ §a: «Вибір одного з чекбоксів обов'язковий» — при «Виклик кур'єра».
    if (showMultiParcelQuestion && isMultiParcelPickup === null) {
      setError('Оберіть «Одна посилка» або «Дві або більше посилок на різні адреси»');
      setSaving(false);
      return;
    }

    // Meta з відповіддю про кількість посилок — лише коли питання показували.
    const meta: ClientCreateMeta | undefined = showMultiParcelQuestion
      ? { isMultiParcelPickup }
      : undefined;

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

      if (isEditMode && initialData) {
        // Per ТЗ: confirm/update existing client + their last-used address.
        // If nothing changed, this is just an idempotent confirm.
        const phoneChanged = phone !== initialData.phone;
        const nameChanged = firstName !== initialData.firstName
          || lastName !== initialData.lastName
          || (middleName || null) !== (initialData.middleName || null);

        if (phoneChanged || nameChanged) {
          const r = await fetch(`/api/clients/${initialData.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'update',
              ...(phoneChanged ? { phone } : {}),
              ...(nameChanged ? { firstName, lastName, middleName: middleName || null } : {}),
            }),
          });
          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d.error || 'Помилка оновлення клієнта');
          }
        }

        if (initialAddr?.id) {
          // Наявна адреса — оновлюємо.
          const r = await fetch(`/api/clients/${initialData.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'updateAddress',
              addressId: initialAddr.id,
              address: {
                deliveryMethod,
                postalCode: postalCode || null,
                city,
                street: street || null,
                building: building || null,
                landmark: landmark || null,
                npWarehouseNum: deliveryMethod === 'np_warehouse' ? (npWarehouseNum || null) : null,
                pickupPointText: deliveryMethod === 'pickup_point' ? (pickupPointText || null) : null,
              },
            }),
          });
          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d.error || 'Помилка оновлення адреси');
          }
        } else {
          // У клієнта не було збереженої адреси — створюємо нову.
          // Без цього раніше нова адреса з діалогу мовчки втрачалась
          // (PATCH не відправлявся) — посилка зберігалась без адреси.
          const r = await fetch(`/api/clients/${initialData.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'addAddress',
              address: {
                country,
                deliveryMethod,
                postalCode: postalCode || null,
                city,
                street: street || null,
                building: building || null,
                landmark: landmark || null,
                npWarehouseNum: deliveryMethod === 'np_warehouse' ? (npWarehouseNum || null) : null,
                pickupPointText: deliveryMethod === 'pickup_point' ? (pickupPointText || null) : null,
              },
            }),
          });
          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d.error || 'Помилка збереження адреси');
          }
        }

        toast.success('Дані підтверджено');
        // Re-fetch the updated client so caller has fresh data.
        const fresh = await fetch(`/api/clients/${initialData.id}`).then(r => r.ok ? r.json() : null);
        onSuccess(fresh || initialData, meta);
        return;
      }

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
        onSuccess(data, meta);
      } else {
        const data = await res.json();
        setError(data.error || 'Помилка створення клієнта');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка мережі');
    } finally {
      setSaving(false);
    }
  }

  // Bold/underlined section title for visual distinction (per ТЗ — назви полів виразніші).
  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <p className="text-sm font-bold text-blue-700 underline underline-offset-4 mb-2">{children}</p>
  );

  // ТЗ §E7/§E9: замість «Адреса» — «Спосіб доставки» (Отримувач) /
  // «Спосіб відправки» (Відправник), з трьома названими опціями.
  // Значення enum (address/np_warehouse/pickup_point) незмінні —
  // міняються лише підписи залежно від ролі.
  const methodSectionTitle =
    role === 'sender' ? 'Спосіб відправки'
    : role === 'receiver' ? 'Спосіб доставки'
    : 'Адреса';
  const methodLabels: Record<'address' | 'np_warehouse' | 'pickup_point', string> =
    role === 'sender'
      ? { address: 'Виклик кур\'єра', np_warehouse: 'Пошта', pickup_point: 'Пункт збору' }
      : { address: 'Адресна доставка', np_warehouse: 'Пошта', pickup_point: 'Пункт видачі' };

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

      {/* ТЗ (docx 13.06.26 §4/§5): «Після поля Країна іде поле Населений
          пункт (обов'язкове)». Місто йде ЗРАЗУ після країни, а вже потім —
          «Спосіб» + «Індекс». Місто авто-капіталізується (перша буква). */}
      <div>
        <Label>Населений пункт *</Label>
        {/* Автокомпліт міста з історії — «Am» → «Amsterdam». Активний лише
            коли вибрана країна, бо API звужує по country. */}
        {country ? (
          <AddressInput
            field="city"
            country={country}
            value={city}
            onChange={(v) => setCity(capCity(v))}
            required
          />
        ) : (
          <CapitalizeInput value={city} onChange={setCity} required />
        )}
      </div>

      {/* «Спосіб» + «Індекс» — після Населеного пункту. Дубль назви методу
          нижче прибрано — селектор уже показує вибране. */}
      <div className="border-t pt-3 grid grid-cols-[1fr_9rem] gap-2 items-end">
        <div>
          <SectionTitle>{methodSectionTitle}</SectionTitle>
          <Select
            value={deliveryMethod}
            onValueChange={(v) => setDeliveryMethod((v ?? 'address') as 'address' | 'np_warehouse' | 'pickup_point')}
          >
            <SelectTrigger>
              <SelectValue>{methodLabels[deliveryMethod]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {/* ТЗ docx 14.05.26 §a: «Виклик кур'єра» (sender=address) ховаємо,
                  якщо в Логістиці для міста немає кур'єра. Для отримувача
                  courierAvailable=true (роль), тож «Адресна доставка» завжди є. */}
              {courierAvailable && (
                <SelectItem value="address">{methodLabels.address}</SelectItem>
              )}
              {/* ТЗ docx 14.05.26 §a: «Пошта» (sender=np_warehouse) ховаємо,
                  якщо в Логістиці для країни пошта не передбачена. Для
                  отримувача postalAvailable=true (роль) — «Пошта» завжди є. */}
              {postalAvailable && (
                <SelectItem value="np_warehouse">{methodLabels.np_warehouse}</SelectItem>
              )}
              {/* ТЗ §4: «Пункт» показуємо лише якщо для країни/міста є точки в
                  Логістиці (або якщо він уже вибраний — щоб не зник). */}
              {(hasAnyPoints || deliveryMethod === 'pickup_point') && (
                <SelectItem value="pickup_point">{methodLabels.pickup_point}</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
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
      </div>

      {/* ТЗ docx 14.05.26 §a: якщо для обраного міста Відправника в Логістиці
          немає жодного способу (ні кур'єра, ні пошти, ні пункту збору) —
          місто не обслуговується. Підказуємо додати його в Логістику. */}
      {senderHasNoMethod && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          Для «{city || 'цього міста'}» немає доступних способів відправки.
          Додайте місто в розділі «Логістика → Міста обслуговування / Пункти збору».
        </div>
      )}

      <div className="space-y-2">
        {deliveryMethod === 'np_warehouse' && (
          <div>
            <Label>Номер складу/поштомату *</Label>
            <Input value={npWarehouseNum} onChange={(e) => setNpWarehouseNum(e.target.value)} required />
          </div>
        )}

        {deliveryMethod === 'pickup_point' && (
          <div>
            <Label>{role === 'sender' ? 'Пункт збору' : 'Пункт видачі'} *</Label>
            {/* ТЗ §4/§5: список реальних точок з Логістики для країни/міста. */}
            {pointsToShow.length > 0 ? (
              <div className="space-y-1.5">
                {pointsToShow.map((p) => {
                  const label = p.name || `${p.city}, ${p.address}`;
                  const sel = selectedPointId === p.id || pickupPointText === label;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setSelectedPointId(p.id); setPickupPointText(label); }}
                      className={cn(
                        'w-full text-left border rounded-lg p-2 text-sm transition-all',
                        sel ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-200 hover:bg-gray-50'
                      )}
                    >
                      <div className="font-medium">{label}</div>
                      {p.name && <div className="text-xs text-gray-500">{p.city}, {p.address}</div>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                Для «{city || 'цього міста'}» немає пунктів у розділі Логістика. Виберіть інший спосіб.
              </div>
            )}
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
                {country ? (
                  <AddressInput
                    field="street"
                    country={country}
                    value={street}
                    onChange={setStreet}
                    required={strict}
                  />
                ) : (
                  <CapitalizeInput value={street} onChange={setStreet} required={strict} />
                )}
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

            {/* ТЗ §a: «Виклик кур'єра» → «Це буде єдина посилка?». Вибір
                обов'язковий — впливає на мінімальний тариф за кожну посилку. */}
            {showMultiParcelQuestion && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2 space-y-1.5">
                <div className="text-xs font-medium text-amber-900">
                  Це буде єдина посилка?
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={isMultiParcelPickup === false}
                    onChange={() => setIsMultiParcelPickup(false)}
                  />
                  Одна посилка
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={isMultiParcelPickup === true}
                    onChange={() => setIsMultiParcelPickup(true)}
                  />
                  Дві або більше посилок на різні адреси
                </label>
                {isMultiParcelPickup === null && (
                  <div className="text-[11px] text-amber-700">
                    Відповідь обов&apos;язкова — від неї залежить мінімальна вартість посилки.
                  </div>
                )}
              </div>
            )}
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
