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
  /** Per ТЗ §7 — поряд з ІТН відображаємо ТТН Нової Пошти, коли є. */
  npTtn: string | null;
  direction: string;
  status: ParcelStatusType;
  totalPlacesCount: number;
  totalWeight: number | null;
  createdAt: string;
  sender: { firstName: string; lastName: string; phone: string };
  receiver: { firstName: string; lastName: string; phone: string };
  receiverAddress: { country: string | null; city: string; street: string | null; building: string | null; postalCode: string | null; landmark: string | null; deliveryMethod: string; npWarehouseNum: string | null } | null;
  senderAddress: { country: string | null; city: string; street: string | null; building: string | null; postalCode: string | null; landmark: string | null } | null;
}

/** ТЗ docx 01.07.26: адреса + індекс (для не-UA сторони обов'язково).
 *  ТЗ docx 02.07.26 (D1): + Орієнтир (коли вказано). */
function fmtAddr(a: { country: string | null; city: string; street?: string | null; building?: string | null; postalCode: string | null; landmark?: string | null } | null | undefined): string {
  if (!a) return '';
  const parts = [a.city];
  if (a.street) parts.push(a.street);
  if (a.building) parts[parts.length - 1] += ` ${a.building}`;
  if (a.country !== 'UA' && a.postalCode) parts.push(a.postalCode);
  let out = parts.join(', ');
  if (a.landmark) out += ` (${a.landmark})`;
  return out;
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
          {/* Фікс багу docx 03.06.2026: «Посилки створені клієнтом не клікабельні».
              Кожна посилка тепер — посилання на /my-orders/[id]. */}
          {orders.map(o => (
            <Link
              key={o.id}
              href={`/my-orders/${o.id}`}
              className="block p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between mb-1">
                <div>
                  <div className="font-mono text-sm font-medium">{o.internalNumber}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    ІТН: <span className="font-mono">{o.itn}</span>
                    {/* ТЗ §7: поряд з ІТН — ТТН Нової Пошти коли вона є. */}
                    {o.npTtn && (
                      <>
                        <span className="mx-1.5 text-gray-300">|</span>
                        ТТН: <span className="font-mono">{o.npTtn}</span>
                      </>
                    )}
                  </div>
                </div>
                <Badge className={STATUS_COLORS[o.status]}>
                  {STATUS_LABELS[o.status]}
                </Badge>
              </div>
              <div className="text-sm mt-2">
                <div>
                  <span className="text-gray-500">Від:</span> {o.sender.lastName} {o.sender.firstName}
                  {o.senderAddress && <span className="text-gray-400"> — {fmtAddr(o.senderAddress)}</span>}
                </div>
                <div>
                  <span className="text-gray-500">Кому:</span> {o.receiver.lastName} {o.receiver.firstName}
                  {o.receiverAddress && (
                    <span className="text-gray-400"> — {fmtAddr(o.receiverAddress)}
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
            </Link>
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
