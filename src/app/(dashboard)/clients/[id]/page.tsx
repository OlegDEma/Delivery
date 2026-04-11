'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';
import { STATUS_LABELS, STATUS_COLORS, type ParcelStatusType } from '@/lib/constants/statuses';
import { formatDate } from '@/lib/utils/format';

interface Address {
  id: string;
  country: string;
  city: string;
  street: string | null;
  building: string | null;
  apartment: string | null;
  postalCode: string | null;
  landmark: string | null;
  npWarehouseNum: string | null;
  deliveryMethod: string;
  usageCount: number;
}

interface ParcelRef {
  id: string;
  internalNumber: string;
  status: ParcelStatusType;
  createdAt: string;
}

interface ClientDetail {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  country: string | null;
  clientType: string;
  notes: string | null;
  addresses: Address[];
  sentParcels: ParcelRef[];
  receivedParcels: ParcelRef[];
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);

  // Edit form
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [notes, setNotes] = useState('');

  // New address form
  const [addrCountry, setAddrCountry] = useState<string>('UA');
  const [addrCity, setAddrCity] = useState('');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrBuilding, setAddrBuilding] = useState('');
  const [addrLandmark, setAddrLandmark] = useState('');
  const [addrNpWarehouse, setAddrNpWarehouse] = useState('');

  async function fetchClient() {
    const res = await fetch(`/api/clients/${id}`);
    if (res.ok) {
      const data = await res.json();
      setClient(data);
      setPhone(data.phone);
      setFirstName(data.firstName);
      setLastName(data.lastName);
      setMiddleName(data.middleName || '');
      setNotes(data.notes || '');
    }
    setLoading(false);
  }

  useEffect(() => { fetchClient(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', phone, firstName, lastName, middleName, notes }),
    });
    setEditing(false);
    await fetchClient();
    setSaving(false);
  }

  async function handleAddAddress(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'addAddress',
        address: {
          country: addrCountry,
          city: addrCity,
          street: addrStreet || undefined,
          building: addrBuilding || undefined,
          landmark: addrLandmark || undefined,
          npWarehouseNum: addrNpWarehouse || undefined,
          deliveryMethod: addrNpWarehouse ? 'np_warehouse' : 'address',
        },
      }),
    });
    setAddressDialogOpen(false);
    setAddrCity('');
    setAddrStreet('');
    setAddrBuilding('');
    setAddrLandmark('');
    setAddrNpWarehouse('');
    fetchClient();
  }

  async function handleDeleteAddress(addressId: string) {
    await fetch(`/api/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deleteAddress', addressId }),
    });
    fetchClient();
  }

  const ADDR_COUNTRY_LABELS: Record<string, string> = { UA: 'Україна', NL: 'Нідерланди', AT: 'Австрія', DE: 'Німеччина' };

  if (loading) return <div className="text-center py-12 text-gray-500">Завантаження...</div>;
  if (!client) return <div className="text-center py-12 text-red-500">Клієнта не знайдено</div>;

  const allParcels = [...client.sentParcels, ...client.receivedParcels]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  return (
    <div className="max-w-2xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">
            {client.lastName} {client.firstName} {client.middleName || ''}
          </h1>
          <div className="text-sm text-gray-500">{client.phone}</div>
          {client.country && (
            <Badge variant="secondary" className="mt-1">{COUNTRY_LABELS[client.country as CountryCode]}</Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(!editing)}>
          {editing ? 'Скасувати' : 'Редагувати'}
        </Button>
      </div>

      {/* Edit form */}
      {editing && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Прізвище</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Ім&apos;я</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Телефон</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="text-base" />
            </div>
            <div>
              <Label className="text-xs">Нотатки</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Button onClick={handleSave} disabled={saving} size="sm">
              {saving ? 'Збереження...' : 'Зберегти'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Addresses */}
      <Card>
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Адреси ({client.addresses.length})</CardTitle>
          <Dialog open={addressDialogOpen} onOpenChange={setAddressDialogOpen}>
            <DialogTrigger render={<Button variant="outline" size="sm">+ Адреса</Button>} />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Нова адреса</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddAddress} className="space-y-3">
                <div>
                  <Label>Країна</Label>
                  <Select value={addrCountry} onValueChange={(v) => setAddrCountry(v ?? 'UA')}>
                    <SelectTrigger><SelectValue>{ADDR_COUNTRY_LABELS[addrCountry]}</SelectValue></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UA">Україна</SelectItem>
                      <SelectItem value="NL">Нідерланди</SelectItem>
                      <SelectItem value="AT">Австрія</SelectItem>
                      <SelectItem value="DE">Німеччина</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Місто *</Label>
                  <Input value={addrCity} onChange={(e) => setAddrCity(e.target.value)} required />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Вулиця</Label>
                    <Input value={addrStreet} onChange={(e) => setAddrStreet(e.target.value)} />
                  </div>
                  <div>
                    <Label>Будинок</Label>
                    <Input value={addrBuilding} onChange={(e) => setAddrBuilding(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Орієнтир</Label>
                  <Input value={addrLandmark} onChange={(e) => setAddrLandmark(e.target.value)} />
                </div>
                {addrCountry === 'UA' && (
                  <div>
                    <Label>Склад НП (номер)</Label>
                    <Input value={addrNpWarehouse} onChange={(e) => setAddrNpWarehouse(e.target.value)} placeholder="1" />
                  </div>
                )}
                <Button type="submit" className="w-full">Додати</Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="divide-y">
            {client.addresses.map(a => (
              <div key={a.id} className="px-4 py-2 flex items-center justify-between">
                <div>
                  <div className="text-sm">
                    {COUNTRY_LABELS[a.country as CountryCode]}, {a.city}
                    {a.street ? `, ${a.street}` : ''}
                    {a.building ? ` ${a.building}` : ''}
                    {a.apartment ? `, кв. ${a.apartment}` : ''}
                  </div>
                  <div className="text-xs text-gray-400">
                    {a.npWarehouseNum && `НП №${a.npWarehouseNum} | `}
                    {a.landmark && `${a.landmark} | `}
                    {a.postalCode && `${a.postalCode} | `}
                    Використано: {a.usageCount}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-400 hover:text-red-600"
                  onClick={() => handleDeleteAddress(a.id)}
                >
                  &times;
                </Button>
              </div>
            ))}
            {client.addresses.length === 0 && (
              <div className="text-center py-4 text-sm text-gray-500">Немає адрес</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Parcels history */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-base">Посилки</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="divide-y">
            {allParcels.map(p => (
              <Link key={p.id} href={`/parcels/${p.id}`} className="flex items-center justify-between px-4 py-2 hover:bg-gray-50">
                <span className="font-mono text-sm">{p.internalNumber}</span>
                <div className="flex items-center gap-2">
                  <Badge className={`text-xs ${STATUS_COLORS[p.status]}`}>
                    {STATUS_LABELS[p.status]}
                  </Badge>
                  <span className="text-xs text-gray-400">{formatDate(p.createdAt)}</span>
                </div>
              </Link>
            ))}
            {allParcels.length === 0 && (
              <div className="text-center py-4 text-sm text-gray-500">Немає посилок</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
