'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';

interface CollectionPoint {
  id: string;
  country: string;
  city: string;
  address: string;
  postalCode: string | null;
  contactPhone: string | null;
  workingHours: string | null;
  isActive: boolean;
}

export default function CollectionPointsPage() {
  const [points, setPoints] = useState<CollectionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [country, setCountry] = useState('NL');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [workingHours, setWorkingHours] = useState('');

  async function fetchPoints() {
    setLoading(true);
    const res = await fetch('/api/collection-points');
    if (res.ok) setPoints(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchPoints(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/collection-points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country, city, address, postalCode, contactPhone, workingHours }),
    });
    setDialogOpen(false);
    setCity(''); setAddress(''); setPostalCode(''); setContactPhone(''); setWorkingHours('');
    fetchPoints();
    setSaving(false);
  }

  const CP_COUNTRY_LABELS: Record<string, string> = { NL: 'Нідерланди', AT: 'Австрія', DE: 'Німеччина' };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Пункти збору</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button>+ Додати</Button>} />
          <DialogContent>
            <DialogHeader><DialogTitle>Новий пункт збору</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <Label>Країна</Label>
                <Select value={country} onValueChange={(v) => setCountry(v ?? 'NL')}>
                  <SelectTrigger><SelectValue>{CP_COUNTRY_LABELS[country]}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NL">Нідерланди</SelectItem>
                    <SelectItem value="AT">Австрія</SelectItem>
                    <SelectItem value="DE">Німеччина</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Місто *</Label><Input value={city} onChange={(e) => setCity(e.target.value)} required /></div>
              <div><Label>Адреса *</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} required /></div>
              <div><Label>Поштовий код</Label><Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} /></div>
              <div><Label>Телефон</Label><Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} /></div>
              <div><Label>Робочі години</Label><Input value={workingHours} onChange={(e) => setWorkingHours(e.target.value)} placeholder="Пн-Пт 9:00-18:00" /></div>
              <Button type="submit" className="w-full" disabled={saving}>{saving ? '...' : 'Створити'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {loading ? <div className="text-center py-12 text-gray-500">Завантаження...</div> : (
        <div className="bg-white rounded-lg border divide-y">
          {points.map(p => (
            <div key={p.id} className="p-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{COUNTRY_LABELS[p.country as CountryCode]}</Badge>
                <span className="font-medium">{p.city}, {p.address}</span>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {p.postalCode && `${p.postalCode} | `}
                {p.contactPhone && `${p.contactPhone} | `}
                {p.workingHours || ''}
              </div>
            </div>
          ))}
          {points.length === 0 && <div className="text-center py-8 text-gray-500">Немає пунктів збору</div>}
        </div>
      )}
    </div>
  );
}
