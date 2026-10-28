'use client';

import { useState, useEffect, useRef } from "react";
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { NO_TRIP_MESSAGE, OPERATOR_PHONE } from '@/lib/parcels/no-trip';
import { CollectionBlock } from '@/components/parcels/collection-block';
// ТЗ docx 21.09.26 (п.5): клієнт має бачити вартість ДО «Створити замовлення».
import { CostCalculator } from '@/components/parcels/cost-calculator';
import { AddressInput } from '@/components/parcels/address-input';
import { PhoneInput } from '@/components/shared/phone-input';
import { FieldHint } from '@/components/shared/field-hint';
import { CapitalizeInput } from '@/components/shared/capitalize-input';
import { getBillableWeight } from '@/lib/utils/volumetric';
import { normalizeCityForMatch } from '@/lib/utils/transliterate';
import { isCourierAllowed, isPostalAllowed, isPickupPointAllowed, type ServiceRule } from '@/lib/utils/logistics-availability';
import { formatWorkingDays, type Weekday } from '@/lib/constants/collection';
import { isPickupPointPricing } from '@/lib/utils/pricing-flags';
import { INSURANCE_AUTO_THRESHOLD_EUR } from '@/lib/constants/insurance';
import { displayParcelNumber } from '@/lib/parcels/display-number';
import { formatPostalCodeInput } from '@/lib/utils/postal-code';
import { BarcodeScanButton } from '@/components/shared/barcode-scan-button';
import {
  TTN_ENTER_REQUEST, TTN_AFTER_SHIPPING_REMINDER, TTN_MISSING_REMINDER, isValidNpTtn,
} from '@/lib/parcels/ttn-reminder';

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

// ТЗ docx 04.10.26 (п.3): максимальна довжина нотатки Клієнта.
const CLIENT_NOTE_MAX = 150;

/** Деталі замовлення з GET /api/client-portal/orders/[id] — лише поля, потрібні формі. */
interface EditableOrder {
  status: string;
  canClientEdit?: boolean;
  direction: string;
  shipmentType: string;
  description: string | null;
  clientNote: string | null;
  declaredValue: string | number | null;
  insuranceApplied: boolean;
  needsPackaging: boolean;
  doorstepDelivery: boolean;
  payer: string;
  paymentMethod: string;
  paymentInUkraine: boolean;
  collectionMethod: string | null;
  collectionPointId: string | null;
  collectionDate: string | null;
  collectionAddress: string | null;
  npTtn: string | null;
  sender: { firstName: string; lastName: string; middleName: string | null; phone: string };
  receiver: { firstName: string; lastName: string; middleName: string | null; phone: string };
  senderAddress: {
    country: string | null; city: string; postalCode: string | null;
    street: string | null; building: string | null; landmark: string | null;
  } | null;
  receiverAddress: {
    country: string; city: string; postalCode: string | null; deliveryMethod: string;
    street: string | null; building: string | null; landmark: string | null;
    npWarehouseNum: string | null; pickupPointText: string | null;
  } | null;
  places: { weight: string | number | null; length: string | number | null; width: string | number | null; height: string | number | null }[];
}

const numStr = (v: string | number | null | undefined) => (v == null || v === '' ? '' : String(Number(v)));

/**
 * Форма замовлення Клієнта: створення (/new-order) і редагування (/my-orders/[id]/edit).
 *
 * ТЗ docx 20.10.26 (Створення посилки Клієнтом): «надати можливість Клієнту редагування
 * посилки після її створення… кнопка „Редагувати“, яка дає можливість змінювати будь-які
 * дані посилки (прізвища та імена, адреси, розміри, вагу, оголошену вартість)… лише до
 * зміни статусу на „Прийнята до перевезення“». Редагування — та сама форма з тими ж
 * перевірками, заповнена даними замовлення. Незмінні лише напрямок і країни сторін:
 * від них залежать рейс, номер у поїздці та ІТН (за ТЗ 12.10.26 ІТН не змінюється ніколи).
 */
