'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STATUS_LABELS, STATUS_COLORS, type ParcelStatusType } from '@/lib/constants/statuses';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';
import { formatDate, formatDateWithWeekday } from '@/lib/utils/format';

interface PartyAddr {
  country: string | null;
  city: string;
  street: string | null;
  building: string | null;
  postalCode: string | null;
  landmark: string | null;
  npWarehouseNum: string | null;
  deliveryMethod?: string | null;
}

interface RouteItem {
  id: string;
  internalNumber: string;
  shortNumber: number | null;
  status: ParcelStatusType;
  direction: string;
  totalWeight: number | null;
  totalPlacesCount: number;
  assignedCourierId: string | null;
  estimatedDeliveryStart: string | null;
  estimatedDeliveryEnd: string | null;
  sender: { firstName: string; lastName: string; phone: string };
  receiver: { firstName: string; lastName: string; phone: string };
  senderAddress: PartyAddr | null;
  receiverAddress: PartyAddr | null;
  routeTaskStatus: string | null;
  routeTaskFailReason: string | null;
  routeTaskReschedDate: string | null;
}

interface JourneyOption {
  id: string;
  country: string;
  departureDate: string;
  euReturnDate: string | null;
  endDate: string | null;
  vehicleInfo: string | null;
  assignedCourier: { id: string; fullName: string } | null;
  secondCourier: { id: string; fullName: string } | null;
}

type TaskStatus = 'pending' | 'address_confirmed' | 'in_navigator' | 'completed' | 'not_completed' | 'rescheduled';

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Очікує',
  address_confirmed: 'Адресу підтверджено',
  in_navigator: 'В навігаторі',
  completed: 'Виконано',
  not_completed: 'Не виконано',
  rescheduled: 'Перенесено',
};

const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  pending: 'bg-gray-100 text-gray-700',
  address_confirmed: 'bg-blue-100 text-blue-700',
  in_navigator: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-green-100 text-green-700',
  not_completed: 'bg-red-100 text-red-700',
  rescheduled: 'bg-yellow-100 text-yellow-700',
};

interface CourierUser {
  id: string;
  fullName: string;
  role: string;
}

/** UA → {EU} → UA · дата — компактний лейбл поїздки для селектора. */
function journeyLabel(j: JourneyOption): string {
  const c = COUNTRY_LABELS[j.country as CountryCode] || j.country;
  return `UA → ${c} → UA · ${formatDate(j.departureDate)}`;
}

/**
 * ТЗ docx 21.07.26 (п.3): у Маршрутному листі показуємо сторону в країні
 * ПРИЗНАЧЕННЯ поїздки (EU). Посилка EU→UA (eu_to_ua) → Відправник у EU;
 * посилка UA→EU (ua_to_eu) → Отримувач у EU. UA-сторону видно лише при
 * відкритті конкретної посилки.
 */
function euDestParty(p: RouteItem) {
  const showSender = p.direction === 'eu_to_ua';
  return showSender
    ? { roleLabel: 'Відправник', name: `${p.sender.lastName} ${p.sender.firstName}`, phone: p.sender.phone, addr: p.senderAddress }
    : { roleLabel: 'Отримувач', name: `${p.receiver.lastName} ${p.receiver.firstName}`, phone: p.receiver.phone, addr: p.receiverAddress };
}

