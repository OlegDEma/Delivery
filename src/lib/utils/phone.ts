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
 * Check if phone matches search query (works without country code).
 * Uses endsWith-style match for queries ≥4 digits to avoid matching
 * a country code or prefix in the middle of a number.
 * Shorter queries fall back to substring.
 */
export function phoneMatchesQuery(phone: string, query: string): boolean {
  const normalizedPhone = normalizePhone(phone);
  const normalizedQuery = normalizePhone(query);
  if (!normalizedQuery) return true;
  if (normalizedQuery.length >= 4) {
    return normalizedPhone.endsWith(normalizedQuery);
  }
  return normalizedPhone.includes(normalizedQuery);
}

/**
 * Detect country by phone prefix.
 * Limited to our supported countries (UA/NL/AT/DE) — anything else returns null.
 * Note: we check in order from longest to shortest prefix to avoid ambiguity
 * (e.g. +380 vs +38).
 */
export function detectCountryByPhone(phone: string): string | null {
  const digits = normalizePhone(phone);
  if (digits.startsWith('380')) return 'UA';
  // For EU codes check that the country code is actually at the start of an
  // international format (+) — if the user typed a local number starting
  // with "31…" without +, we can't reliably tell.
  if (phone.trim().startsWith('+')) {
    if (digits.startsWith('31')) return 'NL';
    if (digits.startsWith('43')) return 'AT';
    if (digits.startsWith('49')) return 'DE';
  }
  return null;
}

/**
 * Normalize phone to a canonical storage form: `+` + digits only.
 * Returns empty string if no digits found.
 */
export function canonicalPhone(phone: string): string {
  const digits = normalizePhone(phone);
  if (!digits) return '';
  return `+${digits}`;
}