export function OrderForm({ editId }: { editId?: string }) {
  const router = useRouter();
  const isEdit = !!editId;
  // ТЗ docx 20.10.26: стан завантаження замовлення для редагування.
  const [editState, setEditState] = useState<'loading' | 'ready' | 'locked' | 'error'>(isEdit ? 'loading' : 'ready');
  const [editWarnings, setEditWarnings] = useState<string[]>([]);
  const [editSaved, setEditSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "auto", block: "center" });
  }, [error]);
  // ТЗ docx 26.10.26: після створення — номер, id (перехід у замовлення: фото, нотатка, ТТН)
  // і нагадування про ТТН, якщо посилка йде Новою поштою, а номера ще немає.
  const [created, setCreated] = useState<{ id: string; number: string; ttnReminder: string | null } | null>(null);
  const [successTtn, setSuccessTtn] = useState('');
  const [successTtnState, setSuccessTtnState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [successTtnError, setSuccessTtnError] = useState('');
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
  // ТЗ docx 09.10.26 (п.4): опис за замовчуванням — «Побутові речі» (можна змінити).
  const [description, setDescription] = useState('Побутові речі');
  const [declaredValue, setDeclaredValue] = useState('');
  // Per ТЗ — opt-in services. Прихований 3% автоматичний бонус скасовано.
  const [insurance, setInsurance] = useState(false);
  // ТЗ docx 21.09.26 (п.4): понад 50 € (для UA→EU — гривневий еквівалент)
  // страхування обовʼязкове — сервер вмикає його сам, а тут блокуємо чекбокс.
  const [insuranceAuto, setInsuranceAuto] = useState(false);
  // ТЗ docx 08.10.26: поріг автострахування — з тарифу напрямку (через калькулятор);
  // константа — лише значення, поки тариф ще не завантажено.
  const [insuranceThresholdEur, setInsuranceThresholdEur] = useState(INSURANCE_AUTO_THRESHOLD_EUR);
  const [needsPackaging, setNeedsPackaging] = useState(false);
  // ТЗ docx 01.07.26: opt-in чекбокс «Доставка до порога будинку» (клієнт теж бачить).
  const [doorstepDelivery, setDoorstepDelivery] = useState(false);
  // ТЗ docx 02.07.26 (D4): доступна лише Європа→Україна + Адресна доставка Отримувача.
  const canDoorstep = direction === 'eu_to_ua' && receiverDeliveryMethod === 'address';
  // ТЗ docx 11.10.26 (п.2): послуга «Пакування» видима Клієнту лише для «Європа→Україна».
  const canPackaging = direction === 'eu_to_ua';
  // ТЗ docx 21.09.26 (п.4): для напрямку Україна→Європа оголошена вартість —
  // у гривнях (як у формі Працівника), для Європа→Україна — в EUR. Раніше
  // клієнту завжди писало «(EUR)», і гривнева сума йшла на сервер як EUR.
  const declaredCurrency: 'EUR' | 'UAH' =
    senderCountry === 'UA' || (!senderCountry && direction === 'ua_to_eu') ? 'UAH' : 'EUR';
  const declaredCurrencyLabel = declaredCurrency === 'UAH' ? 'грн' : 'EUR';
  // ТЗ §E10: «Поле "Пакет" при заповненні Клієнтом відсутнє» — опція
  // з'являється лише коли оформлює Працівник. У клієнтському порталі не
  // показуємо і не відправляємо.
  const [places, setPlaces] = useState<PlaceData[]>([emptyPlace()]);
  // ТЗ docx 09.10.26 (п.5): платник за замовчуванням — «Україна→Європа» Отримувач,
  // «Європа→Україна» Відправник; поки Клієнт не обрав сам — слідуємо за напрямком.
  const [payerChoice, setPayerChoice] = useState<string | null>(null);
  const payer = payerChoice ?? (direction === 'ua_to_eu' ? 'receiver' : 'sender');
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
  // ТЗ docx 03.10.26 (п.2): номер ТТН Нової пошти, який Клієнт вводить при
  // способі передачі «Пошта». Зберігається в посилці (parcels.np_ttn).
  const [npTtn, setNpTtn] = useState('');
  // ТЗ docx 04.10.26 (п.3): нотатка — вільний текст до 150 знаків.
  const [clientNote, setClientNote] = useState('');
  // ТЗ docx 08.10.26 (лише Україна→Європа): питання «Ви вже передали своє відправлення
  // «Посилочці»?». ТЗ docx 26.10.26: від відповіді залежить продовження форми:
  //  «Так» → «Як ви передали нам посилку?» — «Кур'єром» / «Поштою» (+ номер ТТН), без
  //          блоку «Як Ви передасте нам посилку?»;
  //  «Ні»  → звичайна форма з блоком «Як Ви передасте нам посилку?» (раніше «Ні»
  //          забороняло оформлення — тепер оформити можна).
  const [handedOver, setHandedOver] = useState<'' | 'yes' | 'no'>('');
  const [handoverWay, setHandoverWay] = useState<'' | 'courier' | 'post'>('');
  // ТЗ docx 20.10.26: при редагуванні питання не ставимо — спосіб передачі вже обрано.
  const needsHandover = direction === 'ua_to_eu' && !isEdit;
  // ТЗ docx 04.10.26: чи є рейс до вибраної країни (посилка до нього прив'яжеться
  // автоматично). Ключ «напрямок:країна» — щоб не показати застарілу відповідь.
  const [tripCheck, setTripCheck] = useState<{ key: string; hasTrip: boolean } | null>(null);

  // ТЗ docx 26.10.26: зміна відповіді «Ви вже передали…?» скидає спосіб передачі — його
  // задає наступне питання («Так») або блок «Як Ви передасте нам посилку?» («Ні»).
  function answerHandedOver(next: 'yes' | 'no') {
    if (next === handedOver) return;
    setHandedOver(next);
    setHandoverWay('');
    setCollectionMethod('');
    setCollectionPointId('');
    setCollectionStreet('');
    setCollectionBuilding('');
    setCollectionLandmark('');
    setCollectionWarehouse('');
    setNpTtn('');
  }

  // ТЗ docx 26.10.26 («Так»): «Як ви передали нам посилку?» — «Кур'єром» (віддали нашому
  // курʼєру) / «Поштою» (відправили Новою поштою — далі номер ТТН).
  function answerHandoverWay(next: 'courier' | 'post') {
    setHandoverWay(next);
    setCollectionMethod(next === 'courier' ? 'courier_pickup' : 'external_shipping');
    if (next === 'courier') setNpTtn('');
  }

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

  // EU-країна маршруту: для EU→UA — країна Відправника, для UA→EU — Отримувача.
  const euCountry = direction === 'eu_to_ua' ? senderCountry : direction === 'ua_to_eu' ? receiverCountry : '';
  const tripKey = direction && euCountry && euCountry !== 'UA' ? `${direction}:${euCountry}` : '';
  useEffect(() => {
    if (!tripKey) return;
    const [dir, country] = tripKey.split(':');
    let cancelled = false;
    fetch(`/api/client-portal/nearest-trip?direction=${dir}&country=${country}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { trip: unknown } | null) => {
        if (!cancelled && d) setTripCheck({ key: tripKey, hasTrip: !!d.trip });
      })
      .catch(() => { /* мережа — попередження просто не покажемо */ });
    return () => { cancelled = true; };
  }, [tripKey]);
  const noTripForCountry = !!tripKey && tripCheck?.key === tripKey && !tripCheck.hasTrip;

  useEffect(() => {
    fetch('/api/pricing').then(r => r.ok ? r.json() : []).then(setPricingConfigs);
    fetch('/api/service-cities').then(r => r.ok ? r.json() : []).then(setServiceCities);

    // ТЗ docx 20.10.26: редагування — заповнюємо форму даними самого замовлення.
    if (editId) {
      fetch(`/api/client-portal/orders/${editId}`)
        .then(r => (r.ok ? r.json() : null))
        .then((o: EditableOrder | null) => {
          if (!o) { setEditState('error'); return; }
          if (!o.canClientEdit) { setEditState('locked'); return; }
          const ra = o.receiverAddress;
          const sa = o.senderAddress;
          setDirection(o.direction);
          setReceiverPhone(o.receiver.phone);
          setReceiverFirstName(o.receiver.firstName);
          setReceiverLastName(o.receiver.lastName);
          setReceiverMiddleName(o.receiver.middleName ?? '');
          setReceiverCountry(ra?.country ?? (o.direction === 'eu_to_ua' ? 'UA' : ''));
          setReceiverCity(ra?.city ?? '');
          setReceiverPostalCode(ra?.postalCode ?? '');
          setReceiverDeliveryMethod(ra?.deliveryMethod || 'address');
          setReceiverStreet(ra?.street ?? '');
          setReceiverBuilding(ra?.building ?? '');
          setReceiverLandmark(ra?.landmark ?? '');
          setReceiverNpWarehouse(ra?.npWarehouseNum ?? '');
          setReceiverPickupPointText(ra?.pickupPointText ?? '');
          setSenderPhone(o.sender.phone);
          setSenderFirstName(o.sender.firstName);
          setSenderLastName(o.sender.lastName);
          setSenderMiddleName(o.sender.middleName ?? '');
          setSenderCountry(sa?.country ?? (o.direction === 'ua_to_eu' ? 'UA' : 'NL'));
          setSenderCity(sa?.city ?? '');
          setSenderPostalCode(sa?.postalCode ?? '');
          setShipmentType(o.shipmentType || 'parcels_cargo');
          setDescription(o.description ?? '');
          setClientNote(o.clientNote ?? '');
          setDeclaredValue(numStr(o.declaredValue));
          setInsurance(o.insuranceApplied);
          setNeedsPackaging(o.needsPackaging);
          setDoorstepDelivery(o.doorstepDelivery);
          setPlaces(o.places.length > 0
            ? o.places.map(p => ({ weight: numStr(p.weight), length: numStr(p.length), width: numStr(p.width), height: numStr(p.height) }))
            : [emptyPlace()]);
          setPayerChoice(o.payer);
          setPaymentMethod(o.paymentMethod);
          setPaymentInUkraine(o.paymentInUkraine);
          setCollectionMethod(o.collectionMethod ?? '');
          setCollectionPointId(o.collectionPointId ?? '');
          setCollectionDate(o.collectionDate ? o.collectionDate.slice(0, 10) : '');
          setCollectionAddress(o.collectionAddress ?? '');
          // Вулиця/будинок/орієнтир «Виклику курʼєра» зберігаються в адресі Відправника.
          if (o.collectionMethod === 'courier_pickup') {
            setCollectionStreet(sa?.street ?? '');
            setCollectionBuilding(sa?.building ?? '');
            setCollectionLandmark(sa?.landmark ?? '');
          }
          setNpTtn(o.npTtn ?? '');
          setEditState('ready');
        })
        .catch(() => setEditState('error'));
      return;
    }

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
  }, [editId]);

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
        setError("Вкажіть вагу хоча б одного місця"); return;
      }
    }
    // Перевірка 15.09.26: спосіб передачі посилки — обовʼязковий. Раніше форма
    // відправляла порожнє значення, сервер відповідав технічною помилкою, і клієнт
    // не розумів, що робити.
    // Аудит 01.10.26: місто Відправника не було обовʼязковим у формі, тож сервер
    // віддавав сирий текст валідатора «senderCity: Обовʼязкове поле».
    if (!senderCity.trim()) {
      setError('Вкажіть Ваш населений пункт у розділі «Відправник»'); return;
    }
    // ТЗ docx 26.10.26 (Україна→Європа): спершу — відповідь на «Ви вже передали…?» і, для
    // «Так», на «Як ви передали нам посилку?».
    if (needsHandover && !handedOver) {
      setError('Дайте відповідь на питання «Ви вже передали своє відправлення «Посилочці»?» угорі форми'); return;
    }
    if (needsHandover && handedOver === 'yes' && !handoverWay) {
      setError("Оберіть, як Ви передали нам посилку: «Кур'єром» чи «Поштою»"); return;
    }
    if (!collectionMethod) {
      setError("Оберіть, як Ви передасте нам посилку (розділ «Як Ви передасте нам посилку?»)"); return;
    }
    // ТЗ docx 26.10.26: номер ТТН більше не обовʼязковий (якщо його немає — нагадаємо після
    // оформлення), але введений номер має бути справжнім номером НП.
    if (direction === 'ua_to_eu' && collectionMethod === 'external_shipping' && npTtn.trim() && !isValidNpTtn(npTtn)) {
      setError('Номер ТТН Нової пошти — 14 цифр. Перевірте номер або залиште поле порожнім і введіть його пізніше.'); return;
    }
    // ТЗ docx 08.10.26: «При створенні посилки Клієнт повинен ввести оголошену вартість».
    if (!(Number(declaredValue) > 0)) {
      setError(`Вкажіть оголошену вартість посилки (${declaredCurrencyLabel})`); return;
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

    // Перевірка перед запуском 21.09.26: обрив звʼязку або не-JSON відповідь
    // (напр. сторінка помилки хостингу) лишали кнопку у стані «Створення...»
    // без жодного повідомлення — ловимо й показуємо зрозумілий текст.
    try {
      // ТЗ docx 20.10.26: редагування — те саме тіло, PUT на замовлення.
      const res = await fetch(editId ? `/api/client-portal/orders/${editId}` : '/api/client-portal/orders', {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction, shipmentType, description,
          declaredValue: declaredValue ? Number(declaredValue) : undefined,
          declaredValueCurrency: declaredCurrency,
          insurance: insurance || insuranceAuto, needsPackaging: canPackaging && needsPackaging,
          // ТЗ docx 02.07.26 (D4): не застосовуємо doorstep, якщо опція недоступна.
          doorstepDelivery: canDoorstep && doorstepDelivery,
          // «Пакет» недоступний клієнту (ТЗ §E10) — не відправляємо.
          payer, paymentMethod, paymentInUkraine,
          senderPhone, senderFirstName, senderLastName, senderMiddleName, senderCountry, senderCity, senderPostalCode: senderPostalCode.trim(),
          // Перевірка 22.09.26: адреса з блоку «Виклик курʼєра» — і в адресу відправника
          // (картка посилки, Маршрутний лист), а не лише у текстовий collectionAddress.
          senderStreet: collectionMethod === 'courier_pickup' ? collectionStreet.trim() || undefined : undefined,
          senderBuilding: collectionMethod === 'courier_pickup' ? collectionBuilding.trim() || undefined : undefined,
          senderLandmark: collectionMethod === 'courier_pickup' ? collectionLandmark.trim() || undefined : undefined,
          receiverPhone, receiverFirstName, receiverLastName, receiverMiddleName, receiverCountry, receiverCity, receiverPostalCode: receiverPostalCode.trim(),
          receiverStreet, receiverBuilding, receiverLandmark, receiverDeliveryMethod, receiverNpWarehouse, receiverPickupPointText,
          places: places.map(p => ({
            weight: Number(p.weight) || 0,
            length: Number(p.length) || undefined,
            width: Number(p.width) || undefined,
            height: Number(p.height) || undefined,
          })),
          collectionMethod, collectionPointId, collectionDate,
          // ТЗ docx 03.10.26 (п.2, п.4): ТТН зберігаємо в посилці (лише для відправки поштою).
          npTtn: collectionMethod === 'external_shipping' ? npTtn.replace(/\s/g, '') || undefined : undefined,
          // ТЗ docx 04.10.26 (п.3): нотатка Клієнта.
          clientNote: clientNote.trim() || undefined,
          // ТЗ docx 08.10.26 / 26.10.26: відповідь «Ви вже передали…?» (UA→EU) — в історію посилки.
          handedOver: needsHandover ? handedOver === 'yes' : undefined,
          collectionAddress: composedCollectionAddress,
        }),
      });

      if (res.ok && editId) {
        const data = await res.json().catch(() => null);
        setEditWarnings(Array.isArray(data?.warnings) ? data.warnings : []);
        setEditSaved(true);
      } else if (res.ok) {
        const parcel = await res.json();
        // ТЗ docx 26.10.26: посилка йде Новою поштою (UA→EU), а ТТН ще немає — нагадування:
        // «Ні» → «Після відправки посилки Новою поштою…»; «Так» → «Ви не ввели номер ТТН…».
        // Відповідь createParcel не містить npTtn — беремо номер, який форма щойно відправила.
        const ttnMissing = direction === 'ua_to_eu' && collectionMethod === 'external_shipping' && !npTtn.replace(/\s/g, '');
        // ТЗ docx 12.10.26: без старого порядкового номера — номер у поїздці замість нього.
        setCreated({
          id: parcel.id,
          number: displayParcelNumber(parcel.internalNumber, parcel.journeyNumber),
          ttnReminder: ttnMissing ? (handedOver === 'yes' ? TTN_MISSING_REMINDER : TTN_AFTER_SHIPPING_REMINDER) : null,
        });
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || (editId ? 'Не вдалося зберегти зміни. Спробуйте ще раз.' : 'Не вдалося створити замовлення. Спробуйте ще раз.'));
      }
    } catch {
      setError('Немає звʼязку з сервером. Перевірте інтернет і спробуйте ще раз.');
    } finally {
      setSaving(false);
    }
  }

  // ТЗ docx 26.10.26: ТТН можна ввести одразу на екрані «Замовлення створено» (або пізніше
  // в самому замовленні).
  async function saveSuccessTtn() {
    if (!created) return;
    if (!isValidNpTtn(successTtn)) { setSuccessTtnError('Номер ТТН Нової пошти — 14 цифр'); return; }
    setSuccessTtnState('saving');
    setSuccessTtnError('');
    try {
      const res = await fetch(`/api/client-portal/orders/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ npTtn: successTtn.replace(/\s/g, '') }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setSuccessTtnError(data?.error || 'Не вдалося зберегти ТТН');
        setSuccessTtnState('idle');
        return;
      }
      setSuccessTtnState('saved');
    } catch {
      setSuccessTtnError('Немає звʼязку з сервером. Спробуйте ще раз.');
      setSuccessTtnState('idle');
    }
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

  // ТЗ docx 20.10.26: стани редагування — завантаження, недоступно, збережено.
  if (isEdit && editState !== 'ready') {
    return (
      <div className="max-w-lg mx-auto text-center py-12 space-y-4">
        {editState === 'loading' ? (
          <div className="text-gray-500">Завантаження…</div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-900">
            {editState === 'locked'
              ? 'Замовлення вже прийнято до перевезення — змінити його може лише оператор.'
              : 'Замовлення не знайдено.'}
          </div>
        )}
        {editState !== 'loading' && (
          <Link href={`/my-orders/${editId}`}><Button variant="outline">Назад до замовлення</Button></Link>
        )}
      </div>
    );
  }

  if (editSaved) {
    return (
      <div className="max-w-lg mx-auto text-center py-12">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-green-800 mb-2">Зміни збережено</h2>
          <p className="text-green-700">Кур&apos;єр перевірить Ваші дані.</p>
        </div>
        {editWarnings.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-sm text-amber-900 text-left space-y-1">
            {editWarnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
          </div>
        )}
        <Button onClick={() => router.push(`/my-orders/${editId}`)} className="w-full h-12 text-base">
          Переглянути замовлення
        </Button>
      </div>
    );
  }

  if (created) {
    return (
      <div className="max-w-lg mx-auto text-center py-12">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-green-800 mb-2">Замовлення створено</h2>
          <p className="text-green-700">
            {/* Перевірка 15.09.26: SWC «зʼїдав» пробіл після номера («…2026сформовано») — ставимо явно. */}
            Попереднє відправлення N{created.number}{' '}сформовано. Кур&apos;єр перевірить Ваші дані.
          </p>
        </div>
        {/* ТЗ docx 26.10.26: «Ні» + «Відправка поштою» — після «Створити відправлення» одна фраза
            «Після відправки посилки Новою поштою… введіть номер ТТН…»; «Так» + «Поштою» без ТТН —
            нагадування ще раз після оформлення. Номер можна ввести тут або пізніше в замовленні. */}
        {created.ttnReminder && successTtnState !== 'saved' && (
          <div className="text-left mb-6 space-y-2">
            <p className="text-sm font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded px-3 py-2 leading-snug">
              📌 {created.ttnReminder}
            </p>
            <div className="flex gap-2 items-center flex-wrap">
              <Input
                value={successTtn}
                onChange={(e) => setSuccessTtn(e.target.value)}
                placeholder="Номер ТТН, 14 цифр"
                inputMode="numeric"
                className="font-mono flex-1 min-w-[10rem]"
              />
              <BarcodeScanButton onResult={(ttn) => setSuccessTtn(ttn)} label="Фото ТТН" />
              <Button type="button" onClick={saveSuccessTtn} disabled={successTtnState === 'saving' || !successTtn.trim()}>
                {successTtnState === 'saving' ? 'Збереження…' : 'Зберегти ТТН'}
              </Button>
            </div>
            {successTtnError && <p className="text-xs text-red-600">{successTtnError}</p>}
          </div>
        )}
        {successTtnState === 'saved' && (
          <p className="text-sm text-green-700 mb-6">Номер ТТН збережено — за ним ми знайдемо Вашу посилку.</p>
        )}
        {/* ТЗ docx 26.10.26 (п.1): фото посилки і нотатки — у самому замовленні. */}
        <Button onClick={() => router.push(`/my-orders/${created.id}`)} className="w-full h-12 text-base mb-2">
          Переглянути замовлення
        </Button>
        <p className="text-xs text-gray-500 mb-4">У замовленні можна додати фото посилки і нотатку.</p>
        <Button variant="outline" onClick={() => router.push('/my-orders')} className="w-full">
          Мої замовлення
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{isEdit ? 'Редагування замовлення' : 'Нове замовлення'}</h1>
      {/* ТЗ docx 20.10.26: напрямок і країни сторін у готовому замовленні незмінні. */}
      {isEdit && (
        <p className="text-sm text-gray-600 mb-3 max-w-lg">
          Змініть потрібні дані і натисніть «Зберегти зміни». Напрямок і країни Відправника та Отримувача
          змінити не можна — для цього оформіть нове замовлення.
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">

        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base">Виберіть напрямок</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <Select value={direction} onValueChange={(v) => handleDirectionChange(v ?? '')} disabled={isEdit}>
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

        {/* ТЗ docx 08.10.26 — лише «Україна → Європа»: «При спробі Клієнта створити
            посилку з України у Європу має звучати запитання: „Ви вже передали своє
            відправлення «Посилочці»?“». ТЗ docx 26.10.26: пояснювальні тексти під кнопками
            прибрано; «Так» → «Як ви передали нам посилку?» (Кур'єром / Поштою + ТТН);
            «Ні» → звичайна форма з блоком «Як Ви передасте нам посилку?». */}
        {needsHandover && (
          <Card className={handedOver ? '' : 'border-orange-300'}>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-base">Ви вже передали своє відправлення «Посилочці»?</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0 space-y-3">
              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  variant={handedOver === 'yes' ? 'default' : 'outline'}
                  onClick={() => answerHandedOver('yes')}
                >
                  Так, вже передав(ла)
                </Button>
                <Button
                  type="button"
                  variant={handedOver === 'no' ? 'default' : 'outline'}
                  onClick={() => answerHandedOver('no')}
                >
                  Ні, ще не передав(ла)
                </Button>
              </div>
              {handedOver === 'yes' && (
                <div className="border-t pt-3 space-y-3">
                  <div className="text-sm font-medium">Як ви передали нам посилку?</div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant={handoverWay === 'courier' ? 'default' : 'outline'}
                      onClick={() => answerHandoverWay('courier')}
                    >
                      Кур&apos;єром
                    </Button>
                    <Button
                      type="button"
                      variant={handoverWay === 'post' ? 'default' : 'outline'}
                      onClick={() => answerHandoverWay('post')}
                    >
                      Поштою
                    </Button>
                  </div>
                  {handoverWay === 'post' && (
                    <div className="space-y-2">
                      {/* ТЗ docx 26.10.26: «отримує прохання» (як у ТЗ 04.10.26 — помаранчевим,
                          напівжирним), «далі — віконце для введення». Номер можна сфотографувати:
                          він розпізнається і стає у віконце цифрами. */}
                      <p className="text-sm font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1.5 leading-snug">
                        📌 {TTN_ENTER_REQUEST}
                      </p>
                      <div className="flex gap-2 items-center">
                        <Input
                          value={npTtn}
                          onChange={(e) => setNpTtn(e.target.value)}
                          placeholder="Напр. 59000123456789"
                          inputMode="numeric"
                          className="font-mono"
                          aria-label="Номер ТТН Нової пошти"
                        />
                        <BarcodeScanButton onResult={(ttn) => setNpTtn(ttn)} label="Фото ТТН" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

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
              <Select value={receiverCountry} onValueChange={(v) => setReceiverCountry(v ?? '')} disabled={isEdit}>
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
              {/* ТЗ docx 12.10.26: NL-індекс — «1234 AB» (пробіл після цифр, літери великі). */}
              <Input value={receiverPostalCode} onChange={(e) => setReceiverPostalCode(formatPostalCodeInput(e.target.value, receiverPostalCode, receiverCountry))} placeholder={receiverCountry === 'NL' ? '1234 AB' : '00-000'} />
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
              <div><Label>Номер складу/поштомату *</Label><Input value={receiverNpWarehouse} onChange={(e) => setReceiverNpWarehouse(e.target.value)} placeholder="1" inputMode="numeric" /></div>
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
            {/* Відправник — завжди сам Клієнт (сервер бере номер з профілю), тож при
                редагуванні номер лише показуємо. */}
            {isEdit ? (
              <div>
                <Label>Телефон</Label>
                <Input value={senderPhone} disabled />
              </div>
            ) : (
              <PhoneInput
                label="Телефон"
                required
                value={senderPhone}
                onChange={setSenderPhone}
                defaultCountry={(senderCountry as 'UA' | 'NL' | 'AT' | 'DE') || 'UA'}
              />
            )}
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Прізвище *</Label><CapitalizeInput value={senderLastName} onChange={setSenderLastName} required /></div>
              <div><Label>Ім&apos;я *</Label><CapitalizeInput value={senderFirstName} onChange={setSenderFirstName} required /></div>
            </div>
            <div><Label>По батькові</Label><CapitalizeInput value={senderMiddleName} onChange={setSenderMiddleName} /></div>
            <div>
              <Label>Країна</Label>
              <Select value={senderCountry} onValueChange={(v) => setSenderCountry(v ?? 'NL')} disabled={isEdit}>
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
              <Input value={senderPostalCode} onChange={(e) => setSenderPostalCode(formatPostalCodeInput(e.target.value, senderPostalCode, senderCountry))} placeholder={senderCountry === 'NL' ? '1234 AB' : '00-000'} />
            </div>
          </CardContent>
        </Card>

        {/* ТЗ (docx 14.05.26 §b): «Як ви передасте нам посилку?» — остання з
            трьох карток (після «Відправник»). Має бути РОЗГОРНУТА (усі способи
            видно). Умовні поля: Виклик кур'єра → Вулиця/Будинок/Орієнтир;
            Пошта → Номер складу; Пункт збору → перелік для країни/міста. */}
        {/* ТЗ docx 26.10.26: для «Україна → Європа» блок лише після «Ні, ще не передав(ла)»
            (при «Так» спосіб передачі вже відомий — блок прибрано). */}
        {!!direction && (!needsHandover || handedOver === 'no') && (
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
                  npTtn,
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
                  setNpTtn(next.npTtn ?? '');
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
                // ТЗ docx 26.10.26: ТТН у цьому блоці — лише при редагуванні (посилку вже відправлено).
                showUaTtn={isEdit}
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
            {/* ТЗ docx 04.10.26 (п.3): «Додати можливість створити нотатку (поле для
                вільного тексту на 150 знаків)». Нотатку бачить і Працівник. */}
            <div>
              <Label>Нотатка <FieldHint text="Будь-яка додаткова інформація для нас: коли зручно зателефонувати, що врахувати тощо" /></Label>
              <Textarea
                value={clientNote}
                onChange={(e) => setClientNote(e.target.value.slice(0, CLIENT_NOTE_MAX))}
                maxLength={CLIENT_NOTE_MAX}
                placeholder="Напр. телефонуйте після 18:00"
                rows={2}
              />
              <div className="text-[11px] text-gray-400 text-right mt-0.5">{clientNote.length}/{CLIENT_NOTE_MAX}</div>
            </div>
            <div>
              <Label>Оголошена вартість ({declaredCurrencyLabel}) * <FieldHint text="Оцініть вартість своєї посилки" /></Label>
              <Input type="number" step="0.01" min="0" value={declaredValue} onChange={(e) => setDeclaredValue(e.target.value)} />
              {/* ТЗ docx 08.10.26: «При введенні оголошеної вартості Клієнт повинен
                  отримати (побачити) попередження». Оголошена вартість — обов'язкова. */}
              <p className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                ⚠️ Відповідальність фірми обмежується величиною оголошеної вартості посилки.
                <span className="block font-normal text-amber-700">
                  {`До ${insuranceThresholdEur} € включно${direction === 'ua_to_eu' ? ' (еквівалент у гривнях за курсом НБУ)' : ''} страхування не нараховується; понад цю суму — обов'язкове.`}
                </span>
              </p>
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
              {/* ТЗ docx 11.10.26 (п.1): «+» і «Додати місце» — внизу, під місцем (див. нижче). */}
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
            {/* ТЗ docx 11.10.26 (п.1): «+ Додати місце» — під останнім місцем (як у Працівника). */}
            <Button type="button" variant="outline" size="sm" onClick={addPlace} disabled={places.length >= 10} className="w-full">
              + Додати місце
            </Button>
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
            <Select value={payer} onValueChange={(v) => setPayerChoice(v ?? null)}>
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

        {/* ТЗ docx 21.09.26 (п.5): «Клієнт повинен бачити ВАРТІСТЬ, яку він
            повинен сплатити за послугу» — блок стоїть після «Оплати», щоб
            клієнт погодився з сумою і лише тоді тиснув «Створити замовлення».
            Компонент — той самий, що у Працівника і в готовій посилці, тож
            сума збігається з тією, яку буде виставлено. */}
        {!!direction && totalWeight > 0 && (
          <Card>
            <CardHeader className="py-3 px-4"><CardTitle className="text-base">Вартість</CardTitle></CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <CostCalculator
                direction={direction}
                senderCountry={senderCountry || null}
                receiverCountry={receiverCountry || null}
                actualWeight={totalWeight}
                volumetricWeight={totalVolWeight}
                declaredValue={Number(declaredValue) || 0}
                declaredValueCurrency={declaredCurrency}
                insurance={insurance}
                needsPackaging={canPackaging && needsPackaging}
                isDoorstepDelivery={canDoorstep && doorstepDelivery}
                // ТЗ docx 21.09.26 (п.3): вартість рахується згідно ВИБРАНОЇ
                // клієнтом опції доставки Отримувача.
                isAddressDelivery={receiverDeliveryMethod === 'address'}
                isPickupPoint={isPickupPointPricing({ direction, collectionMethod, receiverDeliveryMethod })}
                isCourierPickup={direction === 'eu_to_ua' && collectionMethod === 'courier_pickup'}
                receiverCity={receiverCity || null}
                clientFacing
                onInsuranceAutoApplied={setInsuranceAuto}
                onInsuranceThreshold={setInsuranceThresholdEur}
              />
            </CardContent>
          </Card>
        )}

        {/* ТЗ docx 04.10.26: рейсу до вибраної країни немає — попереджаємо до
            створення (замовлення створити все одно можна; рейс прив'яжеться, щойно
            його заведуть). */}
        {noTripForCountry && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800">
            ⚠️ {NO_TRIP_MESSAGE.replace(OPERATOR_PHONE, '')}
            <a href={`tel:${OPERATOR_PHONE}`} className="font-semibold underline">{OPERATOR_PHONE}</a>
          </div>
        )}

        {/* Перевірка 15.09.26: помилка стояла внизу довгої форми поза екраном —
            клієнт її не бачив. Тепер при появі помилки прокручуємо до неї. */}
        {error && <div ref={errorRef} className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 scroll-mt-28">{error}</div>}

        {/* ТЗ docx 11.10.26 (Створення посилки — загальна зміна): послуги об'єднано під
            назвою «Додаткові послуги» і перенесено вниз — безпосередньо перед кнопкою
            «Створити відправлення». */}
        <Card>
          <CardHeader className="py-3 px-4"><CardTitle className="text-base">Додаткові послуги</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {/* Додаткові послуги — кожна вмикається чекбоксом, % і суми
                визначаються тарифом для напрямку. Тексти підказок — per ТЗ §E10. */}
            <div className="space-y-2">
              {/* ТЗ docx 08.10.26: понад поріг з Тарифів (20 €) страхування вмикається
                  автоматично і зняти його не можна; нижче — лише за чекбоксом. */}
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={insurance || insuranceAuto}
                  disabled={insuranceAuto}
                  onCheckedChange={(c) => setInsurance(c === true)}
                />
                Страхування <FieldHint text="У разі загибелі посилки відшкодовується лише сума страхування. Відмітьте чекбокс, якщо бажаєте застрахувати посилку згідно оголошеної вартості" />
              </label>
              {insuranceAuto && (
                <p className="text-xs text-amber-700 pl-6">
                  Обовʼязкове: оголошена вартість перевищує {insuranceThresholdEur} € — страхування вже враховане у вартості.
                </p>
              )}
              {canPackaging && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={needsPackaging} onCheckedChange={(c) => setNeedsPackaging(c === true)} />
                  Пакування <FieldHint text="Відмітьте, якщо пакунок не є у коробці" />
                </label>
              )}
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

        {/* ТЗ docx 26.10.26: фразу «Щоб оформити замовлення, дайте відповідь „Так“…» прибрано —
            оформити можна і з відповіддю «Ні». */}
        <Button type="submit" className="w-full h-12 text-base" disabled={saving}>
          {/* ТЗ docx 11.10.26: кнопка зветься «Створити відправлення» (як у Працівника). */}
          {isEdit
            ? (saving ? 'Збереження...' : 'Зберегти зміни')
            : (saving ? 'Створення...' : 'Створити відправлення')}
        </Button>
        {isEdit && (
          <Link href={`/my-orders/${editId}`} className="block">
            <Button type="button" variant="outline" className="w-full">Скасувати</Button>
          </Link>
        )}

        <p className="text-xs text-gray-400 text-center">
          {isEdit
            ? 'Змінювати замовлення можна, поки його не прийнято до перевезення.'
            : <>Після створення замовлення кур&apos;єр перевірить Ваші дані та підтвердить відправлення.</>}
        </p>
      </form>
    </div>
  );
}
