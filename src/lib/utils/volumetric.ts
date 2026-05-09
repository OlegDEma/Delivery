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
 *
 * Per ТЗ §8: «Якщо фактична вага більша від об'ємної — як розрахункова
 * завжди береться фактична вага». Тобто коли actual ≥ volumetric, повертаємо
 * actual, незалежно від типу.
 *
 * Коли volumetric > actual — застосовуємо політику:
 *   - actual: повертаємо volumetric (max — як було історично)
 *   - volumetric: завжди volumetric (зберігаємо для зворотної сумісності)
 *   - average: середнє (50/50)
 *   - custom: ffrac × actual + (1−ffrac) × volumetric, де ffrac
 *             конфігурується в тарифі (0..1)
 *
 * No rounding here — caller rounds on display.
 */
export function getBillableWeight(
  actualWeight: number,
  volumetricWeight: number,
  weightType: 'actual' | 'volumetric' | 'average' | 'custom' = 'actual',
  /** Used only when weightType='custom'. Частка фактичної ваги (0..1). */
  customFactualFraction?: number,
): number {
  const a = Number.isFinite(actualWeight) ? actualWeight : 0;
  const v = Number.isFinite(volumetricWeight) ? volumetricWeight : 0;

  // Universal rule per ТЗ — фактична виграє коли вона більша.
  if (a >= v) return a;

  switch (weightType) {
    case 'actual':
      return v;            // max — об'ємна виграла
    case 'volumetric':
      return v;
    case 'average':
      return (a + v) / 2;
    case 'custom': {
      // Clamp до [0,1] — оператор міг ввести 1.2 чи -0.5.
      const ffrac = Math.min(1, Math.max(0, Number(customFactualFraction) || 0));
      return ffrac * a + (1 - ffrac) * v;
    }
  }
}

/** Round a weight value to 3 decimal places for storage/display. */
export function roundWeight(weightKg: number): number {
  if (!Number.isFinite(weightKg)) return 0;
  return Math.round(weightKg * 1000) / 1000;
}
