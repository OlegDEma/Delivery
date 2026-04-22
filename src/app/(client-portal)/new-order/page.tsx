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

interface PlaceData {
  weight: string;
  length: string;
  width: string;
  height: string;
}

const emptyPlace = (): PlaceData => ({ weight: '', length: '', width: '', height: '' });

function volWeight(p: PlaceData): number {
  const l = Number(p.length) || 0, w = Number(p.width) || 0, h = Number(p.height) || 0;
  return l > 0 && w > 0 && h > 0 ? Number(((l * w * h) / 4000).toFixed(2)) : 0;
}

interface PricingConfig {
  id: string;
  country: string;
  direction: string;
  collectionDays: string[];
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
  const [collectionDayWarning, setCollectionDayWarning] = useState('');

  // ТЗ: клієнт має свідомо вибрати напрямок — без дефолту.
  const [direction, setDirection] = useState('');

  // Sender (client fills about themselves)
  const [senderPhone, setSenderPhone] = useState('+');
  const [senderFirstName, setSenderFirstName] = useState('');
  const [senderLastName, setSenderLastName] = useState('');
  const [senderCountry, setSenderCountry] = useState('NL');
  const [senderCity, setSenderCity] = useState('');

  // Receiver
  const [receiverPhone, setReceiverPhone] = useState('+');
  const [receiverFirstName, setReceiverFirstName] = useState('');
  const [receiverLastName, setReceiverLastName] = useState('');
  const [receiverCountry, setReceiverCountry] = useState('');
  const [receiverCity, setReceiverCity] = useState('');
  const [receiverStreet, setReceiverStreet] = useState('');
  const [receiverDeliveryMethod, setReceiverDeliveryMethod] = useState('address');
  const [receiverNpWarehouse, setReceiverNpWarehouse] = useState('');

  // Пошук серед попередніх отримувачів — за ТЗ «дані беруться з останнього
  // відправлення». Якщо клієнт колись відправляв цій людині — дає готові
  // поля на вибір, якщо ні — лишається форма «з чистого листка».
  const [receiverSearch, setReceiverSearch] = useState('');
  const [receiverSuggestions, setReceiverSuggestions] = useState<Array<{
    id: string; firstName: string; lastName: string; phone: string;
    country: string | null; city: string | null; street: string | null;
    building: string | null; npWarehouseNum: string | null; deliveryMethod: string | null;
    fromMyHistory?: boolean;
  }>>([]);
  const [showReceiverForm, setShowReceiverForm] = useState(false);

