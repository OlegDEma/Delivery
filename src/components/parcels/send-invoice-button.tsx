'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Receipt } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface SendInvoiceButtonProps {
  parcelId: string;
  toParty: 'sender' | 'receiver';
  /** When true, the button is hidden — parcel is delivered or otherwise ineligible. */
  disabled?: boolean;
  /** ISO timestamp of last successful send for this parcel (any party). */
  lastSentAt?: string | null;
  /** Called after a successful send so a parent can refresh the invoice-history panel. */
  onSent?: () => void;
}

type ChannelKey = 'whatsapp' | 'viber' | 'sms';

/**
 * ТЗ docx 04.11.26 (п.7, «Адміністрування / Реквізити рахунку»): «Необхідно додати
 * можливість надіслати рахунок не лише СМС, а й по Viber або WhatsApp».
 * Так само, як підтвердження посилки (ТЗ 11.08 / 23.08): вікно з текстом рахунку і
 * трьома каналами. Якщо для каналу підключено провайдера автоматичної розсилки — сервер
 * шле сам; поки провайдера немає — відкривається сам WhatsApp / Viber / SMS з готовим
 * текстом, а факт відправки записується в історію рахунків посилки.
 */
const CHANNELS: { key: ChannelKey; label: string; title: string; color: string }[] = [
  { key: 'whatsapp', label: 'WhatsApp', title: 'WhatsApp', color: 'border-green-300 text-green-700 hover:bg-green-50' },
  { key: 'viber', label: 'Viber', title: 'Viber', color: 'border-purple-300 text-purple-700 hover:bg-purple-50' },
  { key: 'sms', label: 'SMS', title: 'SMS', color: 'border-blue-300 text-blue-700 hover:bg-blue-50' },
];

function deepLink(channel: ChannelKey, phone: string, body: string): string {
  const d = phone.replace(/\D+/g, '');
  const text = encodeURIComponent(body);
  if (channel === 'whatsapp') return `https://wa.me/${d}?text=${text}`;
  // Viber не вміє номер + текст одночасно — forward із готовим текстом (ТЗ 17.08.26).
  if (channel === 'viber') return `viber://forward?text=${text}`;
  return `sms:+${d}?&body=${text}`;
}

export function SendInvoiceButton({ parcelId, toParty, disabled, lastSentAt, onSent }: SendInvoiceButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ body: string; phone: string; configured: Record<ChannelKey, boolean> } | null>(null);
  const [error, setError] = useState('');

  if (disabled) return null;

  async function openDialog() {
    setOpen(true);
    setPreview(null);
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/parcels/${parcelId}/send-invoice?toParty=${toParty}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setPreview(data);
      else setError(data.error || 'Не вдалося сформувати рахунок');
    } catch {
      setError('Помилка мережі');
    } finally {
      setLoading(false);
    }
  }

  async function logSend(channel: ChannelKey, mode: 'auto' | 'manual') {
    const res = await fetch(`/api/parcels/${parcelId}/send-invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toParty, channel, mode }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Помилка');
    return data;
  }

  // Провайдер підключено — сервер надсилає сам.
  async function sendViaServer(ch: (typeof CHANNELS)[number]) {
    setBusy(true);
    try {
      const data = await logSend(ch.key, 'auto');
      if (data.status === 'failed') toast.error(`${ch.title}: ${data.errorMessage || 'не вдалося надіслати'}`);
      else toast.success(`${ch.title}: рахунок надіслано`);
      setOpen(false);
      onSent?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Помилка');
    } finally {
      setBusy(false);
    }
  }

  // Провайдера немає — застосунок відкриває <a>, ми лише фіксуємо факт відправки.
  function handleManual(ch: (typeof CHANNELS)[number]) {
    if (ch.key === 'viber' && preview) {
      navigator.clipboard?.writeText(preview.body).catch(() => {});
      toast.info('Viber: текст скопійовано — оберіть контакт у Viber');
    }
    logSend(ch.key, 'manual')
      .then(() => { toast.success(`${ch.title}: рахунок відмічено як надісланий`); onSent?.(); })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Помилка'));
    // Навігація за посиланням має відбутись до закриття вікна (див. PartyShareButtons).
    setTimeout(() => setOpen(false), 400);
  }

  const title = lastSentAt
    ? `Надіслати ще раз. Останнє надсилання: ${new Date(lastSentAt).toLocaleString('uk-UA')}`
    : 'Надіслати рахунок на оплату';

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center text-blue-600 hover:text-blue-800 disabled:opacity-50 ml-1"
        title={title}
        aria-label={title}
      >
        <Receipt className="w-3.5 h-3.5" />
      </button>
      <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Надіслати рахунок</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-gray-600">
            Кому: <span className="font-medium">{toParty === 'receiver' ? 'Отримувачу' : 'Відправнику'}</span>
            {preview && <span className="text-gray-400"> · {preview.phone}</span>}
          </div>
          {loading && <div className="text-sm text-gray-500">Формуємо рахунок…</div>}
          {error && <div className="text-sm text-red-600">{error}</div>}
          {preview && (
            <>
              <pre className="text-xs bg-gray-50 border rounded p-2 whitespace-pre-wrap max-h-60 overflow-y-auto font-sans">{preview.body}</pre>
              <div className="text-xs text-gray-500">Надіслати через:</div>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map((ch) => (
                  preview.configured[ch.key] ? (
                    <Button key={ch.key} type="button" size="sm" variant="outline" className={ch.color} disabled={busy}
                      onClick={() => sendViaServer(ch)}>
                      {ch.label}
                    </Button>
                  ) : (
                    // Саме <a>: браузер відкриває застосунок нативно (програмний клік блокується).
                    <a
                      key={ch.key}
                      href={deepLink(ch.key, preview.phone, preview.body)}
                      target={ch.key === 'whatsapp' ? '_blank' : undefined}
                      rel={ch.key === 'whatsapp' ? 'noopener noreferrer' : undefined}
                      onClick={() => handleManual(ch)}
                      className={`inline-flex items-center justify-center h-7 px-3 rounded-md border text-sm font-medium no-underline ${ch.color}`}
                    >
                      {ch.label}
                    </a>
                  )
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
