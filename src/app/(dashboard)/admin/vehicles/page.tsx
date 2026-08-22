'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Truck, Pencil, Trash2, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils/format';

interface Vehicle {
  id: string;
  brand: string;
  model: string;
  regNumber: string;
  totalSeats: number | null;
  techPassportPhoto: string | null;
  techPassportPhoto2: string | null;
  greenCardPhoto: string | null;
  oscpvPhoto: string | null;
  techInspectionPhoto: string | null;
  oscpvStart: string | null;
  oscpvEnd: string | null;
  greenCardStart: string | null;
  greenCardEnd: string | null;
  techInspectionDate: string | null;
  nextTechInspectionDate: string | null;
  notes: string | null;
  isActive: boolean;
}

// ТЗ docx 21.08.26: іменовані слоти документів-фото транспорту.
const PHOTO_SLOTS = [
  { slot: 'techPassport', label: 'Техпаспорт (стор. 1)', field: 'techPassportPhoto' },
  { slot: 'techPassport2', label: 'Техпаспорт (стор. 2)', field: 'techPassportPhoto2' },
  { slot: 'greenCard', label: 'Зелена карта', field: 'greenCardPhoto' },
  { slot: 'oscpv', label: 'ОСЦПВ', field: 'oscpvPhoto' },
  { slot: 'techInspection', label: 'Техогляд', field: 'techInspectionPhoto' },
] as const;

type FormState = {
  brand: string; model: string; regNumber: string; totalSeats: string;
  oscpvStart: string; oscpvEnd: string;
  greenCardStart: string; greenCardEnd: string;
  techInspectionDate: string; nextTechInspectionDate: string;
  notes: string; isActive: boolean;
};

const EMPTY_FORM: FormState = {
  brand: '', model: '', regNumber: '', totalSeats: '',
  oscpvStart: '', oscpvEnd: '', greenCardStart: '', greenCardEnd: '',
  techInspectionDate: '', nextTechInspectionDate: '', notes: '', isActive: true,
};

/** ISO-дату → значення для <input type="date"> (YYYY-MM-DD). */
function toInputDate(v: string | null): string {
  return v ? v.slice(0, 10) : '';
}

