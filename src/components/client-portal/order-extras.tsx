'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, StickyNote } from 'lucide-react';
import { compressImageForUpload, PHOTO_TOO_LARGE_MESSAGE } from '@/lib/utils/image-compress';

/**
 * ТЗ docx 26.10.26 (п.1): «Можливість додати фото посилки та створити нотатку має бути у
 * будь-кого, хто створює посилку. Реалізація стандартна» — ті самі кнопки, що й у Працівника.
 *
 * Спільний блок для замовлення Клієнта (/my-orders/[id]) і екрана «Замовлення створено»:
 * Працівник після «Створити» одразу потрапляє в посилку з цими кнопками, тож і Клієнт бачить
 * їх одразу після оформлення (відповідь клієнта 30.10.26 «НЕ ВИКОНАНО»).
 */
export function OrderExtras({
  orderId,
  photos: initialPhotos,
  onChanged,
}: {
  orderId: string;
  photos?: string[];
  onChanged?: () => void;
}) {
  const [photos, setPhotos] = useState<string[]>(initialPhotos ?? []);
  const [syncedFrom, setSyncedFrom] = useState(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [error, setError] = useState('');

  // Батько перечитав замовлення — беремо свіжий перелік фото (без ефекту, під час рендеру).
  if (initialPhotos !== syncedFrom) {
    setSyncedFrom(initialPhotos);
    setPhotos(initialPhotos ?? []);
  }

  async function uploadPhoto(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      // ТЗ docx 26.10.26 / відповідь 30.10.26: фото з телефону — стискаємо до відправки
      // (ліміт хостингу 4,5 МБ на запит, див. image-compress.ts).
      const upload = await compressImageForUpload(file);
      const fd = new FormData();
      fd.append('file', upload);
      const res = await fetch(`/api/client-portal/orders/${orderId}/photos`, { method: 'POST', body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(res.status === 413 ? PHOTO_TOO_LARGE_MESSAGE : data?.error || 'Не вдалося завантажити фото');
        return;
      }
      const data = await res.json().catch(() => null);
      if (Array.isArray(data?.photos)) setPhotos(data.photos);
      onChanged?.();
    } catch {
      setError('Немає звʼязку з сервером. Спробуйте ще раз.');
    } finally {
      setUploading(false);
    }
  }

  // ТЗ docx 26.10.26 (п.1): «Додати нотатку» — як у Працівника (запис в історії посилки).
  async function addNote() {
    setAddingNote(true);
    setError('');
    try {
      const res = await fetch(`/api/client-portal/orders/${orderId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: noteDraft }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Не вдалося додати нотатку');
        return;
      }
      setNoteOpen(false);
      setNoteDraft('');
      setNoteSaved(true);
      onChanged?.();
    } catch {
      setError('Немає звʼязку з сервером. Спробуйте ще раз.');
    } finally {
      setAddingNote(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md bg-white transition-colors ${uploading ? 'opacity-60' : 'cursor-pointer hover:bg-gray-50'}`}>
          <Camera className="w-4 h-4 text-gray-500" />
          {uploading ? 'Завантаження…' : 'Додати фото'}
          {photos.length ? (
            <span className="ml-1 text-xs bg-blue-100 text-blue-700 px-1.5 rounded-full">{photos.length}</span>
          ) : null}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={uploading}
            onChange={(e) => { uploadPhoto(e.target.files?.[0]); e.target.value = ''; }}
          />
        </label>
        <Button type="button" size="sm" variant="outline" onClick={() => { setNoteDraft(''); setNoteOpen(true); setNoteSaved(false); }}>
          <StickyNote className="w-4 h-4 mr-1" /> Додати нотатку
        </Button>
      </div>
      {noteOpen && (
        <div className="border rounded-lg p-3 space-y-2 bg-amber-50/50 text-left">
          <div className="text-xs text-gray-600">Нотатка до посилки</div>
          <input
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value.slice(0, 150))}
            maxLength={150}
            placeholder="Напр. телефонуйте після 18:00"
            className="w-full border rounded-md px-3 py-1.5 text-sm bg-white"
            autoFocus
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={addingNote || !noteDraft.trim()} onClick={addNote}>
              {addingNote ? 'Збереження…' : 'Зберегти нотатку'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setNoteOpen(false)} disabled={addingNote}>Скасувати</Button>
          </div>
        </div>
      )}
      {noteSaved && !noteOpen && <div className="text-sm text-green-700">Нотатку додано.</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}
      {photos.length ? (
        <div className="flex gap-2 flex-wrap">
          {photos.map((url, i) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Фото ${i + 1}`} className="w-16 h-16 object-cover rounded-lg border hover:opacity-80" />
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
