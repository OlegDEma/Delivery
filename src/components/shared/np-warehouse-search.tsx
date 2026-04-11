'use client';

import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface NPWarehouse {
  ref: string;
  number: string;
  description: string;
  shortAddress: string;
}

interface NPWarehouseSearchProps {
  cityRef: string;
  label?: string;
  value: string;
  warehouseRef: string;
  onSelect: (warehouse: { ref: string; number: string; description: string }) => void;
}

export function NPWarehouseSearch({ cityRef, label, value, warehouseRef, onSelect }: NPWarehouseSearchProps) {
  const [warehouses, setWarehouses] = useState<NPWarehouse[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!cityRef) { setWarehouses([]); return; }

    async function fetchWarehouses() {
      setLoading(true);
      const res = await fetch(`/api/nova-poshta/warehouses?cityRef=${cityRef}${search ? `&q=${search}` : ''}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setWarehouses(data);
      }
      setLoading(false);
    }
    fetchWarehouses();
  }, [cityRef, search]);

  if (!cityRef) return null;

  return (
    <div className="space-y-1">
      {label && <Label className="text-xs text-gray-500">{label}</Label>}
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Пошук складу (номер)..."
        className="text-sm mb-1"
      />
      {loading ? (
        <div className="text-xs text-gray-400">Завантаження складів...</div>
      ) : (
        <div className="max-h-48 overflow-y-auto border rounded-lg">
          {warehouses.map(w => (
            <button
              key={w.ref}
              type="button"
              className={`w-full text-left px-3 py-2 text-sm border-b last:border-0 hover:bg-gray-50 ${warehouseRef === w.ref ? 'bg-blue-50' : ''}`}
              onClick={() => onSelect({ ref: w.ref, number: w.number, description: w.description })}
            >
              <span className="font-medium">№{w.number}</span>
              <span className="text-gray-500 ml-1">{w.shortAddress}</span>
            </button>
          ))}
          {warehouses.length === 0 && (
            <div className="text-center py-3 text-xs text-gray-400">Складів не знайдено</div>
          )}
        </div>
      )}
    </div>
  );
}
