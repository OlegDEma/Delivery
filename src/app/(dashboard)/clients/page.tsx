'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Link from 'next/link';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';

interface ClientAddress {
  id: string;
  country: string;
  city: string;
  street: string | null;
  building: string | null;
  landmark: string | null;
  deliveryMethod: string;
  npWarehouseNum: string | null;
}

interface Client {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  country: string | null;
  clientType: string;
  organizationName: string | null;
  addresses: ClientAddress[];
  createdAt: string;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // New client form
  const [phone, setPhone] = useState('+');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [country, setCountry] = useState<CountryCode>('UA');
  const [city, setCity] = useState('');
  const [street, setStreet] = useState('');
  const [building, setBuilding] = useState('');
  const [landmark, setLandmark] = useState('');

  const fetchClients = useCallback(async (q: string = '') => {
    setLoading(true);
    const res = await fetch(`/api/clients?q=${encodeURIComponent(q)}&limit=50`);
    if (res.ok) {
      const data = await res.json();
      setClients(data.clients);
      setTotal(data.total);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  useEffect(() => {
    const timer = setTimeout(() => fetchClients(search), 300);
    return () => clearTimeout(timer);
  }, [search, fetchClients]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        firstName,
        lastName,
        middleName: middleName || undefined,
        country,
        address: city
          ? { country, city, street: street || undefined, building: building || undefined, landmark: landmark || undefined }
          : undefined,
      }),
    });

    if (res.ok) {
      setDialogOpen(false);
      resetForm();
      fetchClients(search);
    } else {
      const data = await res.json();
      setError(data.error || 'Помилка');
    }
    setSaving(false);
  }

  function resetForm() {
    setPhone('+');
    setFirstName('');
    setLastName('');
    setMiddleName('');
    setCountry('UA');
    setCity('');
    setStreet('');
    setBuilding('');
    setLandmark('');
  }

  const CLIENT_COUNTRY_LABELS: Record<string, string> = { UA: 'Україна', NL: 'Нідерланди', AT: 'Австрія', DE: 'Німеччина' };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Клієнти</h1>
          <p className="text-sm text-gray-500">{total} всього</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button>+ Додати</Button>} />
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Новий клієнт</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <Label>Телефон *</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+380..." className="text-base" required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Прізвище *</Label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                </div>
                <div>
                  <Label>Ім&apos;я *</Label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                </div>
              </div>
              <div>
                <Label>По батькові</Label>
                <Input value={middleName} onChange={(e) => setMiddleName(e.target.value)} />
              </div>
              <div>
                <Label>Країна</Label>
                <Select value={country} onValueChange={(v) => setCountry((v ?? '') as CountryCode)}>
                  <SelectTrigger><SelectValue>{CLIENT_COUNTRY_LABELS[country]}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UA">Україна</SelectItem>
                    <SelectItem value="NL">Нідерланди</SelectItem>
                    <SelectItem value="AT">Австрія</SelectItem>
                    <SelectItem value="DE">Німеччина</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-2">Адреса (опціонально)</p>
                <div className="space-y-2">
                  <div>
                    <Label>Місто</Label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Вулиця</Label>
                      <Input value={street} onChange={(e) => setStreet(e.target.value)} />
                    </div>
                    <div>
                      <Label>Будинок</Label>
                      <Input value={building} onChange={(e) => setBuilding(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <Label>Орієнтир</Label>
                    <Input value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="Біля магазину..." />
                  </div>
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? 'Збереження...' : 'Зберегти'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Пошук по телефону або прізвищу..."
          className="text-base max-w-md"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Завантаження...</div>
      ) : (
        <div className="bg-white rounded-lg border divide-y">
          {clients.map((c) => (
            <Link key={c.id} href={`/clients/${c.id}`} className="block p-3 hover:bg-gray-50">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">
                    {c.lastName} {c.firstName}
                    {c.middleName ? ` ${c.middleName}` : ''}
                  </div>
                  <div className="text-sm text-gray-600">{c.phone}</div>
                  {c.addresses[0] && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      {c.addresses[0].city}
                      {c.addresses[0].street ? `, ${c.addresses[0].street}` : ''}
                      {c.addresses[0].building ? ` ${c.addresses[0].building}` : ''}
                      {c.addresses[0].landmark ? ` (${c.addresses[0].landmark})` : ''}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  {c.country && (
                    <Badge variant="secondary" className="text-xs">
                      {COUNTRY_LABELS[c.country as CountryCode] || c.country}
                    </Badge>
                  )}
                </div>
              </div>
            </Link>
          ))}
          {clients.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              {search ? 'Нічого не знайдено' : 'Немає клієнтів'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