  useEffect(() => {
    const q = receiverSearch.trim();
    if (q.length < 2) { setReceiverSuggestions([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/client-portal/receivers?q=${encodeURIComponent(q)}`);
      if (res.ok) setReceiverSuggestions(await res.json());
    }, 250);
    return () => clearTimeout(t);
  }, [receiverSearch]);

  function pickReceiver(r: typeof receiverSuggestions[number]) {
    setReceiverPhone(r.phone || '+');
    setReceiverFirstName(r.firstName);
    setReceiverLastName(r.lastName);
    setReceiverCountry(r.country || 'UA');
    setReceiverCity(r.city || '');
    setReceiverStreet([r.street, r.building].filter(Boolean).join(' '));
    setReceiverDeliveryMethod(r.deliveryMethod || 'address');
    setReceiverNpWarehouse(r.npWarehouseNum || '');
    setReceiverSuggestions([]);
    setReceiverSearch('');
    setShowReceiverForm(true);
  }

  // Parcel
  const [shipmentType, setShipmentType] = useState('parcels_cargo');
  const [description, setDescription] = useState('');
  const [declaredValue, setDeclaredValue] = useState('');
  const [places, setPlaces] = useState<PlaceData[]>([emptyPlace()]);
  const [payer, setPayer] = useState('sender');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentInUkraine, setPaymentInUkraine] = useState(false);

  // Collection (pickup_point | courier_pickup | external_shipping | direct_to_driver)
  const [collectionMethod, setCollectionMethod] = useState<string>('pickup_point');
  const [collectionPointId, setCollectionPointId] = useState('');
  const [collectionDate, setCollectionDate] = useState('');
  const [collectionAddress, setCollectionAddress] = useState('');

  // Автопідставляння країни отримувача за напрямком:
  // eu_to_ua → UA; ua_to_eu — лишаємо пустим, клієнт вибирає NL/AT/DE.
  useEffect(() => {
    if (direction === 'eu_to_ua' && !receiverCountry) {
      setReceiverCountry('UA');
    } else if (direction === 'ua_to_eu' && receiverCountry === 'UA') {
      setReceiverCountry('');
    }
  }, [direction]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch('/api/pricing').then(r => r.ok ? r.json() : []).then(setPricingConfigs);

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
    // Для отримувачів в Україні — вулиця/будинок або номер складу НП обов'язкові.
    if (receiverCountry === 'UA') {
      const hasStreet = receiverStreet.trim().length > 0;
      const hasNpWarehouse = receiverDeliveryMethod === 'np_warehouse' && receiverNpWarehouse.trim().length > 0;
      if (!hasStreet && !hasNpWarehouse) {
        setError('Для отримувача в Україні вкажіть вулицю + номер дому АБО номер складу Нової Пошти');
        return;
      }
    }
    setSaving(true);

    const res = await fetch('/api/client-portal/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        direction, shipmentType, description,
        declaredValue: declaredValue ? Number(declaredValue) : undefined,
        payer, paymentMethod, paymentInUkraine,
        senderPhone, senderFirstName, senderLastName, senderCountry, senderCity,
        receiverPhone, receiverFirstName, receiverLastName, receiverCountry, receiverCity,
        receiverStreet, receiverDeliveryMethod, receiverNpWarehouse,
        places: places.map(p => ({
          weight: Number(p.weight) || 0,
          length: Number(p.length) || undefined,
          width: Number(p.width) || undefined,
          height: Number(p.height) || undefined,
        })),
        collectionMethod, collectionPointId, collectionDate, collectionAddress,
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

  const DIRECTION_LABELS: Record<string, string> = { eu_to_ua: 'З Європи в Україну', ua_to_eu: 'З України в Європу' };
  const COUNTRY_LABELS: Record<string, string> = { NL: 'Нідерланди', AT: 'Австрія', DE: 'Німеччина', UA: 'Україна' };
  const COLLECTION_METHOD_LABELS: Record<string, string> = { collection_point: 'Пункт збору', courier_pickup: "Виклик кур'єра" };
  const DELIVERY_METHOD_LABELS: Record<string, string> = { address: 'Адресна доставка', np_warehouse: 'Склад Нової Пошти', np_poshtamat: 'Поштомат' };
  const SHIPMENT_TYPE_LABELS: Record<string, string> = { parcels_cargo: 'Посилки та вантажі', documents: 'Документи', tires_wheels: 'Шини та диски' };
  const PAYER_LABELS: Record<string, string> = { sender: 'Відправник', receiver: 'Отримувач' };
  const PAYMENT_METHOD_LABELS: Record<string, string> = { cash: 'Готівка', cashless: 'Безготівка' };

  if (successNumber) {
    return (
      <div className="max-w-lg mx-auto text-center py-12">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-green-800 mb-2">Замовлення створено</h2>
          <p className="text-green-700">
            Попереднє відправлення N{successNumber} сформовано. Кур&apos;єр перевірить ваші дані.
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
            <Select value={direction} onValueChange={(v) => setDirection(v ?? '')}>
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

        {/* Sender */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base text-green-600">Відправник (ваші дані)</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-2">
            <div>
              <Label>Телефон *</Label>
              <Input value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} className="text-base" required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Прізвище *</Label><Input value={senderLastName} onChange={(e) => setSenderLastName(e.target.value)} required /></div>
              <div><Label>Ім&apos;я *</Label><Input value={senderFirstName} onChange={(e) => setSenderFirstName(e.target.value)} required /></div>
            </div>
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
            <div><Label>Місто</Label><Input value={senderCity} onChange={(e) => setSenderCity(e.target.value)} /></div>
          </CardContent>
        </Card>

        {/* Collection method */}
        {direction === 'eu_to_ua' && (
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-base">Як ви передасте нам посилку?</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <CollectionBlock
                senderCountry={senderCountry}
                value={{
                  method: (collectionMethod as 'pickup_point' | 'courier_pickup' | 'external_shipping' | 'direct_to_driver' | '') || '',
                  pointId: collectionPointId,
                  date: collectionDate,
                  address: collectionAddress,
                }}
                onChange={(next) => {
                  setCollectionMethod(next.method);
                  setCollectionPointId(next.pointId);
                  setCollectionDate(next.date);
                  setCollectionAddress(next.address);
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

        {/* Receiver */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base text-blue-600">Отримувач</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-2">
            {/* Пошук серед попередніх отримувачів. Дані з останнього
                відправлення: прізвище, ім'я, телефон, місто, адреса. */}
            {!showReceiverForm && (
              <div>
                <Label>Пошук отримувача (прізвище або телефон)</Label>
                <Input
                  value={receiverSearch}
                  onChange={(e) => setReceiverSearch(e.target.value)}
                  placeholder="Почніть вводити…"
                  className="text-base"
                />
                {receiverSuggestions.length > 0 && (
                  <div className="mt-2 bg-white border rounded-lg divide-y">
                    {receiverSuggestions.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => pickReceiver(r)}
                        className="w-full text-left p-2 hover:bg-blue-50 text-sm"
                      >
                        <div className="font-medium flex items-center gap-2">
                          {r.lastName} {r.firstName}
                          {r.fromMyHistory && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                              ваш отримувач
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          {r.phone}
                          {r.city && <> · {r.city}</>}
                          {r.street && <>, {r.street}{r.building ? ` ${r.building}` : ''}</>}
                          {r.npWarehouseNum && <> · НП №{r.npWarehouseNum}</>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {receiverSearch.trim().length >= 2 && receiverSuggestions.length === 0 && (
                  <div className="mt-2 text-xs text-gray-500">
                    Отримувача не знайдено.{' '}
                    <button
                      type="button"
                      onClick={() => setShowReceiverForm(true)}
                      className="text-blue-600 hover:underline"
                    >
                      Створити нового
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowReceiverForm(true)}
                  className="mt-2 text-xs text-blue-600 hover:underline"
                >
                  + Ввести нового отримувача
                </button>
              </div>
            )}

            {showReceiverForm && (
              <>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">Дані отримувача</span>
              <button
                type="button"
                onClick={() => { setShowReceiverForm(false); setReceiverSearch(''); }}
                className="text-xs text-gray-500 hover:text-gray-900"
              >
                ← назад до пошуку
              </button>
            </div>
            <div>
              <Label>Телефон *</Label>
              <Input value={receiverPhone} onChange={(e) => setReceiverPhone(e.target.value)} className="text-base" required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Прізвище *</Label><Input value={receiverLastName} onChange={(e) => setReceiverLastName(e.target.value)} required /></div>
              <div><Label>Ім&apos;я *</Label><Input value={receiverFirstName} onChange={(e) => setReceiverFirstName(e.target.value)} required /></div>
            </div>
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
            <div><Label>Місто *</Label><Input value={receiverCity} onChange={(e) => setReceiverCity(e.target.value)} required /></div>
            {receiverCountry === 'UA' && (
              <div>
                <Label>Спосіб доставки</Label>
                <Select value={receiverDeliveryMethod} onValueChange={(v) => setReceiverDeliveryMethod(v ?? 'address')}>
                  <SelectTrigger><SelectValue>{DELIVERY_METHOD_LABELS[receiverDeliveryMethod]}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="address">Адресна доставка</SelectItem>
                    <SelectItem value="np_warehouse">Склад Нової Пошти</SelectItem>
                    <SelectItem value="np_poshtamat">Поштомат</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {receiverDeliveryMethod === 'np_warehouse' && (
              <div><Label>Номер складу НП</Label><Input value={receiverNpWarehouse} onChange={(e) => setReceiverNpWarehouse(e.target.value)} placeholder="1" /></div>
            )}
            {(receiverDeliveryMethod === 'address' || receiverCountry !== 'UA') && (
              <div><Label>Вулиця, будинок{receiverCountry === 'UA' && ' *'}</Label><Input value={receiverStreet} onChange={(e) => setReceiverStreet(e.target.value)} /></div>
            )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Parcel */}
        <Card>
          <CardHeader className="py-3 px-4"><CardTitle className="text-base">Відправлення</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-2">
            <div>
              <Label>Тип</Label>
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
              <div><Label>Опис</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Побутові речі, продукти..." rows={2} /></div>
            )}
            <div><Label>Оголошена вартість (EUR)</Label><Input type="number" step="0.01" min="0" value={declaredValue} onChange={(e) => setDeclaredValue(e.target.value)} /></div>
          </CardContent>
        </Card>

        {/* Places */}
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex justify-between items-center">
              <CardTitle className="text-base">Місця ({places.length})</CardTitle>
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
                {volWeight(p) > 0 && <div className="text-xs text-gray-500">Об&apos;ємна вага: {volWeight(p)} кг</div>}
              </div>
            ))}
            <div className="text-sm font-medium">Загальна вага: {totalWeight.toFixed(2)} кг</div>
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
          Після створення замовлення кур&apos;єр перевірить ваші дані та підтвердить відправлення.
        </p>
      </form>
    </div>
  );
}
