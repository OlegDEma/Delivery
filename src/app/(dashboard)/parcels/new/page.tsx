'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClientSearch } from '@/components/clients/client-search';
import { DescriptionAutocomplete } from '@/components/parcels/description-autocomplete';
import { CostCalculator } from '@/components/parcels/cost-calculator';
import { FieldHint } from '@/components/shared/field-hint';

interface SelectedClient {
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
}

interface PlaceData {
  weight: string;
  length: string;
  width: string;
  height: string;
  volume: string;
  needsPackaging: boolean;
}

const emptyPlace = (): PlaceData => ({
  weight: '', length: '', width: '', height: '', volume: '', needsPackaging: false,
});

function calcVolWeight(p: PlaceData): number {
  const l = Number(p.length) || 0;
  const w = Number(p.width) || 0;
  const h = Number(p.height) || 0;
  if (l > 0 && w > 0 && h > 0) return Number(((l * w * h) / 4000).toFixed(2));
  return 0;
}

export default function NewParcelPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Receiver (first, as per TZ)
  const [receiver, setReceiver] = useState<SelectedClient | null>(null);
  const [receiverAddressId, setReceiverAddressId] = useState<string>('');

  // Sender
  const [sender, setSender] = useState<SelectedClient | null>(null);
  const [senderAddressId, setSenderAddressId] = useState<string>('');

  // Parcel details
  const [direction, setDirection] = useState<string>('eu_to_ua');
  const [shipmentType, setShipmentType] = useState<string>('parcels_cargo');
  const [description, setDescription] = useState('');

  // Auto-fill description when shipment type changes
  function handleShipmentTypeChange(val: string) {
    setShipmentType(val);
    if (val === 'documents') setDescription('Документи');
    else if (val === 'tires_wheels') setDescription('Шини та диски');
    else if (description === 'Документи' || description === 'Шини та диски') setDescription('');
  }
  const [declaredValue, setDeclaredValue] = useState('');

  // General params mode
  const [useGeneralParams, setUseGeneralParams] = useState(false);
  const [generalWeight, setGeneralWeight] = useState('');
  const [generalVolume, setGeneralVolume] = useState('');
  const [generalPlaces, setGeneralPlaces] = useState('1');

  // Places
  const [places, setPlaces] = useState<PlaceData[]>([emptyPlace()]);

  // Payment
  const [payer, setPayer] = useState<string>('sender');
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [paymentInUkraine, setPaymentInUkraine] = useState(false);
  const [needsPackaging, setNeedsPackaging] = useState(false);

  // Trip date
  const [tripDateMode, setTripDateMode] = useState<string>('none');
  const [customTripDate, setCustomTripDate] = useState('');
  const [trips, setTrips] = useState<{ id: string; departureDate: string; country: string; direction: string }[]>([]);
  const [selectedTripId, setSelectedTripId] = useState('');

  useEffect(() => {
    fetch('/api/trips').then(r => r.ok ? r.json() : []).then(setTrips);
  }, []);

  function addPlace() {
    if (places.length >= 10) return;
    setPlaces([...places, emptyPlace()]);
  }

  function copyPlace(index: number) {
    if (places.length >= 10) return;
    setPlaces([...places, { ...places[index] }]);
  }

  function removePlace(index: number) {
    if (places.length <= 1) return;
    setPlaces(places.filter((_, i) => i !== index));
  }

  function updatePlace(index: number, field: keyof PlaceData, value: string | boolean) {
    const updated = [...places];
    updated[index] = { ...updated[index], [field]: value };
    setPlaces(updated);
  }

  // Auto-select first address when client selected
  function handleReceiverSelect(client: SelectedClient) {
    setReceiver(client);
    if (client.addresses.length > 0) {
      setReceiverAddressId(client.addresses[0].id);
    }
  }

  function handleSenderSelect(client: SelectedClient) {
    setSender(client);
    if (client.addresses.length > 0) {
      setSenderAddressId(client.addresses[0].id);
    }
  }

  // Handle payment method / ukraine checkbox coupling
  function handlePaymentMethodChange(val: string) {
    setPaymentMethod(val);
    if (val === 'cashless') setPaymentInUkraine(true);
  }
  function handlePaymentInUkraineChange(checked: boolean) {
    setPaymentInUkraine(checked);
    if (checked) setPaymentMethod('cashless');
    if (!checked) setPaymentMethod('cash');
  }

  // Totals
  const totalWeight = useGeneralParams
    ? (Number(generalWeight) || 0)
    : places.reduce((s, p) => s + (Number(p.weight) || 0), 0);
  const totalVolWeight = useGeneralParams
    ? (Number(generalVolume) || 0) * 250
    : places.reduce((s, p) => {
        const vol = Number(p.volume) || 0;
        return s + (vol > 0 ? vol * 250 : calcVolWeight(p));
      }, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!receiver) { setError('Спочатку виберіть отримувача — введіть телефон або прізвище'); return; }
    if (!sender) { setError('Виберіть відправника — введіть телефон або прізвище'); return; }

    if (useGeneralParams) {
      if (!generalWeight || Number(generalWeight) <= 0) { setError('Вкажіть загальну вагу'); return; }
    } else {
      const hasValidPlace = places.some(p => Number(p.weight) > 0);
      if (!hasValidPlace) { setError('Вкажіть вагу хоча б одного місця — це обов\'язково'); return; }
    }

    if (!declaredValue || Number(declaredValue) <= 0) {
      setError('Вкажіть оголошену вартість відправлення');
      return;
    }

    if (tripDateMode === 'none') {
      setError('Виберіть дату рейсу — це обов\'язкове поле');
      return;
    }
    if (tripDateMode === 'custom' && !customTripDate) {
      setError('Вкажіть дату рейсу');
      return;
    }

    setSaving(true);

    const res = await fetch('/api/parcels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receiverId: receiver.id,
        receiverAddressId: receiverAddressId || undefined,
        senderId: sender.id,
        senderAddressId: senderAddressId || undefined,
        direction,
        shipmentType,
        description: description || undefined,
        declaredValue: declaredValue || undefined,
        payer,
        paymentMethod,
        paymentInUkraine,
        needsPackaging,
        tripId: selectedTripId || undefined,
        places: useGeneralParams
          ? Array.from({ length: Number(generalPlaces) || 1 }, (_, i) => ({
              weight: (Number(generalWeight) || 0) / (Number(generalPlaces) || 1),
              volume: Number(generalVolume) > 0 ? Number(generalVolume) / (Number(generalPlaces) || 1) : undefined,
            }))
          : places.map(p => ({
              weight: Number(p.weight) || 0,
              length: Number(p.length) || undefined,
              width: Number(p.width) || undefined,
              height: Number(p.height) || undefined,
              volume: Number(p.volume) || undefined,
              needsPackaging: p.needsPackaging,
            })),
      }),
    });

    if (res.ok) {
      const parcel = await res.json();
      router.push(`/parcels/${parcel.id}`);
    } else {
      const data = await res.json();
      setError(data.error || 'Помилка створення');
    }
    setSaving(false);
  }

  const DIRECTION_LABELS: Record<string, string> = { eu_to_ua: 'Європа → Україна', ua_to_eu: 'Україна → Європа' };
  const SHIPMENT_LABELS: Record<string, string> = { parcels_cargo: 'Посилки та вантажі', documents: 'Документи', tires_wheels: 'Шини та диски' };
  const PAYER_LABELS: Record<string, string> = { sender: 'Відправник', receiver: 'Отримувач' };
  const PAYMENT_LABELS: Record<string, string> = { cash: 'Готівка', cashless: 'Безготівка' };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-4">Нова посилка</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Direction */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base">Напрямок</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <Select value={direction} onValueChange={(v) => setDirection(v ?? '')}>
              <SelectTrigger><SelectValue>{DIRECTION_LABELS[direction]}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="eu_to_ua">Європа → Україна</SelectItem>
                <SelectItem value="ua_to_eu">Україна → Європа</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Receiver (first per TZ!) */}
        <Card className="overflow-visible">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base">
              <span className="text-blue-600 font-bold">Отримувач</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-2 overflow-visible">
            <ClientSearch
              label="Пошук отримувача (телефон або прізвище)"
              onSelect={handleReceiverSelect}
              onClear={() => { setReceiver(null); setReceiverAddressId(''); }}
              selected={receiver}
            />
            {receiver && receiver.addresses.length > 1 && (
              <div>
                <Label className="text-xs text-gray-500">Адреса доставки</Label>
                <Select value={receiverAddressId} onValueChange={(v) => setReceiverAddressId(v ?? '')}>
                  <SelectTrigger><SelectValue placeholder="Виберіть адресу" /></SelectTrigger>
                  <SelectContent>
                    {receiver.addresses.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.city}{a.street ? `, ${a.street}` : ''}{a.building ? ` ${a.building}` : ''}
                        {a.npWarehouseNum ? ` (НП ${a.npWarehouseNum})` : ''}
                        {a.landmark ? ` — ${a.landmark}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sender */}
        <Card className="overflow-visible">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base">
              <span className="text-green-600 font-bold">Відправник</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-2 overflow-visible">
            <ClientSearch
              label="Пошук відправника (телефон або прізвище)"
              onSelect={handleSenderSelect}
              onClear={() => { setSender(null); setSenderAddressId(''); }}
              selected={sender}
            />
            {sender && sender.addresses.length > 1 && (
              <div>
                <Label className="text-xs text-gray-500">Адреса відправника</Label>
                <Select value={senderAddressId} onValueChange={(v) => setSenderAddressId(v ?? '')}>
                  <SelectTrigger><SelectValue placeholder="Виберіть адресу" /></SelectTrigger>
                  <SelectContent>
                    {sender.addresses.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.city}{a.street ? `, ${a.street}` : ''}{a.building ? ` ${a.building}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Shipment details */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base">Відправлення</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-3">
            <div>
              <Label>Вид відправлення <FieldHint text="Виберіть тип: Посилки та вантажі, Документи, або Шини та диски. За замовчуванням — Посилки та вантажі." /></Label>
              <Select value={shipmentType} onValueChange={(v) => handleShipmentTypeChange(v ?? 'parcels_cargo')}>
                <SelectTrigger><SelectValue>{SHIPMENT_LABELS[shipmentType]}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="parcels_cargo">Посилки та вантажі</SelectItem>
                  <SelectItem value="documents">Документи</SelectItem>
                  <SelectItem value="tires_wheels">Шини та диски</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {shipmentType === 'parcels_cargo' && (
              <div>
                <Label>Опис відправлення <FieldHint text="Опишіть що саме відправляється: побутові речі, продукти харчування, будівельні матеріали тощо. Почніть вводити — з'являться раніше використані описи." /></Label>
                <DescriptionAutocomplete
                  value={description}
                  onChange={setDescription}
                  placeholder="Побутові речі, продукти..."
                />
              </div>
            )}
            <div>
              <Label>Оголошена вартість (EUR) <FieldHint text="Загальна вартість відправлення, оголошена Відправником. Використовується для розрахунку страхування." /></Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={declaredValue}
                onChange={(e) => setDeclaredValue(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </CardContent>
        </Card>

        {/* Places */}
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Параметри відправлення <FieldHint text="Введіть загальні параметри (вага+об'єм+кількість місць) або детально по кожному місцю." />
              </CardTitle>
              {!useGeneralParams && (
                <Button type="button" variant="outline" size="sm" onClick={addPlace} disabled={places.length >= 10}>
                  + Додати місце
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-3">
            {/* Toggle: general vs detailed */}
            <div className="flex items-center gap-2">
              <Checkbox checked={useGeneralParams} onCheckedChange={(c) => setUseGeneralParams(c === true)} />
              <Label className="text-sm">Загальні параметри <FieldHint text="Відмітьте для введення загальної ваги, об'єму та кількості місць замість детальних параметрів кожного місця." /></Label>
            </div>

            {useGeneralParams ? (
              /* General params mode */
              <div className="border rounded-lg p-3 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Загальна вага (кг)</Label>
                    <Input type="number" step="0.01" min="0" value={generalWeight} onChange={(e) => setGeneralWeight(e.target.value)} className="text-base" />
                  </div>
                  <div>
                    <Label className="text-xs">Загальний об&apos;єм (м&sup3;)</Label>
                    <Input type="number" step="0.001" min="0" value={generalVolume} onChange={(e) => setGeneralVolume(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Кількість місць</Label>
                    <Input type="number" step="1" min="1" max="10" value={generalPlaces} onChange={(e) => setGeneralPlaces(e.target.value)} />
                  </div>
                </div>
                {Number(generalVolume) > 0 && (
                  <div className="text-xs text-gray-500">
                    Об&apos;ємна вага: <span className="font-medium">{(Number(generalVolume) * 250).toFixed(2)} кг</span> (об&apos;єм &times; 250)
                  </div>
                )}
              </div>
            ) : (
              /* Detailed per-place mode */
              <>
                {places.map((place, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Місце {i + 1}</span>
                      <div className="flex gap-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => copyPlace(i)} title="Копіювати місце">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </Button>
                        {places.length > 1 && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => removePlace(i)} className="text-red-500 hover:text-red-700">
                            &times;
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div>
                        <Label className="text-xs">Вага (кг)</Label>
                        <Input type="number" step="0.01" min="0" value={place.weight} onChange={(e) => updatePlace(i, 'weight', e.target.value)} className="text-base" />
                      </div>
                      <div>
                        <Label className="text-xs">Довжина (см)</Label>
                        <Input type="number" step="1" min="0" value={place.length} onChange={(e) => updatePlace(i, 'length', e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">Ширина (см)</Label>
                        <Input type="number" step="1" min="0" value={place.width} onChange={(e) => updatePlace(i, 'width', e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">Висота (см)</Label>
                        <Input type="number" step="1" min="0" value={place.height} onChange={(e) => updatePlace(i, 'height', e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Або об&apos;єм (м&sup3;) <FieldHint text="Якщо об'єм відомий, можна ввести його напряму замість довжини/ширини/висоти." /></Label>
                      <Input type="number" step="0.001" min="0" value={place.volume} onChange={(e) => updatePlace(i, 'volume', e.target.value)} className="w-40" />
                    </div>
                    {(calcVolWeight(place) > 0 || Number(place.volume) > 0) && (
                      <div className="text-xs text-gray-500">
                        Об&apos;ємна вага: <span className="font-medium">
                          {calcVolWeight(place) > 0 ? calcVolWeight(place) : (Number(place.volume) * 250).toFixed(2)} кг
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Checkbox checked={place.needsPackaging} onCheckedChange={(checked) => updatePlace(i, 'needsPackaging', checked === true)} />
                      <Label className="text-sm">Потребує пакування <FieldHint text="Відмітьте, якщо пакунок не є у коробці, не є паралелепіпедом, або не має плаского дна. Послуга платна." /></Label>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Totals */}
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <div className="flex justify-between">
                <span>Фактична вага:</span>
                <span className="font-medium">{totalWeight.toFixed(2)} кг</span>
              </div>
              {totalVolWeight > 0 && (
                <div className="flex justify-between">
                  <span>Об&apos;ємна вага:</span>
                  <span className="font-medium">{totalVolWeight.toFixed(2)} кг</span>
                </div>
              )}
              <div className="flex justify-between font-medium border-t mt-1 pt-1">
                <span>Розрахункова вага:</span>
                <span>{Math.max(totalWeight, totalVolWeight).toFixed(2)} кг</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base">Оплата</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-3">
            <div>
              <Label>Платник за доставку <FieldHint text="Хто оплачує доставку — Відправник чи Отримувач." /></Label>
              <Select value={payer} onValueChange={(v) => setPayer(v ?? '')}>
                <SelectTrigger><SelectValue>{PAYER_LABELS[payer]}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sender">Відправник</SelectItem>
                  <SelectItem value="receiver">Отримувач</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Форма оплати</Label>
              <Select value={paymentMethod} onValueChange={(v) => handlePaymentMethodChange(v ?? '')}>
                <SelectTrigger><SelectValue>{PAYMENT_LABELS[paymentMethod]}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Готівка</SelectItem>
                  <SelectItem value="cashless">Безготівка</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={paymentInUkraine}
                onCheckedChange={(c) => handlePaymentInUkraineChange(c === true)}
              />
              <Label className="text-sm">Оплата в Україні <FieldHint text="Якщо оплата в Україні — автоматично встановлюється безготівковий розрахунок. І навпаки." /></Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={needsPackaging}
                onCheckedChange={(c) => setNeedsPackaging(c === true)}
              />
              <Label className="text-sm">Потребує пакування</Label>
            </div>
          </CardContent>
        </Card>

        {/* Trip date */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base">Дата рейсу</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-2">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="tripDate" value="nearest_nl" checked={tripDateMode === 'nearest_nl'}
                  onChange={() => { setTripDateMode('nearest_nl'); const t = trips.find(t => t.country === 'NL' && t.direction === direction); if (t) setSelectedTripId(t.id); }} />
                Найближчий рейс до Нідерландів
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="tripDate" value="nearest_at" checked={tripDateMode === 'nearest_at'}
                  onChange={() => { setTripDateMode('nearest_at'); const t = trips.find(t => t.country === 'AT' && t.direction === direction); if (t) setSelectedTripId(t.id); }} />
                Найближчий рейс до Австрії
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="tripDate" value="custom" checked={tripDateMode === 'custom'}
                  onChange={() => setTripDateMode('custom')} />
                Інше
              </label>
              {tripDateMode === 'custom' && (
                <Input type="date" value={customTripDate} onChange={(e) => setCustomTripDate(e.target.value)} className="w-44" />
              )}
              <label className="flex items-center gap-2 text-sm text-gray-500">
                <input type="radio" name="tripDate" value="none" checked={tripDateMode === 'none'}
                  onChange={() => { setTripDateMode('none'); setSelectedTripId(''); }} />
                Не вказувати
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Cost calculation */}
        <CostCalculator
          direction={direction}
          senderCountry={sender?.country || sender?.addresses[0]?.country || null}
          receiverCountry={receiver?.addresses[0]?.country || null}
          actualWeight={totalWeight}
          volumetricWeight={totalVolWeight}
          declaredValue={Number(declaredValue) || 0}
          needsPackaging={needsPackaging || places.some(p => p.needsPackaging)}
          isAddressDelivery={receiver?.addresses[0]?.deliveryMethod === 'address'}
        />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full h-12 text-base" disabled={saving}>
          {saving ? 'Створення...' : 'Створити відправлення'}
        </Button>
      </form>
    </div>
  );
}
