'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type ParcelStatusType } from '@/lib/constants/statuses';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';
import { formatDate, formatDateWithWeekday } from '@/lib/utils/format';
import { parcelParties } from '@/lib/parcels/party-snapshot';
import { useAuth } from '@/lib/hooks/use-auth';
import { ROLES } from '@/lib/constants/roles';

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
  // ТЗ docx 26.07.26 (п.1): знімок сторін для accepted+ (див. parcelParties).
  senderSnapshot: unknown;
  receiverSnapshot: unknown;
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
  // ТЗ docx 26.07.26 (п.1): для accepted+ беремо сторону зі знімка, не з живих даних.
  const pt = parcelParties(p);
  const party = showSender ? pt.sender : pt.receiver;
  return {
    roleLabel: showSender ? 'Відправник' : 'Отримувач',
    name: `${party.lastName} ${party.firstName}`,
    phone: party.phone,
    addr: party.address,
  };
}

export default function RoutesPage() {
  // ТЗ docx 21.08.26: селектор поїздок — лише Суперадміну; водій бачить текучу поїздку.
  const { role } = useAuth();
  const isSuperAdmin = role === ROLES.SUPER_ADMIN;
  const [journeys, setJourneys] = useState<JourneyOption[]>([]);
  const [selectedJourneyId, setSelectedJourneyId] = useState('');
  const [journeysLoaded, setJourneysLoaded] = useState(false);
  const [parcels, setParcels] = useState<RouteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskStatus>>({});
  const [failureReasons, setFailureReasons] = useState<Record<string, string>>({});
  const [reschedDates, setReschedDates] = useState<Record<string, string>>({});
  // ТЗ docx 08.08.26 (v12): вибір адрес у загальному списку → для нового Маршрутного листа.
  const [selectedParcelIds, setSelectedParcelIds] = useState<Set<string>>(new Set());
  // ТЗ docx 08.08.26 (v12): RouteTask — адреса на маршруті (посилка або ручна).
  const [routeTasks, setRouteTasks] = useState<{
    id: string; parcelId: string | null; taskDate: string | null;
    status: string | null; failureReason: string | null;
    addressText: string | null; postalCode: string | null;
    manualName: string | null; manualPhone: string | null; manualDirection: string | null; manualCity: string | null;
  }[]>([]);
  // ТЗ docx 08.08.26 (v12): операційне вікно для РУЧНИХ адрес у листі (статус/причина
  // зберігаються на самому RouteTask, бо посилки немає). Ключ — id задачі.
  const [manualStatuses, setManualStatuses] = useState<Record<string, TaskStatus>>({});
  const [manualReasons, setManualReasons] = useState<Record<string, string>>({});
  const [sheetDate, setSheetDate] = useState('');
  const [creatingSheet, setCreatingSheet] = useState(false);
  // ТЗ docx 08.08.26 (v12): «Додати адресу» — ручний ввід довільної адреси.
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ addressText: '', postalCode: '', manualCity: '', manualName: '', manualPhone: '', manualDirection: '' });
  const [addingManual, setAddingManual] = useState(false);
  // ТЗ docx 08.08.26 (v12): групування списку адрес — за номером/індексом/містом.
  const [groupMode, setGroupMode] = useState<'number' | 'postal' | 'city'>('number');

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
    // ТЗ docx 08.08.26: задачі маршрутних листів (за датами) цієї поїздки.
    fetch(`/api/route-tasks?journeyId=${selectedJourneyId}`)
      .then(r => (r.ok ? r.json() : []))
      .then(d => {
        if (!active || !Array.isArray(d)) return;
        setRouteTasks(d);
        // Сідимо статуси/причини РУЧНИХ задач (без посилки) з даних сервера.
        const ms: Record<string, TaskStatus> = {};
        const mr: Record<string, string> = {};
        for (const t of d) {
          if (t.parcelId) continue;
          ms[t.id] = (t.status as TaskStatus) || 'pending';
          if (t.failureReason) mr[t.id] = t.failureReason;
        }
        setManualStatuses(ms);
        setManualReasons(mr);
      })
      .catch(() => {});
    fetch(`/api/parcels?journeyId=${selectedJourneyId}&limit=100`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!active) return;
        if (data?.parcels) {
          // ТЗ docx 08.08.26: у Маршрутному листі водій бачить УСІ посилки поїздки —
          // незалежно від статусу (раніше «Створена» ховались). Сортуємо за індексом
          // сторони в країні призначення.
          const sorted = (data.parcels as RouteItem[]).slice().sort((a, b) => {
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

  // ТЗ docx 08.08.26 (v12): «Створити Маршрутний лист» — відмічені у списку адреси
  // (посилки + ручні) переміщуються у лист на обрану дату (зникають із загального списку).
  async function handleCreateSheet() {
    if (!sheetDate || selectedParcelIds.size === 0) return;
    // Ручні адреси у виборі позначені префіксом «m:» (task id), решта — id посилок.
    const sel = Array.from(selectedParcelIds);
    const parcelIds = sel.filter(id => !id.startsWith('m:'));
    const taskIds = sel.filter(id => id.startsWith('m:')).map(id => id.slice(2));
    setCreatingSheet(true);
    const res = await fetch('/api/route-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskDate: sheetDate, parcelIds, taskIds }),
    });
    setCreatingSheet(false);
    if (res.ok) {
      setSelectedParcelIds(new Set());
      setSheetDate('');
      setReload(n => n + 1);
    }
  }

  // ТЗ docx 08.08.26 (v12): додати довільну адресу вручну (без посилки) у загальний список.
  async function handleAddManual() {
    if (!selectedJourneyId || !manualForm.addressText.trim()) return;
    setAddingManual(true);
    const res = await fetch('/api/route-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manual: true, journeyId: selectedJourneyId, ...manualForm }),
    });
    setAddingManual(false);
    if (res.ok) {
      setManualOpen(false);
      setManualForm({ addressText: '', postalCode: '', manualCity: '', manualName: '', manualPhone: '', manualDirection: '' });
      setReload(n => n + 1);
    }
  }

  async function handleRemoveFromSheet(taskId: string) {
    await fetch(`/api/route-tasks/${taskId}`, { method: 'DELETE' });
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

  // ТЗ docx 08.08.26 (v12): «Перенести» — адреса переміщується у Маршрутний лист
  // обраної дати (змінюємо taskDate задачі → вона зникає з поточного листа і
  // з'являється в цільовому). Порожня дата = скасувати (лишити де є).
  async function handleRescheduleTask(taskId: string, date: string) {
    if (!date) return;
    await fetch(`/api/route-tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskDate: date }),
    });
    setReload(n => n + 1);
  }

  // Операційний статус/причина РУЧНОЇ адреси в листі (зберігаються на RouteTask).
  function updateManualStatus(taskId: string, status: TaskStatus) {
    setManualStatuses(prev => ({ ...prev, [taskId]: status }));
    fetch(`/api/route-tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  }
  function updateManualReason(taskId: string, reason: string) {
    setManualReasons(prev => ({ ...prev, [taskId]: reason }));
    fetch(`/api/route-tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ failureReason: reason }),
    });
  }


  const TASK_LABELS = TASK_STATUS_LABELS;

  // ТЗ docx 08.08.26: групуємо задачі за ДАТОЮ — кожна дата = окремий Маршрутний лист.
  const parcelById = new Map(parcels.map(p => [p.id, p]));
  const sheets = (() => {
    const map = new Map<string, typeof routeTasks>();
    for (const t of routeTasks) {
      const key = (t.taskDate || '').slice(0, 10);
      if (!key) continue;
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, tasks]) => ({ date, tasks }));
  })();

  // ТЗ docx 08.08.26 (v12): посилки, вже переміщені у якийсь лист (RouteTask з датою),
  // зникають із загального списку. Загальний список = посилки поїздки ЩЕ не в листі.
  const sheetedParcelIds = new Set(
    routeTasks.filter(t => t.taskDate && t.parcelId).map(t => t.parcelId as string),
  );
  const generalParcels = parcels.filter(p => !sheetedParcelIds.has(p.id));
  // ТЗ docx 08.08.26 (v12): ручні адреси (без посилки), ще не переміщені в лист (taskDate=null).
  const manualGeneral = routeTasks.filter(t => !t.parcelId && !t.taskDate);

  // ТЗ docx 08.08.26 (v12): групування загального списку за номером/індексом/містом.
  const groupedGeneral = (() => {
    const keyOf = (p: RouteItem) => {
      if (groupMode === 'postal') return euDestParty(p).addr?.postalCode || 'Без індексу';
      if (groupMode === 'city') return euDestParty(p).addr?.city || 'Без міста';
      return ''; // 'number' — без груп (єдиний список за номером)
    };
    if (groupMode === 'number') {
      return [{ key: '', items: [...generalParcels].sort((a, b) => a.internalNumber.localeCompare(b.internalNumber)) }];
    }
    const map = new Map<string, RouteItem[]>();
    for (const p of generalParcels) {
      const k = keyOf(p);
      const arr = map.get(k) ?? [];
      arr.push(p);
      map.set(k, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([key, items]) => ({ key, items }));
  })();

  const selectedJourney = journeys.find(j => j.id === selectedJourneyId) || null;
  // ТЗ docx 08.08.26 (v12): у шапці — ПОВНІ імена водіїв (не лише прізвища).
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
          {/* ТЗ docx 08.08.26 (v12): максимально стисло, БЕЗ підписів полів —
              країни · дати (виїзд→повернення) · ПОВНІ імена водіїв · транспорт. */}
          {selectedJourney && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-gray-700">
              <span className="font-semibold">UA → {COUNTRY_LABELS[selectedJourney.country as CountryCode] || selectedJourney.country} → UA</span>
              <span className="text-gray-300">·</span>
              <span>
                {formatDateWithWeekday(selectedJourney.departureDate)}
                {(selectedJourney.endDate || selectedJourney.euReturnDate) &&
                  ` → ${formatDateWithWeekday((selectedJourney.endDate || selectedJourney.euReturnDate)!)}`}
              </span>
              {drivers && (<><span className="text-gray-300">·</span><span>{drivers}</span></>)}
              {selectedJourney.vehicleInfo && (<><span className="text-gray-300">·</span><span>{selectedJourney.vehicleInfo}</span></>)}
            </div>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>Друкувати</Button>
      </div>

      {/* ТЗ docx 21.08.26: селектор поїздок — лише Суперадміну (бачить усі поїздки).
          Водій бачить лише ТЕКУЧУ поїздку (авто-вибір найближчої), тож селектор прибрано. */}
      {isSuperAdmin && (
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
      )}

      {/* ТЗ docx 08.08.26 (v12): панель формування Маршрутного листа —
          групування списку + дата + кнопка «Створити» (з відмічених адрес). */}
      {selectedJourney && (
        <div className="flex flex-wrap items-center gap-2 mb-3 text-sm print:hidden">
          <span className="text-gray-500">Групувати:</span>
          {(['number', 'postal', 'city'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setGroupMode(m)}
              className={`px-2 py-1 rounded border text-xs ${groupMode === m ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 hover:bg-gray-50'}`}>
              {m === 'number' ? 'Номер' : m === 'postal' ? 'Індекс' : 'Місто'}
            </button>
          ))}
          <span className="mx-1 text-gray-300">|</span>
          <Input type="date" value={sheetDate} onChange={(e) => setSheetDate(e.target.value)} className="h-8 w-40 text-xs" />
          <Button size="sm" onClick={handleCreateSheet} disabled={!sheetDate || selectedParcelIds.size === 0 || creatingSheet}>
            {creatingSheet ? 'Створення…' : `Створити Маршрутний лист (${selectedParcelIds.size})`}
          </Button>
          <Button size="sm" variant="outline" onClick={toggleAllParcels}>
            {selectedParcelIds.size === generalParcels.length && generalParcels.length > 0 ? 'Зняти все' : 'Вибрати все'}
          </Button>
        </div>
      )}

      {/* ТЗ docx 08.08.26 (v12): створені Маршрутні листи по датах. Відкритий лист:
          країна · дата · відповідальний водій · транспорт · Друк + адреси зі статусами. */}
      {selectedJourney && sheets.length > 0 && (
        <div className="mb-4 space-y-2">
          {sheets.map((sheet, si) => (
            <div key={sheet.date} className="border rounded-lg bg-white overflow-hidden">
              <div className="px-3 py-2 border-b bg-blue-50/60 flex items-center justify-between text-sm gap-2">
                <div className="min-w-0">
                  <span className="font-semibold">Маршрутний лист {si + 1} · {formatDateWithWeekday(sheet.date)}</span>
                  <span className="ml-2 text-gray-600 text-xs">
                    {COUNTRY_LABELS[selectedJourney.country as CountryCode] || selectedJourney.country}
                    {drivers ? ` · ${drivers}` : ''}{selectedJourney.vehicleInfo ? ` · ${selectedJourney.vehicleInfo}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gray-400">{sheet.tasks.length} адрес</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs print:hidden" onClick={() => window.print()}>🖨 Друкувати</Button>
                </div>
              </div>
              <div className="divide-y">
                {sheet.tasks.map(t => {
                  const p = t.parcelId ? parcelById.get(t.parcelId) : null;
                  const isManual = !t.parcelId;
                  const d = p ? euDestParty(p) : null;
                  const a = d?.addr;
                  // Статус: посилка → parcel.routeTaskStatus (taskStatuses); ручна → RouteTask.status.
                  const ts: TaskStatus = (p ? taskStatuses[p.id] : manualStatuses[t.id]) || 'pending';
                  const onStatus = (v: string | null) => (p
                    ? updateTaskStatus(p.id, (v ?? 'pending') as TaskStatus)
                    : updateManualStatus(t.id, (v ?? 'pending') as TaskStatus));
                  return (
                    <div key={t.id} className="px-3 py-2 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        {p ? (
                          <Link href={`/parcels/${p.id}`} className="min-w-0">
                            <div className="text-gray-700">
                              {a ? <>{a.postalCode ? `${a.postalCode} ` : ''}{a.city}{a.street ? `, ${a.street}` : ''}{a.building ? ` ${a.building}` : ''}</> : 'Адресу не вказано'}
                            </div>
                            <div className="text-xs text-gray-500"><span className="font-mono mr-1">{p.internalNumber}</span>{d?.name} · {d?.phone} · {p.direction === 'eu_to_ua' ? `${selectedJourney.country}-UA` : `UA-${selectedJourney.country}`}</div>
                          </Link>
                        ) : isManual ? (
                          // ТЗ docx 08.08.26 (v12): ручна адреса в листі — повноцінний запис (не «прибрано»).
                          <Link href="/parcels/new" className="min-w-0">
                            <div className="text-gray-700">
                              <span className="text-amber-500 mr-1">✎</span>
                              {t.postalCode ? `${t.postalCode} ` : ''}{t.manualCity || ''}{t.addressText ? `${t.manualCity ? ', ' : ''}${t.addressText}` : ''}
                            </div>
                            <div className="text-xs text-amber-600">Ручна адреса{t.manualName ? ` · ${t.manualName}` : ''}{t.manualPhone ? ` · ${t.manualPhone}` : ''}{t.manualDirection ? ` · ${t.manualDirection}` : ''}</div>
                          </Link>
                        ) : <span className="text-gray-400 text-xs">Посилку прибрано з поїздки</span>}
                        <button type="button" onClick={() => handleRemoveFromSheet(t.id)} className="text-xs text-red-500 hover:text-red-700 shrink-0 print:hidden">Прибрати</button>
                      </div>
                      {/* ТЗ docx 08.08.26 (v12): операційне вікно статусу адреси в листі (посилки і ручні). */}
                      {(p || isManual) && (
                        <div className="mt-1 flex flex-wrap gap-1 print:hidden">
                          <Select value={ts} onValueChange={onStatus}>
                            <SelectTrigger className="h-7 text-xs w-44"><SelectValue>{TASK_LABELS[ts]}</SelectValue></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Очікує</SelectItem>
                              <SelectItem value="address_confirmed">Адресу підтверджено</SelectItem>
                              <SelectItem value="in_navigator">Внесено в навігатор</SelectItem>
                              <SelectItem value="completed">Виконано</SelectItem>
                              <SelectItem value="rescheduled">Перенести</SelectItem>
                              <SelectItem value="not_completed">Не виконано</SelectItem>
                            </SelectContent>
                          </Select>
                          {ts === 'not_completed' && (
                            <Input className="h-7 text-xs w-40" placeholder="Причина..."
                              value={(p ? failureReasons[p.id] : manualReasons[t.id]) || ''}
                              onChange={(e) => (p ? updateFailReason(p.id, e.target.value) : updateManualReason(t.id, e.target.value))} />
                          )}
                          {ts === 'rescheduled' && (
                            <Input type="date" className="h-7 text-xs w-36" title="Оберіть дату — адреса переміститься у відповідний лист"
                              value={(p ? reschedDates[p.id] : '') || ''}
                              onChange={(e) => { if (p) updateReschedDate(p.id, e.target.value); handleRescheduleTask(t.id, e.target.value); }} />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Завантаження...</div>
      ) : !selectedJourney ? (
        <div className="text-center py-12 text-gray-500">
          {journeysLoaded && journeys.length === 0
            ? 'Немає активних поїздок. Створіть поїздку у розділі «Поїздки».'
            : 'Виберіть поїздку, щоб побачити маршрутний лист.'}
        </div>
      ) : (
        // ТЗ docx 08.08.26 (v12): загальний список адрес (посилки + ручні), ще не в листах.
        // Кожен запис — 2 рядки: [№ + адреса в країні перебування + чекбокс справа] / [клієнт · тел · напрямок].
        <div className="space-y-3">
          {generalParcels.length === 0 && manualGeneral.length === 0 && (
            <div className="text-center py-8 text-gray-500 border rounded-lg bg-white">
              {parcels.length === 0 ? 'У цій поїздці ще немає посилок' : 'Усі адреси поїздки вже у Маршрутних листах'}
            </div>
          )}
          {groupedGeneral.map((grp, gi) => (
            <div key={grp.key || `g${gi}`}>
              {grp.key && <div className="text-xs font-semibold text-gray-500 mb-1 px-1">{groupMode === 'postal' ? 'Індекс' : 'Місто'}: {grp.key}</div>}
              <div className="bg-white rounded-lg border divide-y">
                {grp.items.map((p, idx) => {
                  const d = euDestParty(p);
                  const a = d.addr;
                  return (
                    <div key={p.id} className="px-3 py-2">
                      {/* Верхній рядок: № + адреса (індекс, місто, вулиця, будинок) + чекбокс справа */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 font-mono shrink-0">{idx + 1}.</span>
                        <Link href={`/parcels/${p.id}`} className="min-w-0 flex-1 text-sm hover:text-blue-600 truncate">
                          {a
                            ? <>{a.postalCode ? `${a.postalCode} ` : ''}{a.city}{a.street ? `, ${a.street}` : ''}{a.building ? ` ${a.building}` : ''}</>
                            : <span className="text-gray-400">Адресу не вказано</span>}
                        </Link>
                        <div className="shrink-0">
                          <Checkbox checked={selectedParcelIds.has(p.id)} onCheckedChange={() => toggleParcelSelection(p.id)} />
                        </div>
                      </div>
                      {/* Нижній рядок: клієнт · телефон · напрямок */}
                      <Link href={`/parcels/${p.id}`} className="block text-xs text-gray-500 mt-0.5 ml-5">
                        <span className="font-mono text-gray-400 mr-1">{p.internalNumber}</span>
                        {d.name} · {d.phone} · {p.direction === 'eu_to_ua' ? `${selectedJourney.country}-UA` : `UA-${selectedJourney.country}`}
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* ТЗ docx 08.08.26 (v12): ручні адреси (додані Водієм) у загальному списку. */}
          {manualGeneral.length > 0 && (
            <div className="bg-white rounded-lg border divide-y">
              {manualGeneral.map((t, idx) => {
                const selId = `m:${t.id}`;
                return (
                  <div key={t.id} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-amber-500 font-mono shrink-0">✎{idx + 1}.</span>
                      <Link href="/parcels/new" className="min-w-0 flex-1 text-sm truncate hover:text-blue-600">
                        {t.postalCode ? `${t.postalCode} ` : ''}{t.manualCity || ''}{t.addressText ? `${t.manualCity ? ', ' : ''}${t.addressText}` : ''}
                      </Link>
                      <div className="shrink-0">
                        <Checkbox checked={selectedParcelIds.has(selId)} onCheckedChange={() => toggleParcelSelection(selId)} />
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 ml-5 flex items-center gap-1">
                      <span className="text-amber-600">Ручна адреса</span>
                      {t.manualName ? ` · ${t.manualName}` : ''}{t.manualPhone ? ` · ${t.manualPhone}` : ''}{t.manualDirection ? ` · ${t.manualDirection}` : ''}
                      <button type="button" onClick={() => handleRemoveFromSheet(t.id)} className="ml-auto text-red-500 hover:text-red-700 print:hidden">Видалити</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ТЗ docx 08.08.26 (v12): «Додати адресу» — завжди під останнім записом. */}
          {!manualOpen ? (
            <Button variant="outline" size="sm" onClick={() => setManualOpen(true)} className="print:hidden">+ Додати адресу</Button>
          ) : (
            <div className="border rounded-lg p-3 bg-amber-50/40 space-y-2 print:hidden">
              <div className="text-xs font-semibold text-gray-600">Нова адреса на маршруті (вручну або copy-paste)</div>
              <Input placeholder="Адреса: індекс, місто, вулиця, будинок" value={manualForm.addressText} onChange={(e) => setManualForm(f => ({ ...f, addressText: e.target.value }))} className="h-8 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Індекс" value={manualForm.postalCode} onChange={(e) => setManualForm(f => ({ ...f, postalCode: e.target.value }))} className="h-8 text-sm" />
                <Input placeholder="Місто" value={manualForm.manualCity} onChange={(e) => setManualForm(f => ({ ...f, manualCity: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="Клієнт (необовʼязково)" value={manualForm.manualName} onChange={(e) => setManualForm(f => ({ ...f, manualName: e.target.value }))} className="h-8 text-sm" />
                <Input placeholder="Телефон" value={manualForm.manualPhone} onChange={(e) => setManualForm(f => ({ ...f, manualPhone: e.target.value }))} className="h-8 text-sm" />
                <Input placeholder="Напрямок (UA-NL)" value={manualForm.manualDirection} onChange={(e) => setManualForm(f => ({ ...f, manualDirection: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAddManual} disabled={!manualForm.addressText.trim() || addingManual}>{addingManual ? 'Додавання…' : 'Додати'}</Button>
                <Button size="sm" variant="ghost" onClick={() => setManualOpen(false)}>Скасувати</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
