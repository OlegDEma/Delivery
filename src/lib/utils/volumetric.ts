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
 * Об'ємна вага (кг) безпосередньо з об'єму в м³.
 *
 * Per ТЗ: «об'єм (м³) × 250». Походить з того ж дільника 4000: 1 м³ =
 * 1 000 000 см³, тож 1 000 000 / 4000 = 250. Тримаємо як єдине джерело,
 * щоб фронт-калькулятор і бекенд рахували однаково.
 *
 * Використовується коли користувач увів ТІЛЬКИ об'єм (без Д/Ш/В): без цього
 * бекенд лишав об'ємну вагу 0 → на детальній «Об'ємна вага: 0.00 кг».
 */
export function volumetricWeightFromVolume(volumeM3: number): number {
  if (!Number.isFinite(volumeM3) || volumeM3 <= 0) return 0;
  return (volumeM3 * 1_000_000) / VOLUMETRIC_DIVISOR;
}

/**
 * ТЗ docx 28.10.26: зворотне до volumetricWeightFromVolume — об'єм (м³) з
 * об'ємної ваги, введеної Працівником напряму («ділення на 250»).
 */
export function volumeFromVolumetricWeight(volumetricWeightKg: number): number {
  if (!Number.isFinite(volumetricWeightKg) || volumetricWeightKg <= 0) return 0;
  return (volumetricWeightKg * VOLUMETRIC_DIVISOR) / 1_000_000;
}

type NumLike = number | string | null | undefined;

/**
 * Об'ємна вага одного місця (кг), без округлення. Пріоритет джерел:
 *   1) Д×Ш×В — стандартний алгоритм (ТЗ 13.06.26: розміри важливіші за об'єм);
 *   2) об'ємна вага, введена Працівником напряму (ТЗ 28.10.26) — беремо як є,
 *      щоб не губити точність на зворотному перерахунку через об'єм
 *      (у БД об'єм зберігається лише з 4 знаками);
 *   3) об'єм × 250.
 * Спільна для створення (parcel-creation) і PATCH /api/parcels/[id].
 */
export function placeVolumetricWeight(p: {
  length?: NumLike; width?: NumLike; height?: NumLike;
  volume?: NumLike; volumetricWeight?: NumLike;
}): number {
  const fromDims = calculateVolumetricWeight(Number(p.length) || 0, Number(p.width) || 0, Number(p.height) || 0);
  if (fromDims > 0) return fromDims;
  const direct = Number(p.volumetricWeight) || 0;
  if (Number.isFinite(direct) && direct > 0) return direct;
  return volumetricWeightFromVolume(Number(p.volume) || 0);
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
