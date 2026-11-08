'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/lib/hooks/use-auth';
import { canEditParcelData, editLockReason } from '@/lib/parcels/edit-lock';
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
import { PlacesEditor, usePlacesDraft, emptyPlace } from '@/components/parcels/places-editor';
import { handleFlowEnter, focusFlowElement, focusInvalidField } from '@/lib/ui/focus-flow';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';
import { isPickupPointPricing } from '@/lib/utils/pricing-flags';
import { parcelNumberWithJourney } from '@/lib/parcels/display-number';

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
 * ТЗ docx 04.11.26 (п.8): «повинна відкриватись така сама форма (з тими самими механізмами)
 * як і при створенні». «Параметри відправлення» — той самий блок, що у створенні
 * (PlacesEditor: «+ Додати місце», «Загальні параметри», копіювання), «Додаткові послуги» —
 * внизу перед кнопкою, як у створенні; нові місця сервер тепер зберігає (посилка 301).
 *
 * Сторони (Отримувач/Відправник) показуються READ-ONLY — їхні поля
 * редагуються окремо через кнопку-олівець на сторінці посилки
 * (`ParcelPartyEdit`), бо PATCH /api/parcels/[id] не змінює власне
 * посилання на клієнтів. Це чесне обмеження — повідомляємо у формі.
 */

interface ParcelData {
  id: string;
  /** ТЗ docx 26.07.26 (п.1): редагувати можна лише «Створена» і лише автором. */
  status: string;
  createdById: string | null;
  internalNumber: string;
  journeyNumber?: number | null;
  direction: string;
  shipmentType: string;
  description: string | null;
  declaredValue: number | string | null;
  declaredValueCurrency: string | null;
  insuranceApplied: boolean;
  needsPackaging: boolean;
  doorstepDelivery: boolean;
  parcelMoneyAmount: number | string | null;
  /** ТЗ docx 04.11.26 (п.5): «Доплата за НП» (EUR). */
  npSurcharge: number | string | null;
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
  const { user, role, loading: authLoading } = useAuth();
  const [parcel, setParcel] = useState<ParcelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Editable state
  const [shipmentType, setShipmentType] = useState('parcels_cargo');
  const [description, setDescription] = useState('');
  const [declaredValue, setDeclaredValue] = useState('');
  const [insurance, setInsurance] = useState(false);
  // ТЗ docx 21.09.26 (п.4): понад 50 € оголошеної вартості (для UA→EU —
  // гривневий еквівалент) страхування вмикається автоматично на сервері.
  // Прапорець приходить з «Розрахунку вартості» — блокуємо чекбокс, щоб
  // оператор не знімав те, що вже враховано в сумі.
  const [insuranceAuto, setInsuranceAuto] = useState(false);

