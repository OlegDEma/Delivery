'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DescriptionAutocomplete } from '@/components/parcels/description-autocomplete';
import { CostCalculator } from '@/components/parcels/cost-calculator';
import { FieldHint } from '@/components/shared/field-hint';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import { TripSelector, type TripOption } from '@/components/parcels/trip-selector';
import { CollectionBlock, type CollectionState } from '@/components/parcels/collection-block';
import { formatWorkingDays, type Weekday } from '@/lib/constants/collection';
import { PhoneInput } from '@/components/shared/phone-input';
import { getBillableWeight } from '@/lib/utils/volumetric';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';

/**
 * Редагування існуючої посилки. Зроблено по докс-багу від 03.06.2026:
 * «При натисканні кнопки 'Редагувати' відкривається форма створення посилки
 * зі всіма полями і зі всіма вікнами, але з введеними при створенні посилки
 * даними». А також:
 *  - "Перекреслене забрати з форми редагування" → блок «Розрахунок вартості»
 *    і per-card кнопок «Зберегти» в режимі редагування немає (він іде
 *    в самому низу як в формі створення).
 *  - "Кнопка 'Збереження' має бути в самому низу і заміняти собою при
 *    редагуванні кнопку 'Створити відправлення'" → внизу одна кнопка
 *    «Зберегти».
 *
 * Сторони (Отримувач/Відправник) показуються READ-ONLY — їхні поля
 * редагуються окремо через кнопку-олівець на сторінці посилки
 * (`ParcelPartyEdit`), бо PATCH /api/parcels/[id] не змінює власне
 * посилання на клієнтів. Це чесне обмеження — повідомляємо у формі.
 */

interface PlaceDraft {
  id?: string;
  weight: string;
  length: string;
  width: string;
  height: string;
  volume: string;
  needsPackaging: boolean;
}

const emptyPlace = (): PlaceDraft => ({
  weight: '', length: '', width: '', height: '', volume: '', needsPackaging: false,
});

function calcVolWeight(p: PlaceDraft): number {
  const l = Number(p.length) || 0;
  const w = Number(p.width) || 0;
  const h = Number(p.height) || 0;
  if (l > 0 && w > 0 && h > 0) return Number(((l * w * h) / 4000).toFixed(2));
  return 0;
}

interface ParcelData {
  id: string;
  internalNumber: string;
  direction: string;
  shipmentType: string;
  description: string | null;
  declaredValue: number | string | null;
  declaredValueCurrency: string | null;
  insuranceApplied: boolean;
  needsPackaging: boolean;
  doorstepDelivery: boolean;
  parcelMoneyAmount: number | string | null;
  payer: string;
  paymentMethod: string;
  paymentInUkraine: boolean;
  collectionMethod: string | null;
  collectionPointId: string | null;
  /** ТЗ docx 01.07.26: обраний пункт збору — щоб показати ЛИШЕ його (адреса+індекс). */
  collectionPoint: {
    id: string; name: string | null; country: string; city: string; address: string;
    postalCode: string | null; workingHours: string | null; workingDays: string[];
  } | null;
  collectionDate: string | null;
  collectionAddress: string | null;
  isMultiParcelPickup: boolean | null;
  trip: { id: string; departureDate: string; country: string } | null;
  sender: { id: string; firstName: string; lastName: string; phone: string; country?: string | null };
  senderAddress: {
    id: string; country: string | null; city: string;
    street: string | null; building: string | null; postalCode: string | null; deliveryMethod: string;
  } | null;
  receiver: { id: string; firstName: string; lastName: string; phone: string };
  receiverAddress: {
    id: string; country: string; city: string;
    street: string | null; building: string | null; postalCode: string | null; npWarehouseNum: string | null;
    deliveryMethod: string;
  } | null;
  places: {
    id: string; placeNumber: number;
    weight: number | string | null; length: number | string | null;
    width: number | string | null; height: number | string | null;
    volume?: number | string | null;
    volumetricWeight: number | string | null; needsPackaging: boolean;
  }[];
}

type PricingRule = { country: string; direction: string; weightType: 'actual'|'volumetric'|'average'|'custom'; weightCustomFactualFraction?: number };

