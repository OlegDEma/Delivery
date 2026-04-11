'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatWeight } from '@/lib/utils/format';

interface PendingParcel {
  id: string;
  internalNumber: string;
  status: string;
  totalPlacesCount: number;
  totalWeight: number | null;
  createdAt: string;
  createdSource: string;
  sender: { firstName: string; lastName: string; phone: string };
  receiver: { firstName: string; lastName: string; phone: string };
  receiverAddress: { city: string; street: string | null } | null;
}

export default function PendingOrdersPage() {
  const [parcels, setParcels] = useState<PendingParcel[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchPending() {
    setLoading(true);
    const res = await fetch('/api/parcels?status=draft&limit=50');
    if (res.ok) {
      const data = await res.json();
      // Show only client-created orders
      setParcels(data.parcels.filter((p: PendingParcel) => p.createdSource === 'client_web' || p.createdSource === 'client_telegram'));
    }
    setLoading(false);
  }

  useEffect(() => { fetchPending(); }, []);

  async function handleConfirm(parcelId: string) {
    const direction = parcels.find(p => p.id === parcelId);
    const status = direction ? 'accepted_for_transport_to_ua' : 'accepted_for_transport_to_ua';
    await fetch(`/api/parcels/${parcelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, statusNote: 'Підтверджено кур\'єром' }),
    });
    fetchPending();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Замовлення клієнтів</h1>
      <p className="text-sm text-gray-500 mb-4">Замовлення створені клієнтами на сайті, які потребують перевірки та підтвердження</p>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Завантаження...</div>
      ) : (
        <div className="bg-white rounded-lg border divide-y">
          {parcels.map(p => (
            <div key={p.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-medium">{p.internalNumber}</span>
                    <Badge className="text-xs bg-yellow-100 text-yellow-800">Очікує підтвердження</Badge>
                    <Badge variant="secondary" className="text-xs">
                      {p.createdSource === 'client_web' ? 'Сайт' : 'Telegram'}
                    </Badge>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-500">Від:</span> {p.sender.lastName} {p.sender.firstName}
                    <span className="text-gray-400 ml-1">{p.sender.phone}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-500">Кому:</span> {p.receiver.lastName} {p.receiver.firstName}
                    <span className="text-gray-400 ml-1">{p.receiver.phone}</span>
                  </div>
                  {p.receiverAddress && (
                    <div className="text-xs text-gray-400">
                      {p.receiverAddress.city}{p.receiverAddress.street ? `, ${p.receiverAddress.street}` : ''}
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mt-1">
                    {formatDate(p.createdAt)} | {p.totalPlacesCount} місць | {p.totalWeight ? formatWeight(Number(p.totalWeight)) : '—'}
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Link href={`/parcels/${p.id}`}>
                    <Button variant="outline" size="sm" className="w-full">Перевірити</Button>
                  </Link>
                  <Button size="sm" onClick={() => handleConfirm(p.id)} className="w-full">
                    Підтвердити
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {parcels.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              Немає нових замовлень від клієнтів
            </div>
          )}
        </div>
      )}
    </div>
  );
}
