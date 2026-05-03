'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COUNTRY_LABELS, COUNTRY_PHONE_CODES, type CountryCode } from '@/lib/constants/countries';
import { cn } from '@/lib/utils';

const COUNTRY_FLAGS: Record<CountryCode, string> = {
  UA: '🇺🇦',
  NL: '🇳🇱',
  AT: '🇦🇹',
  DE: '🇩🇪',
};

const PHONE_CODE_TO_COUNTRY: Record<string, CountryCode> = Object.fromEntries(
  (Object.entries(COUNTRY_PHONE_CODES) as [CountryCode, string][]).map(([c, code]) => [code, c])
) as Record<string, CountryCode>;

export interface PhoneInputProps {
  /** Full E.164 phone, e.g. "+380501234567" */
  value: string;
  onChange: (value: string) => void;
  /** Default country (used when value is empty). */
  defaultCountry?: CountryCode;
  label?: string;
  required?: boolean;
  className?: string;
}

function splitPhone(phone: string, fallback: CountryCode): { country: CountryCode; rest: string } {
  if (phone) {
    const sortedCodes = (Object.entries(COUNTRY_PHONE_CODES) as [CountryCode, string][])
      .sort((a, b) => b[1].length - a[1].length); // longest first (+380 before +38)
    for (const [country, code] of sortedCodes) {
      if (phone.startsWith(code)) {
        return { country, rest: phone.slice(code.length).replace(/\D/g, '') };
      }
    }
  }
  return { country: fallback, rest: phone.replace(/^\+/, '').replace(/\D/g, '') };
}

export function PhoneInput({
  value,
  onChange,
  defaultCountry = 'UA',
  label,
  required,
  className,
}: PhoneInputProps) {
  const { country, rest } = splitPhone(value, defaultCountry);

  function handleCountryChange(next: CountryCode) {
    onChange(`${COUNTRY_PHONE_CODES[next]}${rest}`);
  }

  function handleNumberChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Strip non-digits and leading zero (per ТЗ: «Введіть номер без нуля»).
    const digits = e.target.value.replace(/\D/g, '').replace(/^0+/, '');
    onChange(`${COUNTRY_PHONE_CODES[country]}${digits}`);
  }

  return (
    <div className={cn('space-y-1', className)}>
      {label && <Label>{label}{required && ' *'}</Label>}
      <div className="flex gap-1">
        <Select value={country} onValueChange={(v) => handleCountryChange((v ?? defaultCountry) as CountryCode)}>
          <SelectTrigger
            className="w-[120px] shrink-0"
            title="Виберіть код країни"
          >
            <SelectValue>
              <span className="inline-flex items-center gap-1">
                <span className="text-base leading-none">{COUNTRY_FLAGS[country]}</span>
                <span className="font-mono text-sm">{COUNTRY_PHONE_CODES[country]}</span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(COUNTRY_PHONE_CODES) as CountryCode[]).map((c) => (
              <SelectItem key={c} value={c}>
                <span className="inline-flex items-center gap-2">
                  <span>{COUNTRY_FLAGS[c]}</span>
                  <span className="font-mono">{COUNTRY_PHONE_CODES[c]}</span>
                  <span className="text-xs text-gray-500">{COUNTRY_LABELS[c]}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          inputMode="tel"
          value={rest}
          onChange={handleNumberChange}
          placeholder="Введіть номер без нуля"
          title="Введіть номер без нуля"
          className="flex-1 text-base"
          required={required}
        />
      </div>
    </div>
  );
}

export { PHONE_CODE_TO_COUNTRY };
