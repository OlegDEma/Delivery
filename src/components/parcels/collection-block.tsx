'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';
import {
  COLLECTION_METHODS,
  COLLECTION_METHOD_LABELS,
  COLLECTION_METHOD_HINTS_CLIENT,
  COLLECTION_METHOD_ICONS,
  formatWorkingDays,
  nextWorkingDay,
  weekdayFromDate,
  WEEKDAY_LABELS_FULL,
  type CollectionMethod,
  type Weekday,
} from '@/lib/constants/collection';
import { formatDate } from '@/lib/utils/format';

export interface CollectionPointOption {
  id: string;
  name: string | null;
  country: string;
  city: string;
  address: string;
  contactPhone: string | null;
  workingHours: string | null;
  workingDays: Weekday[];
  notes: string | null;
  maxCapacity: number | null;
  isActive: boolean;
}

export interface CollectionState {
  method: CollectionMethod | '';
  pointId: string;
  date: string;  // YYYY-MM-DD
  address: string;
  /**
   * Per ТЗ — при courier_pickup оператор обирає чи це «єдина посилка» (false)
   * чи «2+ посилок з цієї локації» (true). Впливає на мінімальний тариф.
   * Null коли method ≠ courier_pickup або відповідь ще не надана.
   */
  isMultiParcelPickup?: boolean | null;
}

interface CollectionBlockProps {
  /** Country where the sender is — filters points. E.g. 'NL' */
  senderCountry: CountryCode | string | null;
  /** Sender city — drives «Виклик кур'єра» availability when sender is in UA. */
  senderCity?: string | null;
  value: CollectionState;
  onChange: (next: CollectionState) => void;
  /** If true, shows minimal client-portal UI. If false, full staff UI. */
  clientFacing?: boolean;
}

interface ServiceCity {
  id: string;
  country: string;
  city: string;
  acceptsCourierPickup: boolean;
}

// Per ТЗ: «Передати водію» приховано. Залишаються три способи.
const METHODS: CollectionMethod[] = [
  COLLECTION_METHODS.PICKUP_POINT,
  COLLECTION_METHODS.COURIER_PICKUP,
  COLLECTION_METHODS.EXTERNAL_SHIPPING,
];

