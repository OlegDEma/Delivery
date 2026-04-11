/**
 * Calculate volumetric weight from dimensions in centimeters
 * Formula: (length * width * height) / 4000
 * Returns weight in kilograms
 */
export function calculateVolumetricWeight(
  lengthCm: number,
  widthCm: number,
  heightCm: number
): number {
  if (lengthCm <= 0 || widthCm <= 0 || heightCm <= 0) return 0;
  return Number(((lengthCm * widthCm * heightCm) / 4000).toFixed(3));
}

/**
 * Calculate volume in cubic meters from dimensions in centimeters
 */
export function calculateVolume(
  lengthCm: number,
  widthCm: number,
  heightCm: number
): number {
  if (lengthCm <= 0 || widthCm <= 0 || heightCm <= 0) return 0;
  return Number(((lengthCm * widthCm * heightCm) / 1_000_000).toFixed(4));
}

/**
 * Get the billable weight (max of actual and volumetric)
 */
export function getBillableWeight(
  actualWeight: number,
  volumetricWeight: number,
  weightType: 'actual' | 'volumetric' | 'average' = 'actual'
): number {
  switch (weightType) {
    case 'actual':
      return Math.max(actualWeight, volumetricWeight);
    case 'volumetric':
      return volumetricWeight;
    case 'average':
      return (actualWeight + volumetricWeight) / 2;
  }
}