  const [needsPackaging, setNeedsPackaging] = useState(false);
  // ТЗ docx 01.07.26: opt-in «Доставка до порога будинку».
  const [doorstepDelivery, setDoorstepDelivery] = useState(false);
  // ТЗ docx 01.07.26: при відкритті показуємо ЛИШЕ обраний пункт; «Змінити» відкриє список.
  const [changePickup, setChangePickup] = useState(false);
  const [parcelMoneyEnabled, setParcelMoneyEnabled] = useState(false);
  const [parcelMoneyAmount, setParcelMoneyAmount] = useState('');
  // ТЗ docx 04.11.26 (п.5): «Доплата за НП» (EUR).
  const [npSurchargeEnabled, setNpSurchargeEnabled] = useState(false);
  const [npSurchargeAmount, setNpSurchargeAmount] = useState('');
  const npSurcharge = npSurchargeEnabled ? Number(npSurchargeAmount) || 0 : 0;
  const [payer, setPayer] = useState('sender');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentInUkraine, setPaymentInUkraine] = useState(false);
  const [sendInvoice, setSendInvoice] = useState(false);
  const [invoicePhone, setInvoicePhone] = useState('');

  // ТЗ docx 04.11.26 (п.8): ті самі «Параметри відправлення», що й у створенні.
  const placesDraft = usePlacesDraft();
  const { places, setPlaces } = placesDraft;

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
      const npsAmt = p.npSurcharge != null ? Number(p.npSurcharge) : 0;
      setNpSurchargeEnabled(npsAmt > 0);
      setNpSurchargeAmount(npsAmt > 0 ? String(npsAmt) : '');
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
            // ТЗ docx 28.10.26: збережена об'ємна вага — у віконце (без розмірів
            // вона введена напряму або з об'єму; з розмірами віконце її перерахує).
            volWeight: pl.volumetricWeight != null && Number(pl.volumetricWeight) > 0 ? String(Number(pl.volumetricWeight)) : '',
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
  }, [id, setPlaces]);

  // ТЗ docx 26.07.26 (п.1): edit-сторінка доступна лише для статусу «Створена»
  // і лише автору (super_admin — виняток). Інакше повертаємо на детальну з
  // поясненням. Чекаємо, поки завантажаться і auth, і посилка.
  useEffect(() => {
    if (authLoading || !parcel) return;
    const ok = canEditParcelData(
      { status: parcel.status, createdById: parcel.createdById },
      { userId: user?.id ?? '', role: role ?? '' },
    );
    if (!ok) {
      toast.error(editLockReason());
      router.replace(`/parcels/${id}`);
    }
  }, [authLoading, parcel, user, role, id, router]);

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
  // ТЗ docx 02.07.26 (D4): «Доставка до порога будинку» — лише Європа→Україна +
  // Адресна доставка Отримувача (спосіб зберігається в receiverAddress).
  const canDoorstep = direction === 'eu_to_ua' && parcel?.receiverAddress?.deliveryMethod === 'address';
  const declaredCurrencyLabel = parcel?.declaredValueCurrency === 'UAH' || senderInUA ? 'грн' : 'EUR';
  const declaredCurrency = (parcel?.declaredValueCurrency || (senderInUA ? 'UAH' : 'EUR')) as 'UAH' | 'EUR';

  const totalWeight = placesDraft.totalWeight;
  const totalVolWeight = placesDraft.totalVolWeight;

  // ТЗ docx 04.11.26 (п.3): незаповнене віконце — нагадування + курсор у нього з підсвіткою.
  function failAt(message: string, field: string) {
    setError(message);
    focusInvalidField(field);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!parcel) return;
    setError('');

    if (!declaredValue || Number(declaredValue) <= 0) {
      failAt('Вкажіть оголошену вартість', '[data-field="declared-value"]'); return;
    }
    const placesError = placesDraft.validate();
    if (placesError) { failAt(placesError.message, placesError.field); return; }
    if (npSurchargeEnabled && !(Number(npSurchargeAmount) > 0)) {
      failAt('Вкажіть суму «Доплати за НП» (EUR) або зніміть позначку', '[data-field="np-surcharge"]'); return;
    }
    if (
      direction === 'eu_to_ua' &&
      collection.method === 'courier_pickup' &&
      collection.isMultiParcelPickup === null
    ) {
      setError('Оберіть «Одна посилка» або «Дві або більше посилок»'); return;
    }

    setSaving(true);

    // ТЗ docx 04.11.26 (п.8): наявні місця — з id (оновлюються), нові — без id (сервер їх
    // створює і перенумеровує всі місця «1/N»). «Загальні параметри» замінюють місця.
    const placesPayload = placesDraft.payload();

    const res = await fetch(`/api/parcels/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shipmentType,
        description: description || null,
        declaredValue: declaredValue ? Number(declaredValue) : 0,
        insuranceApplied: insurance || insuranceAuto,
        needsPackaging,
        // ТЗ docx 02.07.26 (D4): не застосовуємо doorstep, якщо опція недоступна.
        doorstepDelivery: canDoorstep && doorstepDelivery,
        parcelMoneyAmount:
          parcelMoneyEnabled && Number(parcelMoneyAmount) > 0
            ? Number(parcelMoneyAmount)
            : null,
        // ТЗ docx 04.11.26 (п.5): «Доплата за НП» (EUR); null — без доплати.
        npSurcharge: npSurcharge > 0 ? npSurcharge : null,
        payer,
        paymentMethod,
        paymentInUkraine,
        tripId: selectedTripId || null,
        // Перевірка 22.09.26: для UA→EU блок не показуємо, але збережений вибір клієнта
        // (кур'єр/пошта) не затираємо при редагуванні інших полів.
        collectionMethod: collection.method ? collection.method : null,
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

  // Правило тарифу для «Розрахункової ваги» (Bug 5) — у PlacesEditor.
  const weightRule = pricingConfigs.find(c => c.country === senderCountry && c.direction === direction) ?? null;

  return (
    <div className="max-w-2xl">
      <Breadcrumbs items={[
        { label: 'Посилки', href: '/parcels' },
        // ТЗ docx 12.10.26: без старого порядкового номера.
        { label: parcelNumberWithJourney(parcel.internalNumber, parcel.journeyNumber), href: `/parcels/${id}` },
        { label: 'Редагувати' },
      ]} />
      <h1 className="text-2xl font-bold mb-4">Редагувати посилку</h1>

      {/* ТЗ docx 04.11.26 (п.1): Enter / «Далі» — Оголошена вартість → Вага → Об'ємна вага. */}
      <form onSubmit={handleSubmit} onKeyDown={handleFlowEnter} className="space-y-4">
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
              {/* ТЗ docx 04.11.26 (п.2): цифрова клавіатура. */}
              <Input
                type="number" inputMode="decimal" step="0.01" min="0"
                value={declaredValue} onChange={(e) => setDeclaredValue(e.target.value)} placeholder="0.00"
                data-field="declared-value" data-flow="" enterKeyHint="next"
              />
            </div>
          </CardContent>
        </Card>

        {/* ТЗ docx 04.11.26 (п.8): «Параметри відправлення» — той самий блок, що у створенні
            (раніше тут не було «+ Додати місце» і «Загальних параметрів», а нові місця сервер
            відкидав). */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base">
              Параметри відправлення <FieldHint text="Введіть загальні параметри (вага+об'єм+кількість місць) або детально по кожному місцю." />
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <PlacesEditor draft={placesDraft} weightRule={weightRule} />
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
              // ТЗ docx 21.07.26 (п.2): лише рейси з країни Відправника. Беремо
              // СИРУ країну (sender/адреса), а не похідну senderCountry — вона
              // має trip-fallback, що дав би циклічність (рейс→країна→фільтр).
              senderCountry={parcel?.sender?.country || parcel?.senderAddress?.country || null}
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
          onInsuranceAutoApplied={setInsuranceAuto}
          needsPackaging={needsPackaging || places.some(p => p.needsPackaging)}
          isDoorstepDelivery={canDoorstep && doorstepDelivery}
          isAddressDelivery={parcel.receiverAddress?.deliveryMethod === 'address'}
          isPickupPoint={isPickupPointPricing({ direction, collectionMethod: collection.method, receiverDeliveryMethod: parcel.receiverAddress?.deliveryMethod })}
          isCourierPickup={direction === 'eu_to_ua' && collection.method === 'courier_pickup'}
          isMultiParcelPickup={!!collection.isMultiParcelPickup}
          parcelMoneyAmount={parcelMoneyEnabled ? Number(parcelMoneyAmount) || 0 : 0}
          receiverCity={parcel.receiverAddress?.city || ''}
          npSurcharge={npSurcharge}
        />

        {/* ТЗ docx 11.10.26 / 04.11.26 (п.8): «Додаткові послуги» — внизу, перед кнопкою, як у формі
            створення. ТЗ docx 04.11.26 (п.5): разом із «Доплатою за НП». */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base">Додаткові послуги</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-3">
            <div className="rounded-lg border p-3 bg-gray-50">
              <div className="flex items-center gap-2">
                <Checkbox id="insurance-cb" checked={insurance || insuranceAuto} disabled={insuranceAuto} onCheckedChange={(c) => setInsurance(c === true)} />
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

            {/* ТЗ docx 01.07.26: «Доставка до порога будинку» — під Пакуванням.
                ТЗ docx 02.07.26 (D4): лише Європа→Україна + Адресна доставка. */}
            {canDoorstep && (
            <div className="rounded-lg border p-3 bg-gray-50">
              <div className="flex items-center gap-2">
                <Checkbox id="doorstep-cb" checked={doorstepDelivery} onCheckedChange={(c) => setDoorstepDelivery(c === true)} />
                <Label htmlFor="doorstep-cb" className="text-sm font-medium cursor-pointer">
                  Доставка до порога будинку{' '}
                  <FieldHint text="До вартості додається фіксована сума з Тарифів для цього напрямку." />
                </Label>
              </div>
            </div>
            )}

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

            {/* ТЗ docx 04.11.26 (п.5): «Доплата за НП» (EUR) — додається до вартості до оплати. */}
            <div className="rounded-lg border p-3 bg-gray-50 space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="np-surcharge-cb"
                  checked={npSurchargeEnabled}
                  onCheckedChange={(c) => {
                    const enabled = c === true;
                    setNpSurchargeEnabled(enabled);
                    if (!enabled) setNpSurchargeAmount('');
                    else setTimeout(() => focusFlowElement(document.querySelector<HTMLElement>('[data-field="np-surcharge"]')), 30);
                  }}
                />
                <Label htmlFor="np-surcharge-cb" className="text-sm font-medium cursor-pointer">
                  Доплата за НП{' '}
                  <FieldHint text="Сума в євро, на яку збільшується загальна вартість до оплати за посилку." />
                </Label>
              </div>
              {npSurchargeEnabled && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number" inputMode="decimal" step="0.01" min="0"
                    value={npSurchargeAmount}
                    onChange={(e) => setNpSurchargeAmount(e.target.value)}
                    placeholder="0.00"
                    className="max-w-[10rem]"
                    data-field="np-surcharge"
                  />
                  <span className="text-sm text-gray-600">EUR</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

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
