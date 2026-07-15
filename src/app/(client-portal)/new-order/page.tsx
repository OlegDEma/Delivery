'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { CollectionBlock } from '@/components/parcels/collection-block';
import { AddressInput } from '@/components/parcels/address-input';
import { PhoneInput } from '@/components/shared/phone-input';
import { FieldHint } from '@/components/shared/field-hint';
import { CapitalizeInput } from '@/components/shared/capitalize-input';
import { getBillableWeight } from '@/lib/utils/volumetric';
import { normalizeCityForMatch } from '@/lib/utils/transliterate';
import { isCourierAllowed, isPostalAllowed, isPickupPointAllowed, type ServiceRule } from '@/lib/utils/logistics-availability';
import { formatWorkingDays, type Weekday } from '@/lib/constants/collection';

interface PlaceData {
  weight: string;
  length: string;
  width: string;
  height: string;
}

// ТЗ docx 02.07.26 (D6): у Клієнта немає поля «об'єм» — лише Д/Ш/В.
const emptyPlace = (): PlaceData => ({ weight: '', length: '', width: '', height: '' });

function volWeight(p: PlaceData): number {
  const l = Number(p.length) || 0, w = Number(p.width) || 0, h = Number(p.height) || 0;
  if (l > 0 && w > 0 && h > 0) return Number(((l * w * h) / 4000).toFixed(2));
  return 0;
}

interface PricingConfig {
  id: string;
  country: string;
  direction: string;
  collectionDays: string[];
  // ТЗ docx 02.07.26 (D7): правило розрахункової ваги з Тарифів.
  weightType?: 'actual' | 'volumetric' | 'average' | 'custom';
  weightCustomFactualFraction?: number;
}

const DAY_MAP: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

const DAY_LABELS: Record<string, string> = {
  sunday: 'неділя', monday: 'понеділок', tuesday: 'вівторок', wednesday: 'середа',
  thursday: 'четвер', friday: "п'ятниця", saturday: 'субота',
};

