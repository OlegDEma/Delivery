'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS, STATUS_COLORS, type ParcelStatusType } from '@/lib/constants/statuses';
import { formatDate } from '@/lib/utils/format';

interface Order {
  id: string;
  internalNumber: string;
  itn: string;
  direction: string;
  status: ParcelStatusType;
  totalPlacesCount: number;
  totalWeight: number | null;
  createdAt: string;
  sender: { firstName: string; lastName: string; phone: string };
  receiver: { firstName: string; lastName: string; phone: string };
  receiverAddress: { city: string; deliveryMethod: string; npWarehouseNum: string | null } | null;
}

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/client-portal/orders')
      .then(r => r.ok ? r.json() : [])
      .then(data => { setOrders(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Мої замовлення</h1>
        <Link href="/new-order">
          <Button>+ Нове замовлення</Button>
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Завантаження...</div>
      ) : (
        <div className="bg-white rounded-lg border divide-y">
          {orders.map(o => (
            <div key={o.id} className="p-4">
              <div className="flex items-start justify-between mb-1">
                <div>
                  <div className="font-mono text-sm font-medium">{o.internalNumber}</div>
                  <div className="text-xs text-gray-400 mt-0.5">ІТН: {o.itn}</div>
                </div>
                <Badge className={STATUS_COLORS[o.status]}>
                  {STATUS_LABELS[o.status]}
                </Badge>
              </div>
              <div className="text-sm mt-2">
                <div><span className="text-gray-500">Від:</span> {o.sender.lastName} {o.sender.firstName}</div>
                <div>
                  <span className="text-gray-500">Кому:</span> {o.receiver.lastName} {o.receiver.firstName}
                  {o.receiverAddress && (
                    <span className="text-gray-400"> — {o.receiverAddress.city}
                      {o.receiverAddress.npWarehouseNum ? `, НП №${o.receiverAddress.npWarehouseNum}` : ''}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                <span>{formatDate(o.createdAt)}</span>
                <span>{o.totalPlacesCount} місць</span>
                {o.totalWeight && <span>{Number(o.totalWeight).toFixed(1)} кг</span>}
                <span>{o.direction === 'eu_to_ua' ? 'EU→UA' : 'UA→EU'}</span>
              </div>
            </div>
          ))}
          {orders.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <p className="mb-2">У вас ще немає замовлень</p>
              <Link href="/new-order">
                <Button>Створити замовлення</Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
