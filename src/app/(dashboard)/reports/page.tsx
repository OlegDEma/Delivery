'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { STATUS_LABELS, STATUS_COLORS, type ParcelStatusType } from '@/lib/constants/statuses';

interface WarehouseParcel {
  id: string;
  internalNumber: string;
  totalWeight: number | null;
  totalPlacesCount: number;
  receiver: { firstName: string; lastName: string };
  receiverAddress: { city: string } | null;
}

interface CourierUser {
  id: string;
  fullName: string;
  role: string;
}

interface CourierReport {
  courier: CourierUser;
  parcelCount: number;
  totalWeight: number;
  totalCost: number;
}

interface TripData {
  id: string;
  departureDate: string;
  country: string;
  direction: string;
  status: string;
  assignedCourier: { fullName: string } | null;
  _count: { parcels: number };
}

interface TripReport {
  trip: TripData;
  parcels: {
    id: string;
    internalNumber: string;
    status: ParcelStatusType;
    totalWeight: number | null;
  }[];
  totalWeight: number;
  statusBreakdown: Record<string, number>;
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('warehouse');

  // Warehouse tab
  const [warehouseParcels, setWarehouseParcels] = useState<WarehouseParcel[]>([]);
  const [warehouseLoading, setWarehouseLoading] = useState(false);

  // Courier tab
  const [courierReports, setCourierReports] = useState<CourierReport[]>([]);
  const [courierLoading, setCourierLoading] = useState(false);

