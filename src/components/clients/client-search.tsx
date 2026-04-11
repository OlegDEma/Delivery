'use client';

import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ClientCreateForm } from './client-create-form';

interface ClientResult {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  country: string | null;
  addresses: {
    id: string;
    country: string;
    city: string;
    street: string | null;
    building: string | null;
    apartment: string | null;
    postalCode: string | null;
    landmark: string | null;
    npWarehouseNum: string | null;
    npPoshtamatNum: string | null;
    deliveryMethod: string;
    usageCount: number;
  }[];
}

interface ClientSearchProps {
  label: string;
  onSelect: (client: ClientResult) => void;
  onClear: () => void;
  selected?: ClientResult | null;
}

export function ClientSearch({ label, onSelect, onClear, selected }: ClientSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ClientResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSearch(value: string) {
    setQuery(value);
    setSearchError('');

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/clients?q=${encodeURIComponent(value)}&limit=10`);
        if (res.ok) {
          const data = await res.json();
          if (data.clients.length > 0) {
            setResults(data.clients);
            setShowDropdown(true);
          } else {
            // Якщо не знайдено і схоже на ТТН — шукаємо в посилках
            const digits = value.replace(/\D/g, '');
            if (digits.length >= 10) {
              const parcelRes = await fetch(`/api/parcels?q=${encodeURIComponent(value)}&limit=5`);
              if (parcelRes.ok) {
                const parcelData = await parcelRes.json();
                const fromParcels: ClientResult[] = parcelData.parcels.map((p: { sender: { id: string; phone: string; firstName: string; lastName: string } }) => ({
                  id: p.sender.id,
                  phone: p.sender.phone,
                  firstName: p.sender.firstName,
                  lastName: p.sender.lastName,
                  middleName: null,
                  country: null,
                  addresses: [],
                }));
                const unique = fromParcels.filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i);
                setResults(unique);
                setShowDropdown(true);
              }
            } else {
              setResults([]);
              setShowDropdown(true);
            }
          }
        } else {
          setSearchError('Помилка пошуку');
          setShowDropdown(true);
        }
      } catch {
        setSearchError('Помилка мережі');
        setShowDropdown(true);
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  function handleSelect(client: ClientResult) {
    onSelect(client);
    setQuery('');
    setShowDropdown(false);
  }

  function handleOpenCreate() {
    setShowDropdown(false);
    setShowCreateDialog(true);
  }

  function handleClientCreated(client: ClientResult) {
    setShowCreateDialog(false);
    setQuery('');
    onSelect(client);
  }

  // Визначаємо, чи запит схожий на телефон
  function getInitialPhone(): string | undefined {
    if (!query) return undefined;
    const digits = query.replace(/\D/g, '');
    if (query.startsWith('+') || digits.length >= 5) return query;
    return undefined;
  }

  if (selected) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-gray-500">{label}</Label>
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          <div>
            <div className="font-medium text-sm">
              {selected.lastName} {selected.firstName}
              {selected.middleName ? ` ${selected.middleName}` : ''}
            </div>
            <div className="text-xs text-gray-600">{selected.phone}</div>
            {selected.addresses[0] && (
              <div className="text-xs text-gray-500 mt-0.5">
                {selected.addresses[0].city}
                {selected.addresses[0].street ? `, ${selected.addresses[0].street}` : ''}
                {selected.addresses[0].building ? ` ${selected.addresses[0].building}` : ''}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClear}
            className="text-gray-400 hover:text-red-500 ml-2 text-lg"
          >
            &times;
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative space-y-1">
      <Label className="text-xs text-gray-500">{label}</Label>
      <div className="flex gap-1">
        <Input
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => {
            if (results.length > 0 || (query.length >= 2)) setShowDropdown(true);
          }}
          placeholder="Телефон або прізвище..."
          className="text-base flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 px-2 h-9 text-lg font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50"
          onClick={handleOpenCreate}
          title="Створити нового клієнта"
        >
          +
        </Button>
      </div>
      {loading && (
        <div className="absolute right-14 top-8 text-xs text-gray-400">Завантаження...</div>
      )}

      {showDropdown && (
        <div className="absolute z-[9999] w-full mt-1 bg-white border-2 border-blue-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {searchError ? (
            <div className="px-3 py-3 text-sm text-red-600">{searchError}</div>
          ) : (
            <>
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="w-full text-left px-3 py-3 hover:bg-blue-50 border-b border-gray-100 last:border-0 transition-colors"
                  onClick={() => handleSelect(c)}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-sm text-gray-900">{c.lastName} {c.firstName}</span>
                    <span className="text-sm text-blue-600 font-mono shrink-0">{c.phone}</span>
                  </div>
                  {c.addresses[0] && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      {c.addresses[0].city}
                      {c.addresses[0].street ? `, ${c.addresses[0].street}` : ''}
                      {c.addresses[0].building ? ` ${c.addresses[0].building}` : ''}
                      {c.addresses[0].landmark ? ` (${c.addresses[0].landmark})` : ''}
                      {c.addresses[0].npWarehouseNum ? ` | НП №${c.addresses[0].npWarehouseNum}` : ''}
                    </div>
                  )}
                  {!c.addresses[0] && c.country && (
                    <div className="text-xs text-gray-400 mt-0.5">{c.country}</div>
                  )}
                </button>
              ))}
              {results.length === 0 && query.length >= 2 && !loading && (
                <div className="px-3 py-3 text-sm text-gray-500">
                  Нікого не знайдено
                </div>
              )}
              <button
                type="button"
                className="w-full text-left px-3 py-2.5 hover:bg-green-50 border-t border-gray-200 transition-colors flex items-center gap-2 text-green-700 font-medium text-sm"
                onClick={handleOpenCreate}
              >
                <span className="text-lg leading-none">+</span>
                Створити нового клієнта
              </button>
            </>
          )}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Новий клієнт</DialogTitle>
          </DialogHeader>
          <ClientCreateForm
            onSuccess={handleClientCreated}
            onCancel={() => setShowCreateDialog(false)}
            initialPhone={getInitialPhone()}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
