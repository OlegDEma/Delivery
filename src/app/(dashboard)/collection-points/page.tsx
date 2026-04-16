'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';
import {
  formatWorkingDays,
  nextWorkingDay,
  weekdayFromDate,
  WEEKDAY_LABELS_FULL,
  type Weekday,
} from '@/lib/constants/collection';
import { formatDate } from '@/lib/utils/format';
import { EmptyState } from '@/components/shared/empty-state';

interface Point {
  id: string;
  name: string | null;
  country: string;
  city: string;
  address: string;
  contactPhone: string | null;
  workingHours: string | null;
  workingDays: Weekday[];
  maxCapacity: number | null;
  isActive: boolean;
}

export default function CollectionPointsListPage() {
  const [points, setPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/collection-points')
      .then(r => (r.ok ? r.json() : []))
      .then(setPoints)
      .finally(() => setLoading(false));
  }, []);

  // Group by country
  const grouped = new Map<string, Point[]>();
  for (const p of points) {
    const list = grouped.get(p.country) || [];
    list.push(p);
    grouped.set(p.country, list);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Пункти збору</h1>
      <p className="text-sm text-gray-500 mb-4">
        Клацніть на пункт щоб відкрити сторінку прийому посилок від клієнтів.
      </p>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Завантаження...</div>
      ) : points.length === 0 ? (
        <EmptyState
          title="Немає пунктів збору"
          description="Попросіть адміністратора додати пункти в Адміністрування → Пункти збору"
        />
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([country, list]) => (
            <div key={country}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {COUNTRY_LABELS[country as CountryCode] || country}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {list.map(p => {
                  const next = p.workingDays?.length ? nextWorkingDay(p.workingDays) : null;
                  const today = weekdayFromDate(new Date());
                  const acceptsToday = p.workingDays?.includes(today) ?? false;
                  return (
                    <Link key={p.id} href={`/collection-points/${p.id}`}>
                      <Card className={`hover:border-blue-300 transition-colors ${p.isActive ? '' : 'opacity-60'}`}>
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">
                                {p.name || `${p.city}, ${p.address}`}
                              </div>
                              {p.name && (
                                <div className="text-xs text-gray-500 truncate">
                                  {p.city}, {p.address}
                                </div>
                              )}
                            </div>
                            {acceptsToday && p.isActive ? (
                              <Badge className="bg-green-100 text-green-800 text-[10px] shrink-0">
                                Сьогодні
                              </Badge>
                            ) : next && p.isActive ? (
                              <Badge variant="secondary" className="text-[10px] shrink-0">
                                {WEEKDAY_LABELS_FULL[weekdayFromDate(next)]} {formatDate(next)}
                              </Badge>
                            ) : (
                              !p.isActive && (
                                <Badge variant="outline" className="text-[10px] shrink-0">Неактивний</Badge>
                              )
                            )}
                          </div>
                          {p.workingDays?.length > 0 && (
                            <div className="text-xs text-gray-500">
                              📅 {formatWorkingDays(p.workingDays)}
                              {p.workingHours ? ` · ${p.workingHours}` : ''}
                            </div>
                          )}
                          {p.contactPhone && (
                            <div className="text-xs text-gray-500">📞 {p.contactPhone}</div>
                          )}
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
