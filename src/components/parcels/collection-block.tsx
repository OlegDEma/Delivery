'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';
import {
  COLLECTION_METHODS,
  COLLECTION_METHOD_LABELS,
  COLLECTION_METHOD_HINTS,
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
}

interface CollectionBlockProps {
  /** Country where the sender is — filters points. E.g. 'NL' */
  senderCountry: CountryCode | string | null;
  value: CollectionState;
  onChange: (next: CollectionState) => void;
  /** If true, shows only minimal UI (client-portal). If false, full (staff). */
  clientFacing?: boolean;
}

export function CollectionBlock({ senderCountry, value, onChange, clientFacing = false }: CollectionBlockProps) {
  const [points, setPoints] = useState<CollectionPointOption[]>([]);
  const [loadingPoints, setLoadingPoints] = useState(true);

  useEffect(() => {
    setLoadingPoints(true);
    const qs = senderCountry ? `?country=${encodeURIComponent(senderCountry)}` : '';
    fetch(`/api/collection-points${qs}`)
      .then(r => (r.ok ? r.json() : []))
      .then((list: CollectionPointOption[]) => {
        setPoints(list.filter(p => p.isActive));
      })
      .finally(() => setLoadingPoints(false));
  }, [senderCountry]);

  function setMethod(m: CollectionMethod | '') {
    // Clear point/address when method doesn't need them
    onChange({
      ...value,
      method: m,
      pointId: m === 'pickup_point' ? value.pointId : '',
      address: m === 'courier_pickup' ? value.address : '',
    });
  }

  const methods: CollectionMethod[] = [
    COLLECTION_METHODS.PICKUP_POINT,
    COLLECTION_METHODS.COURIER_PICKUP,
    COLLECTION_METHODS.EXTERNAL_SHIPPING,
    COLLECTION_METHODS.DIRECT_TO_DRIVER,
  ];

  const pointsForCountry = senderCountry
    ? points.filter(p => p.country === senderCountry)
    : points;

  return (
    <div className="space-y-3">
      {/* Method cards */}
      <div>
        <Label className="text-xs text-gray-500 mb-1 block">Як ви передасте нам посилку?</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {methods.map(m => {
            const on = value.method === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={cn(
                  'text-left border rounded-lg p-3 transition-all',
                  on
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                )}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-lg">{COLLECTION_METHOD_ICONS[m]}</span>
                  <span className="font-medium text-sm">{COLLECTION_METHOD_LABELS[m]}</span>
                </div>
                <div className="text-xs text-gray-500 leading-snug">
                  {COLLECTION_METHOD_HINTS[m]}
                </div>
              </button>
            );
          })}
        </div>
        {!clientFacing && (
          <button
            type="button"
            onClick={() => setMethod('')}
            className={cn(
              'mt-2 text-xs',
              value.method === ''
                ? 'text-gray-700 font-medium'
                : 'text-gray-400 hover:text-gray-600'
            )}
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

      {/* Courier pickup — date + address */}
      {value.method === 'courier_pickup' && (
        <div className="border-t pt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
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

      {/* External shipping hint */}
      {value.method === 'external_shipping' && (
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
