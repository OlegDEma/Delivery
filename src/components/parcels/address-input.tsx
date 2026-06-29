'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { transliterateCity } from '@/lib/utils/transliterate';

type SuggestionField = 'city' | 'street';

interface AddressInputProps {
  /** Field semantics — drives both the suggestion endpoint and the keyboard hint. */
  field: SuggestionField;
  /** ISO country code (UA / NL / AT / DE). Filters suggestions and decides
   *  the keyboard layout: UA → Cyrillic, EU → Latin (per ТЗ). */
  country: string | null | undefined;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  /** When true, suggestions stay disabled (e.g. for street when city not picked). */
  disabled?: boolean;
}

/**
 * Address-field input with two ТЗ behaviours:
 *
 *  1. Autocomplete from previously used city/street values, scoped by country.
 *     Backed by `/api/addresses/suggest`. Triggers from the first character so
 *     «Am» can match «Amsterdam» on a Dutch shipment.
 *
 *  2. Keyboard hinting for mobile. When country is European we set
 *     `lang="en"` and `inputMode="text"`. Most Android keyboards (GBoard,
 *     SwiftKey) honor `lang` to switch the active layout. iOS doesn't, but
 *     the spec is explicit about Android. Falls back to no-op on desktop.
 */
export function AddressInput({
  field, country, value, onChange,
  placeholder, required, className, disabled,
}: AddressInputProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Click-outside closes the dropdown.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function fetchSuggestions(q: string) {
    if (!country || disabled) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 1) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/addresses/suggest?field=${field}&country=${encodeURIComponent(country)}&q=${encodeURIComponent(q)}`
        );
        if (!res.ok) return;
        const data: string[] = await res.json();
        setSuggestions(data);
        setOpen(data.length > 0);
      } catch {
        // Suggestions are best-effort. Network blip → silent.
      }
    }, 200);
  }

  function handleChange(v: string) {
    onChange(v);
    fetchSuggestions(v);
  }

  function handleSelect(v: string) {
    onChange(v);
    setOpen(false);
  }

  // ТЗ docx 29.06.26 §3: для країни ≠ UA назву НАСЕЛЕНОГО ПУНКТУ, введену
  // кирилицею, АВТОМАТИЧНО транслітеруємо в латиницю (Амстердам→Amsterdam,
  // Відень→Wien). Робимо це на blur — щоб не заважати набору кирилицею і не
  // стрибав курсор. Лише для field='city' (вулиці не чіпаємо).
  function handleBlur() {
    if (field !== 'city' || !country || country === 'UA') return;
    const translit = transliterateCity(value, country);
    if (translit !== value) onChange(translit);
  }

  // EU → Latin keyboard hint; UA → Ukrainian (default browser locale handles it).
  const isEU = country && country !== 'UA';
  const lang = isEU ? 'en' : 'uk';

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={handleBlur}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={className}
        // Keyboard hints for mobile. `lang` is the cleanest signal Android
        // keyboards respect for switching the active layout. `inputMode=text`
        // forces alphabetic keyboard (vs numeric / phone).
        lang={lang}
        inputMode="text"
        // Browsers' built-in autofill for city/street competes with our own
        // suggestion list — disable it so the user only sees our history.
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b last:border-0"
              onClick={() => handleSelect(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