export default function NewOrderPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successNumber, setSuccessNumber] = useState<string | null>(null);
  const [pricingConfigs, setPricingConfigs] = useState<PricingConfig[]>([]);
  // ТЗ docx 02.07.26 (D8): правила Логістики — щоб ховати заборонені для
  // Країни/НП способи доставки Отримувача (Адресна/Пошта).
  const [serviceCities, setServiceCities] = useState<ServiceRule[]>([]);
  const [collectionDayWarning, setCollectionDayWarning] = useState('');

  // ТЗ: клієнт має свідомо вибрати напрямок — без дефолту.
  const [direction, setDirection] = useState('');

  // Sender (client fills about themselves)
  const [senderPhone, setSenderPhone] = useState('+');
  const [senderFirstName, setSenderFirstName] = useState('');
  const [senderLastName, setSenderLastName] = useState('');
  const [senderMiddleName, setSenderMiddleName] = useState('');
  const [senderCountry, setSenderCountry] = useState('NL');
  const [senderCity, setSenderCity] = useState('');
  const [senderPostalCode, setSenderPostalCode] = useState('');

  // Receiver
  const [receiverPhone, setReceiverPhone] = useState('+');
  const [receiverFirstName, setReceiverFirstName] = useState('');
  const [receiverLastName, setReceiverLastName] = useState('');
  const [receiverMiddleName, setReceiverMiddleName] = useState('');
  const [receiverCountry, setReceiverCountry] = useState('');
  const [receiverCity, setReceiverCity] = useState('');
  const [receiverPostalCode, setReceiverPostalCode] = useState('');
  // ТЗ §4: «Пункт видачі» — вибір зі списку реальних точок для отримувача.
  const [receiverPickupPointText, setReceiverPickupPointText] = useState('');
  // ТЗ docx 29.06.26 §2: id обраного пункту видачі — для коректної підсвітки
  // (пункти можуть мати однакову назву, тож матч по назві підсвічує всі).
  const [receiverPickupPointId, setReceiverPickupPointId] = useState('');
  const [receiverPoints, setReceiverPoints] = useState<{ id: string; name: string | null; country: string; city: string; address: string; postalCode: string | null; workingHours: string | null; workingDays: Weekday[] }[]>([]);
  const [receiverStreet, setReceiverStreet] = useState('');
  // ТЗ (docx 20.06.26 §19): «Адресна доставка» Отримувача = Вулиця + Будинок +
  // Орієнтир (ідентично формі Працівника).
  const [receiverBuilding, setReceiverBuilding] = useState('');
  const [receiverLandmark, setReceiverLandmark] = useState('');
  const [receiverDeliveryMethod, setReceiverDeliveryMethod] = useState('address');
  const [receiverNpWarehouse, setReceiverNpWarehouse] = useState('');

  // Parcel
  const [shipmentType, setShipmentType] = useState('parcels_cargo');
  const [description, setDescription] = useState('');
  const [declaredValue, setDeclaredValue] = useState('');
  // Per ТЗ — opt-in services. Прихований 3% автоматичний бонус скасовано.
  const [insurance, setInsurance] = useState(false);
  const [needsPackaging, setNeedsPackaging] = useState(false);
  // ТЗ docx 01.07.26: opt-in чекбокс «Доставка до порога будинку» (клієнт теж бачить).
  const [doorstepDelivery, setDoorstepDelivery] = useState(false);
  // ТЗ docx 02.07.26 (D4): доступна лише Європа→Україна + Адресна доставка Отримувача.
  const canDoorstep = direction === 'eu_to_ua' && receiverDeliveryMethod === 'address';
  // ТЗ §E10: «Поле "Пакет" при заповненні Клієнтом відсутнє» — опція
  // з'являється лише коли оформлює Працівник. У клієнтському порталі не
  // показуємо і не відправляємо.
  const [places, setPlaces] = useState<PlaceData[]>([emptyPlace()]);
  const [payer, setPayer] = useState('sender');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentInUkraine, setPaymentInUkraine] = useState(false);

  // Collection (pickup_point | courier_pickup | external_shipping | direct_to_driver)
  const [collectionMethod, setCollectionMethod] = useState<string>('pickup_point');
  const [collectionPointId, setCollectionPointId] = useState('');
  const [collectionDate, setCollectionDate] = useState('');
  const [collectionAddress, setCollectionAddress] = useState('');
  // ТЗ (docx 14.05.26 §b): умовні поля «Як ви передасте». Кур'єр →
  // Вулиця/Будинок/Орієнтир; Пошта → Номер складу. На submit складаємо їх в
  // єдиний рядок collectionAddress (бекенд приймає один рядок).
  const [collectionStreet, setCollectionStreet] = useState('');
  const [collectionBuilding, setCollectionBuilding] = useState('');
  const [collectionLandmark, setCollectionLandmark] = useState('');
  const [collectionWarehouse, setCollectionWarehouse] = useState('');

  // Автопідставляння країн за напрямком (ТЗ §E8). Виноситься в колбек,
  // щоб не дзеркалити стейт у useEffect — react-hooks/set-state-in-effect.
  // eu_to_ua: Відправник у ЄС, Отримувач в Україні.
  // ua_to_eu: Відправник в Україні, Отримувач у ЄС.
  function handleDirectionChange(next: string) {
    setDirection(next);
    if (next === 'eu_to_ua') {
      if (!receiverCountry) setReceiverCountry('UA');
      // Відправник у ЄС — повертаємо дефолт, якщо стояла Україна.
      if (senderCountry === 'UA') setSenderCountry('NL');
    } else if (next === 'ua_to_eu') {
      if (receiverCountry === 'UA') setReceiverCountry('');
      // Відправник в Україні — код телефону +380 підставиться автоматично.
      setSenderCountry('UA');
    }
  }

  useEffect(() => {
    fetch('/api/pricing').then(r => r.ok ? r.json() : []).then(setPricingConfigs);
    fetch('/api/service-cities').then(r => r.ok ? r.json() : []).then(setServiceCities);

    // Prefill «Відправник (ваші дані)» — ім'я / прізвище / телефон /
    // країна / місто з профілю клієнта + його основної адреси.
    fetch('/api/client-portal/me').then(r => r.ok ? r.json() : null).then((me: {
      firstName: string; lastName: string; phone: string;
      country: string | null; city: string | null;
    } | null) => {
      if (!me) return;
      if (me.phone) setSenderPhone(me.phone);
      if (me.firstName) setSenderFirstName(me.firstName);
      if (me.lastName) setSenderLastName(me.lastName);
      if (me.country) setSenderCountry(me.country);
      if (me.city) setSenderCity(me.city);
    });
  }, []);

  // ТЗ docx 02.07.26 (D8): якщо поточний спосіб доставки Отримувача став
  // недоступним за Логістикою (Адресна/Пошта заборонені для Країни/НП) —
  // перемикаємо на перший доступний, щоб не відправити заборонену опцію.
  // ТЗ docx 12.07.26: те саме для «Пункт видачі» (заборона acceptsPickupPoint)
  // — інакше збережений вибір обходив би заборону при зміні міста.
  useEffect(() => {
    const cityNorm = normalizeCityForMatch(receiverCity, receiverCountry);
    const allowed: string[] = [];
    if (isCourierAllowed(serviceCities, receiverCountry, cityNorm, 'receiver')) allowed.push('address');
    if (isPostalAllowed(serviceCities, receiverCountry, cityNorm, 'receiver')) allowed.push('np_warehouse');
    if (isPickupPointAllowed(serviceCities, receiverCountry, cityNorm, 'receiver')) allowed.push('pickup_point');
    if (
      allowed.length > 0 &&
      (receiverDeliveryMethod === 'address' || receiverDeliveryMethod === 'np_warehouse' || receiverDeliveryMethod === 'pickup_point') &&
      !allowed.includes(receiverDeliveryMethod)
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReceiverDeliveryMethod(allowed[0]);
      // Обраний пункт видачі більше не валідний — чистимо, щоб не
      // відправити його разом із новим способом.
      if (receiverDeliveryMethod === 'pickup_point') {
        setReceiverPickupPointId('');
        setReceiverPickupPointText('');
      }
    }
  }, [serviceCities, receiverCountry, receiverCity, receiverDeliveryMethod]);

  // ТЗ docx 09.07.26: коли відправник в Україні, «Пункт збору» недоступний
  // (в UA пунктів збору немає — вони суто європейські). Стандартний дефолт
  // collectionMethod='pickup_point' у цьому разі скидаємо, щоб клієнт свідомо
  // обрав доступний спосіб і не було відправлено приховану опцію.
  // ТЗ docx 12.07.26: те саме, коли «Пункт збору» ЗАБОРОНЕНО для міста/країни
  // Відправника у «Містах обслуговування».
  useEffect(() => {
    const senderCityNorm = normalizeCityForMatch(senderCity, senderCountry);
    const pickupAllowed = senderCountry !== 'UA' &&
      isPickupPointAllowed(serviceCities, senderCountry, senderCityNorm, 'sender');
    if (!pickupAllowed && collectionMethod === 'pickup_point') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollectionMethod('');
      setCollectionPointId('');
    }
  }, [senderCountry, senderCity, serviceCities, collectionMethod]);

  // ТЗ §4: точки видачі для країни отримувача — для опції «Пункт видачі».
  useEffect(() => {
    if (!receiverCountry) { setReceiverPoints([]); return; }
    let cancelled = false;
    fetch(`/api/collection-points?country=${encodeURIComponent(receiverCountry)}`)
      .then(r => (r.ok ? r.json() : []))
      .then((list) => { if (!cancelled) setReceiverPoints(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setReceiverPoints([]); });
    return () => { cancelled = true; };
  }, [receiverCountry]);

  function validateCollectionDate(dateStr: string) {
    if (!dateStr) { setCollectionDayWarning(''); return; }
    const config = pricingConfigs.find(c => c.country === senderCountry && c.direction === direction);
    if (!config || !config.collectionDays || config.collectionDays.length === 0) {
      setCollectionDayWarning('');
      return;
    }
    const date = new Date(dateStr + 'T12:00:00');
    const dayOfWeek = date.getDay();
    const allowedDayNums = config.collectionDays.map(d => DAY_MAP[d]).filter(n => n !== undefined);
    if (!allowedDayNums.includes(dayOfWeek)) {
      const allowedLabels = config.collectionDays.map(d => DAY_LABELS[d] || d).join(', ');
      setCollectionDayWarning(`Увага: збір у країні ${senderCountry} відбувається тільки: ${allowedLabels}. Обрана дата може бути недоступна.`);
    } else {
      setCollectionDayWarning('');
    }
  }

  function handleCollectionDateChange(dateStr: string) {
    setCollectionDate(dateStr);
    if (collectionMethod === 'courier_pickup') {
      validateCollectionDate(dateStr);
    }
  }

  function addPlace() {
    if (places.length >= 10) return;
    setPlaces([...places, emptyPlace()]);
  }

  function updatePlace(i: number, field: keyof PlaceData, val: string) {
    const u = [...places];
    u[i] = { ...u[i], [field]: val };
    setPlaces(u);
  }

  function removePlace(i: number) {
    if (places.length <= 1) return;
    setPlaces(places.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!direction) {
      setError('Виберіть напрямок'); return;
    }
    if (!receiverPhone || !receiverFirstName || !receiverLastName || !receiverCountry || !receiverCity) {
      setError('Заповніть обов\'язкові дані отримувача: телефон, прізвище, ім\'я, країна, населений пункт'); return;
    }
    // ТЗ §b: валідація за обраним способом доставки (як у Працівника).
    // «Пошта» → Номер складу/поштомату обов'язковий; «Пункт видачі» → точка
    // обрана; «Адресна доставка» → вулиця обов'язкова лише для UA.
    if (receiverDeliveryMethod === 'np_warehouse') {
      if (!receiverNpWarehouse.trim()) {
        setError('Вкажіть номер складу/поштомату'); return;
      }
    } else if (receiverDeliveryMethod === 'pickup_point') {
      if (!receiverPickupPointText.trim()) {
        setError('Виберіть пункт видачі зі списку'); return;
      }
    } else if (receiverCountry === 'UA' && (!receiverStreet.trim() || !receiverBuilding.trim())) {
      setError('Для отримувача в Україні вкажіть вулицю та будинок'); return;
    }
    // ТЗ docx 02.07.26 (D6): у Клієнта немає поля «об'єм» — тож для кожного
    // місця з вагою мають бути вказані довжина, ширина ТА висота.
    {
      const badPlace = places.findIndex(p => {
        if (Number(p.weight) <= 0) return false;
        const hasDims = Number(p.length) > 0 && Number(p.width) > 0 && Number(p.height) > 0;
        return !hasDims;
      });
      if (badPlace !== -1) {
        setError(`Місце ${badPlace + 1}: вкажіть довжину, ширину та висоту — об'ємна вага не може бути нульовою`);
        return;
      }
      if (!places.some(p => Number(p.weight) > 0)) {
        setError('Вкажіть вагу хоча б одного місця'); return;
      }
    }
    setSaving(true);

    // ТЗ §b: умовні поля «Як ви передасте» складаємо в єдиний рядок
    // collectionAddress (бекенд приймає одне текстове поле). Кур'єр →
    // «Вулиця, буд. N (Орієнтир)»; Пошта → «Склад №N».
    let composedCollectionAddress = collectionAddress;
    if (collectionMethod === 'courier_pickup') {
      const parts = [
        collectionStreet.trim(),
        collectionBuilding.trim() ? `буд. ${collectionBuilding.trim()}` : '',
      ].filter(Boolean);
      composedCollectionAddress = parts.join(', ');
      if (collectionLandmark.trim()) {
        composedCollectionAddress = composedCollectionAddress
          ? `${composedCollectionAddress} (${collectionLandmark.trim()})`
          : `(${collectionLandmark.trim()})`;
      }
    } else if (collectionMethod === 'external_shipping') {
      composedCollectionAddress = collectionWarehouse.trim() ? `Склад №${collectionWarehouse.trim()}` : '';
    }

    const res = await fetch('/api/client-portal/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        direction, shipmentType, description,
        declaredValue: declaredValue ? Number(declaredValue) : undefined,
        insurance, needsPackaging,
        // ТЗ docx 02.07.26 (D4): не застосовуємо doorstep, якщо опція недоступна.
        doorstepDelivery: canDoorstep && doorstepDelivery,
        // «Пакет» недоступний клієнту (ТЗ §E10) — не відправляємо.
        payer, paymentMethod, paymentInUkraine,
        senderPhone, senderFirstName, senderLastName, senderMiddleName, senderCountry, senderCity, senderPostalCode,
        receiverPhone, receiverFirstName, receiverLastName, receiverMiddleName, receiverCountry, receiverCity, receiverPostalCode,
        receiverStreet, receiverBuilding, receiverLandmark, receiverDeliveryMethod, receiverNpWarehouse, receiverPickupPointText,
        places: places.map(p => ({
          weight: Number(p.weight) || 0,
          length: Number(p.length) || undefined,
          width: Number(p.width) || undefined,
          height: Number(p.height) || undefined,
        })),
        collectionMethod, collectionPointId, collectionDate,
        collectionAddress: composedCollectionAddress,
      }),
    });

    if (res.ok) {
      const parcel = await res.json();
      setSuccessNumber(parcel.internalNumber);
    } else {
      const data = await res.json();
      setError(data.error || 'Помилка');
    }
    setSaving(false);
  }

  const totalWeight = places.reduce((s, p) => s + (Number(p.weight) || 0), 0);
  // ТЗ docx 02.07.26 (D7): показуємо Розрахункову вагу за правилом з Тарифів.
  // Тариф беремо з країни, що визначає ціну: eu_to_ua → відправник (EU),
  // ua_to_eu → отримувач (EU).
  const totalVolWeight = places.reduce((s, p) => s + volWeight(p), 0);
  const billedCountry = direction === 'eu_to_ua' ? senderCountry : receiverCountry;
  const weightCfg = pricingConfigs.find(c => c.country === billedCountry && c.direction === direction);
  const billableWeight = getBillableWeight(
    totalWeight,
    totalVolWeight,
    weightCfg?.weightType || 'custom',
    weightCfg?.weightCustomFactualFraction ?? 0.5,
  );

  const DIRECTION_LABELS: Record<string, string> = { eu_to_ua: 'З Європи в Україну', ua_to_eu: 'З України в Європу' };
  const COUNTRY_LABELS: Record<string, string> = { NL: 'Нідерланди', AT: 'Австрія', DE: 'Німеччина', UA: 'Україна' };
  const COLLECTION_METHOD_LABELS: Record<string, string> = { collection_point: 'Пункт збору', courier_pickup: "Виклик кур'єра" };
  // ТЗ (docx 14.05.26 §b): «Спосіб доставки» Отримувача = рівно 3 опції як у
  // Працівника: Адресна доставка / Пошта / Пункт видачі (без «Поштомату»).
  const DELIVERY_METHOD_LABELS: Record<string, string> = { address: 'Адресна доставка', np_warehouse: 'Пошта', pickup_point: 'Пункт видачі' };

  // ТЗ §b: Пункти видачі — САМЕ для вибраної країни ТА населеного пункту, без
  // fallback на всю країну. Якщо для міста точок немає — опція ховається.
  // ТЗ docx 29.06.26 §3: порівнюємо за латинізованою назвою (Відень→Wien).
  const recvCityNorm = normalizeCityForMatch(receiverCity, receiverCountry);
  const recvCityPoints = recvCityNorm ? receiverPoints.filter(p => p.city.trim().toLowerCase() === recvCityNorm) : [];
  const recvPointsToShow = recvCityPoints;
  const recvHasPoints = recvCityPoints.length > 0;
  // ТЗ docx 02.07.26 (D8): доступність способів доставки Отримувача за Логістикою
  // (Адресна доставка = кур'єр; Пошта = поштова відправка). Заборонені — ховаємо.
  const recvCourierAllowed = isCourierAllowed(serviceCities, receiverCountry, recvCityNorm, 'receiver');
  const recvPostalAllowed = isPostalAllowed(serviceCities, receiverCountry, recvCityNorm, 'receiver');
  // ТЗ docx 12.07.26: «Пункт видачі» Отримувача теж можна заборонити в
  // «Містах обслуговування» — тоді опцію ховаємо, навіть якщо точки існують.
  const recvPickupAllowed = isPickupPointAllowed(serviceCities, receiverCountry, recvCityNorm, 'receiver');
  const SHIPMENT_TYPE_LABELS: Record<string, string> = { parcels_cargo: 'Посилки та вантажі', documents: 'Документи', tires_wheels: 'Шини та диски' };
  const PAYER_LABELS: Record<string, string> = { sender: 'Відправник', receiver: 'Отримувач' };
  const PAYMENT_METHOD_LABELS: Record<string, string> = { cash: 'Готівка', cashless: 'Безготівка' };

  if (successNumber) {
    return (
      <div className="max-w-lg mx-auto text-center py-12">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-green-800 mb-2">Замовлення створено</h2>
          <p className="text-green-700">
            Попереднє відправлення N{successNumber} сформовано. Кур&apos;єр перевірить Ваші дані.
          </p>
        </div>
        <Button onClick={() => router.push('/my-orders')} className="w-full h-12 text-base">
          Переглянути мої замовлення
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Нове замовлення</h1>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">

        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base">Виберіть напрямок</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <Select value={direction} onValueChange={(v) => handleDirectionChange(v ?? '')}>
              <SelectTrigger>
                <SelectValue>
                  {direction ? DIRECTION_LABELS[direction] : <span className="text-gray-400">Виберіть напрямок…</span>}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="eu_to_ua">З Європи в Україну</SelectItem>
                <SelectItem value="ua_to_eu">З України в Європу</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Receiver — ТЗ (docx 14.05.26 §b): порядок став
            напрямок → Отримувач → Відправник → «Як ви передасте». */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base text-blue-600">Отримувач</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-2">
            <PhoneInput
              label="Телефон"
              required
              value={receiverPhone}
              onChange={setReceiverPhone}
              defaultCountry={(receiverCountry as 'UA' | 'NL' | 'AT' | 'DE') || 'UA'}
            />
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Прізвище *</Label><CapitalizeInput value={receiverLastName} onChange={setReceiverLastName} required /></div>
              <div><Label>Ім&apos;я *</Label><CapitalizeInput value={receiverFirstName} onChange={setReceiverFirstName} required /></div>
            </div>
            <div><Label>По батькові</Label><CapitalizeInput value={receiverMiddleName} onChange={setReceiverMiddleName} /></div>
            <div>
              <Label>Країна *</Label>
              <Select value={receiverCountry} onValueChange={(v) => setReceiverCountry(v ?? '')}>
                <SelectTrigger>
                  <SelectValue>
                    {receiverCountry ? COUNTRY_LABELS[receiverCountry] : <span className="text-gray-400">Виберіть країну…</span>}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UA">Україна</SelectItem>
                  <SelectItem value="NL">Нідерланди</SelectItem>
                  <SelectItem value="AT">Австрія</SelectItem>
                  <SelectItem value="DE">Німеччина</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              {/* ТЗ §4: «Населений пункт» (як у формі Працівника) + авто-велика
                  перша буква. */}
              <Label>Населений пункт *</Label>
              <AddressInput
                field="city"
                country={receiverCountry}
                value={receiverCity}
                onChange={(v) => setReceiverCity(v ? v.charAt(0).toUpperCase() + v.slice(1) : v)}
                required
              />
            </div>
            {/* ТЗ §4: поле «Індекс» після Населеного пункту. */}
            <div>
              <Label>Індекс</Label>
              <Input value={receiverPostalCode} onChange={(e) => setReceiverPostalCode(e.target.value)} placeholder="00-000" />
            </div>
            {/* ТЗ §b: «Спосіб доставки» = рівно 3 опції як у Працівника:
                Адресна доставка / Пошта / Пункт видачі. «Пункт видачі» — лише
                якщо для країни/міста є точки в Логістиці (інакше ховаємо). */}
            {receiverCountry && (
              <div>
                <Label>Спосіб доставки</Label>
                <Select value={receiverDeliveryMethod} onValueChange={(v) => setReceiverDeliveryMethod(v ?? 'address')}>
                  <SelectTrigger><SelectValue>{DELIVERY_METHOD_LABELS[receiverDeliveryMethod]}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {/* ТЗ docx 02.07.26 (D8): заборонені для Країни/НП способи ховаємо. */}
                    {(recvCourierAllowed || receiverDeliveryMethod === 'address') && (
                      <SelectItem value="address">Адресна доставка</SelectItem>
                    )}
                    {(recvPostalAllowed || receiverDeliveryMethod === 'np_warehouse') && (
                      <SelectItem value="np_warehouse">Пошта</SelectItem>
                    )}
                    {((recvHasPoints && recvPickupAllowed) || receiverDeliveryMethod === 'pickup_point') && (
                      <SelectItem value="pickup_point">Пункт видачі</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
            {receiverDeliveryMethod === 'np_warehouse' && (
              <div><Label>Номер складу/поштомату *</Label><Input value={receiverNpWarehouse} onChange={(e) => setReceiverNpWarehouse(e.target.value)} placeholder="1" /></div>
            )}
            {receiverDeliveryMethod === 'pickup_point' && (
              <div>
                <Label>Пункт видачі *</Label>
                {recvPointsToShow.length > 0 ? (
                  <div className="space-y-1.5">
                    {recvPointsToShow.map((p) => {
                      const label = p.name || `${p.city}, ${p.address}`;
                      const sel = receiverPickupPointId ? receiverPickupPointId === p.id : receiverPickupPointText === label;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          // ТЗ docx 29.06.26 §2: при виборі пункту його індекс
                          // авто-вставляється в «Індекс» Отримувача; підсвітка по id.
                          onClick={() => {
                            setReceiverPickupPointId(p.id);
                            setReceiverPickupPointText(label);
                            if (p.postalCode) setReceiverPostalCode(p.postalCode);
                          }}
                          className={`w-full text-left border rounded-lg p-2 text-sm transition-all ${sel ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-200 hover:bg-gray-50'}`}
                        >
                          <div className="font-medium">{label}</div>
                          {p.name && <div className="text-xs text-gray-500">{p.city}, {p.address}</div>}
                          {/* ТЗ docx 29.06.26 §2: години роботи. */}
                          {p.workingDays?.length > 0 && (
                            <div className="text-xs text-gray-500">
                              📅 {formatWorkingDays(p.workingDays)}{p.workingHours ? ` · ${p.workingHours}` : ''}
                            </div>
                          )}
                          {p.postalCode && <div className="text-xs text-gray-400">Індекс: {p.postalCode}</div>}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                    Для «{receiverCity || 'цього міста'}» немає пунктів видачі. Виберіть інший спосіб.
                  </div>
                )}
              </div>
            )}
            {/* ТЗ §19: «Адресна доставка» = Вулиця / Будинок / Орієнтир (як у Працівника). */}
            {(receiverDeliveryMethod === 'address') && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Вулиця{receiverCountry === 'UA' && ' *'}</Label>
                    <AddressInput field="street" country={receiverCountry} value={receiverStreet} onChange={setReceiverStreet} />
                  </div>
                  <div>
                    <Label>Будинок{receiverCountry === 'UA' && ' *'}</Label>
                    <Input value={receiverBuilding} onChange={(e) => setReceiverBuilding(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Орієнтир</Label>
                  <Input value={receiverLandmark} onChange={(e) => setReceiverLandmark(e.target.value)} placeholder="Біля магазину..." />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Sender — ТЗ §b: після «Отримувач», перед «Як ви передасте». */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base text-green-600">Відправник (Ваші дані)</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-2">
            <PhoneInput
              label="Телефон"
              required
              value={senderPhone}
              onChange={setSenderPhone}
              defaultCountry={(senderCountry as 'UA' | 'NL' | 'AT' | 'DE') || 'UA'}
            />
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Прізвище *</Label><CapitalizeInput value={senderLastName} onChange={setSenderLastName} required /></div>
              <div><Label>Ім&apos;я *</Label><CapitalizeInput value={senderFirstName} onChange={setSenderFirstName} required /></div>
            </div>
            <div><Label>По батькові</Label><CapitalizeInput value={senderMiddleName} onChange={setSenderMiddleName} /></div>
            <div>
              <Label>Країна</Label>
              <Select value={senderCountry} onValueChange={(v) => setSenderCountry(v ?? 'NL')}>
                <SelectTrigger><SelectValue>{COUNTRY_LABELS[senderCountry]}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NL">Нідерланди</SelectItem>
                  <SelectItem value="AT">Австрія</SelectItem>
                  <SelectItem value="DE">Німеччина</SelectItem>
                  <SelectItem value="UA">Україна</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Населений пункт *</Label>
              <AddressInput
                field="city"
                country={senderCountry}
                value={senderCity}
                onChange={(v) => setSenderCity(v ? v.charAt(0).toUpperCase() + v.slice(1) : v)}
              />
            </div>
            {/* ТЗ §b: поле «Індекс» після Населеного пункту. Умовні поля
                способу передачі (Вулиця/Будинок/Орієнтир, Номер складу) тепер
                живуть у картці «Як ви передасте» нижче. */}
            <div>
              <Label>Індекс</Label>
              <Input value={senderPostalCode} onChange={(e) => setSenderPostalCode(e.target.value)} placeholder="00-000" />
            </div>
          </CardContent>
        </Card>

        {/* ТЗ (docx 14.05.26 §b): «Як ви передасте нам посилку?» — остання з
            трьох карток (після «Відправник»). Має бути РОЗГОРНУТА (усі способи
            видно). Умовні поля: Виклик кур'єра → Вулиця/Будинок/Орієнтир;
            Пошта → Номер складу; Пункт збору → перелік для країни/міста. */}
        {!!direction && (
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-base">Як Ви передасте нам посилку?</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <CollectionBlock
                senderCountry={senderCountry}
                senderCity={senderCity}
                value={{
                  method: (collectionMethod as 'pickup_point' | 'courier_pickup' | 'external_shipping' | 'direct_to_driver' | '') || '',
                  pointId: collectionPointId,
                  date: collectionDate,
                  address: collectionAddress,
                  street: collectionStreet,
                  building: collectionBuilding,
                  landmark: collectionLandmark,
                  warehouseNum: collectionWarehouse,
                }}
                onChange={(next) => {
                  setCollectionMethod(next.method);
                  setCollectionPointId(next.pointId);
                  setCollectionDate(next.date);
                  setCollectionAddress(next.address);
                  setCollectionStreet(next.street ?? '');
                  setCollectionBuilding(next.building ?? '');
                  setCollectionLandmark(next.landmark ?? '');
                  setCollectionWarehouse(next.warehouseNum ?? '');
                  // ТЗ docx 29.06.26 §2: при виборі пункту збору його поштовий
                  // код авто-вставляється в «Індекс» Відправника.
                  if (next.method === 'pickup_point' && next.postalCode) {
                    setSenderPostalCode(next.postalCode);
                  }
                  if (next.method === 'courier_pickup' && next.date) {
                    validateCollectionDate(next.date);
                  } else {
                    setCollectionDayWarning('');
                  }
                }}
                clientFacing
              />
              {collectionDayWarning && (
                <p className="text-xs text-amber-600 mt-2">{collectionDayWarning}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Parcel */}
        <Card>
          <CardHeader className="py-3 px-4"><CardTitle className="text-base">Відправлення</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-2">
            <div>
              <Label>Вид відправлення <FieldHint text="Виберіть тип відправлення з випадаючого списку: Посилки та вантажі, Документи або Шини та диски" /></Label>
              <Select value={shipmentType} onValueChange={(v) => setShipmentType(v ?? 'parcels_cargo')}>
                <SelectTrigger><SelectValue>{SHIPMENT_TYPE_LABELS[shipmentType]}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="parcels_cargo">Посилки та вантажі</SelectItem>
                  <SelectItem value="documents">Документи</SelectItem>
                  <SelectItem value="tires_wheels">Шини та диски</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {shipmentType === 'parcels_cargo' && (
              <div><Label>Опис відправлення <FieldHint text="Опишіть що саме відправляється: побутові речі, продукти харчування, будівельні матеріали тощо" /></Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Побутові речі, продукти..." rows={2} /></div>
            )}
            <div><Label>Оголошена вартість (EUR) <FieldHint text="Оцініть вартість своєї посилки" /></Label><Input type="number" step="0.01" min="0" value={declaredValue} onChange={(e) => setDeclaredValue(e.target.value)} /></div>

            {/* Додаткові послуги — кожна вмикається чекбоксом, % і суми
                визначаються тарифом для напрямку. Тексти підказок — per ТЗ §E10. */}
            <div className="space-y-2 pt-2 border-t">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={insurance} onCheckedChange={(c) => setInsurance(c === true)} />
                Страхування <FieldHint text="У разі загибелі посилки відшкодовується лише сума страхування. Відмітьте чекбокс, якщо бажаєте застрахувати посилку згідно оголошеної вартості" />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={needsPackaging} onCheckedChange={(c) => setNeedsPackaging(c === true)} />
                Пакування <FieldHint text="Відмітьте, якщо пакунок не є у коробці" />
              </label>
              {/* ТЗ docx 01.07.26: «Доставка до порога будинку» — під Пакуванням.
                  ТЗ docx 02.07.26 (D4): лише Європа→Україна + Адресна доставка. */}
              {canDoorstep && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={doorstepDelivery} onCheckedChange={(c) => setDoorstepDelivery(c === true)} />
                  Доставка до порога будинку <FieldHint text="До вартості додається фіксована сума з Тарифів для цього напрямку." />
                </label>
              )}
              {/* Per ТЗ §E10: «Поле "Пакет" при заповненні Клієнтом
                  відсутнє». Опція з'являється лише коли посилку оформлює
                  Працівник. Тому в клієнтському порталі чекбокс «Пакет»
                  не рендеримо взагалі. */}
            </div>
          </CardContent>
        </Card>

        {/* Places */}
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex justify-between items-center">
              {/* ТЗ §E11: вкладка зветься «Параметри відправлення» (однаково
                  для Працівника і Клієнта) та йде після «Відправлення». */}
              <CardTitle className="text-base">Параметри відправлення ({places.length})</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addPlace} disabled={places.length >= 10}>+</Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-3">
            {places.map((p, i) => (
              <div key={i} className="border rounded p-2 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Місце {i + 1}</span>
                  {places.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => removePlace(i)} className="text-red-500">&times;</Button>}
                </div>
                <p className="text-xs text-gray-400">Нанесіть даний порядковий номер місця на відповідний пакунок</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div><Label className="text-xs">Вага (кг)</Label><Input type="number" step="0.01" value={p.weight} onChange={(e) => updatePlace(i, 'weight', e.target.value)} /></div>
                  <div><Label className="text-xs">Довжина (см)</Label><Input type="number" value={p.length} onChange={(e) => updatePlace(i, 'length', e.target.value)} /></div>
                  <div><Label className="text-xs">Ширина (см)</Label><Input type="number" value={p.width} onChange={(e) => updatePlace(i, 'width', e.target.value)} /></div>
                  <div><Label className="text-xs">Висота (см)</Label><Input type="number" value={p.height} onChange={(e) => updatePlace(i, 'height', e.target.value)} /></div>
                </div>
                {/* ТЗ docx 02.07.26 (D6): поле «об'єм» у Клієнта прибрано — лише Д/Ш/В. */}
                {volWeight(p) > 0 && <div className="text-xs text-gray-500">Об&apos;ємна вага: {volWeight(p)} кг</div>}
              </div>
            ))}
            {/* ТЗ docx 02.07.26 (D7): Фактична / Об'ємна / Розрахункова вага. */}
            <div className="text-sm space-y-0.5 border-t pt-2 mt-1">
              <div className="flex justify-between"><span className="text-gray-500">Фактична вага</span><span>{totalWeight.toFixed(2)} кг</span></div>
              {totalVolWeight > 0 && (
                <div className="flex justify-between"><span className="text-gray-500">Об&apos;ємна вага</span><span>{totalVolWeight.toFixed(2)} кг</span></div>
              )}
              <div className="flex justify-between font-medium"><span>Розрахункова вага</span><span>{billableWeight.toFixed(2)} кг</span></div>
            </div>
          </CardContent>
        </Card>

        {/* Payment */}
        <Card>
          <CardHeader className="py-3 px-4"><CardTitle className="text-base">Оплата</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-2">
            <Select value={payer} onValueChange={(v) => setPayer(v ?? 'sender')}>
              <SelectTrigger><SelectValue>{PAYER_LABELS[payer]}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="sender">Відправник</SelectItem>
                <SelectItem value="receiver">Отримувач</SelectItem>
              </SelectContent>
            </Select>
            <Select value={paymentMethod} onValueChange={(v) => { setPaymentMethod(v ?? 'cash'); if (v === 'cashless') setPaymentInUkraine(true); }}>
              <SelectTrigger><SelectValue>{PAYMENT_METHOD_LABELS[paymentMethod]}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Готівка</SelectItem>
                <SelectItem value="cashless">Безготівка</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={paymentInUkraine} onCheckedChange={(c) => { setPaymentInUkraine(c === true); if (c) setPaymentMethod('cashless'); else setPaymentMethod('cash'); }} />
              Оплата в Україні
            </label>
          </CardContent>
        </Card>

        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

        <Button type="submit" className="w-full h-12 text-base" disabled={saving}>
          {saving ? 'Створення...' : 'Створити замовлення'}
        </Button>

        <p className="text-xs text-gray-400 text-center">
          Після створення замовлення кур&apos;єр перевірить Ваші дані та підтвердить відправлення.
        </p>
      </form>
    </div>
  );
}
