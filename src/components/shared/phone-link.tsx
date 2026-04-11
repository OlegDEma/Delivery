'use client';

interface PhoneLinkProps {
  phone: string;
  className?: string;
}

export function PhoneLink({ phone, className }: PhoneLinkProps) {
  return (
    <a
      href={`tel:${phone}`}
      className={`text-blue-600 hover:text-blue-800 hover:underline ${className || ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      {phone}
    </a>
  );
}