export function CollectionBlock({ senderCountry, senderCity, value, onChange, clientFacing = false }: CollectionBlockProps) {
  const [points, setPoints] = useState<CollectionPointOption[]>([]);
  const [loadingPoints, setLoadingPoints] = useState(true);
  const [serviceCities, setServiceCities] = useState<ServiceCity[]>([]);

  // Initial fetch + refetch коли змінюється країна. setLoading(true) робимо
  // лише ASYNC після старту запиту, щоб уникнути sync-setState-in-effect.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingPoints(true);
      const qs = senderCountry ? `?country=${encodeURIComponent(senderCountry)}` : '';
      try {
        const r = await fetch(`/api/collection-points${qs}`);
        if (cancelled) return;
        const list: CollectionPointOption[] = r.ok ? await r.json() : [];
        if (cancelled) return;
        setPoints(list.filter(p => p.isActive));
      } finally {
        if (!cancelled) setLoadingPoints(false);
      }
    })();
    return () => { cancelled = true; };
  }, [senderCountry]);

  // Fetch list of cities where courier_pickup is allowed (per ТЗ §5).
  // Using forCourierPickup=1 server-side filter so we don't ship dormant rows.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/service-cities?forCourierPickup=1');
        if (cancelled || !r.ok) return;
        const list: ServiceCity[] = await r.json();
        if (!cancelled) setServiceCities(list);
      } catch { /* best-effort */ }
    })();
    return () => { cancelled = true; };
  }, []);

  function setMethod(m: CollectionMethod | '') {
    onChange({
      ...value,
      method: m,
      pointId: m === 'pickup_point' ? value.pointId : '',
      address: m === 'courier_pickup' ? value.address : '',
      // Reset multi-parcel flag коли вибір не courier_pickup.
      isMultiParcelPickup: m === 'courier_pickup' ? value.isMultiParcelPickup ?? null : null,
    });
  }

  // ТЗ §5: для клієнта courier_pickup доступний лише за прописаних правил.
  //   - У EU (NL/AT/DE): дозволено в усіх містах (TODO: можна звузити списком).
  //   - В UA: лише у місті(ах), які є у `service_cities` з
  //          acceptsCourierPickup=true. За замовчуванням — лише Львів.
  // На staff боці завжди доступно (clientFacing=false).
  const courierPickupAvailableForClient = (() => {
    if (!clientFacing) return true;
    if (!senderCountry) return false;
    if (senderCountry !== 'UA') return true;
    // UA — звіряємо місто.
    if (!senderCity) return false;
    const normalized = senderCity.trim().toLowerCase();
    return serviceCities.some(
      sc => sc.country === 'UA' &&
            sc.acceptsCourierPickup &&
            sc.city.trim().toLowerCase() === normalized
    );
  })();

  // ТЗ §E13: «Відправка поштою» доступна клієнту, якщо відправлення з України
  // (клієнт надсилає посилку нам Новою поштою на склад у Львові — ФОП). Для
  // відправлень з ЄС клієнт користується пунктом збору / викликом кур'єра.
  const externalShippingAvailableForClient = !clientFacing || senderCountry === 'UA';

  const pointsForCountry = senderCountry
    ? points.filter(p => p.country === senderCountry)
    : points;

  // ТЗ Staff: «При виборі одного з трьох полів два інших зникають».
  // ТЗ Client: те саме.
  const hideOthers = !!value.method;
  const visibleMethods = hideOthers ? METHODS.filter(m => m === value.method) : METHODS;

  return (
    <div className="space-y-3">
      {/* Title — ТЗ для клієнта залишити, для staff прибрати. */}
      {clientFacing && (
        <Label className="text-xs text-gray-500 mb-1 block">Як Ви передасте нам посилку?</Label>
      )}

      {/* Method cards */}
      <div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {visibleMethods.map(m => {
            const on = value.method === m;
            const disabled =
              (m === COLLECTION_METHODS.COURIER_PICKUP && !courierPickupAvailableForClient) ||
              (m === COLLECTION_METHODS.EXTERNAL_SHIPPING && !externalShippingAvailableForClient);

            return (
              <button
                key={m}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setMethod(m)}
                className={cn(
                  'text-left border rounded-lg p-3 transition-all',
                  on && 'border-blue-500 bg-blue-50 ring-2 ring-blue-200',
                  !on && !disabled && 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50',
                  disabled && 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                )}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-lg">{COLLECTION_METHOD_ICONS[m]}</span>
                  <span className="font-medium text-sm">{COLLECTION_METHOD_LABELS[m]}</span>
                </div>
                {/* Підказки — лише для клієнта (per ТЗ, staff працює без них). */}
                {clientFacing && (
                  <div className="text-xs text-gray-500 leading-snug">
                    {COLLECTION_METHOD_HINTS_CLIENT[m]}
                    {disabled && m === COLLECTION_METHODS.COURIER_PICKUP && (
                      <div className="mt-1 text-amber-700">
                        Доступно лише якщо адреса відправника у країні, яку ми обслуговуємо
                        (для України — тільки Львів).
                      </div>
                    )}
                    {disabled && m === COLLECTION_METHODS.EXTERNAL_SHIPPING && (
                      <div className="mt-1 text-amber-700">
                        Опція тимчасово недоступна.
                      </div>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        {/* «Очистити вибір» — і для staff, і для клієнта (per ТЗ). */}
        {value.method && (
          <button
            type="button"
            onClick={() => setMethod('')}
            className="mt-2 text-xs text-gray-500 hover:text-gray-700"
          >
            ⊘ Очистити вибір
          </button>
        )}
      </div>

      {/* Pickup point selection */}
      {value.method === 'pickup_point' && (
        <div className="border-t pt-3">
          <Label className="text-xs text-gray-500 mb-1 block">
            Пункт збору {senderCountry ? `(${COUNTRY_LABELS[senderCountry as CountryCode] || senderCountry})` : ''}
          </Label>

          {loadingPoints ? (
            <div className="text-sm text-gray-400">Завантаження пунктів…</div>
          ) : pointsForCountry.length === 0 ? (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              Поки що немає пунктів збору в цій країні. Виберіть інший спосіб передачі.
            </div>
          ) : (
            <div className="space-y-2">
              {pointsForCountry.map(p => {
                const isSelected = value.pointId === p.id;
                const next = p.workingDays?.length ? nextWorkingDay(p.workingDays) : null;
                const today = weekdayFromDate(new Date());
                const acceptsToday = p.workingDays?.includes(today) ?? false;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onChange({ ...value, pointId: p.id })}
                    className={cn(
                      'w-full text-left border rounded-lg p-3 transition-all',
                      isSelected
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">
                          {p.name || `${p.city}, ${p.address}`}
                        </div>
                        {p.name && (
                          <div className="text-xs text-gray-500">
                            {p.city}, {p.address}
                          </div>
                        )}
                        {p.workingDays?.length > 0 && (
                          <div className="text-xs text-gray-500 mt-1">
                            📅 {formatWorkingDays(p.workingDays)}
                            {p.workingHours && ` · ${p.workingHours}`}
                          </div>
                        )}
                        {p.contactPhone && (
                          <div className="text-xs text-gray-400">📞 {p.contactPhone}</div>
                        )}
                        {p.notes && (
                          <div className="text-xs text-amber-700 mt-1">ℹ️ {p.notes}</div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        {acceptsToday ? (
                          <span className="text-[10px] font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                            Сьогодні
                          </span>
                        ) : next ? (
                          <span className="text-[10px] font-medium text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                            {WEEKDAY_LABELS_FULL[weekdayFromDate(next)]}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Courier pickup */}
      {value.method === 'courier_pickup' && (
        <div className="border-t pt-3 space-y-3">
          {/* Per ТЗ Staff: запитання «Це буде єдина посилка від цього
              Відправника?» з двома чекбоксами. Вибір обов'язковий — впливає
              на мінімальний тариф. Для клієнта це не показуємо: оператор
              зробить вибір при прийнятті. */}
          {!clientFacing && (
            <div className="bg-amber-50 border border-amber-200 rounded p-2 space-y-1.5">
              <div className="text-xs font-medium text-amber-900">
                Це буде єдина посилка від цього Відправника?
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={value.isMultiParcelPickup === false}
                    onCheckedChange={(c) =>
                      c === true && onChange({ ...value, isMultiParcelPickup: false })
                    }
                  />
                  Одна посилка
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={value.isMultiParcelPickup === true}
                    onCheckedChange={(c) =>
                      c === true && onChange({ ...value, isMultiParcelPickup: true })
                    }
                  />
                  Дві або більше посилок
                </label>
              </div>
              {value.isMultiParcelPickup === null || value.isMultiParcelPickup === undefined ? (
                <div className="text-[11px] text-amber-700">
                  Відповідь обов&apos;язкова — від неї залежить мінімальна вартість посилки.
                </div>
              ) : null}
            </div>
          )}

          {/* Для staff лишаємо date + address. ТЗ для клієнта забороняє ці
              два поля (адреса = адреса відправника, дата визначається рейсом). */}
          {!clientFacing && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-gray-500">Бажана дата виїзду</Label>
                <Input
                  type="date"
                  value={value.date}
                  onChange={(e) => onChange({ ...value, date: e.target.value })}
                />
                {value.date && (
                  <p className="text-xs text-gray-400 mt-1">
                    {WEEKDAY_LABELS_FULL[weekdayFromDate(new Date(value.date))]},{' '}
                    {formatDate(value.date)}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs text-gray-500">Адреса забору</Label>
                <Input
                  value={value.address}
                  onChange={(e) => onChange({ ...value, address: e.target.value })}
                  placeholder="Вулиця, дім, квартира, місто"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* External shipping. ТЗ §E13: якщо країна відправлення — Україна,
          показуємо реквізити нашого складу (ФОП Добровольський + НП Львів).
          Для інших країн — узагальнена підказка (лише staff). */}
      {value.method === 'external_shipping' && senderCountry === 'UA' && (
        <div className="border-t pt-3">
          <div className="text-xs text-gray-700 bg-amber-50 border border-amber-200 rounded p-3 space-y-2 leading-snug">
            <div className="font-medium text-amber-900">
              Відправте Вашу посилку нам Новою поштою
            </div>
            <div className="space-y-0.5">
              <div className="font-medium">Наша адреса:</div>
              <div>Львів</div>
              <div>Нова пошта, відділення №1</div>
              <div className="text-red-700 font-medium">
                ⚠️ ФОП Добровольський Андрій Ярославович
              </div>
              <div className="text-gray-500">
                (відправляти лише на фізичну особу-підприємця — ФОП)
              </div>
              <div>
                тел. <span className="font-medium">+380673320502</span>
              </div>
              <div className="text-red-700">
                ⚠️ Лише на цей номер телефону (інакше посилку не видадуть на пошті)
              </div>
              <div>При потребі — ЄДРПОУ 2236117857</div>
            </div>
            <div className="space-y-0.5">
              <div className="font-medium text-amber-900">ОБОВ&apos;ЯЗКОВО</div>
              <div>
                До посилки необхідно додати супровідний листок, у якому
                продублювати усі дані кінцевого Отримувача, заповнені Вами
                у формі на сайті:
              </div>
              <ul className="list-disc pl-4">
                <li>країна отримання</li>
                <li>місто отримання</li>
                <li>прізвище та ім&apos;я українською мовою (виняток — іноземні прізвища)</li>
                <li>актуальний номер телефону в Європі — ОБОВ&apos;ЯЗКОВО з кодом країни</li>
              </ul>
              <div className="text-gray-500">
                Це може бути й український номер (але краще давати місцевий, якщо є).
              </div>
            </div>
          </div>
        </div>
      )}
      {value.method === 'external_shipping' && senderCountry !== 'UA' && !clientFacing && (
        <div className="border-t pt-3">
          <div className="text-xs text-gray-500 bg-gray-50 rounded p-2">
            Після створення замовлення ми надішлемо вам адресу нашого складу в{' '}
            {senderCountry ? COUNTRY_LABELS[senderCountry as CountryCode] : 'Європі'},
            куди треба відправити посилку локальною поштою (PostNL/DPD тощо).
            <br />
            Додайте трек-номер у деталях замовлення коли відправите.
          </div>
        </div>
      )}

      {/* Direct to driver hint */}
      {value.method === 'direct_to_driver' && (
        <div className="border-t pt-3">
          <div className="text-xs text-gray-500 bg-gray-50 rounded p-2">
            Водій звʼяжеться з вами за 1-2 дні до рейсу.
            Ми доберемо рейс з найближчою датою до вашої.
          </div>
          <div className="mt-2">
            <Label className="text-xs text-gray-500">Бажана дата (опціонально)</Label>
            <Input
              type="date"
              value={value.date}
              onChange={(e) => onChange({ ...value, date: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
