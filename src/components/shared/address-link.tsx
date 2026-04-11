'use client';

interface AddressLinkProps {
  address: string;
  className?: string;
}

export function AddressLink({ address, className }: AddressLinkProps) {
  if (!address) return null;

  const query = encodeURIComponent(address);

  return (
    <a
      href={`https://www.google.com/maps/search/?api=1&query=${query}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`hover:text-blue-600 hover:underline inline ${className || ''}`}
      onClick={(e) => e.stopPropagation()}
      title="Відкрити в Google Maps"
    >
      {address}
    </a>
  );
}
