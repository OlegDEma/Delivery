/**
 * Generate Individual Transport Number (ITN)
 * Format: YY + 6-digit sequential + 4-digit random + 2-digit checksum = 14 digits
 *
 * Randomness note: this uses crypto.getRandomValues where available (all
 * modern Node + browser) so the 4-digit suffix gives ~10000 possible values
 * per sequential+year combo. Real collisions are vanishingly rare, but
 * callers should still handle @unique collisions via a retry wrapper.
 */
export function generateITN(year: number, sequentialNumber: number): string {
  const yy = String(year).slice(-2);
  const seq = String(sequentialNumber).padStart(6, '0');
  const random = String(1000 + secureRandomInt(9000)); // 1000..9999
  const base = `${yy}${seq}${random}`;

  // Simple checksum: sum of all digits mod 97, padded to 2 digits
  const checksum = Array.from(base)
    .reduce((sum, d) => sum + Number(d), 0) % 97;
  const check = String(checksum).padStart(2, '0');

  return `${base}${check}`;
}

/** Returns a cryptographically-random integer in [0, max). */
function secureRandomInt(max: number): number {
  const g = globalThis as { crypto?: { getRandomValues?: (arr: Uint32Array) => Uint32Array } };
  if (g.crypto?.getRandomValues) {
    const arr = new Uint32Array(1);
    g.crypto.getRandomValues(arr);
    return arr[0] % max;
  }
  return Math.floor(Math.random() * max);
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
 * Generate human-readable internal number.
 * Format: "287 Іванівці 1/3, 10.05.2026"
 * Year is 4 digits — we need clarity for records that span decades.
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
  const yyyy = String(date.getFullYear());

  const placePart = totalPlaces > 1
    ? `${placeNumber}/${totalPlaces}`
    : '1';

  return `${sequentialNumber} ${receiverCity} ${placePart}, ${dd}.${mm}.${yyyy}`;
}

/**
 * Run `create` with a fresh ITN, retrying on Prisma unique-constraint errors.
 * The caller passes a factory that builds the ITN and performs the insert.
 *
 * Typical usage inside a prisma.$transaction:
 *   const parcel = await withItnRetry((itn) => tx.parcel.create({ data: { ...data, itn } }));
 */
export async function withItnRetry<T>(
  fn: (itn: string) => Promise<T>,
  year: number,
  sequentialNumber: number,
  maxAttempts = 5
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    const itn = generateITN(year, sequentialNumber);
    try {
      return await fn(itn);
    } catch (err) {
      // Retry only on Prisma "Unique constraint failed" — rethrow anything else.
      const e = err as { code?: string; meta?: { target?: string[] } };
      if (e?.code === 'P2002' && (e.meta?.target?.includes('itn') ?? true)) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError ?? new Error('ITN retry exhausted');
}