export default function VehiclesAdminPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  // ТЗ docx 21.08.26: per-slot індикатор завантаження (кілька фото-документів).
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/vehicles')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { setVehicles(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(v: Vehicle) {
    setEditId(v.id);
    setForm({
      brand: v.brand, model: v.model, regNumber: v.regNumber,
      totalSeats: v.totalSeats != null ? String(v.totalSeats) : '',
      oscpvStart: toInputDate(v.oscpvStart), oscpvEnd: toInputDate(v.oscpvEnd),
      greenCardStart: toInputDate(v.greenCardStart), greenCardEnd: toInputDate(v.greenCardEnd),
      techInspectionDate: toInputDate(v.techInspectionDate), nextTechInspectionDate: toInputDate(v.nextTechInspectionDate),
      notes: v.notes ?? '', isActive: v.isActive,
    });
    setOpen(true);
  }

  async function handleSubmit() {
    if (!form.brand.trim() || !form.model.trim() || !form.regNumber.trim()) {
      toast.error('Марка, модель і реєстраційний номер обовʼязкові');
      return;
    }
    setSaving(true);
    try {
      const url = editId ? `/api/vehicles/${editId}` : '/api/vehicles';
      const method = editId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Помилка збереження');
      }
      toast.success(editId ? 'Збережено' : 'Транспорт додано');
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Помилка');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(v: Vehicle) {
    if (!confirm(`Видалити ${v.brand} ${v.model} (${v.regNumber})?`)) return;
    const res = await fetch(`/api/vehicles/${v.id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Видалено'); load(); }
    else toast.error('Не вдалося видалити');
  }

  async function handlePhoto(slot: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editId) return;
    setUploadingSlot(slot);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/vehicles/${editId}/photo?slot=${slot}`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Помилка завантаження');
      toast.success('Фото завантажено');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setUploadingSlot(null);
      e.target.value = '';
    }
  }

  async function handleDeletePhoto(slot: string, label: string) {
    if (!editId) return;
    if (!confirm(`Видалити фото «${label}»?`)) return;
    setUploadingSlot(slot);
    try {
      const res = await fetch(`/api/vehicles/${editId}/photo?slot=${slot}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Помилка видалення');
      toast.success('Фото видалено');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setUploadingSlot(null);
    }
  }

  const editingVehicle = editId ? vehicles.find((v) => v.id === editId) : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Truck className="w-6 h-6" /> Транспортні засоби</h1>
          <p className="text-sm text-gray-500">Доступні для вибору у поїздках/рейсах. Документи з датами.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button onClick={openCreate}>+ Додати транспорт</Button>} />
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? 'Редагувати транспорт' : 'Новий транспорт'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Марка *</Label>
                  <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Рено" />
                </div>
                <div>
                  <Label className="text-xs">Модель *</Label>
                  <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Мастер" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Реєстраційний номер *</Label>
                <Input value={form.regNumber} onChange={(e) => setForm({ ...form, regNumber: e.target.value })} placeholder="ВС1274ТВ" />
              </div>
              {/* ТЗ docx 21.08.26: загальна к-сть місць (включно з водієм). */}
              <div>
                <Label className="text-xs">Загальна к-сть місць (включно з водієм)</Label>
                <Input
                  type="number" min={1} max={99}
                  value={form.totalSeats}
                  onChange={(e) => setForm({ ...form, totalSeats: e.target.value })}
                  placeholder="напр. 8"
                />
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Пасажирські місця задаються на поїздці; недоступні = загальні − пасажирські (з місця водія).
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 border-t pt-2">
                <div>
                  <Label className="text-xs">ОСЦПВ — початок</Label>
                  <Input type="date" value={form.oscpvStart} onChange={(e) => setForm({ ...form, oscpvStart: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">ОСЦПВ — кінець</Label>
                  <Input type="date" value={form.oscpvEnd} onChange={(e) => setForm({ ...form, oscpvEnd: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Зелена карта — початок</Label>
                  <Input type="date" value={form.greenCardStart} onChange={(e) => setForm({ ...form, greenCardStart: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Зелена карта — кінець</Label>
                  <Input type="date" value={form.greenCardEnd} onChange={(e) => setForm({ ...form, greenCardEnd: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Техогляд — дата</Label>
                  <Input type="date" value={form.techInspectionDate} onChange={(e) => setForm({ ...form, techInspectionDate: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Наступний техогляд</Label>
                  <Input type="date" value={form.nextTechInspectionDate} onChange={(e) => setForm({ ...form, nextTechInspectionDate: e.target.value })} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Нотатки</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.isActive} onCheckedChange={(c) => setForm({ ...form, isActive: !!c })} />
                Активний (доступний для вибору)
              </label>

              {/* ТЗ docx 21.08.26: документи-фото (зелена карта, ОСЦПВ, техогляд, 2 стор.
                  техпаспорта) — завантаження/заміна/видалення. Лише в режимі редагування. */}
              {editId && (
                <div className="border-t pt-2 space-y-2">
                  <Label className="text-xs">Документи (фото)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {PHOTO_SLOTS.map(({ slot, label, field }) => {
                      const url = editingVehicle ? editingVehicle[field] : null;
                      const busy = uploadingSlot === slot;
                      return (
                        <div key={slot} className="border rounded p-2">
                          <div className="text-[11px] font-medium text-gray-600 mb-1">{label}</div>
                          {url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={url} alt={label} className="mb-1 h-24 w-full object-cover rounded border" />
                          ) : (
                            <div className="mb-1 h-24 w-full rounded border border-dashed bg-gray-50 flex items-center justify-center text-[10px] text-gray-400">немає</div>
                          )}
                          <div className="flex items-center gap-2">
                            <label className="inline-flex items-center gap-1 text-xs text-blue-600 cursor-pointer">
                              <Camera className="w-3.5 h-3.5" />
                              {busy ? '…' : (url ? 'Замінити' : 'Додати')}
                              <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhoto(slot, e)} disabled={busy} />
                            </label>
                            {url && !busy && (
                              <button type="button" onClick={() => handleDeletePhoto(slot, label)} className="text-xs text-red-500 hover:text-red-700 ml-auto">
                                Видалити
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {!editId && (
                <p className="text-xs text-gray-400 border-t pt-2">Документи-фото можна додати після збереження.</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>Скасувати</Button>
                <Button onClick={handleSubmit} disabled={saving}>{saving ? 'Збереження…' : (editId ? 'Зберегти' : 'Додати')}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Завантаження…</div>
      ) : vehicles.length === 0 ? (
        <div className="text-center py-12 text-gray-500">Транспорт ще не додано</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((v) => (
            <div key={v.id} className="bg-white border rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold flex items-center gap-1.5">
                    🚛 {v.brand} {v.model}
                    {!v.isActive && <Badge variant="secondary" className="text-[10px]">неактивний</Badge>}
                  </div>
                  <div className="font-mono text-sm text-gray-600">{v.regNumber}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button type="button" onClick={() => openEdit(v)} className="text-gray-400 hover:text-blue-600" title="Редагувати"><Pencil className="w-4 h-4" /></button>
                  <button type="button" onClick={() => handleDelete(v)} className="text-gray-400 hover:text-red-600" title="Видалити"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                {v.totalSeats != null && <div>Місць усього: <span className="font-medium text-gray-700">{v.totalSeats}</span> (з водієм)</div>}
                {(v.oscpvStart || v.oscpvEnd) && <div>ОСЦПВ: {v.oscpvStart ? formatDate(v.oscpvStart) : '—'} → {v.oscpvEnd ? formatDate(v.oscpvEnd) : '—'}</div>}
                {(v.greenCardStart || v.greenCardEnd) && <div>Зелена карта: {v.greenCardStart ? formatDate(v.greenCardStart) : '—'} → {v.greenCardEnd ? formatDate(v.greenCardEnd) : '—'}</div>}
                {v.techInspectionDate && <div>Техогляд: {formatDate(v.techInspectionDate)}{v.nextTechInspectionDate ? ` → наступний ${formatDate(v.nextTechInspectionDate)}` : ''}</div>}
                {(() => {
                  const docs = [v.techPassportPhoto, v.techPassportPhoto2, v.greenCardPhoto, v.oscpvPhoto, v.techInspectionPhoto].filter(Boolean).length;
                  return docs > 0 ? <div className="text-blue-600">📷 Документів: {docs}/5</div> : null;
                })()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
