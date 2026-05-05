'use client';

import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ClientCreateForm } from './client-create-form';
import { PhoneInput } from '@/components/shared/phone-input';
import type { CountryCode } from '@/lib/constants/countries';

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
  /** Direction of the parcel (drives default country/phone code in "New client"). */
  direction?: 'eu_to_ua' | 'ua_to_eu';
  /** Role this client will play — sender or receiver. */
  role?: 'sender' | 'receiver';
  /**
   * Inline-edited phone number — per ТЗ: «Заповнену інформацію в кожному полі
   * можна, при бажанні, поміняти окремо ... наприклад лише номер телефону».
   * If parent passes onPhoneEdit, an edit-pencil appears on the selected card.
   */
  onPhoneEdit?: (newPhone: string) => void;
}

export function ClientSearch({ label, onSelect, onClear, selected, direction, role, onPhoneEdit }: ClientSearchProps) {
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ClientResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  // Per ТЗ: при знаходженні клієнта в пошуку відкривається ТА САМА форма, що
  // й при «+», заповнена даними з останньої відправки. Кнопка «Зберегти»
  // підтверджує актуальність або зберігає правки.
  const [editCandidate, setEditCandidate] = useState<ClientResult | null>(null);
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
        const params = new URLSearchParams({ q: value, limit: '10' });
        if (role) params.set('role', role);
        const res = await fetch(`/api/clients?${params}`);
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
    setQuery('');
    setShowDropdown(false);
    // Open the same modal as «+», prefilled — worker confirms with «Зберегти».
    setEditCandidate(client);
  }

  function handleEditConfirmed(client: ClientResult) {
    setEditCandidate(null);
    onSelect(client);
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
    const addr = selected.addresses[0];
    const country = addr?.country || selected.country;
    return (
      <div className="space-y-1">
        <Label className="text-xs text-gray-500">{label}</Label>
        <div className="flex items-start justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          <div>
            {/* Per ТЗ: «у даних Відправника та Отримувача забрати дублюючі надписи
                (статус клієнта Відправник та Отримувач)» — роль вже є в заголовку картки. */}
            <div className="font-medium text-sm">
              {selected.lastName} {selected.firstName}
              {selected.middleName ? ` ${selected.middleName}` : ''}
            </div>
            {editingPhone && onPhoneEdit ? (
              <div className="flex items-center gap-1 mt-1">
                <div className="flex-1">
                  <PhoneInput
                    value={phoneDraft}
                    onChange={setPhoneDraft}
                    defaultCountry={(selected.country as CountryCode) || 'UA'}
                  />
                </div>
                <button
                  type="button"
                  className="text-xs text-green-700 hover:text-green-800 font-medium px-1"
                  onClick={() => { onPhoneEdit(phoneDraft); setEditingPhone(false); }}
                >✓</button>
                <button
                  type="button"
                  className="text-xs text-gray-400 hover:text-gray-700 px-1"
                  onClick={() => setEditingPhone(false)}
                >×</button>
              </div>
            ) : (
              <div className="text-xs text-gray-600 flex items-center gap-2">
                <span>{selected.phone}</span>
                {onPhoneEdit && (
                  <button
                    type="button"
                    className="text-[10px] text-blue-600 hover:underline"
                    onClick={() => { setPhoneDraft(selected.phone); setEditingPhone(true); }}
                    title="Змінити номер"
                  >
                    ред.
                  </button>
                )}
              </div>
            )}
            {country && (
              <div className="text-xs text-gray-500 mt-0.5">
                <span className="font-medium">Країна:</span> {country}
              </div>
            )}
            {addr && (
              <div className="text-xs text-gray-500">
                <span className="font-medium">Адреса:</span>{' '}
                {addr.city}
                {addr.street ? `, ${addr.street}` : ''}
                {addr.building ? ` ${addr.building}` : ''}
                {addr.npWarehouseNum ? ` | НП №${addr.npWarehouseNum}` : ''}
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
              {results.map((c) => {
                const addr = c.addresses[0];
                const country = addr?.country || c.country;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-3 py-3 hover:bg-blue-50 border-b border-gray-100 last:border-0 transition-colors"
                    onClick={() => handleSelect(c)}
                  >
                    <div className="flex items-center justify-end gap-2 mb-0.5">
                      <span className="text-sm text-blue-600 font-mono shrink-0">{c.phone}</span>
                    </div>
                    <div className="font-semibold text-sm text-gray-900">{c.lastName} {c.firstName}</div>
                    {(country || addr) && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        {country && <span className="font-medium text-gray-600">{country}</span>}
                        {country && addr && ' · '}
                        {addr && (
                          <>
                            {addr.city}
                            {addr.street ? `, ${addr.street}` : ''}
                            {addr.building ? ` ${addr.building}` : ''}
                            {addr.landmark ? ` (${addr.landmark})` : ''}
                            {addr.npWarehouseNum ? ` | НП №${addr.npWarehouseNum}` : ''}
                          </>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
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
            <DialogTitle>
              {/* Per ТЗ: «вкладка Новий клієнт ... має називатись "Отримувач"
                  замість "Новий клієнт"» (analogously для Відправника). */}
              {role === 'receiver' ? 'Отримувач' : role === 'sender' ? 'Відправник' : 'Новий клієнт'}
            </DialogTitle>
          </DialogHeader>
          <ClientCreateForm
            onSuccess={handleClientCreated}
            onCancel={() => setShowCreateDialog(false)}
            initialPhone={getInitialPhone()}
            direction={direction}
            role={role}
          />
        </DialogContent>
      </Dialog>

      {/* Edit-existing dialog — opens on search-select per ТЗ. Same form, prefilled. */}
      <Dialog open={!!editCandidate} onOpenChange={(o) => { if (!o) setEditCandidate(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {role === 'receiver' ? 'Отримувач' : role === 'sender' ? 'Відправник' : 'Клієнт'}
              <span className="text-xs font-normal text-gray-500 ml-2">
                — підтвердьте або оновіть дані
              </span>
            </DialogTitle>
          </DialogHeader>
          {editCandidate && (
            <ClientCreateForm
              onSuccess={handleEditConfirmed}
              onCancel={() => setEditCandidate(null)}
              direction={direction}
              role={role}
              initialData={editCandidate}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
