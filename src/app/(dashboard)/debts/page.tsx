'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils/format';

interface DebtParcel {
  id: string;
  internalNumber: string;
  totalCost: number;
  createdAt: string;
  direction: string;
}

interface DebtEntry {
  clientId: string;
  clientName: string;
  clientPhone: string;
  totalDebt: number;
  parcelsCount: number;
  oldestDate: string;
  parcels: DebtParcel[];
}

export default function DebtsPage() {
  const [debts, setDebts] = useState<DebtEntry[]>([]);
  const [totalDebt, setTotalDebt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/debts')
      .then(r => r.ok ? r.json() : { debts: [], totalDebt: 0 })
      .then(data => { setDebts(data.debts); setTotalDebt(data.totalDebt); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function getDaysOverdue(dateStr: string): number {
    const diff = Date.now() - new Date(dateStr).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Завантаження...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Борги</h1>
          <p className="text-sm text-gray-500">{debts.length} клієнтів з боргами</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          <div className="text-xs text-red-500">Загальний борг</div>
          <div className="text-xl font-bold text-red-700">{formatCurrency(totalDebt, 'EUR')}</div>
        </div>
      </div>

      <div className="bg-white rounded-lg border divide-y">
        {debts.map(d => {
          const days = getDaysOverdue(d.oldestDate);
          const isExpanded = expandedId === d.clientId;

          return (
            <div key={d.clientId}>
              <button
                className="w-full text-left p-3 hover:bg-gray-50"
                onClick={() => setExpandedId(isExpanded ? null : d.clientId)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">{d.clientName}</div>
                    <div className="text-sm text-gray-500">{d.clientPhone}</div>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">{d.parcelsCount} посилок</Badge>
                      {days > 14 && <Badge variant="destructive" className="text-xs">{days} днів</Badge>}
                      {days <= 14 && days > 7 && <Badge className="text-xs bg-yellow-100 text-yellow-800">{days} днів</Badge>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-red-600">{formatCurrency(d.totalDebt, 'EUR')}</div>
                    <div className="text-xs text-gray-400">з {formatDate(d.oldestDate)}</div>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 space-y-1">
                  {d.parcels.map(p => (
                    <Link key={p.id} href={`/parcels/${p.id}`} className="flex justify-between items-center px-3 py-1.5 bg-gray-50 rounded hover:bg-gray-100 text-sm">
                      <span className="font-mono">{p.internalNumber}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{formatDate(p.createdAt)}</span>
                        <span className="font-medium text-red-600">{formatCurrency(p.totalCost, 'EUR')}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {debts.length === 0 && (
          <div className="text-center py-8 text-gray-500">Немає боргів — все оплачено!</div>
        )}
      </div>
    </div>
  );
}
