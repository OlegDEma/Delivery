'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils/format';

interface AuditActor {
  id: string;
  fullName: string;
  email: string;
}

interface AuditRow {
  id: string;
  event: string;
  actor: AuditActor | null;
  subjectType: string | null;
  subjectId: string | null;
  payload: unknown;
  createdAt: string;
}

interface AuditResponse {
  entries: AuditRow[];
  events: string[];
}

const ALL = '__all__';

// Human labels for the common events. Unknown events fall back to raw key.
const EVENT_LABELS: Record<string, string> = {
  'parcel.created': 'Посилка створена',
  'parcel.updated': 'Посилка оновлена',
  'parcel.deleted': 'Посилка видалена',
  'parcel.status_changed': 'Статус посилки',
  'parcel.cost_overridden': 'Вартість перевизначена',
  'client.created': 'Клієнт створений',
  'client.updated': 'Клієнт оновлений',
  'client.deleted': 'Клієнт видалений',
  'user.created': 'Користувач створений',
  'user.role_changed': 'Змінено роль',
  'user.deactivated': 'Деактивовано',
  'user.deleted': 'Видалено користувача',
  'cash.entry_created': 'Касовий запис',
  'trip.created': 'Рейс створений',
  'trip.closed': 'Рейс закритий',
  'pricing.updated': 'Тарифи оновлені',
};

function labelEvent(e: string): string {
  return EVENT_LABELS[e] || e;
}

// Styling hint — green for creates, red for deletes, blue for rest.
function eventTone(e: string): string {
  if (e.endsWith('.deleted') || e.endsWith('.deactivated')) return 'bg-red-100 text-red-700';
  if (e.endsWith('.created')) return 'bg-green-100 text-green-700';
  return 'bg-blue-100 text-blue-700';
}

function subjectHref(type: string | null, id: string | null): string | null {
  if (!type || !id) return null;
  if (type === 'parcel') return `/parcels/${id}`;
  if (type === 'client') return `/clients/${id}`;
  if (type === 'trip') return `/trips/${id}`;
  return null;
}

export default function AuditPage() {
  const [eventFilter, setEventFilter] = useState<string>(ALL);
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<string>(ALL);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (eventFilter !== ALL) params.set('event', eventFilter);
    if (subjectTypeFilter !== ALL) params.set('subjectType', subjectTypeFilter);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    const res = await fetch(`/api/audit?${params.toString()}`);
    if (res.ok) {
      const d: AuditResponse = await res.json();
      setData(d);
    }
    setLoading(false);
  }, [eventFilter, subjectTypeFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Журнал подій</h1>

      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div>
              <Label className="text-xs">Подія</Label>
              <Select value={eventFilter} onValueChange={(v) => setEventFilter(v ?? ALL)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Всі події</SelectItem>
                  {data?.events.map((e) => (
                    <SelectItem key={e} value={e}>
                      {labelEvent(e)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Тип обʼєкта</Label>
              <Select value={subjectTypeFilter} onValueChange={(v) => setSubjectTypeFilter(v ?? ALL)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Всі</SelectItem>
                  <SelectItem value="parcel">Посилка</SelectItem>
                  <SelectItem value="client">Клієнт</SelectItem>
                  <SelectItem value="user">Користувач</SelectItem>
                  <SelectItem value="trip">Рейс</SelectItem>
                  <SelectItem value="pricing">Тариф</SelectItem>
                  <SelectItem value="cash_entry">Каса</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="audit-from" className="text-xs">Від</Label>
              <Input id="audit-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="audit-to" className="text-xs">До</Label>
              <Input id="audit-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <Button onClick={fetchData} disabled={loading}>
              {loading ? 'Завантаження...' : 'Оновити'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && !data ? (
        <div className="text-center py-12 text-gray-500">Завантаження...</div>
      ) : !data || data.entries.length === 0 ? (
        <div className="text-center py-12 text-gray-500">Немає записів</div>
      ) : (
        <div className="bg-white rounded-lg border divide-y">
          {data.entries.map((row) => {
            const href = subjectHref(row.subjectType, row.subjectId);
            return (
              <div key={row.id} className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`text-xs ${eventTone(row.event)}`}>{labelEvent(row.event)}</Badge>
                    {row.subjectType && (
                      <span className="text-xs text-gray-500">{row.subjectType}</span>
                    )}
                    {href && (
                      <Link href={href} className="text-xs text-blue-600 hover:underline font-mono">
                        {row.subjectId?.slice(0, 8)}…
                      </Link>
                    )}
                  </div>
                  {row.payload != null && typeof row.payload === 'object' && (
                    <div className="text-xs text-gray-500 mt-1 font-mono break-all line-clamp-2">
                      {JSON.stringify(row.payload)}
                    </div>
                  )}
                </div>
                <div className="text-xs text-gray-500 shrink-0 sm:text-right">
                  <div>{row.actor?.fullName || 'Система'}</div>
                  <div>{formatDateTime(row.createdAt)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
