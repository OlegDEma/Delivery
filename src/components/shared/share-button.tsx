'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface ShareButtonProps {
  parcelNumber: string;
  className?: string;
}

export function ShareButton({ parcelNumber, className }: ShareButtonProps) {
  const [shared, setShared] = useState(false);

  const trackingUrl = `${window.location.origin}/tracking?q=${encodeURIComponent(parcelNumber)}`;
  const message = `Ваша посилка ${parcelNumber} — відстежити: ${trackingUrl}`;

  async function handleShare() {
    // Try native share first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({ title: `Посилка ${parcelNumber}`, text: message, url: trackingUrl });
        return;
      } catch { /* user cancelled */ }
    }

    // Fallback: copy to clipboard
    await navigator.clipboard.writeText(message);
    setShared(true);
    setTimeout(() => setShared(false), 3000);
  }

  function openWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  }

  function openViber() {
    window.open(`viber://forward?text=${encodeURIComponent(message)}`, '_blank');
  }

  return (
    <div className={`flex gap-1 ${className || ''}`}>
      <Button variant="outline" size="sm" onClick={handleShare} className="text-xs">
        {shared ? '✓ Скопійовано' : 'Поділитись'}
      </Button>
      <Button variant="ghost" size="sm" onClick={openWhatsApp} className="text-xs text-green-600 px-2" title="WhatsApp">
        WA
      </Button>
      <Button variant="ghost" size="sm" onClick={openViber} className="text-xs text-purple-600 px-2" title="Viber">
        Vb
      </Button>
    </div>
  );
}
