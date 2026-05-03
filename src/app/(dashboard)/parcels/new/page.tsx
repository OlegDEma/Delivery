'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
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
import { CapitalizeInput } from '@/components/shared/capitalize-input';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import { cn } from '@/lib/utils';
import { TripSelector, type TripOption } from '@/components/parcels/trip-selector';
import { CollectionBlock, type CollectionState } from '@/components/parcels/collection-block';
import { AddressEditor } from '@/components/parcels/address-editor';
import { PhoneInput } from '@/components/shared/phone-input';

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

  // Load repeat data if ?repeat=parcelId
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const repeatId = params.get('repeat');
    if (!repeatId) return;

    fetch(`/api/parcels/${repeatId}`).then(r => r.ok ? r.json() : null).then(data => {
      if (!data) return;
      setDirection(data.direction);
      setShipmentType(data.shipmentType);
      setDescription(data.description || '');
      setPayer(data.payer);
      setPaymentMethod(data.paymentMethod);
      setPaymentInUkraine(data.paymentInUkraine);
      // Set sender/receiver from data
      if (data.sender) {
        setSender({
          id: data.sender.id, phone: data.sender.phone,
          firstName: data.sender.firstName, lastName: data.sender.lastName,
          middleName: null, country: null, addresses: data.sender.addresses || [],
        });
      }
      if (data.receiver) {
        setReceiver({
          id: data.receiver.id, phone: data.receiver.phone,
          firstName: data.receiver.firstName, lastName: data.receiver.lastName,
          middleName: null, country: null, addresses: data.receiver.addresses || [],
        });
        if (data.receiverAddressId) setReceiverAddressId(data.receiverAddressId);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Receiver (first, as per TZ)
  const [receiver, setReceiver] = useState<SelectedClient | null>(null);
  const [receiverAddressId, setReceiverAddressId] = useState<string>('');
  const [recvDeliveryMethod, setRecvDeliveryMethod] = useState<string>('address');
  const [recvPostalCode, setRecvPostalCode] = useState('');
  const [recvCity, setRecvCity] = useState('');
  const [recvStreet, setRecvStreet] = useState('');
  const [recvBuilding, setRecvBuilding] = useState('');
  const [recvNpWarehouse, setRecvNpWarehouse] = useState('');
  const [recvLandmark, setRecvLandmark] = useState('');
  const [recvPickupPointText, setRecvPickupPointText] = useState('');
  const [recvPhoneOverride, setRecvPhoneOverride] = useState('');

  // Sender
  const [sender, setSender] = useState<SelectedClient | null>(null);
  const [senderAddressId, setSenderAddressId] = useState<string>('');
  const [senderDeliveryMethod, setSenderDeliveryMethod] = useState<string>('address');
  const [senderPostalCode, setSenderPostalCode] = useState('');
  const [senderCity, setSenderCity] = useState('');
  const [senderStreet, setSenderStreet] = useState('');
  const [senderBuilding, setSenderBuilding] = useState('');
  const [senderNpWarehouse, setSenderNpWarehouse] = useState('');
  const [senderLandmark, setSenderLandmark] = useState('');
  const [senderPickupPointText, setSenderPickupPointText] = useState('');
  const [senderPhoneOverride, setSenderPhoneOverride] = useState('');

  // Parcel details — last selected direction is persisted per-browser (per ТЗ).
  // Read localStorage AFTER mount to avoid SSR/CSR hydration mismatch
  // (server has no window, so first render must use the static default).
  const [direction, setDirection] = useState<string>('eu_to_ua');
  useEffect(() => {
    const stored = window.localStorage.getItem('parcel:lastDirection');
    if (stored && stored !== direction) setDirection(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    window.localStorage.setItem('parcel:lastDirection', direction);
  }, [direction]);
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
  const [insurance, setInsurance] = useState(false);

  // Currency for declared value depends on sender's country (UA → грн, EU → €).
  const senderCountry = sender?.country || sender?.addresses[0]?.country || null;
  const declaredCurrency = senderCountry === 'UA' ? 'UAH' : 'EUR';
  const declaredCurrencyLabel = senderCountry === 'UA' ? 'грн' : 'EUR';
  const insuranceCost = insurance ? Number((Number(declaredValue) * 0.03).toFixed(2)) : 0;

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
  // Send invoice via SMS — per ТЗ: «на телефонний номер Платника за доставку
  // відправляється повідомлення». Phone defaults to payer's stored phone.
  const [sendInvoice, setSendInvoice] = useState(false);
  const [invoicePhone, setInvoicePhone] = useState('');

  // Trip date
  const [tripDateMode, setTripDateMode] = useState<string>('trip'); // 'trip' | 'custom'
  const [trips, setTrips] = useState<TripOption[]>([]);
  const [selectedTripId, setSelectedTripId] = useState('');

  // Collection (EU→UA only): how we receive the parcel
  const [collection, setCollection] = useState<CollectionState>({
    method: '',
    pointId: '',
    date: '',
    address: '',
  });

  useEffect(() => {
    fetch('/api/trips').then(r => r.ok ? r.json() : []).then(setTrips);
  }, []);

  // Clear selected trip if direction no longer matches
  useEffect(() => {
    if (!selectedTripId) return;
    const selected = trips.find(t => t.id === selectedTripId);
    if (selected && selected.direction !== direction) {
      setSelectedTripId('');
    }
  }, [direction, selectedTripId, trips]);

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

  // Auto-select last-used address (sorted by API by role+date) and fill editable fields
  function handleReceiverSelect(client: SelectedClient) {
    setReceiver(client);
    const addr = client.addresses[0] as (typeof client.addresses)[number] & { pickupPointText?: string | null } | undefined;
    if (addr) {
      setReceiverAddressId(addr.id);
      setRecvDeliveryMethod(addr.deliveryMethod || 'address');
      setRecvPostalCode(addr.postalCode || '');
      setRecvCity(addr.city || '');
      setRecvStreet(addr.street || '');
      setRecvBuilding(addr.building || '');
      setRecvNpWarehouse(addr.npWarehouseNum || '');
      setRecvLandmark(addr.landmark || '');
      setRecvPickupPointText(addr.pickupPointText || '');
    } else {
      setRecvPostalCode(''); setRecvCity(''); setRecvStreet(''); setRecvBuilding(''); setRecvNpWarehouse(''); setRecvLandmark(''); setRecvPickupPointText('');
    }
  }

  function handleSenderSelect(client: SelectedClient) {
    setSender(client);
    const addr = client.addresses[0] as (typeof client.addresses)[number] & { pickupPointText?: string | null } | undefined;
    if (addr) {
      setSenderAddressId(addr.id);
      setSenderDeliveryMethod(addr.deliveryMethod || 'address');
      setSenderPostalCode(addr.postalCode || '');
      setSenderCity(addr.city || '');
      setSenderStreet(addr.street || '');
      setSenderBuilding(addr.building || '');
      setSenderNpWarehouse(addr.npWarehouseNum || '');
      setSenderLandmark(addr.landmark || '');
      setSenderPickupPointText(addr.pickupPointText || '');
    } else {
      setSenderPostalCode(''); setSenderCity(''); setSenderStreet(''); setSenderBuilding(''); setSenderNpWarehouse(''); setSenderLandmark(''); setSenderPickupPointText('');
    }
  }

  // Per ТЗ: Cashless is allowed in any country (UA or EU, both in UAH);
  // only constraint is «Готівка неможлива у випадку оплати в Україні».
  // So: Cashless does NOT force "Оплата в Україні" anymore;
  // but ticking "Оплата в Україні" forces Cashless.
  function handlePaymentMethodChange(val: string) {
    if (val === 'cash' && paymentInUkraine) {
      // Cash impossible if payment is in UA — reject.
      return;
    }
    setPaymentMethod(val);
  }
  function handlePaymentInUkraineChange(checked: boolean) {
    setPaymentInUkraine(checked);
    if (checked) setPaymentMethod('cashless');
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

    if (tripDateMode === 'trip' && !selectedTripId) {
      setError('Виберіть рейс зі списку або натисніть «Без рейсу»');
      return;
    }

    setSaving(true);

    const res = await fetch('/api/parcels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receiverId: receiver.id,
        receiverPhoneOverride: recvPhoneOverride || undefined,
        senderPhoneOverride: senderPhoneOverride || undefined,
        receiverAddressId: receiverAddressId || undefined,
        // Inline-edited fields — backend updates the linked address (or creates
        // a new one if no addressId yet). Per ТЗ: «завжди зберігаємо і
        // оновлюємо останній адрес».
        receiverAddress: {
          country: receiver.addresses[0]?.country || (direction === 'eu_to_ua' ? 'UA' : null),
          deliveryMethod: recvDeliveryMethod,
          postalCode: recvPostalCode || undefined,
          city: recvCity || undefined,
          street: recvStreet || undefined,
          building: recvBuilding || undefined,
          landmark: recvLandmark || undefined,
          npWarehouseNum: recvDeliveryMethod === 'np_warehouse' ? (recvNpWarehouse || undefined) : undefined,
          pickupPointText: recvDeliveryMethod === 'pickup_point' ? (recvPickupPointText || undefined) : undefined,
        },
        senderId: sender.id,
        senderAddressId: senderAddressId || undefined,
        senderAddress: {
          country: sender.addresses[0]?.country || (direction === 'ua_to_eu' ? 'UA' : null),
          deliveryMethod: senderDeliveryMethod,
          postalCode: senderPostalCode || undefined,
          city: senderCity || undefined,
          street: senderStreet || undefined,
          building: senderBuilding || undefined,
          landmark: senderLandmark || undefined,
          npWarehouseNum: senderDeliveryMethod === 'np_warehouse' ? (senderNpWarehouse || undefined) : undefined,
          pickupPointText: senderDeliveryMethod === 'pickup_point' ? (senderPickupPointText || undefined) : undefined,
        },
        direction,
        shipmentType,
        description: description || undefined,
        declaredValue: declaredValue ? Number(declaredValue) : undefined,
        declaredValueCurrency: declaredCurrency,
        insurance,
        insuranceCost: insurance ? insuranceCost : 0,
        payer,
        paymentMethod,
        paymentInUkraine,
        needsPackaging,
        sendInvoice,
        invoicePhone: sendInvoice && invoicePhone ? invoicePhone : undefined,
        tripId: selectedTripId || undefined,
        // Collection (EU→UA only — server ignores otherwise)
        collectionMethod: direction === 'eu_to_ua' && collection.method ? collection.method : undefined,
        collectionPointId: collection.method === 'pickup_point' ? collection.pointId || undefined : undefined,
        collectionDate: collection.date || undefined,
        collectionAddress: collection.method === 'courier_pickup' ? collection.address || undefined : undefined,
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
      toast.success('Посилку створено');
      router.push(`/parcels/${parcel.id}`);
    } else {
      const data = await res.json();
      const msg = data.error || 'Помилка створення';
      setError(msg);
      toast.error(msg);
    }
    setSaving(false);
  }

  const DIRECTION_LABELS: Record<string, string> = { eu_to_ua: 'Європа → Україна', ua_to_eu: 'Україна → Європа' };
  const SHIPMENT_LABELS: Record<string, string> = { parcels_cargo: 'Посилки та вантажі', documents: 'Документи', tires_wheels: 'Шини та диски' };
  const PAYER_LABELS: Record<string, string> = { sender: 'Відправник', receiver: 'Отримувач' };
  const PAYMENT_LABELS: Record<string, string> = { cash: 'Готівка', cashless: 'Безготівка' };

  return (
    <div className="max-w-2xl">
      <Breadcrumbs items={[{label: 'Посилки', href: '/parcels'}, {label: 'Нова посилка'}]} />
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
              onClear={() => { setReceiver(null); setReceiverAddressId(''); setRecvPostalCode(''); setRecvCity(''); setRecvStreet(''); setRecvBuilding(''); setRecvNpWarehouse(''); setRecvLandmark(''); setRecvPickupPointText(''); setRecvDeliveryMethod('address'); }}
              selected={receiver}
              direction={direction as 'eu_to_ua' | 'ua_to_eu'}
              role="receiver"
              onPhoneEdit={(p) => {
                setRecvPhoneOverride(p);
                if (receiver) setReceiver({ ...receiver, phone: p });
              }}
            />
            {/* Editable address fields — auto-filled from last parcel, can be changed */}
            {receiver && (
              <div className="border-t pt-2 mt-2 space-y-2">
                {receiver.addresses.length > 1 && (
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-gray-500 font-medium">Інша адреса з історії</Label>
                    <Select value={receiverAddressId} onValueChange={(v) => {
                      const addr = receiver.addresses.find(a => a.id === (v ?? '')) as
                        (typeof receiver.addresses)[number] & { pickupPointText?: string | null } | undefined;
                      if (addr) {
                        setReceiverAddressId(addr.id);
                        setRecvDeliveryMethod(addr.deliveryMethod || 'address');
                        setRecvPostalCode(addr.postalCode || '');
                        setRecvCity(addr.city || '');
                        setRecvStreet(addr.street || '');
                        setRecvBuilding(addr.building || '');
                        setRecvNpWarehouse(addr.npWarehouseNum || '');
                        setRecvLandmark(addr.landmark || '');
                        setRecvPickupPointText(addr.pickupPointText || '');
                      }
                    }}>
                      <SelectTrigger className="h-7 text-xs w-48">
                        <SelectValue>{receiver.addresses.find(a => a.id === receiverAddressId)?.city || 'Інша адреса'}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {receiver.addresses.map(a => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.city}{a.npWarehouseNum ? ` НП ${a.npWarehouseNum}` : ''}{a.street ? `, ${a.street}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <AddressEditor
                  cityPlaceholder="Львів"
                  state={{
                    deliveryMethod: recvDeliveryMethod,
                    postalCode: recvPostalCode,
                    city: recvCity,
                    street: recvStreet,
                    building: recvBuilding,
                    landmark: recvLandmark,
                    npWarehouseNum: recvNpWarehouse,
                    pickupPointText: recvPickupPointText,
                  }}
                  onChange={(p) => {
                    if (p.deliveryMethod !== undefined) setRecvDeliveryMethod(p.deliveryMethod);
                    if (p.postalCode !== undefined) setRecvPostalCode(p.postalCode);
                    if (p.city !== undefined) setRecvCity(p.city);
                    if (p.street !== undefined) setRecvStreet(p.street);
                    if (p.building !== undefined) setRecvBuilding(p.building);
                    if (p.landmark !== undefined) setRecvLandmark(p.landmark);
                    if (p.npWarehouseNum !== undefined) setRecvNpWarehouse(p.npWarehouseNum);
                    if (p.pickupPointText !== undefined) setRecvPickupPointText(p.pickupPointText);
                  }}
                />
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
              onClear={() => { setSender(null); setSenderAddressId(''); setSenderPostalCode(''); setSenderCity(''); setSenderStreet(''); setSenderBuilding(''); setSenderNpWarehouse(''); setSenderLandmark(''); setSenderPickupPointText(''); setSenderDeliveryMethod('address'); }}
              selected={sender}
              direction={direction as 'eu_to_ua' | 'ua_to_eu'}
              role="sender"
              onPhoneEdit={(p) => {
                setSenderPhoneOverride(p);
                if (sender) setSender({ ...sender, phone: p });
              }}
            />
            {sender && (
              <div className="border-t pt-2 mt-2 space-y-2">
                <AddressEditor
                  title="Адреса відправника"
                  cityPlaceholder="Амстердам"
                  state={{
                    deliveryMethod: senderDeliveryMethod,
                    postalCode: senderPostalCode,
                    city: senderCity,
                    street: senderStreet,
                    building: senderBuilding,
                    landmark: senderLandmark,
                    npWarehouseNum: senderNpWarehouse,
                    pickupPointText: senderPickupPointText,
                  }}
                  onChange={(p) => {
                    if (p.deliveryMethod !== undefined) setSenderDeliveryMethod(p.deliveryMethod);
                    if (p.postalCode !== undefined) setSenderPostalCode(p.postalCode);
                    if (p.city !== undefined) setSenderCity(p.city);
                    if (p.street !== undefined) setSenderStreet(p.street);
                    if (p.building !== undefined) setSenderBuilding(p.building);
                    if (p.landmark !== undefined) setSenderLandmark(p.landmark);
                    if (p.npWarehouseNum !== undefined) setSenderNpWarehouse(p.npWarehouseNum);
                    if (p.pickupPointText !== undefined) setSenderPickupPointText(p.pickupPointText);
                  }}
                />
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
              <Label>
                Оголошена вартість ({declaredCurrencyLabel}){' '}
                <FieldHint text="Загальна вартість відправлення, оголошена Відправником. Валюта залежить від країни Відправника: Україна → грн, ЄС → EUR. Використовується для розрахунку страхування." />
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={declaredValue}
                onChange={(e) => setDeclaredValue(e.target.value)}
                placeholder="0.00"
              />
            </div>

            {/* Insurance (per ТЗ) */}
            <div className="rounded-lg border p-3 bg-gray-50">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="insurance-cb"
                  checked={insurance}
                  onCheckedChange={(c) => setInsurance(c === true)}
                />
                <Label htmlFor="insurance-cb" className="text-sm font-medium cursor-pointer">
                  Страхування (3% від оголошеної вартості)
                </Label>
              </div>
              <div className="mt-2 text-sm">
                {insurance ? (
                  Number(declaredValue) > 0 ? (
                    <div className="text-green-700">
                      Застраховано на <span className="font-semibold">{Number(declaredValue).toFixed(2)} {declaredCurrencyLabel}</span>.
                      Страхування: <span className="font-semibold">{insuranceCost.toFixed(2)} {declaredCurrencyLabel}</span>
                    </div>
                  ) : (
                    <div className="text-amber-700">Вкажіть оголошену вартість, щоб розрахувати страхування</div>
                  )
                ) : (
                  <div className="text-gray-500">Не застраховано</div>
                )}
              </div>
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
              <Label className="text-sm">
                Оплата в Україні{' '}
                <FieldHint text="Якщо оплата в Україні — примусово встановлюється Безготівка (готівка в Україні неможлива). Безготівка ж доступна як в Україні, так і в Європі — в обох випадках у гривнях." />
              </Label>
            </div>
            {/* Per ТЗ: «Поле "Потребує пакування" забрати. Воно присутнє у
                вкладці "Параметри відправлення".» */}

            {/* Send invoice (per ТЗ) */}
            <div className="rounded-lg border p-3 bg-gray-50 space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="send-invoice-cb"
                  checked={sendInvoice}
                  onCheckedChange={(c) => setSendInvoice(c === true)}
                />
                <Label htmlFor="send-invoice-cb" className="text-sm font-medium cursor-pointer">
                  Відправити рахунок{' '}
                  <FieldHint text="Надіслати SMS з реквізитами банку та сумою оплати на телефон Платника." />
                </Label>
              </div>
              {sendInvoice && (
                <div>
                  <Label className="text-xs">Телефон Платника (за замовч. — телефон вибраного платника)</Label>
                  <PhoneInput
                    value={invoicePhone}
                    onChange={setInvoicePhone}
                    defaultCountry="UA"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Collection method — EU→UA only */}
        {direction === 'eu_to_ua' && (
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-base">Спосіб прийому посилки</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <CollectionBlock
                senderCountry={sender?.country || sender?.addresses[0]?.country || null}
                value={collection}
                onChange={setCollection}
              />
            </CardContent>
          </Card>
        )}

        {/* Trip selection */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base">
              Рейс {direction === 'eu_to_ua' ? 'Європа → Україна' : 'Україна → Європа'}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-3">
            {tripDateMode === 'trip' && (
              <TripSelector
                trips={trips}
                direction={direction}
                selectedTripId={selectedTripId}
                onChange={setSelectedTripId}
                allowNone={false}
              />
            )}

            {tripDateMode === 'custom' && (
              <div className="text-sm text-gray-600 bg-amber-50 rounded-lg p-3 border border-amber-200">
                ⚠️ Посилка буде створена без рейсу. Ви зможете прив&apos;язати її до рейсу пізніше в деталях посилки.
              </div>
            )}

            <div className="flex gap-2 pt-1 border-t">
              <button
                type="button"
                onClick={() => { setTripDateMode('trip'); }}
                className={cn(
                  'text-xs px-2 py-1 rounded border transition-colors',
                  tripDateMode === 'trip'
                    ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                )}
              >
                Вибрати зі списку рейсів
              </button>
              <button
                type="button"
                onClick={() => { setTripDateMode('custom'); setSelectedTripId(''); }}
                className={cn(
                  'text-xs px-2 py-1 rounded border transition-colors',
                  tripDateMode === 'custom'
                    ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                )}
              >
                Без рейсу
              </button>
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
          insuranceEnabled={insurance}
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
