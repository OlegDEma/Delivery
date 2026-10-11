'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { tripRouteLabel } from '@/lib/constants/countries';
import { formatDateWithWeekday } from '@/lib/utils/format';

interface TripOpt { id: string; country: string; direction: string; departureDate: string }

/**
 * ТЗ docx 09.10.26 (п.2): Клієнт може перенести своє замовлення на інший рейс,
 * поки воно «Створена». Перед перенесенням — «Ви дійсно хочете перенести посилку?».
 */
export function ClientTripTransfer({ parcelId, onDone }: { parcelId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [trips, setTrips] = useState<TripOpt[] | null>(null);
  const [target, setTarget] = useState<TripOpt | null>(null);
  const [busy, setBusy] = useState(false);

  async function openList() {
    setOpen(true);
    setTrips(null);
    const r = await fetch(`/api/client-portal/orders/${parcelId}/transfer`).catch(() => null);
    const d = r && r.ok ? await r.json() : { trips: [] };
    setTrips(d.trips ?? []);
  }

  async function confirm() {
    if (!target) return;
    setBusy(true);
    const r = await fetch(`/api/client-portal/orders/${parcelId}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId: target.id }),
    }).catch(() => null);
    setBusy(false);
    if (r?.ok) {
      toast.success('Замовлення перенесено на інший рейс');
      setTarget(null);
      setOpen(false);
      onDone();
    } else {
      const d = r ? await r.json().catch(() => ({})) : {};
      toast.error(d.error || 'Не вдалося перенести замовлення');
      setTarget(null);
    }
  }

  return (
    <div className="mt-2">
      {!open ? (
        <Button type="button" size="sm" variant="outline" onClick={openList}>⇄ Перенести на інший рейс</Button>
      ) : (
        <div className="border rounded-lg p-2 space-y-1.5 bg-white">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Оберіть рейс</span>
            <button type="button" className="text-xs text-gray-500 hover:text-gray-800" onClick={() => setOpen(false)}>Скасувати</button>
          </div>
          {trips === null && <div className="text-xs text-gray-500">Завантаження…</div>}
          {trips?.length === 0 && <div className="text-xs text-gray-500">Інших рейсів у цьому напрямку поки немає.</div>}
          {trips?.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTarget(t)}
              className="w-full text-left text-sm border rounded px-2 py-1.5 hover:bg-blue-50 hover:border-blue-300"
            >
              {tripRouteLabel(t.country, t.direction)} · {formatDateWithWeekday(t.departureDate)}
            </button>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={!!target}
        title="Ви дійсно хочете перенести посилку?"
        description={target ? <>Замовлення буде перенесено на рейс {tripRouteLabel(target.country, target.direction)} {formatDateWithWeekday(target.departureDate)}.</> : null}
        confirmLabel="Так, перенести"
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setTarget(null)}
      />
    </div>
  );
}
