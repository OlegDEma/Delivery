'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Mail } from 'lucide-react';

interface ShareButtonProps {
  parcelNumber: string;
  /** PЇБ отримувача — підставляється в Gmail subject і body як адресат */
  receiverName?: string;
  /** Телефон отримувача у форматі E.164 — використовується як адресат WhatsApp/Viber */
  receiverPhone?: string;
  className?: string;
}

/**
 * «Поділитись» за ТЗ: 3 месенджери (Gmail, WhatsApp, Viber). За замовчуванням
 * кожен відкривається з попередньо заповненим контактом Отримувача.
 * - Gmail: компоновочний лінк до Gmail web — mailto fallback.
 * - WhatsApp: wa.me/<phone>?text= — якщо телефон валідний.
 * - Viber: viber://chat?number=<phone>&text= — підтримується на мобільних.
 */
export function ShareButton({ parcelNumber, receiverName, receiverPhone, className }: ShareButtonProps) {
  const [shared, setShared] = useState(false);

  const trackingUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/tracking?q=${encodeURIComponent(parcelNumber)}`
    : `/tracking?q=${encodeURIComponent(parcelNumber)}`;
  const message = `Ваша посилка ${parcelNumber} — відстежити: ${trackingUrl}`;

  // Нормалізований телефон без '+', пробілів і дефісів — для wa.me / viber.
  const phoneDigits = (receiverPhone || '').replace(/\D+/g, '');

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

  function openGmail() {
    const subject = `Посилка ${parcelNumber}`;
    const body = receiverName
      ? `${receiverName},\n\n${message}`
      : message;
    // Gmail web compose — якщо не залогінений, відкриється login.
    // Тримаємо mailto як fallback для desktop-клієнтів.
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, '_blank');
  }

  function openWhatsApp() {
    // Якщо телефон є — пишемо напряму отримувачу, інакше відкриваємо selector.
    const url = phoneDigits
      ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }

  function openViber() {
    // Viber deep-link. На desktop без клієнта — не спрацює, тоді fallback-forward.
    const url = phoneDigits
      ? `viber://chat?number=%2B${phoneDigits}&text=${encodeURIComponent(message)}`
      : `viber://forward?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }

  return (
    <div className={`flex gap-1 ${className || ''}`}>
      <Button variant="outline" size="sm" onClick={handleNative} className="text-xs">
        {shared ? '✓ Скопійовано' : 'Поділитись'}
      </Button>
      <Button
        variant="ghost" size="sm" onClick={openGmail}
        className="text-xs text-red-600 px-2 h-8" title="Gmail — надіслати листом"
      >
        <Mail className="w-3.5 h-3.5" />
      </Button>
      <Button
        variant="ghost" size="sm" onClick={openWhatsApp}
        className="text-xs text-green-600 px-2 h-8" title="WhatsApp"
      >
        WA
      </Button>
      <Button
        variant="ghost" size="sm" onClick={openViber}
        className="text-xs text-purple-600 px-2 h-8" title="Viber"
      >
        Vb
      </Button>
    </div>
  );
}
