'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface PartyShareButtonsProps {
  parcelId: string;
  /** Кому шлемо — визначає сторону й номер на сервері. */
  toParty: 'sender' | 'receiver';
  /** Телефон сторони (для показу в діалозі + deep-link). */
  phone?: string | null;
  /** Готовий текст підтвердження — прев'ю в діалозі і тіло повідомлення. */
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

type Channel = (typeof CHANNELS)[number];

/** Номер лише цифрами (для wa.me / tel). */
function digitsOf(phone?: string | null): string {
  return (phone || '').replace(/\D+/g, '');
}

/**
 * ТЗ docx 11.08.26 / 17.08.26: «відкривається відповідна програма (WA, V, SMS) з даними
 * цієї особи у адресному рядку і вищенаведеною формою у тілі повідомлення».
 * Viber не вміє одночасно номер + текст, тому для нього використовуємо forward?text=
 * (текст готовий, контакт обирається) — саме текст був проблемою в ТЗ 17.08.
 */
function deepLink(channel: Channel['key'], phone: string | null | undefined, body: string): string {
  const d = digitsOf(phone);
  const text = encodeURIComponent(body);
  if (channel === 'whatsapp') return `https://wa.me/${d}?text=${text}`;
  if (channel === 'viber') return `viber://forward?text=${text}`;
  return `sms:+${d}?&body=${text}`;
}

/**
 * Іконки WhatsApp/Viber/SMS біля сторони посилки.
 * ТЗ docx 23.08.26: якщо СЕРВЕРНОГО провайдера не підключено — не показуємо «у черзі»,
 * а відкриваємо сам застосунок із готовим текстом (як у ТЗ 11.08) і логуємо факт
 * відправки, щоб на сайті було видно, що підтвердження вже надіслано.
 */
export function PartyShareButtons({ parcelId, toParty, phone, message, onSent, className }: PartyShareButtonsProps) {
  const [pending, setPending] = useState<Channel | null>(null);
  const [sending, setSending] = useState(false);
  const [configured, setConfigured] = useState<Record<string, boolean>>({});

  // Які канали має сервер (реальний провайдер) — визначає режим кнопки.
  useEffect(() => {
    let active = true;
    fetch(`/api/parcels/${parcelId}/send-confirmation`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active && d?.configured) setConfigured(d.configured); })
      .catch(() => {});
    return () => { active = false; };
  }, [parcelId]);

  /** Записуємо факт відправки в історію (для обох режимів). */
  async function logSend(channel: Channel, mode: 'auto' | 'manual') {
    const res = await fetch(`/api/parcels/${parcelId}/send-confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toParty, channel: channel.key, mode }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Помилка надсилання');
    return data;
  }

  // Режим «сервер шле сам» — лише коли провайдер підключено.
  async function sendViaServer() {
    if (!pending) return;
    setSending(true);
    try {
      const data = await logSend(pending, 'auto');
      if (data.status === 'sent') toast.success(`${pending.title}: підтвердження надіслано`);
      else toast.error(`${pending.title}: ${data.errorMessage || 'не вдалося надіслати'}`);
      setPending(null);
      onSent?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Помилка');
    } finally {
      setSending(false);
    }
  }

  // Режим deep-link: застосунок відкриває сам <a>, ми лише фіксуємо факт.
  function handleManualSent() {
    if (!pending) return;
    const ch = pending;
    if (ch.key === 'viber') {
      navigator.clipboard?.writeText(message).catch(() => {});
      toast.info('Viber: текст скопійовано — оберіть контакт у Viber');
    }
    logSend(ch, 'manual')
      .then(() => { toast.success(`${ch.title}: відмічено як надіслане`); onSent?.(); })
      .catch(() => {});
    setPending(null);
  }

  const isConfigured = pending ? !!configured[pending.key] : false;

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
          <div className="flex gap-2 justify-end pt-1 items-center">
            <Button variant="outline" size="sm" onClick={() => setPending(null)} disabled={sending}>Скасувати</Button>
            {isConfigured ? (
              <Button size="sm" onClick={sendViaServer} disabled={sending || !phone}>
                {sending ? 'Надсилання…' : 'Надіслати'}
              </Button>
            ) : (
              // Провайдера немає → відкриваємо застосунок. Саме <a>, щоб браузер
              // відкрив нативно (програмний клік блокується як popup).
              <a
                href={pending ? deepLink(pending.key, phone, message) : '#'}
                target={pending?.key === 'whatsapp' ? '_blank' : undefined}
                rel={pending?.key === 'whatsapp' ? 'noopener noreferrer' : undefined}
                onClick={handleManualSent}
                className="inline-flex items-center justify-center h-8 px-3 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 no-underline"
              >
                Відкрити {pending?.title} і надіслати
              </a>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </span>
  );
}