export default function EditParcelPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [parcel, setParcel] = useState<ParcelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Editable state
  const [shipmentType, setShipmentType] = useState('parcels_cargo');
  const [description, setDescription] = useState('');
  const [declaredValue, setDeclaredValue] = useState('');
  const [insurance, setInsurance] = useState(false);
  const [needsPackaging, setNeedsPackaging] = useState(false);
  // ТЗ docx 01.07.26: opt-in «Доставка до порога будинку».
  const [doorstepDelivery, setDoorstepDelivery] = useState(false);
  // ТЗ docx 01.07.26: при відкритті показуємо ЛИШЕ обраний пункт; «Змінити» відкриє список.
  const [changePickup, setChangePickup] = useState(false);
  const [parcelMoneyEnabled, setParcelMoneyEnabled] = useState(false);
  const [parcelMoneyAmount, setParcelMoneyAmount] = useState('');
  const [payer, setPayer] = useState('sender');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentInUkraine, setPaymentInUkraine] = useState(false);
  const [sendInvoice, setSendInvoice] = useState(false);
  const [invoicePhone, setInvoicePhone] = useState('');

  // General params toggle (UI-only — backend завжди приймає places).
  const [useGeneralParams, setUseGeneralParams] = useState(false);
  const [generalWeight, setGeneralWeight] = useState('');
  const [generalVolume, setGeneralVolume] = useState('');
  const [generalPlaces, setGeneralPlaces] = useState('1');

  const [places, setPlaces] = useState<PlaceDraft[]>([emptyPlace()]);

  const [collection, setCollection] = useState<CollectionState>({
    method: '', pointId: '', date: '', address: '', isMultiParcelPickup: null,
  });

  const [trips, setTrips] = useState<TripOption[]>([]);
  const [selectedTripId, setSelectedTripId] = useState('');
  const [pricingConfigs, setPricingConfigs] = useState<PricingRule[]>([]);

  // Initial fetch — parcel, trips, pricing configs.
  useEffect(() => {
    Promise.all([
      fetch(`/api/parcels/${id}`).then(r => r.ok ? r.json() : null),
      fetch('/api/trips').then(r => r.ok ? r.json() : []),
      fetch('/api/pricing').then(r => r.ok ? r.json() : []),
    ]).then(([p, t, pc]: [ParcelData | null, TripOption[], PricingRule[]]) => {
      if (!p) {
        setError('Посилку не знайдено');
        setLoading(false);
        return;
      }
      setParcel(p);
      setTrips(t || []);
      setPricingConfigs(pc || []);

      // Hydrate editable state from parcel.
      setShipmentType(p.shipmentType || 'parcels_cargo');
      setDescription(p.description || '');
      setDeclaredValue(p.declaredValue != null ? String(p.declaredValue) : '');
      setInsurance(!!p.insuranceApplied);
      setNeedsPackaging(!!p.needsPackaging);
      setDoorstepDelivery(!!p.doorstepDelivery);
      const pmAmt = p.parcelMoneyAmount != null ? Number(p.parcelMoneyAmount) : 0;
      setParcelMoneyEnabled(pmAmt > 0);
      setParcelMoneyAmount(pmAmt > 0 ? String(pmAmt) : '');
      setPayer(p.payer || 'sender');
      setPaymentMethod(p.paymentMethod || 'cash');
      setPaymentInUkraine(!!p.paymentInUkraine);
      setPlaces(p.places.length
        ? p.places.map(pl => ({
            id: pl.id,
            weight: pl.weight != null ? String(pl.weight) : '',
            length: pl.length != null ? String(pl.length) : '',
            width: pl.width != null ? String(pl.width) : '',
            height: pl.height != null ? String(pl.height) : '',
            volume: pl.volume != null ? String(pl.volume) : '',
            needsPackaging: !!pl.needsPackaging,
          }))
        : [emptyPlace()]);
      setCollection({
        method: (p.collectionMethod || '') as CollectionState['method'],
        pointId: p.collectionPointId || '',
        date: p.collectionDate ? String(p.collectionDate).slice(0, 10) : '',
        address: p.collectionAddress || '',
        isMultiParcelPickup: p.isMultiParcelPickup,
      });
      setSelectedTripId(p.trip?.id || '');
      setLoading(false);
    }).catch(() => {
      setError('Помилка завантаження');
      setLoading(false);
    });
  }, [id]);

  function handleShipmentTypeChange(val: string) {
    setShipmentType(val);
    if (val === 'documents') setDescription('Документи');
    else if (val === 'tires_wheels') setDescription('Шини та диски');
    else if (description === 'Документи' || description === 'Шини та диски') setDescription('');
  }
  function handlePaymentMethodChange(val: string) {
    if (val === 'cash' && paymentInUkraine) return;
    setPaymentMethod(val);
  }
  function handlePaymentInUkraineChange(checked: boolean) {
    setPaymentInUkraine(checked);
    if (checked) setPaymentMethod('cashless');
  }

  function addPlace() {
    if (places.length >= 10) return;
    setPlaces([...places, emptyPlace()]);
  }
  function copyPlace(i: number) {
    if (places.length >= 10) return;
    setPlaces([...places, { ...places[i], id: undefined }]);
  }
  function removePlace(i: number) {
    if (places.length <= 1) return;
    setPlaces(places.filter((_, idx) => idx !== i));
  }
  function updatePlace(i: number, field: keyof PlaceDraft, value: string | boolean) {
    const u = [...places];
    u[i] = { ...u[i], [field]: value };
    setPlaces(u);
  }

  const direction = parcel?.direction || 'eu_to_ua';
  const senderCountry =
    parcel?.sender?.country
    || parcel?.senderAddress?.country
    || (direction === 'eu_to_ua'
      ? (() => {
          const t = trips.find(tr => tr.id === selectedTripId);
          return t?.country && t.country !== 'UA' ? t.country : null;
        })()
      : null);

  const senderInUA = senderCountry === 'UA' || (!senderCountry && direction === 'ua_to_eu');
  const declaredCurrencyLabel = parcel?.declaredValueCurrency === 'UAH' || senderInUA ? 'грн' : 'EUR';
  const declaredCurrency = (parcel?.declaredValueCurrency || (senderInUA ? 'UAH' : 'EUR')) as 'UAH' | 'EUR';

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
    if (!parcel) return;
    setError('');

    if (useGeneralParams) {
      if (!generalWeight || Number(generalWeight) <= 0) { setError('Вкажіть загальну вагу'); return; }
      if (!generalVolume || Number(generalVolume) <= 0) {
        setError('Вкажіть загальний об\'єм (м³) — об\'ємна вага не може бути нульовою'); return;
      }
    } else {
      if (!places.some(p => Number(p.weight) > 0)) {
        setError('Вкажіть вагу хоча б одного місця'); return;
      }
      // ТЗ (docx 13.06.26): кожне місце з вагою має мати Д/Ш/В АБО об'єм.
      const badPlace = places.findIndex(p => {
        if (Number(p.weight) <= 0) return false;
        const hasDims = Number(p.length) > 0 && Number(p.width) > 0 && Number(p.height) > 0;
        const hasVolume = Number(p.volume) > 0;
        return !hasDims && !hasVolume;
      });
      if (badPlace !== -1) {
        setError(`Місце ${badPlace + 1}: вкажіть довжину/ширину/висоту АБО об'єм (м³) — об'ємна вага не може бути нульовою`);
        return;
      }
    }
    if (!declaredValue || Number(declaredValue) <= 0) {
      setError('Вкажіть оголошену вартість'); return;
    }
    if (
      direction === 'eu_to_ua' &&
      collection.method === 'courier_pickup' &&
      collection.isMultiParcelPickup === null
    ) {
      setError('Оберіть «Одна посилка» або «Дві або більше посилок»'); return;
    }

    setSaving(true);

    // Map places. У PATCH передаємо лише id+поля; нові місця — без id (бекенд
    // ігнорує — додавання нових місць у PATCH не підтримане, але це не
    // блокує редагування існуючих).
    const placesPayload = useGeneralParams
      ? Array.from({ length: Number(generalPlaces) || 1 }, () => ({
          weight: (Number(generalWeight) || 0) / (Number(generalPlaces) || 1),
          length: undefined, width: undefined, height: undefined,
          volume: Number(generalVolume) > 0 ? Number(generalVolume) / (Number(generalPlaces) || 1) : undefined,
        }))
      : places.map(p => ({
          id: p.id,
          weight: Number(p.weight) || 0,
          length: Number(p.length) || undefined,
          width: Number(p.width) || undefined,
          height: Number(p.height) || undefined,
          volume: Number(p.volume) || undefined,
          needsPackaging: p.needsPackaging,
        }));

    const res = await fetch(`/api/parcels/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shipmentType,
        description: description || null,
        declaredValue: declaredValue ? Number(declaredValue) : 0,
        insuranceApplied: insurance,
        needsPackaging,
        doorstepDelivery,
        parcelMoneyAmount:
          parcelMoneyEnabled && Number(parcelMoneyAmount) > 0
            ? Number(parcelMoneyAmount)
            : null,
        payer,
        paymentMethod,
        paymentInUkraine,
        tripId: selectedTripId || null,
        collectionMethod: direction === 'eu_to_ua' && collection.method ? collection.method : null,
        collectionPointId: collection.method === 'pickup_point' ? collection.pointId || null : null,
        collectionDate: collection.date || null,
        collectionAddress: collection.method === 'courier_pickup' ? collection.address || null : null,
        isMultiParcelPickup:
          collection.method === 'courier_pickup' ? !!collection.isMultiParcelPickup : null,
        places: placesPayload,
      }),
    });

    setSaving(false);
    if (res.ok) {
      toast.success('Збережено');
      router.push(`/parcels/${id}`);
    } else {
      const data = await res.json().catch(() => ({}));
      const msg = data.error || 'Помилка збереження';
      setError(msg);
      toast.error(msg);
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Завантаження...</div>;
  if (error && !parcel) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-3">{error}</div>
        <Button variant="outline" onClick={() => router.push(`/parcels/${id}`)}>Назад</Button>
      </div>
    );
  }
  if (!parcel) return null;

  const SHIPMENT_LABELS: Record<string, string> = { parcels_cargo: 'Посилки та вантажі', documents: 'Документи', tires_wheels: 'Шини та диски' };
  const PAYER_LABELS: Record<string, string> = { sender: 'Відправник', receiver: 'Отримувач' };
  const PAYMENT_LABELS: Record<string, string> = { cash: 'Готівка', cashless: 'Безготівка' };

  // Compute Розрахункова вага по правилу тарифу (Bug 5).
  const cfg = pricingConfigs.find(c => c.country === senderCountry && c.direction === direction);
  const weightType = (cfg?.weightType || 'custom') as 'actual'|'volumetric'|'average'|'custom';
  const ffrac = cfg?.weightCustomFactualFraction ?? 0.5;
  const billable = getBillableWeight(totalWeight, totalVolWeight, weightType, ffrac);

  return (
    <div className="max-w-2xl">
      <Breadcrumbs items={[
        { label: 'Посилки', href: '/parcels' },
        { label: parcel.internalNumber, href: `/parcels/${id}` },
        { label: 'Редагувати' },
      ]} />
      <h1 className="text-2xl font-bold mb-4">Редагувати посилку</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Direction — read-only (PATCH не змінює напрямок). */}
        <Card>
          <CardHeader className="py-3 px-4"><CardTitle className="text-base">Напрямок</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 pt-0 text-sm">
            {direction === 'eu_to_ua' ? 'Європа → Україна' : 'Україна → Європа'}
            <div className="text-xs text-gray-400 mt-0.5">Напрямок не редагується після створення.</div>
          </CardContent>
        </Card>

        {/* Receiver — read-only. */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base"><span className="text-blue-600 font-bold">Отримувач</span></CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 text-sm">
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="font-medium">{parcel.receiver.lastName} {parcel.receiver.firstName}</div>
              <div className="text-gray-600">{parcel.receiver.phone}</div>
              {parcel.receiverAddress && (
                <div className="text-xs text-gray-500 mt-1">
                  {COUNTRY_LABELS[parcel.receiverAddress.country as CountryCode] || parcel.receiverAddress.country},
                  {' '}{parcel.receiverAddress.city}
                  {parcel.receiverAddress.street ? `, ${parcel.receiverAddress.street}` : ''}
                  {parcel.receiverAddress.building ? ` ${parcel.receiverAddress.building}` : ''}
                  {/* ТЗ docx 01.07.26: індекс для не-UA сторони. */}
                  {parcel.receiverAddress.postalCode ? `, ${parcel.receiverAddress.postalCode}` : ''}
                  {parcel.receiverAddress.npWarehouseNum ? ` | НП №${parcel.receiverAddress.npWarehouseNum}` : ''}
                </div>
              )}
            </div>
            <div className="text-xs text-gray-400 mt-1.5">
              ПІБ/телефон/адресу Отримувача редагуйте через олівець ✏️ на сторінці посилки.
            </div>
          </CardContent>
        </Card>

        {/* Sender — read-only. */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base"><span className="text-green-600 font-bold">Відправник</span></CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 text-sm space-y-3">
            <div className="bg-green-50 rounded-lg p-3">
              <div className="font-medium">{parcel.sender.lastName} {parcel.sender.firstName}</div>
              <div className="text-gray-600">{parcel.sender.phone}</div>
              {parcel.senderAddress && (
                <div className="text-xs text-gray-500 mt-1">
                  {parcel.senderAddress.country ? `${COUNTRY_LABELS[parcel.senderAddress.country as CountryCode] || parcel.senderAddress.country}, ` : ''}
                  {parcel.senderAddress.city}
                  {parcel.senderAddress.street ? `, ${parcel.senderAddress.street}` : ''}
                  {parcel.senderAddress.building ? ` ${parcel.senderAddress.building}` : ''}
                  {/* ТЗ docx 01.07.26: індекс для не-UA сторони. */}
                  {parcel.senderAddress.postalCode ? `, ${parcel.senderAddress.postalCode}` : ''}
                </div>
              )}
            </div>
            <div className="text-xs text-gray-400">
              ПІБ/телефон/адресу Відправника редагуйте через олівець ✏️ на сторінці посилки.
            </div>

            {/* Спосіб відправки (collection) — як у формі створення (§E13). */}
            {direction === 'eu_to_ua' && (
              <div className="pt-2 mt-1 border-t">
                <Label className="text-sm font-medium mb-1.5 block">Спосіб відправки</Label>
                {/* ТЗ docx 01.07.26: при повторному відкритті показуємо ЛИШЕ раніше
                    обраний пункт збору (адреса+індекс+години), а не весь список.
                    «Змінити пункт» відкриває повний перелік. */}
                {collection.method === 'pickup_point' && parcel.collectionPoint && !changePickup ? (
                  <div className="border rounded-lg p-2 text-sm bg-blue-50">
                    <div className="font-medium">
                      Пункт збору — {parcel.collectionPoint.name
                        ? `${parcel.collectionPoint.name} (${parcel.collectionPoint.city}, ${parcel.collectionPoint.address})`
                        : `${parcel.collectionPoint.city}, ${parcel.collectionPoint.address}`}
                    </div>
                    {(parcel.collectionPoint.postalCode || parcel.senderAddress?.postalCode) && (
                      <div className="text-xs text-gray-500">Індекс: {parcel.collectionPoint.postalCode || parcel.senderAddress?.postalCode}</div>
                    )}
                    {parcel.collectionPoint.workingDays?.length > 0 && (
                      <div className="text-xs text-gray-500">
                        📅 {formatWorkingDays(parcel.collectionPoint.workingDays as Weekday[])}
                        {parcel.collectionPoint.workingHours ? ` · ${parcel.collectionPoint.workingHours}` : ''}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setChangePickup(true)}
                      className="mt-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                    >
                      Змінити пункт
                    </button>
                  </div>
                ) : (
                  // «Змінити пункт»: показуємо ВСІ пункти EU-країни (як у staff
                  // collection-card), без фільтра за містом відправника — інакше
                  // оператор не зміг би обрати інший пункт (напр. місто клієнта
                  // не збігається з жодним пунктом). Країну беремо з обраного
                  // пункту (надійне EU-джерело), а не з country клієнта (може
                  // бути 'UA' у українця з EU-адресою).
                  <CollectionBlock
                    senderCountry={parcel.collectionPoint?.country || senderCountry}
                    value={collection}
                    onChange={setCollection}
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Shipment details. */}
        <Card>
          <CardHeader className="py-3 px-4"><CardTitle className="text-base">Відправлення</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-3">
            <div>
              <Label>Вид відправлення <FieldHint text="Виберіть тип: Посилки та вантажі, Документи або Шини та диски." /></Label>
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
                <Label>Опис відправлення <FieldHint text="Опишіть що саме відправляється." /></Label>
                <DescriptionAutocomplete value={description} onChange={setDescription} placeholder="Побутові речі, продукти..." />
              </div>
            )}
            <div>
              <Label>
                Оголошена вартість ({declaredCurrencyLabel})
              </Label>
              <Input type="number" step="0.01" min="0" value={declaredValue} onChange={(e) => setDeclaredValue(e.target.value)} placeholder="0.00" />
            </div>

            <div className="rounded-lg border p-3 bg-gray-50">
              <div className="flex items-center gap-2">
                <Checkbox id="insurance-cb" checked={insurance} onCheckedChange={(c) => setInsurance(c === true)} />
                <Label htmlFor="insurance-cb" className="text-sm font-medium cursor-pointer">
                  Страхування{' '}
                  <FieldHint text="При активації до вартості додається % від Оголошеної вартості." />
                </Label>
              </div>
            </div>

            <div className="rounded-lg border p-3 bg-gray-50">
              <div className="flex items-center gap-2">
                <Checkbox id="packaging-cb" checked={needsPackaging} onCheckedChange={(c) => setNeedsPackaging(c === true)} />
                <Label htmlFor="packaging-cb" className="text-sm font-medium cursor-pointer">
                  Пакування{' '}
                  <FieldHint text="Відмітьте, якщо пакунок не є у коробці." />
                </Label>
              </div>
            </div>

            {/* ТЗ docx 01.07.26: «Доставка до порога будинку» — під Пакуванням. */}
            <div className="rounded-lg border p-3 bg-gray-50">
              <div className="flex items-center gap-2">
                <Checkbox id="doorstep-cb" checked={doorstepDelivery} onCheckedChange={(c) => setDoorstepDelivery(c === true)} />
                <Label htmlFor="doorstep-cb" className="text-sm font-medium cursor-pointer">
                  Доставка до порога будинку{' '}
                  <FieldHint text="До вартості додається фіксована сума з Тарифів для цього напрямку." />
                </Label>
              </div>
            </div>

            <div className="rounded-lg border p-3 bg-gray-50 space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="parcel-money-cb"
                  checked={parcelMoneyEnabled}
                  onCheckedChange={(c) => {
                    const enabled = c === true;
                    setParcelMoneyEnabled(enabled);
                    if (!enabled) setParcelMoneyAmount('');
                  }}
                />
                <Label htmlFor="parcel-money-cb" className="text-sm font-medium cursor-pointer">Пакет</Label>
              </div>
              {parcelMoneyEnabled && (
                <Input
                  type="number" inputMode="decimal" step="0.01" min="0"
                  value={parcelMoneyAmount}
                  onChange={(e) => setParcelMoneyAmount(e.target.value)}
                  placeholder="Сума у віконці «Пакет»"
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Places. У РЕЖИМІ РЕДАГУВАННЯ:
            — «+ Додати місце» приховане (PATCH-роут не створює нові місця);
            — «Загальні параметри» приховані (стирання ID існуючих місць
              викликало б їх видалення на бекенді).
            Якщо потрібна реструктуризація місць — створюється нова посилка. */}
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Параметри відправлення <FieldHint text="Редагуйте вагу та розміри існуючих місць. Для реструктуризації створіть нову посилку." />
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-3">
            {useGeneralParams ? (
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
                    Об&apos;ємна вага: <span className="font-medium">{(Number(generalVolume) * 250).toFixed(2)} кг</span>
                  </div>
                )}
              </div>
            ) : (
              <>
                {places.map((place, i) => (
                  <div key={place.id || `new-${i}`} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Місце {i + 1}</span>
                      <div className="flex gap-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => copyPlace(i)} title="Копіювати місце">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </Button>
                        {places.length > 1 && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => removePlace(i)} className="text-red-500 hover:text-red-700">×</Button>
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
                      <Label className="text-xs">Або об&apos;єм (м&sup3;)</Label>
                      <Input type="number" step="0.001" min="0" value={place.volume} onChange={(e) => updatePlace(i, 'volume', e.target.value)} className="w-40" />
                    </div>
                    {(calcVolWeight(place) > 0 || Number(place.volume) > 0) && (
                      <div className="text-xs text-gray-500">
                        Об&apos;ємна вага: <span className="font-medium">
                          {calcVolWeight(place) > 0 ? calcVolWeight(place) : (Number(place.volume) * 250).toFixed(2)} кг
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}

            {/* Totals — Розрахункова по правилу тарифу (Bug 5). */}
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
                <span>{billable.toFixed(2)} кг</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment. */}
        <Card>
          <CardHeader className="py-3 px-4"><CardTitle className="text-base">Оплата</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-3">
            <div>
              <Label>Платник за доставку</Label>
              <Select value={payer} onValueChange={(v) => setPayer(v ?? 'sender')}>
                <SelectTrigger><SelectValue>{PAYER_LABELS[payer]}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sender">Відправник</SelectItem>
                  <SelectItem value="receiver">Отримувач</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Форма оплати</Label>
              <Select value={paymentMethod} onValueChange={(v) => handlePaymentMethodChange(v ?? 'cash')}>
                <SelectTrigger><SelectValue>{PAYMENT_LABELS[paymentMethod]}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Готівка</SelectItem>
                  <SelectItem value="cashless">Безготівка</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={paymentInUkraine} onCheckedChange={(c) => handlePaymentInUkraineChange(c === true)} />
              <Label className="text-sm">Оплата в Україні</Label>
            </div>
            <div className="rounded-lg border p-3 bg-gray-50 space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox id="send-invoice-cb" checked={sendInvoice} onCheckedChange={(c) => setSendInvoice(c === true)} />
                <Label htmlFor="send-invoice-cb" className="text-sm font-medium cursor-pointer">Відправити рахунок</Label>
              </div>
              {sendInvoice && (
                <div>
                  <Label className="text-xs">Телефон Платника</Label>
                  <PhoneInput value={invoicePhone} onChange={setInvoicePhone} defaultCountry="UA" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Trip. */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base">
              Рейс {direction === 'eu_to_ua' ? 'Європа → Україна' : 'Україна → Європа'}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <TripSelector
              trips={trips}
              direction={direction}
              selectedTripId={selectedTripId}
              onChange={setSelectedTripId}
              allowNone={true}
            />
          </CardContent>
        </Card>

        {/* Cost calculator. */}
        <CostCalculator
          direction={direction}
          senderCountry={senderCountry}
          receiverCountry={parcel.receiverAddress?.country || null}
          actualWeight={totalWeight}
          volumetricWeight={totalVolWeight}
          declaredValue={Number(declaredValue) || 0}
          declaredValueCurrency={declaredCurrency}
          insurance={insurance}
          needsPackaging={needsPackaging || places.some(p => p.needsPackaging)}
          isDoorstepDelivery={doorstepDelivery}
          isAddressDelivery={parcel.receiverAddress?.deliveryMethod === 'address'}
          isPickupPoint={direction === 'eu_to_ua' && collection.method === 'pickup_point'}
          isCourierPickup={direction === 'eu_to_ua' && collection.method === 'courier_pickup'}
          isMultiParcelPickup={!!collection.isMultiParcelPickup}
          parcelMoneyAmount={parcelMoneyEnabled ? Number(parcelMoneyAmount) || 0 : 0}
          receiverCity={parcel.receiverAddress?.city || ''}
        />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
        )}

        {/* ТЗ-docx (Bug 6): кнопка «Зберегти» в самому низу, заміняє собою
            «Створити відправлення». «Скасувати» — лівіше. */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 px-6"
            onClick={() => router.push(`/parcels/${id}`)}
            disabled={saving}
          >
            Скасувати
          </Button>
          <Button type="submit" className="flex-1 h-12 text-base" disabled={saving}>
            {saving ? 'Збереження...' : 'Зберегти'}
          </Button>
        </div>
      </form>
    </div>
  );
}
