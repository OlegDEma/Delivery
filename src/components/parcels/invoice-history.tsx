'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils/format';

interface MessageHistoryEntry {
  id: string;
  toParty: 'sender' | 'receiver';
  toPhone: string;
  kind: string;      // 'invoice' | 'confirmation'
  channel: string;   // 'sms' | 'viber' | 'whatsapp'
  provider: string | null;
  status: 'queued' | 'sent' | 'failed';
  errorMessage: string | null;
  sentBy: string | null;
  createdAt: string;
  bodyPreview: string;
}

interface InvoiceHistoryProps {
  parcelId: string;
  /** ТЗ docx 18.08.26: 'invoice' (рахунки) | 'confirmation' (підтвердження). */
  kind?: 'invoice' | 'confirmation';
  /** Bumped externally to trigger a refetch (e.g. after the operator sent a new message). */
  refreshKey?: number;
}

const STATUS_LABEL: Record<string, string> = {
  queued: 'у черзі', sent: 'надіслано', failed: 'помилка',
};
const STATUS_CLASS: Record<string, string> = {
  queued: 'text-amber-700 bg-amber-50', sent: 'text-green-700 bg-green-50', failed: 'text-red-700 bg-red-50',
};
const PARTY_LABEL: Record<string, string> = {
  sender: 'Відправнику', receiver: 'Отримувачу',
};
const CHANNEL_LABEL: Record<string, string> = {
  sms: 'SMS', viber: 'Viber', whatsapp: 'WhatsApp',
};

/**
 * Компактна панель зі списком надісланих повідомлень посилки (рахунків або
 * підтверджень) — з `/api/parcels/:id/invoice-history?kind=`. Ховається, поки
 * немає жодного запису, щоб не роздувати сторінку.
 */
export function InvoiceHistory({ parcelId, kind, refreshKey }: InvoiceHistoryProps) {
  const [entries, setEntries] = useState<MessageHistoryEntry[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const qs = kind ? `?kind=${kind}` : '';
        const res = await fetch(`/api/parcels/${parcelId}/invoice-history${qs}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (res.ok) {
          const data: MessageHistoryEntry[] = await res.json();
          if (controller.signal.aborted) return;
          setEntries(data);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    })();
    return () => controller.abort();
  }, [parcelId, kind, refreshKey]);

  if (entries.length === 0) return null;

  const title = kind === 'confirmation' ? 'Надіслані підтвердження' : 'Надіслані рахунки';

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-sm">{title} ({entries.length})</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0 space-y-1.5">
        {entries.map((e) => (
          <div key={e.id} className="text-xs border rounded p-1.5 space-y-0.5">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                {/* Канал показуємо для підтверджень (рахунки завжди SMS). */}
                {kind === 'confirmation' && (
                  <span className="font-semibold text-blue-700 mr-1">{CHANNEL_LABEL[e.channel] ?? e.channel}</span>
                )}
                <span className="font-medium">{PARTY_LABEL[e.toParty]}</span>
                <span className="text-gray-400 ml-1">· {e.toPhone}</span>
              </div>
              <span className={`px-1.5 py-0.5 rounded ${STATUS_CLASS[e.status] ?? ''}`}>
                {STATUS_LABEL[e.status] ?? e.status}
              </span>
            </div>
            <div className="text-gray-500 truncate" title={e.bodyPreview}>{e.bodyPreview}</div>
            <div className="flex items-center justify-between text-gray-400">
              <span>
                {formatDateTime(e.createdAt)}
                {e.sentBy ? ` · ${e.sentBy}` : ''}
                {e.provider ? ` · ${e.provider}` : ''}
              </span>
              {e.errorMessage && (
                <span className="text-red-600 truncate ml-2" title={e.errorMessage}>{e.errorMessage}</span>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
