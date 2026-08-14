'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface ShareButtonProps {
  parcelNumber: string;
  /** ПІБ отримувача — підставляється у привітання. */
  receiverName?: string;
  /** Телефон отримувача у форматі E.164 — адресат WhatsApp/Viber/SMS. */
  receiverPhone?: string;
  className?: string;
}

/**
 * «Поділитись» за ТЗ docx 11.08.26: месенджери WhatsApp / Viber / SMS (email прибрано).
 * За замовчуванням кожен відкривається з попередньо заповненим контактом Отримувача
 * і текстом. Реалізовано через <a> (не window.open) — схеми viber:// та sms: через
 * window.open('_blank') відкривали порожню вкладку і застосунок не запускався.
 */
export function ShareButton({ parcelNumber, receiverName, receiverPhone, className }: ShareButtonProps) {
  const [shared, setShared] = useState(false);

  const trackingUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/tracking?q=${encodeURIComponent(parcelNumber)}`
    : `/tracking?q=${encodeURIComponent(parcelNumber)}`;
  const message = receiverName
    ? `${receiverName}, ваша посилка ${parcelNumber} — відстежити: ${trackingUrl}`
    : `Ваша посилка ${parcelNumber} — відстежити: ${trackingUrl}`;
  const text = encodeURIComponent(message);

  // Нормалізований телефон без '+', пробілів і дефісів — для wa.me / viber / sms.
  const phoneDigits = (receiverPhone || '').replace(/\D+/g, '');

  const waUrl = phoneDigits ? `https://wa.me/${phoneDigits}?text=${text}` : `https://wa.me/?text=${text}`;
  const viberUrl = phoneDigits ? `viber://chat?number=%2B${phoneDigits}&text=${text}` : `viber://forward?text=${text}`;
  const smsUrl = phoneDigits ? `sms:+${phoneDigits}?body=${text}` : `sms:?body=${text}`;

  async function handleNative() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Посилка ${parcelNumber}`, text: message, url: trackingUrl });
        return;
      } catch { /* user cancelled */ }
    }
    await navigator.clipboard.writeText(message);
    setShared(true);
    setTimeout(() => setShared(false), 3000);
  }

  const badge = (color: string) =>
    `text-xs font-bold ${color} px-2 h-8 inline-flex items-center rounded-md border no-underline`;

  return (
    <div className={`flex gap-1 items-center ${className || ''}`}>
      <Button variant="outline" size="sm" onClick={handleNative} className="text-xs">
        {shared ? '✓ Скопійовано' : 'Поділитись'}
      </Button>
      {/* WhatsApp — https, нова вкладка. */}
      <a href={waUrl} target="_blank" rel="noopener noreferrer" title="WhatsApp"
        className={badge('text-green-600 border-green-200 hover:text-green-700')}>WA</a>
      {/* Viber — власна схема, без target=_blank. */}
      <a href={viberUrl} title="Viber"
        className={badge('text-purple-600 border-purple-200 hover:text-purple-700')}>Vb</a>
      {/* SMS — власна схема, без target=_blank. */}
      <a href={smsUrl} title="SMS"
        className={badge('text-blue-600 border-blue-200 hover:text-blue-700')}>SMS</a>
    </div>
  );
}
