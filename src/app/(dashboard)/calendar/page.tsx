'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';

interface Trip {
  id: string;
  direction: string;
  country: string;
  departureDate: string;
  status: string;
  assignedCourier: { fullName: string } | null;
  _count: { parcels: number };
}

const STATUS_COLORS: Record<string, string> = {
  planned: 'bg-blue-500', in_progress: 'bg-yellow-500', completed: 'bg-green-500', cancelled: 'bg-gray-400',
};

const DAY_NAMES = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTH_NAMES = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];

export default function CalendarPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    fetch('/api/trips')
      .then(r => r.ok ? r.json() : [])
      .then(data => { setTrips(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  function getTripsForDate(date: number): Trip[] {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
    return trips.filter(t => t.departureDate.startsWith(dateStr));
  }

  function prevMonth() {
    setCurrentMonth(new Date(year, month - 1, 1));
  }
  function nextMonth() {
    setCurrentMonth(new Date(year, month + 1, 1));
  }

  const days: (number | null)[] = [];
  for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  if (loading) return <div className="text-center py-12 text-gray-500">Завантаження...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Календар рейсів</h1>

      <div className="flex items-center justify-between mb-4">
        <Button variant="outline" size="sm" onClick={prevMonth}>← Попередній</Button>
        <h2 className="text-lg font-medium">{MONTH_NAMES[month]} {year}</h2>
        <Button variant="outline" size="sm" onClick={nextMonth}>Наступний →</Button>
      </div>

      {/* Calendar grid */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-7 bg-gray-50 border-b">
          {DAY_NAMES.map(d => (
            <div key={d} className="p-2 text-center text-xs font-medium text-gray-500">{d}</div>
          ))}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const dayTrips = day ? getTripsForDate(day) : [];
            const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();

            return (
              <div key={i} className={`min-h-[80px] md:min-h-[100px] border-b border-r p-1 ${!day ? 'bg-gray-50' : ''} ${isToday ? 'bg-blue-50' : ''}`}>
                {day && (
                  <>
                    <div className={`text-xs font-medium mb-0.5 ${isToday ? 'text-blue-600 font-bold' : 'text-gray-600'}`}>
                      {day}
                    </div>
                    <div className="space-y-0.5">
                      {dayTrips.map(t => (
                        <Link key={t.id} href={`/trips/${t.id}`}>
                          <div className={`text-[10px] px-1 py-0.5 rounded text-white truncate cursor-pointer hover:opacity-80 ${STATUS_COLORS[t.status] || 'bg-gray-400'}`}>
                            {COUNTRY_LABELS[t.country as CountryCode]?.slice(0, 3) || t.country}
                            {t.direction === 'eu_to_ua' ? '→' : '←'}
                            {t._count.parcels > 0 && ` (${t._count.parcels})`}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-3 text-xs text-gray-500">
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-blue-500" /> Заплановано</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-yellow-500" /> В дорозі</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-500" /> Завершено</div>
      </div>
    </div>
  );
}
