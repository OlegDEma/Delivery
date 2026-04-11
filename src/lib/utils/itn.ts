/**
 * Generate Individual Transport Number (ITN)
 * Format: YY + 6-digit sequential + 4-digit random + 2-digit checksum = 14 digits
 */
export function generateITN(year: number, sequentialNumber: number): string {
  const yy = String(year).slice(-2);
  const seq = String(sequentialNumber).padStart(6, '0');
  const random = String(Math.floor(1000 + Math.random() * 9000));
  const base = `${yy}${seq}${random}`;

  // Simple checksum: sum of all digits mod 97, padded to 2 digits
  const checksum = Array.from(base)
    .reduce((sum, d) => sum + Number(d), 0) % 97;
  const check = String(checksum).padStart(2, '0');

  return `${base}${check}`;
}

/**
 * Generate ITN for a specific place within a parcel
 * Appends place info: ITN-placeNumber/totalPlaces
 */
export function generatePlaceITN(
  parcelITN: string,
  placeNumber: number,
  totalPlaces: number
): string {
  return `${parcelITN}-${placeNumber}/${totalPlaces}`;
}

/**
 * Generate human-readable internal number
 * Format: "287 Іванівці 1/3, 10.05.22"
 */
export function generateInternalNumber(
  sequentialNumber: number,
  receiverCity: string,
  placeNumber: number,
  totalPlaces: number,
  date: Date
): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);

  const placePart = totalPlaces > 1
    ? `${placeNumber}/${totalPlaces}`
    : '1';

  return `${sequentialNumber} ${receiverCity} ${placePart}, ${dd}.${mm}.${yy}`;
}
