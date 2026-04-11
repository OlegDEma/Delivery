'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS, STATUS_COLORS, type ParcelStatusType } from '@/lib/constants/statuses';
import { formatDate, formatWeight } from '@/lib/utils/format';

interface SearchResult {
  id: string;
  internalNumber: string;
  itn: string;
  status: ParcelStatusType;
  direction: string;
  totalWeight: number | null;
  totalPlacesCount: number;
  npTtn: string | null;
  createdAt: string;
  sender: { firstName: string; lastName: string; phone: string };
  receiver: { firstName: string; lastName: string; phone: string };
  receiverAddress: { city: string; street: string | null } | null;
}

export default function SearchPage() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Auto-search from URL query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (q) {
      setName(q);
      // Trigger search
      setTimeout(() => {
        const form = document.querySelector('form');
        if (form) form.requestSubmit();
      }, 100);
    }
  }, []);

  // Multi-criteria filters
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [city, setCity] = useState('');
  const [itn, setItn] = useState('');

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSearched(true);

    // Build combined query
    const params = new URLSearchParams();
    params.set('limit', '100');

    // Use q for general text search (name, ITN, phone)
    const searchParts: string[] = [];
    if (name) searchParts.push(name);
    if (phone) searchParts.push(phone);
    if (itn) searchParts.push(itn);
    if (searchParts.length > 0) params.set('q', searchParts[0]); // Primary search

    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);

    const res = await fetch(`/api/parcels?${params}`);
    if (res.ok) {
      const data = await res.json();
      let filtered = data.parcels as SearchResult[];

      // Client-side filtering for additional criteria
      if (name && searchParts.length > 1) {
        const nameLower = name.toLowerCase();
        filtered = filtered.filter(p =>
          p.sender.lastName.toLowerCase().includes(nameLower) ||
          p.sender.firstName.toLowerCase().includes(nameLower) ||
          p.receiver.lastName.toLowerCase().includes(nameLower) ||
          p.receiver.firstName.toLowerCase().includes(nameLower)
        );
      }
      if (phone && name) {
        filtered = filtered.filter(p =>
          p.sender.phone.includes(phone) || p.receiver.phone.includes(phone)
        );
      }
      if (city) {
        const cityLower = city.toLowerCase();
        filtered = filtered.filter(p =>
          p.receiverAddress?.city?.toLowerCase().includes(cityLower)
        );
      }

      setResults(filtered);
    }
    setLoading(false);
  }

  function handleClear() {
    setName('');
    setPhone('');
    setDateFrom('');
    setDateTo('');
    setCity('');
    setItn('');
    setResults([]);
    setSearched(false);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Пошук посилок</h1>

      <form onSubmit={handleSearch} className="bg-white rounded-lg border p-4 mb-4 space-y-3">
        <p className="text-sm text-gray-500">Введіть будь-які критерії пошуку в будь-якому порядку. Чим більше критеріїв — тим точніший результат.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Прізвище або ім&apos;я</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Іваненко" />
          </div>
          <div>
            <Label className="text-xs">Телефон</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+380..." />
          </div>
          <div>
            <Label className="text-xs">ІТН або ТТН НП</Label>
            <Input value={itn} onChange={(e) => setItn(e.target.value)} placeholder="2600000..." />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Місто отримувача</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Львів" />
          </div>
          <div>
            <Label className="text-xs">Дата від</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Дата до</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? 'Пошук...' : 'Знайти'}
          </Button>
          <Button type="button" variant="outline" onClick={handleClear}>Очистити</Button>
        </div>
      </form>

      {searched && (
        <div className="mb-2 text-sm text-gray-500">
          Знайдено: {results.length} посилок
        </div>
      )}

      <div className="bg-white rounded-lg border divide-y">
        {results.map(p => (
          <Link key={p.id} href={`/parcels/${p.id}`} className="block p-3 hover:bg-gray-50">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-mono text-sm font-medium">{p.internalNumber}</span>
                  <Badge className={`text-xs ${STATUS_COLORS[p.status]}`}>{STATUS_LABELS[p.status]}</Badge>
                </div>
                <div className="text-sm">
                  <span className="text-gray-500">Від:</span> {p.sender.lastName} {p.sender.firstName}
                  <span className="text-gray-400 ml-1">{p.sender.phone}</span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-500">Кому:</span> {p.receiver.lastName} {p.receiver.firstName}
                  <span className="text-gray-400 ml-1">{p.receiver.phone}</span>
                </div>
                {p.receiverAddress && (
                  <div className="text-xs text-gray-400">{p.receiverAddress.city}</div>
                )}
              </div>
              <div className="text-right shrink-0 text-sm">
                <div>{formatDate(p.createdAt)}</div>
                <div className="font-medium">{p.totalWeight ? formatWeight(Number(p.totalWeight)) : '—'}</div>
                {p.npTtn && <div className="text-xs text-gray-400 font-mono">{p.npTtn}</div>}
              </div>
            </div>
          </Link>
        ))}
        {searched && results.length === 0 && (
          <div className="text-center py-8 text-gray-500">Нічого не знайдено</div>
        )}
        {!searched && (
          <div className="text-center py-8 text-gray-400">Введіть критерії та натисніть "Знайти"</div>
        )}
      </div>
    </div>
  );
}
