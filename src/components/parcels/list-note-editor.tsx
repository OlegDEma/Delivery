'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Має збігатися з VARCHAR(60) у parcels.list_note і з updateParcelSchema.listNote. */
const LIST_NOTE_MAX = 60;

/**
 * ТЗ docx 12.10.26 (коментар клієнта до друку списку): стовпчик «Примітки» —
 * «відображати треба не весь текст, а лише основне. Наприклад: „буду після 18:00“,
 * „до обіду відсутній“». Працівник вписує тут коротку примітку; якщо її немає —
 * у список друкується нотатка Клієнта. Клієнту ця примітка не показується.
 */
export function ListNoteEditor({
  parcelId,
  value,
  hasClientNote,
  onSaved,
}: {
  parcelId: string;
  value: string | null;
  hasClientNote: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(next: string | null) {
    setSaving(true);
    try {
      const res = await fetch(`/api/parcels/${parcelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listNote: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || 'Не вдалося зберегти примітку');
        return;
      }
      toast.success(next ? 'Примітку для списку збережено' : 'Примітку для списку прибрано');
      setEditing(false);
      onSaved();
    } catch {
      toast.error('Немає звʼязку з сервером. Спробуйте ще раз.');
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-1 border rounded px-2 py-2 space-y-1.5 bg-sky-50/60">
        <div className="text-xs text-gray-600">
          Примітка для списку рейсу — друкується у стовпчику «Примітки».
          {hasClientNote && ' Якщо порожня — друкується нотатка клієнта.'}
        </div>
        <Input
          value={draft}
          maxLength={LIST_NOTE_MAX}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Напр. буду після 18:00"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter' && !saving) save(draft.trim() || null); }}
        />
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={saving} onClick={() => save(draft.trim() || null)}>
            {saving ? 'Збереження…' : 'Зберегти'}
          </Button>
          <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>Скасувати</Button>
          <span className="ml-auto text-[11px] text-gray-400">{draft.length}/{LIST_NOTE_MAX}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1 text-sm flex flex-wrap items-baseline gap-x-2">
      <span className="text-gray-500">Примітка для списку:</span>
      {value
        ? <span className="break-words">{value}</span>
        : <span className="text-gray-400">{hasClientNote ? 'немає (друкується нотатка клієнта)' : 'немає'}</span>}
      <button
        type="button"
        className="text-blue-600 hover:underline text-xs"
        onClick={() => { setDraft(value ?? ''); setEditing(true); }}
      >
        {value ? 'Змінити' : '+ Додати'}
      </button>
    </div>
  );
}
