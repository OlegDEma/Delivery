/**
 * Normalize phone number: remove all non-digit characters
 * Used for searching without country code
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Format phone for display: ensure it starts with +
 */
export function formatPhone(phone: string): string {
  const digits = normalizePhone(phone);
  if (!digits) return '';
  return digits.startsWith('+') ? phone : `+${digits}`;
}

/**
 * Check if phone matches search query (works without country code)
 */
export function phoneMatchesQuery(phone: string, query: string): boolean {
  const normalizedPhone = normalizePhone(phone);
  const normalizedQuery = normalizePhone(query);
  return normalizedPhone.includes(normalizedQuery);
}

/**
 * Detect country by phone prefix
 */
export function detectCountryByPhone(phone: string): string | null {
  const digits = normalizePhone(phone);
  if (digits.startsWith('380')) return 'UA';
  if (digits.startsWith('31')) return 'NL';
  if (digits.startsWith('43')) return 'AT';
  if (digits.startsWith('49')) return 'DE';
  return null;
}
