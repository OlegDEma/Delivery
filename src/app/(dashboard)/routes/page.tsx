'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STATUS_LABELS, STATUS_COLORS, type ParcelStatusType } from '@/lib/constants/statuses';

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
  receiverAddress: {
    city: string;
    street: string | null;
    building: string | null;
    postalCode: string | null;
    landmark: string | null;
    npWarehouseNum: string | null;
  } | null;
  routeTaskStatus: string | null;
  routeTaskFailReason: string | null;
  routeTaskReschedDate: string | null;
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

export default function RoutesPage() {
  const [parcels, setParcels] = useState<RouteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);
  const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskStatus>>({});
  const [failureReasons, setFailureReasons] = useState<Record<string, string>>({});
  const [reschedDates, setReschedDates] = useState<Record<string, string>>({});
  const [couriers, setCouriers] = useState<CourierUser[]>([]);
  const [selectedCourierId, setSelectedCourierId] = useState('');
  const [selectedParcelIds, setSelectedParcelIds] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);

  const fetchParcels = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFilter) {
      params.set('dateFrom', dateFilter);
      params.set('dateTo', dateFilter);
    }
    params.set('limit', '100');

    const res = await fetch(`/api/parcels?${params}`);
    if (res.ok) {
      const data = await res.json();
      const sorted = (data.parcels as RouteItem[]).sort((a, b) => {
        const codeA = a.receiverAddress?.postalCode || '';
        const codeB = b.receiverAddress?.postalCode || '';
        return codeA.localeCompare(codeB);
      });
      setParcels(sorted);
      // Init task statuses from DB
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
  }, [dateFilter]);

  useEffect(() => { fetchParcels(); }, [fetchParcels]);

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
    fetchParcels();
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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Маршрутний лист</h1>
          <p className="text-sm text-gray-500">
            {completedCount}/{parcels.length} виконано | {totalPlaces} місць | {totalWeight.toFixed(1)} кг
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>Друкувати</Button>
      </div>

      <div className="flex gap-2 mb-4">
        <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-44" />
      </div>

      {/* Courier assignment section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-blue-800">Призначити кур&apos;єра:</span>
          <Select value={selectedCourierId} onValueChange={(v) => setSelectedCourierId(v ?? '')}>
            <SelectTrigger className="w-56 h-8 text-sm">
              <SelectValue>{selectedCourierId ? (couriers.find(c => c.id === selectedCourierId)?.fullName || 'Виберіть кур\'єра') : 'Виберіть кур\'єра'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
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
            {selectedParcelIds.size === parcels.length ? 'Зняти все' : 'Вибрати все'}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Завантаження...</div>
      ) : (
        <div className="bg-white rounded-lg border divide-y">
          {parcels.map((p, idx) => {
            const ts = taskStatuses[p.id] || 'pending';
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
                        {p.receiver.lastName} {p.receiver.firstName}
                      </div>
                      <div className="text-xs text-gray-600">{p.receiver.phone}</div>
                      {p.receiverAddress && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          {p.receiverAddress.postalCode && <span className="font-mono mr-1">{p.receiverAddress.postalCode}</span>}
                          {p.receiverAddress.city}
                          {p.receiverAddress.street ? `, ${p.receiverAddress.street}` : ''}
                          {p.receiverAddress.building ? ` ${p.receiverAddress.building}` : ''}
                          {p.receiverAddress.landmark && (
                            <span className="italic text-gray-500"> ({p.receiverAddress.landmark})</span>
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
            <div className="text-center py-8 text-gray-500">Немає посилок на цю дату</div>
          )}
        </div>
      )}
    </div>
  );
}
