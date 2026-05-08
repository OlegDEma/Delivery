'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils/format';

interface InvoiceHistoryEntry {
  id: string;
  toParty: 'sender' | 'receiver';
  toPhone: string;
  provider: string | null;
  status: 'queued' | 'sent' | 'failed';
  errorMessage: string | null;
  sentBy: string | null;
  createdAt: string;
  bodyPreview: string;
}

interface InvoiceHistoryProps {
  parcelId: string;
  /** Bumped externally to trigger a refetch (e.g. after the operator sent a new invoice). */
  refreshKey?: number;
}

const STATUS_LABEL: Record<string, string> = {
  queued: 'у черзі',
  sent: 'надіслано',
  failed: 'помилка',
};
const STATUS_CLASS: Record<string, string> = {
  queued: 'text-amber-700 bg-amber-50',
  sent: 'text-green-700 bg-green-50',
  failed: 'text-red-700 bg-red-50',
};
const PARTY_LABEL: Record<string, string> = {
  sender: 'Відправнику',
  receiver: 'Отримувачу',
};

/**
 * Compact panel listing all SMS-invoice sends for a parcel — populated by
 * `/api/parcels/:id/invoice-history`. Stays hidden until at least one entry
 * exists, so the parcel detail page doesn't grow vertically for parcels that
 * haven't triggered the new pipeline yet.
 */
export function InvoiceHistory({ parcelId, refreshKey }: InvoiceHistoryProps) {
  const [entries, setEntries] = useState<InvoiceHistoryEntry[]>([]);

  // Fetch is inlined into the effect body so setState happens AFTER the
  // async fetch completes — react-hooks/set-state-in-effect tolerates
  // post-await updates but flags synchronous setState.
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/parcels/${parcelId}/invoice-history`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (res.ok) {
          const data: InvoiceHistoryEntry[] = await res.json();
          if (controller.signal.aborted) return;
          setEntries(data);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    })();
    return () => controller.abort();
  }, [parcelId, refreshKey]);

  if (entries.length === 0) return null;

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-sm">Надіслані рахунки ({entries.length})</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0 space-y-1.5">
        {entries.map((e) => (
          <div key={e.id} className="text-xs border rounded p-1.5 space-y-0.5">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <span className="font-medium">{PARTY_LABEL[e.toParty]}</span>
                <span className="text-gray-400 ml-1">· {e.toPhone}</span>
              </div>
              <span className={`px-1.5 py-0.5 rounded ${STATUS_CLASS[e.status] ?? ''}`}>
                {STATUS_LABEL[e.status] ?? e.status}
              </span>
            </div>
            <div className="text-gray-500 truncate" title={e.bodyPreview}>
              {e.bodyPreview}
            </div>
            <div className="flex items-center justify-between text-gray-400">
              <span>
                {formatDateTime(e.createdAt)}
                {e.sentBy ? ` · ${e.sentBy}` : ''}
                {e.provider ? ` · ${e.provider}` : ''}
              </span>
              {e.errorMessage && (
                <span className="text-red-600 truncate ml-2" title={e.errorMessage}>
                  {e.errorMessage}
                </span>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