  // Trip tab
  const [tripReports, setTripReports] = useState<TripReport[]>([]);
  const [tripLoading, setTripLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'warehouse') fetchWarehouse();
    else if (activeTab === 'courier') fetchCouriers();
    else if (activeTab === 'trip') fetchTrips();
  }, [activeTab]);

  async function fetchWarehouse() {
    setWarehouseLoading(true);
    const res = await fetch('/api/parcels?status=at_lviv_warehouse&limit=100');
    if (res.ok) {
      const data = await res.json();
      setWarehouseParcels(data.parcels || []);
    }
    setWarehouseLoading(false);
  }

  async function fetchCouriers() {
    setCourierLoading(true);
    const usersRes = await fetch('/api/users');
    if (!usersRes.ok) { setCourierLoading(false); return; }
    const users: CourierUser[] = await usersRes.json();
    const couriers = users.filter((u: CourierUser) => u.role === 'driver_courier');

    const reports: CourierReport[] = [];
    for (const courier of couriers) {
      const parcelsRes = await fetch(`/api/parcels?courierId=${courier.id}&limit=100`);
      if (parcelsRes.ok) {
        const data = await parcelsRes.json();
        const parcels = data.parcels || [];
        const totalWeight = parcels.reduce((s: number, p: { totalWeight: number | null }) => s + (Number(p.totalWeight) || 0), 0);
        const totalCost = parcels.reduce((s: number, p: { calculatedCost: number | null }) => s + (Number(p.calculatedCost) || 0), 0);
        reports.push({
          courier,
          parcelCount: parcels.length,
          totalWeight,
          totalCost,
        });
      }
    }
    setCourierReports(reports);
    setCourierLoading(false);
  }

  async function fetchTrips() {
    setTripLoading(true);
    const tripsRes = await fetch('/api/trips');
    if (!tripsRes.ok) { setTripLoading(false); return; }
    const trips: TripData[] = await tripsRes.json();

    const reports: TripReport[] = [];
    for (const trip of trips.slice(0, 20)) {
      const parcelsRes = await fetch(`/api/parcels?tripId=${trip.id}&limit=100`);
      if (parcelsRes.ok) {
        const data = await parcelsRes.json();
        const parcels = data.parcels || [];
        const totalWeight = parcels.reduce((s: number, p: { totalWeight: number | null }) => s + (Number(p.totalWeight) || 0), 0);
        const statusBreakdown: Record<string, number> = {};
        parcels.forEach((p: { status: string }) => {
          statusBreakdown[p.status] = (statusBreakdown[p.status] || 0) + 1;
        });
        reports.push({ trip, parcels, totalWeight, statusBreakdown });
      }
    }
    setTripReports(reports);
    setTripLoading(false);
  }

  const warehouseTotalWeight = warehouseParcels.reduce((s, p) => s + (Number(p.totalWeight) || 0), 0);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Звіти</h1>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as string)}>
        <TabsList className="mb-4">
          <TabsTrigger value="warehouse">По складу</TabsTrigger>
          <TabsTrigger value="courier">По кур&apos;єру</TabsTrigger>
          <TabsTrigger value="trip">По рейсу</TabsTrigger>
        </TabsList>

        {/* Warehouse tab */}
        <TabsContent value="warehouse">
          {warehouseLoading ? (
            <div className="text-center py-12 text-gray-500">Завантаження...</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">{warehouseParcels.length}</div>
                    <div className="text-sm text-gray-500">Посилок на складі</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">{warehouseTotalWeight.toFixed(1)} кг</div>
                    <div className="text-sm text-gray-500">Загальна вага</div>
                  </CardContent>
                </Card>
              </div>

              <div className="bg-white rounded-lg border divide-y">
                {warehouseParcels.map(p => (
                  <div key={p.id} className="p-3 flex items-center justify-between">
                    <div>
                      <span className="font-mono text-sm font-medium">{p.internalNumber}</span>
                      <span className="text-sm text-gray-500 ml-2">
                        {p.receiver.lastName} {p.receiver.firstName}
                      </span>
                      {p.receiverAddress && (
                        <span className="text-xs text-gray-400 ml-2">{p.receiverAddress.city}</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600">
                      {p.totalWeight ? `${Number(p.totalWeight).toFixed(1)} кг` : '—'} | {p.totalPlacesCount} м.
                    </div>
                  </div>
                ))}
                {warehouseParcels.length === 0 && (
                  <div className="text-center py-8 text-gray-500">Немає посилок на складі</div>
                )}
              </div>
            </>
          )}
        </TabsContent>

        {/* Courier tab */}
        <TabsContent value="courier">
          {courierLoading ? (
            <div className="text-center py-12 text-gray-500">Завантаження...</div>
          ) : (
            <div className="space-y-4">
              {courierReports.map(r => (
                <Card key={r.courier.id}>
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-base">{r.courier.fullName}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-xl font-bold">{r.parcelCount}</div>
                        <div className="text-xs text-gray-500">Посилок</div>
                      </div>
                      <div>
                        <div className="text-xl font-bold">{r.totalWeight.toFixed(1)}</div>
                        <div className="text-xs text-gray-500">Вага (кг)</div>
                      </div>
                      <div>
                        <div className="text-xl font-bold">{r.totalCost.toFixed(2)}</div>
                        <div className="text-xs text-gray-500">Вартість (EUR)</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {courierReports.length === 0 && (
                <div className="text-center py-8 text-gray-500">Немає даних</div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Trip tab */}
        <TabsContent value="trip">
          {tripLoading ? (
            <div className="text-center py-12 text-gray-500">Завантаження...</div>
          ) : (
            <div className="space-y-4">
              {tripReports.map(r => (
                <Card key={r.trip.id}>
                  <CardHeader className="py-3 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        {r.trip.country} | {new Date(r.trip.departureDate).toLocaleDateString('uk-UA')}
                      </CardTitle>
                      <Badge className="text-xs">{r.trip.status}</Badge>
                    </div>
                    {r.trip.assignedCourier && (
                      <div className="text-xs text-gray-500">{r.trip.assignedCourier.fullName}</div>
                    )}
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0">
                    <div className="grid grid-cols-2 gap-4 text-center mb-3">
                      <div>
                        <div className="text-xl font-bold">{r.parcels.length}</div>
                        <div className="text-xs text-gray-500">Посилок</div>
                      </div>
                      <div>
                        <div className="text-xl font-bold">{r.totalWeight.toFixed(1)}</div>
                        <div className="text-xs text-gray-500">Вага (кг)</div>
                      </div>
                    </div>
                    {Object.keys(r.statusBreakdown).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(r.statusBreakdown).map(([status, count]) => (
                          <Badge
                            key={status}
                            className={`text-xs ${STATUS_COLORS[status as ParcelStatusType] || 'bg-gray-100 text-gray-700'}`}
                          >
                            {STATUS_LABELS[status as ParcelStatusType] || status}: {count}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {tripReports.length === 0 && (
                <div className="text-center py-8 text-gray-500">Немає рейсів</div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
