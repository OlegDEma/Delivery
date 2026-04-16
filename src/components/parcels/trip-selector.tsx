'use client';

import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';
import { formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

export interface TripOption {
  id: string;
  departureDate: string;
  country: string;
  direction: string;
  status: string;
  assignedCourier?: { fullName: string } | null;
  _count?: { parcels: number };
}

interface TripSelectorProps {
  trips: TripOption[];
  direction: 'eu_to_ua' | 'ua_to_eu' | string;
  selectedTripId: string;
  onChange: (tripId: string) => void;
  /** Whether to allow "no trip" (unassigned) — defaults to true. */
  allowNone?: boolean;
  /** Compact mode: smaller cards */
  compact?: boolean;
}

export function TripSelector({
  trips,
  direction,
  selectedTripId,
  onChange,
  allowNone = true,
  compact = false,
}: TripSelectorProps) {
  const filtered = trips
    .filter(
      t =>
        t.direction === direction &&
        (t.status === 'planned' || t.status === 'in_progress')
    )
    .sort(
      (a, b) =>
        new Date(a.departureDate).getTime() - new Date(b.departureDate).getTime()
    );

  if (filtered.length === 0) {
    return (
      <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3 border border-dashed">
        Немає активних рейсів у цьому напрямку.
        Створіть рейс у розділі «Рейси».
      </div>
    );
  }

  return (
    <div className={cn('grid gap-2', compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2')}>
      {allowNone && (
        <button
          type="button"
          onClick={() => onChange('')}
          className={cn(
            'text-left border rounded-lg transition-all',
            compact ? 'p-2' : 'p-3',
            selectedTripId === ''
              ? 'border-gray-500 bg-gray-100 ring-2 ring-gray-200'
              : 'border-dashed border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50'
          )}
        >
          <div className="text-sm font-medium text-gray-700">
            ⊘ Без рейсу
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            Не прив&apos;язувати до жодного рейсу
          </div>
        </button>
      )}

      {filtered.map(t => {
        const isSelected = selectedTripId === t.id;
        const countryLabel = COUNTRY_LABELS[t.country as CountryCode] || t.country;
        const routeLabel =
          direction === 'eu_to_ua' ? `${countryLabel} → UA` : `UA → ${countryLabel}`;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              'text-left border rounded-lg transition-all',
              compact ? 'p-2' : 'p-3',
              isSelected
                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
            )}
          >
            <div className="flex items-center justify-between mb-1">
              <span className={cn('font-semibold', compact ? 'text-xs' : 'text-sm')}>
                {routeLabel}
              </span>
              {t.status === 'in_progress' ? (
                <span className="text-[10px] font-medium uppercase tracking-wider text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded">
                  В дорозі
                </span>
              ) : (
                <span className="text-[10px] font-medium uppercase tracking-wider text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                  Заплановано
                </span>
              )}
            </div>
            <div className="text-xs text-gray-600">
              📅 {formatDate(t.departureDate)}
            </div>
            {t.assignedCourier && (
              <div className="text-xs text-gray-500 mt-0.5 truncate">
                👤 {t.assignedCourier.fullName}
              </div>
            )}
            {t._count && (
              <div className="text-xs text-gray-400 mt-0.5">
                📦 {t._count.parcels} посилок
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
