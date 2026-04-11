'use client';

import { Input } from '@/components/ui/input';
import { ComponentProps } from 'react';

interface CapitalizeInputProps extends Omit<ComponentProps<typeof Input>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
}

export function CapitalizeInput({ value, onChange, ...props }: CapitalizeInputProps) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    // Capitalize first letter of each word
    const capitalized = val.replace(/(^|\s|-)\S/g, (match) => match.toUpperCase());
    onChange(capitalized);
  }

  return <Input value={value} onChange={handleChange} {...props} />;
}
