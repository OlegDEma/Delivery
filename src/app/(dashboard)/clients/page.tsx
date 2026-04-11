'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import Link from 'next/link';
import { COUNTRY_LABELS, type CountryCode } from '@/lib/constants/countries';
import { ClientCreateForm } from '@/components/clients/client-create-form';

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
            <ClientCreateForm
              onSuccess={() => {
                setDialogOpen(false);
                fetchClients(search);
              }}
            />
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
