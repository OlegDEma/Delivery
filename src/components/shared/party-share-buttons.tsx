'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface PartyShareButtonsProps {
  parcelId: string;
  /** Кому шлемо — визначає сторону й номер на сервері. */
  toParty: 'sender' | 'receiver';
  /** Телефон сторони (для показу в діалозі). */
  phone?: string | null;
  /** Готовий текст підтвердження — прев'ю в діалозі (сервер формує власний ідентичний). */
  message: string;
  /** Викликається після відправки — щоб оновити історію «Надіслані підтвердження». */
  onSent?: () => void;
  className?: string;
}

const CHANNELS = [
  { key: 'whatsapp', label: 'WA', title: 'WhatsApp', color: 'text-green-600 hover:text-green-700 border-green-200' },
  { key: 'viber', label: 'Vb', title: 'Viber', color: 'text-purple-600 hover:text-purple-700 border-purple-200' },
  { key: 'sms', label: 'SMS', title: 'SMS', color: 'text-blue-600 hover:text-blue-700 border-blue-200' },
] as const;

/**
 * ТЗ docx 18.08.26: біля кожної сторони — іконки WhatsApp/Viber/SMS, які запускають
 * СЕРВЕРНУ авто-відправку підтвердження (сервер сам шле через провайдера і записує
 * факт у лог). Клік → діалог-прев'ю («перевіряю, відправляю», за ТЗ 17.08) → «Надіслати».
 */
export function PartyShareButtons({ parcelId, toParty, phone, message, onSent, className }: PartyShareButtonsProps) {
  const [pending, setPending] = useState<(typeof CHANNELS)[number] | null>(null);
  const [sending, setSending] = useState(false);

  async function send() {
    if (!pending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/parcels/${parcelId}/send-confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toParty, channel: pending.key }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Помилка надсилання');
      if (data.status === 'sent') toast.success(`${pending.title}: підтвердження надіслано`);
      else if (data.status === 'queued') toast.info(`${pending.title}: у черзі — провайдер ще не підключено`);
      else toast.error(`${pending.title}: ${data.errorMessage || 'помилка'}`);
      setPending(null);
      onSent?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Помилка');
    } finally {
      setSending(false);
    }
  }

  return (
    <span className={`inline-flex items-center gap-1 align-middle ${className || ''}`}>
      {CHANNELS.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => setPending(c)}
          title={`Надіслати підтвердження у ${c.title}`}
          className={`text-[10px] font-bold ${c.color} border rounded px-1 py-0.5 leading-none`}
        >
          {c.label}
        </button>
      ))}

      <Dialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Надіслати підтвердження{pending ? ` — ${pending.title}` : ''}</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-gray-600">
            Кому: <span className="font-medium">{toParty === 'receiver' ? 'Отримувачу' : 'Відправнику'}</span>
            <span className="text-gray-400"> · {phone || '—'}</span>
          </div>
          <pre className="text-xs bg-gray-50 border rounded p-2 whitespace-pre-wrap max-h-60 overflow-y-auto font-sans">{message}</pre>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" size="sm" onClick={() => setPending(null)} disabled={sending}>Скасувати</Button>
            <Button size="sm" onClick={send} disabled={sending || !phone}>{sending ? 'Надсилання…' : 'Надіслати'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </span>
  );
}
