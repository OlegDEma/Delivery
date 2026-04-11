'use client';

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface NPCity {
  ref: string;
  name: string;
  area: string;
  type: string;
}

interface NPCitySearchProps {
  label?: string;
  value: string;
  cityRef: string;
  onSelect: (city: { ref: string; name: string }) => void;
  onClear: () => void;
}

export function NPCitySearch({ label, value, cityRef, onSelect, onClear }: NPCitySearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NPCity[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
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

  function handleSearch(val: string) {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length < 2) { setResults([]); setShowDropdown(false); return; }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/nova-poshta/cities?q=${encodeURIComponent(val)}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setResults(data);
            setShowDropdown(data.length > 0);
          }
        }
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  if (value && cityRef) {
    return (
      <div className="space-y-1">
        {label && <Label className="text-xs text-gray-500">{label}</Label>}
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          <span className="text-sm font-medium">{value}</span>
          <button type="button" onClick={onClear} className="text-gray-400 hover:text-red-500 ml-2">&times;</button>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative space-y-1">
      {label && <Label className="text-xs text-gray-500">{label}</Label>}
      <Input
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        onFocus={() => results.length > 0 && setShowDropdown(true)}
        placeholder="Введіть назву міста..."
        className="text-base"
      />
      {loading && <div className="absolute right-3 top-8 text-xs text-gray-400">...</div>}
      {showDropdown && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map(c => (
            <button
              key={c.ref}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b last:border-0"
              onClick={() => { onSelect({ ref: c.ref, name: c.name }); setQuery(''); setShowDropdown(false); }}
            >
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-gray-400">{c.type}, {c.area}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
