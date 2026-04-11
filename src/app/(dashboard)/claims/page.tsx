'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDateTime } from '@/lib/utils/format';

interface Claim {
  id: string;
  type: string;
  description: string;
  resolution: string | null;
  status: string;
  createdAt: string;
  parcel: { internalNumber: string; itn: string } | null;
  client: { firstName: string; lastName: string; phone: string } | null;
  createdBy: { fullName: string } | null;
}

const TYPE_LABELS: Record<string, string> = { damage: 'Пошкодження', lost: 'Втрата', delay: 'Затримка', other: 'Інше' };
const STATUS_LABELS: Record<string, string> = { open: 'Відкрито', in_progress: 'В роботі', resolved: 'Вирішено', rejected: 'Відхилено' };
const STATUS_COLORS: Record<string, string> = { open: 'bg-red-100 text-red-800', in_progress: 'bg-yellow-100 text-yellow-800', resolved: 'bg-green-100 text-green-800', rejected: 'bg-gray-100 text-gray-800' };

export default function ClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [parcelItn, setParcelItn] = useState('');
  const [type, setType] = useState('damage');
  const [description, setDescription] = useState('');

  async function fetchClaims() {
    setLoading(true);
    const res = await fetch('/api/claims');
    if (res.ok) setClaims(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchClaims(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    // Find parcel by ITN or internal number
    const parcelRes = await fetch(`/api/parcels?q=${encodeURIComponent(parcelItn)}&limit=1`);
    if (!parcelRes.ok) { setError('Помилка пошуку посилки'); setSaving(false); return; }
    const parcelData = await parcelRes.json();
    if (!parcelData.parcels?.length) { setError('Посилку не знайдено'); setSaving(false); return; }

    const res = await fetch('/api/claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parcelId: parcelData.parcels[0].id,
        type,
        description,
      }),
    });

    if (res.ok) {
      setDialogOpen(false);
      setParcelItn('');
      setDescription('');
      fetchClaims();
    } else {
      const data = await res.json();
      setError(data.error || 'Помилка');
    }
    setSaving(false);
  }

  async function handleStatusChange(claimId: string, newStatus: string) {
    await fetch('/api/claims', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: claimId, status: newStatus }),
    });
    fetchClaims();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Претензії</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button>+ Нова претензія</Button>} />
          <DialogContent>
            <DialogHeader><DialogTitle>Нова претензія</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <Label>Номер посилки (ІТН або внутрішній) *</Label>
                <Input value={parcelItn} onChange={(e) => setParcelItn(e.target.value)} placeholder="26000..." required />
              </div>
              <div>
                <Label>Тип</Label>
                <Select value={type} onValueChange={(v) => setType(v ?? 'damage')}>
                  <SelectTrigger><SelectValue>{TYPE_LABELS[type]}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="damage">Пошкодження</SelectItem>
                    <SelectItem value="lost">Втрата</SelectItem>
                    <SelectItem value="delay">Затримка</SelectItem>
                    <SelectItem value="other">Інше</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Опис *</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} required placeholder="Опишіть проблему..." />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full" disabled={saving}>{saving ? '...' : 'Створити'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? <div className="text-center py-12 text-gray-500">Завантаження...</div> : (
        <div className="bg-white rounded-lg border divide-y">
          {claims.map(c => (
            <div key={c.id} className="p-3">
              <div className="flex items-start justify-between mb-1">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge className={STATUS_COLORS[c.status]}>{STATUS_LABELS[c.status]}</Badge>
                    <Badge variant="secondary">{TYPE_LABELS[c.type] || c.type}</Badge>
                    {c.parcel && (
                      <Link href={`/parcels/${c.id}`} className="font-mono text-sm text-blue-600 hover:underline">
                        {c.parcel.internalNumber}
                      </Link>
                    )}
                  </div>
                  <div className="text-sm mt-1">{c.description}</div>
                  {c.resolution && <div className="text-sm text-green-700 mt-1">Рішення: {c.resolution}</div>}
                  <div className="text-xs text-gray-400 mt-1">
                    {formatDateTime(c.createdAt)}
                    {c.client && ` | ${c.client.lastName} ${c.client.firstName} ${c.client.phone}`}
                    {c.createdBy && ` | ${c.createdBy.fullName}`}
                  </div>
                </div>
                {c.status !== 'resolved' && c.status !== 'rejected' && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => handleStatusChange(c.id, 'in_progress')} className="text-xs">В роботу</Button>
                    <Button size="sm" variant="outline" onClick={() => handleStatusChange(c.id, 'resolved')} className="text-xs text-green-600">Вирішено</Button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {claims.length === 0 && <div className="text-center py-8 text-gray-500">Немає претензій</div>}
        </div>
      )}
    </div>
  );
}
