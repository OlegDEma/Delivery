'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Receipt } from 'lucide-react';

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

/**
 * Inline action button (per ТЗ — «справа від значка редагувати»). One click
 * fires `/api/parcels/:id/send-invoice` to the chosen party.
 *
 * The component intentionally renders as a tiny icon-link to fit in the
 * narrow row reserved for sender/receiver display. Server is responsible
 * for resolving the phone, rendering the template, and writing the audit
 * log — this is just a thin trigger.
 */
export function SendInvoiceButton({ parcelId, toParty, disabled, lastSentAt, onSent }: SendInvoiceButtonProps) {
  const [busy, setBusy] = useState(false);

  if (disabled) return null;

  async function handleClick() {
    if (!confirm(`Надіслати рахунок ${toParty === 'sender' ? 'Відправнику' : 'Отримувачу'}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/parcels/${parcelId}/send-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toParty }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(
          data.status === 'sent'
            ? 'Рахунок надіслано'
            : 'Рахунок поставлено в чергу на відправку'
        );
        onSent?.();
      } else {
        toast.error(data.error || 'Помилка');
      }
    } catch {
      toast.error('Помилка мережі');
    } finally {
      setBusy(false);
    }
  }

  const title = lastSentAt
    ? `Надіслати ще раз. Останнє надсилання: ${new Date(lastSentAt).toLocaleString('uk-UA')}`
    : 'Надіслати рахунок на оплату';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="inline-flex items-center text-blue-600 hover:text-blue-800 disabled:opacity-50 ml-1"
      title={title}
      aria-label={title}
    >
      <Receipt className="w-3.5 h-3.5" />
    </button>
  );
}