export default function RoutesPage() {
  const [journeys, setJourneys] = useState<JourneyOption[]>([]);
  const [selectedJourneyId, setSelectedJourneyId] = useState('');
  const [journeysLoaded, setJourneysLoaded] = useState(false);
  const [parcels, setParcels] = useState<RouteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskStatus>>({});
  const [failureReasons, setFailureReasons] = useState<Record<string, string>>({});
  const [reschedDates, setReschedDates] = useState<Record<string, string>>({});
  const [couriers, setCouriers] = useState<CourierUser[]>([]);
  const [selectedCourierId, setSelectedCourierId] = useState('');
  const [selectedParcelIds, setSelectedParcelIds] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);

  // Завантажуємо поїздки; дефолт — ?journeyId з URL або найближча до сьогодні.
  useEffect(() => {
    fetch('/api/journeys')
      .then(r => (r.ok ? r.json() : []))
      .then((data: JourneyOption[]) => {
        setJourneys(data);
        setJourneysLoaded(true);
        const urlId = new URLSearchParams(window.location.search).get('journeyId');
        if (urlId && data.some(j => j.id === urlId)) {
          setSelectedJourneyId(urlId);
        } else if (data.length > 0) {
          const now = Date.now();
          const nearest = [...data].sort(
            (a, b) =>
              Math.abs(new Date(a.departureDate).getTime() - now) -
              Math.abs(new Date(b.departureDate).getTime() - now)
          )[0];
          setSelectedJourneyId(nearest.id);
        } else {
          setLoading(false);
        }
      })
      .catch(() => { setJourneysLoaded(true); setLoading(false); });
  }, []);

  // reload-лічильник: після призначення кур'єра піднімаємо його, і ефект нижче
  // перезавантажує посилки (setState лише в .then-колбеку, не синхронно в ефекті).
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!selectedJourneyId) return;
    let active = true;
    fetch(`/api/parcels?journeyId=${selectedJourneyId}&limit=100`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!active) return;
        if (data?.parcels) {
          // ТЗ: сортуємо за поштовим індексом сторони в країні призначення.
          const sorted = (data.parcels as RouteItem[]).sort((a, b) => {
            const ca = euDestParty(a).addr?.postalCode || '';
            const cb = euDestParty(b).addr?.postalCode || '';
            return ca.localeCompare(cb);
          });
          setParcels(sorted);
          const statuses: Record<string, TaskStatus> = {};
          const reasons: Record<string, string> = {};
          const rescheds: Record<string, string> = {};
          sorted.forEach(p => {
            statuses[p.id] = (p.routeTaskStatus as TaskStatus) || 'pending';
            if (p.routeTaskFailReason) reasons[p.id] = p.routeTaskFailReason;
            if (p.routeTaskReschedDate) rescheds[p.id] = p.routeTaskReschedDate.split('T')[0];
          });
          setTaskStatuses(statuses);
          setFailureReasons(reasons);
          setReschedDates(rescheds);
        }
        setLoading(false);
      })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedJourneyId, reload]);

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.ok ? r.json() : [])
      .then((users: CourierUser[]) => {
        setCouriers(users.filter(u => u.role === 'driver_courier'));
      });
  }, []);

  function toggleParcelSelection(parcelId: string) {
    setSelectedParcelIds(prev => {
      const next = new Set(prev);
      if (next.has(parcelId)) next.delete(parcelId);
      else next.add(parcelId);
      return next;
    });
  }

  function toggleAllParcels() {
    if (selectedParcelIds.size === parcels.length) {
      setSelectedParcelIds(new Set());
    } else {
      setSelectedParcelIds(new Set(parcels.map(p => p.id)));
    }
  }

  async function handleAssignCourier() {
    if (!selectedCourierId || selectedParcelIds.size === 0) return;
    setAssigning(true);
    const promises = Array.from(selectedParcelIds).map(id =>
      fetch(`/api/parcels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedCourierId: selectedCourierId }),
      })
    );
    await Promise.all(promises);
    setAssigning(false);
    setSelectedParcelIds(new Set());
    setReload(n => n + 1);
  }

  function updateTaskStatus(parcelId: string, status: TaskStatus) {
    setTaskStatuses(prev => ({ ...prev, [parcelId]: status }));
    fetch(`/api/parcels/${parcelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routeTaskStatus: status }),
    });
  }

  function updateFailReason(parcelId: string, reason: string) {
    setFailureReasons(prev => ({ ...prev, [parcelId]: reason }));
    fetch(`/api/parcels/${parcelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routeTaskFailReason: reason }),
    });
  }

  function updateReschedDate(parcelId: string, date: string) {
    setReschedDates(prev => ({ ...prev, [parcelId]: date }));
    fetch(`/api/parcels/${parcelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routeTaskReschedDate: date || null }),
    });
  }

  const completedCount = Object.values(taskStatuses).filter(s => s === 'completed').length;
  const totalWeight = parcels.reduce((s, p) => s + (Number(p.totalWeight) || 0), 0);
  const totalPlaces = parcels.reduce((s, p) => s + p.totalPlacesCount, 0);

  const TASK_LABELS = TASK_STATUS_LABELS;

  const selectedJourney = journeys.find(j => j.id === selectedJourneyId) || null;
  // ТЗ docx 21.07.26 (п.3): «прізвища водіїв». Profile має лише fullName —
  // показуємо повне ім'я (прізвище в ньому міститься); двох водіїв через кому.
  const drivers = [selectedJourney?.assignedCourier?.fullName, selectedJourney?.secondCourier?.fullName]
    .filter(Boolean)
    .join(', ');

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Маршрутний лист</h1>
          {/* ТЗ docx 21.07.26 (п.3): зверху — дата поїздки, прізвища водіїв,
              номер машини (саме в цьому порядку). Видимі й у друку. */}
          {selectedJourney && (
            <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              <span>
                <span className="text-gray-500">Дата поїздки:</span>{' '}
                <span className="font-medium">{formatDateWithWeekday(selectedJourney.departureDate)}</span>
              </span>
              <span>
                <span className="text-gray-500">Водії:</span>{' '}
                <span className="font-medium">{drivers || '—'}</span>
              </span>
              <span>
                <span className="text-gray-500">Машина:</span>{' '}
                <span className="font-medium">{selectedJourney.vehicleInfo || '—'}</span>
              </span>
            </div>
          )}
          <p className="text-sm text-gray-500 mt-1">
            {completedCount}/{parcels.length} виконано | {totalPlaces} місць | {totalWeight.toFixed(1)} кг
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>Друкувати</Button>
      </div>

      {/* Вибір поїздки — лист показує посилки ОБОХ її рейсів. */}
      <div className="flex gap-2 mb-4 print:hidden">
        <Select value={selectedJourneyId} onValueChange={(v) => { setSelectedJourneyId(v ?? ''); setLoading(true); }}>
          <SelectTrigger className="w-96 h-9 text-sm">
            <SelectValue placeholder="Виберіть поїздку">
              {selectedJourney ? journeyLabel(selectedJourney) : 'Виберіть поїздку'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="min-w-[24rem]">
            {journeys.map(j => (
              <SelectItem key={j.id} value={j.id}>{journeyLabel(j)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Courier assignment section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-blue-800">Призначити кур&apos;єра:</span>
          <Select value={selectedCourierId} onValueChange={(v) => setSelectedCourierId(v ?? '')}>
            <SelectTrigger className="w-56 h-8 text-sm">
              <SelectValue>{selectedCourierId ? (couriers.find(c => c.id === selectedCourierId)?.fullName || 'Виберіть кур\'єра') : 'Виберіть кур\'єра'}</SelectValue>
            </SelectTrigger>
            <SelectContent className="min-w-[16rem]">
              {couriers.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={handleAssignCourier}
            disabled={!selectedCourierId || selectedParcelIds.size === 0 || assigning}
          >
            {assigning ? 'Призначення...' : `Призначити кур'єра (${selectedParcelIds.size})`}
          </Button>
          <Button size="sm" variant="outline" onClick={toggleAllParcels}>
            {selectedParcelIds.size === parcels.length && parcels.length > 0 ? 'Зняти все' : 'Вибрати все'}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Завантаження...</div>
      ) : !selectedJourney ? (
        <div className="text-center py-12 text-gray-500">
          {journeysLoaded && journeys.length === 0
            ? 'Немає активних поїздок. Створіть поїздку у розділі «Поїздки».'
            : 'Виберіть поїздку, щоб побачити маршрутний лист.'}
        </div>
      ) : (
        <div className="bg-white rounded-lg border divide-y">
          {parcels.map((p, idx) => {
            const ts = taskStatuses[p.id] || 'pending';
            const d = euDestParty(p);
            return (
              <div key={p.id} className={`p-3 ${ts === 'completed' ? 'bg-green-50/50' : ts === 'not_completed' ? 'bg-red-50/50' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  {/* Checkbox for courier assignment */}
                  <div className="pt-1 print:hidden">
                    <Checkbox
                      checked={selectedParcelIds.has(p.id)}
                      onCheckedChange={() => toggleParcelSelection(p.id)}
                    />
                  </div>
                  {/* Left: info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-gray-400 font-mono w-5">{idx + 1}.</span>
                      {p.shortNumber && <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono font-bold">#{p.shortNumber}</span>}
                      <Link href={`/parcels/${p.id}`} className="font-mono text-sm font-medium hover:text-blue-600">{p.internalNumber}</Link>
                      <Badge className={`text-xs ${STATUS_COLORS[p.status]}`}>{STATUS_LABELS[p.status]}</Badge>
                    </div>

                    <div className="ml-7">
                      <div className="text-sm font-medium">
                        {d.name}
                        <span className="ml-2 text-[10px] font-normal uppercase tracking-wide text-gray-400">{d.roleLabel}</span>
                      </div>
                      <div className="text-xs text-gray-600">{d.phone}</div>
                      {d.addr && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          {d.addr.postalCode && <span className="font-mono mr-1">{d.addr.postalCode}</span>}
                          {d.addr.city}
                          {d.addr.street ? `, ${d.addr.street}` : ''}
                          {d.addr.building ? ` ${d.addr.building}` : ''}
                          {d.addr.landmark && (
                            <span className="italic text-gray-500"> ({d.addr.landmark})</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: weight + status control */}
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-medium">{p.totalWeight ? `${Number(p.totalWeight).toFixed(1)} кг` : '—'}</div>
                    <div className="text-xs text-gray-400 mb-1">{p.totalPlacesCount} м.</div>
                  </div>
                </div>

                {/* Task status controls */}
                <div className="ml-7 mt-2 flex flex-wrap gap-1 print:hidden">
                  <Select value={ts} onValueChange={(v) => updateTaskStatus(p.id, (v ?? 'pending') as TaskStatus)}>
                    <SelectTrigger className="h-7 text-xs w-48">
                      <SelectValue>{TASK_LABELS[ts]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Очікує</SelectItem>
                      <SelectItem value="address_confirmed">Адресу підтверджено</SelectItem>
                      <SelectItem value="in_navigator">Внесено в навігатор</SelectItem>
                      <SelectItem value="completed">Виконано</SelectItem>
                      <SelectItem value="not_completed">Не виконано</SelectItem>
                      <SelectItem value="rescheduled">Перенести</SelectItem>
                    </SelectContent>
                  </Select>

                  {ts === 'not_completed' && (
                    <Input
                      className="h-7 text-xs w-40"
                      placeholder="Причина..."
                      value={failureReasons[p.id] || ''}
                      onChange={(e) => updateFailReason(p.id, e.target.value)}
                    />
                  )}
                  {ts === 'rescheduled' && (
                    <Input
                      type="date"
                      className="h-7 text-xs w-36"
                      value={reschedDates[p.id] || ''}
                      onChange={(e) => updateReschedDate(p.id, e.target.value)}
                    />
                  )}

                  <Badge className={`text-xs ${TASK_STATUS_COLORS[ts]} print:border`}>
                    {TASK_LABELS[ts]}
                  </Badge>
                </div>
              </div>
            );
          })}
          {parcels.length === 0 && (
            <div className="text-center py-8 text-gray-500">У цій поїздці ще немає посилок</div>
          )}
        </div>
      )}
    </div>
  );
}
