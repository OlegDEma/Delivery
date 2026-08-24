'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Kind = 'confirmation' | 'invoice';

interface PassengerShareButtonsProps {
  passengerId: string;
  /** Що надсилаємо: підтвердження місця чи рахунок. */
  kind: Kind;
  phone?: string | null;
  className?: string;
}

const CHANNELS = [
  { key: 'whatsapp', label: 'WA', title: 'WhatsApp', color: 'text-green-600 hover:text-green-700 border-green-200' },
  { key: 'viber', label: 'Vb', title: 'Viber', color: 'text-purple-600 hover:text-purple-700 border-purple-200' },
  { key: 'sms', label: 'SMS', title: 'SMS', color: 'text-blue-600 hover:text-blue-700 border-blue-200' },
] as const;

type Channel = (typeof CHANNELS)[number];

function deepLink(channel: Channel['key'], phone: string | null | undefined, body: string): string {
  const d = (phone || '').replace(/\D+/g, '');
  const text = encodeURIComponent(body);
  if (channel === 'whatsapp') return `https://wa.me/${d}?text=${text}`;
  if (channel === 'viber') return `viber://forward?text=${text}`;
  return `sms:+${d}?&body=${text}`;
}

/**
 * ТЗ docx 23.08.26 (Пасажири, п.5-6): надсилання пасажиру ПІДТВЕРДЖЕННЯ з усіма
 * даними та РАХУНКУ — через WhatsApp / Viber / SMS, як це зроблено для посилок.
 * Провайдера немає → відкриваємо застосунок із готовим текстом і фіксуємо факт.
 */
export function PassengerShareButtons({ passengerId, kind, phone, className }: PassengerShareButtonsProps) {
  const [pending, setPending] = useState<Channel | null>(null);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);

  async function openFor(channel: Channel) {
    setPending(channel);
    setLoading(true);
    try {
      const res = await fetch(`/api/passengers/${passengerId}/send-message`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не вдалося сформувати текст');
      setBody(kind === 'invoice' ? data.invoice : data.confirmation);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Помилка');
      setPending(null);
    } finally {
      setLoading(false);
    }
  }

  function handleSent() {
    if (!pending) return;
    const ch = pending;
    if (ch.key === 'viber') {
      navigator.clipboard?.writeText(body).catch(() => {});
      toast.info('Viber: текст скопійовано — оберіть контакт у Viber');
    }
    fetch(`/api/passengers/${passengerId}/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: ch.key, kind, mode: 'manual' }),
    })
      .then((r) => { if (r.ok) toast.success(`${ch.title}: відмічено як надіслане`); })
      .catch(() => {});
    setPending(null);
  }

  const title = kind === 'invoice' ? 'рахунок' : 'підтвердження';

  return (
    <span className={`inline-flex items-center gap-1 align-middle ${className || ''}`}>
      {CHANNELS.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={(e) => { e.stopPropagation(); openFor(c); }}
          title={`Надіслати ${title} у ${c.title}`}
          className={`text-[10px] font-bold ${c.color} border rounded px-1 py-0.5 leading-none`}
        >
          {c.label}
        </button>
      ))}

      <Dialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Надіслати {title}{pending ? ` — ${pending.title}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-gray-600">Кому: <span className="text-gray-400">{phone || '—'}</span></div>
          <pre className="text-xs bg-gray-50 border rounded p-2 whitespace-pre-wrap max-h-60 overflow-y-auto font-sans">
            {loading ? 'Формування тексту…' : body}
          </pre>
          <div className="flex gap-2 justify-end pt-1 items-center">
            <Button variant="outline" size="sm" onClick={() => setPending(null)}>Скасувати</Button>
            <a
              href={pending && body ? deepLink(pending.key, phone, body) : '#'}
              target={pending?.key === 'whatsapp' ? '_blank' : undefined}
              rel={pending?.key === 'whatsapp' ? 'noopener noreferrer' : undefined}
              onClick={handleSent}
              className={`inline-flex items-center justify-center h-8 px-3 rounded-md text-white text-sm font-medium no-underline ${
                loading || !body ? 'bg-gray-300 pointer-events-none' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              Відкрити {pending?.title} і надіслати
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </span>
  );
}
