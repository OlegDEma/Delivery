/**
 * Volumetric divisor used by the business (cm³ → kg).
 * Keep as a single source of truth — used by pricing calc + UI.
 */
export const VOLUMETRIC_DIVISOR = 4000;

/**
 * Calculate volumetric weight from dimensions in centimeters.
 * Formula: (length * width * height) / 4000
 * Returns weight in kilograms — full precision, do NOT round here.
 * Rounding should happen only at the display boundary.
 */
export function calculateVolumetricWeight(
  lengthCm: number,
  widthCm: number,
  heightCm: number
): number {
  if (!Number.isFinite(lengthCm) || !Number.isFinite(widthCm) || !Number.isFinite(heightCm)) return 0;
  if (lengthCm <= 0 || widthCm <= 0 || heightCm <= 0) return 0;
  return (lengthCm * widthCm * heightCm) / VOLUMETRIC_DIVISOR;
}

/**
 * Calculate volume in cubic meters from dimensions in centimeters.
 */
export function calculateVolume(
  lengthCm: number,
  widthCm: number,
  heightCm: number
): number {
  if (!Number.isFinite(lengthCm) || !Number.isFinite(widthCm) || !Number.isFinite(heightCm)) return 0;
  if (lengthCm <= 0 || widthCm <= 0 || heightCm <= 0) return 0;
  return (lengthCm * widthCm * heightCm) / 1_000_000;
}

/**
 * Get the billable weight depending on weight type.
 * No rounding here — caller rounds on display.
 */
export function getBillableWeight(
  actualWeight: number,
  volumetricWeight: number,
  weightType: 'actual' | 'volumetric' | 'average' = 'actual'
): number {
  const a = Number.isFinite(actualWeight) ? actualWeight : 0;
  const v = Number.isFinite(volumetricWeight) ? volumetricWeight : 0;
  switch (weightType) {
    case 'actual':
      return Math.max(a, v);
    case 'volumetric':
      return v;
    case 'average':
      return (a + v) / 2;
  }
}

/** Round a weight value to 3 decimal places for storage/display. */
export function roundWeight(weightKg: number): number {
  if (!Number.isFinite(weightKg)) return 0;
  return Math.round(weightKg * 1000) / 1000;
}
