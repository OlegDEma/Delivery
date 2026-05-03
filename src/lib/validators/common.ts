import { z } from 'zod';

/**
 * Shared primitive schemas used across request-body validators.
 * Kept small on purpose — business rules live closer to features.
 */

export const countrySchema = z.enum(['UA', 'NL', 'AT', 'DE']);

export const directionSchema = z.enum(['eu_to_ua', 'ua_to_eu']);

export const weightTypeSchema = z.enum(['actual', 'volumetric', 'average']);

export const deliveryMethodSchema = z.enum(['address', 'np_warehouse', 'np_poshtamat', 'pickup_point']);

export const payerSchema = z.enum(['sender', 'receiver']);

export const paymentMethodSchema = z.enum(['cash', 'cashless']);

export const shipmentTypeSchema = z.enum(['parcels_cargo', 'documents', 'tires_wheels']);

export const collectionMethodSchema = z.enum([
  'pickup_point',
  'courier_pickup',
  'external_shipping',
  'direct_to_driver',
]);

export const parcelStatusSchema = z.enum([
  'draft',
  'at_collection_point',
  'accepted_for_transport_to_ua',
  'in_transit_to_ua',
  'at_lviv_warehouse',
  'at_nova_poshta',
  'delivered_ua',
  'accepted_for_transport_to_eu',
  'in_transit_to_eu',
  'at_eu_warehouse',
  'delivered_eu',
  'not_received',
  'refused',
  'returned',
]);

export const userRoleSchema = z.enum([
  'super_admin',
  'admin',
  'cashier',
  'warehouse_worker',
  'driver_courier',
  'client',
]);

/** UUID v4-ish (Prisma generates v4). Use z.string().uuid() for strict. */
export const uuidSchema = z.string().uuid();

/** Cheap regex for raw UUID checks in route handlers (no Zod parsing). */
export const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export function isUuid(s: string): boolean { return UUID_RE.test(s); }

/**
 * Safely parse request body as JSON. Returns parsed object on success,
 * `null` if body is missing/invalid JSON. Caller should respond 400.
 *
 * Without this, bare `await request.json()` throws on missing body or
 * wrong Content-Type and surfaces as opaque 500 to the client.
 */
export async function safeJson(request: Request): Promise<unknown | null> {
  try { return await request.json(); }
  catch { return null; }
}

/** Money amount — positive, max ~1M, 2 decimals. */
export const moneySchema = z
  .number()
  .finite()
  .min(0, 'Сума не може бути від\'ємною')
  .max(1_000_000, 'Сума завелика');

export const positiveMoneySchema = z
  .number()
  .finite()
  .positive('Сума має бути більше 0')
  .max(1_000_000, 'Сума завелика');

/** Weight in kg — 0..5000. */
export const weightSchema = z
  .number()
  .finite()
  .min(0)
  .max(5_000, 'Вага завелика');

/** Dimension in cm — 0..500. */
export const dimensionSchema = z
  .number()
  .finite()
  .min(0)
  .max(500, 'Розмір завеликий');

/** Phone: accepts anything with digits; normalization done separately. */
export const phoneSchema = z
  .string()
  .trim()
  .min(5, 'Занадто короткий номер')
  .max(32, 'Занадто довгий номер')
  .regex(/^\+?[\d\s()-]+$/, 'Невалідний номер телефону');

/** Trimmed non-empty string with explicit max length. */
export function text(maxLen: number, message = 'Обов\'язкове поле') {
  return z.string().trim().min(1, message).max(maxLen);
}

/**
 * Packaging prices JSON — validates both shape and values.
 * Keys: numeric threshold (e.g. "10", "20", "30+"), values: positive numbers.
 */
export const packagingPricesSchema = z
  .record(
    z.string().regex(/^\d+\+?$/, 'Невалідний ключ тарифу пакування'),
    z.number().finite().min(0).max(1000)
  )
  .nullable();

/**
 * Helper to safely parse packagingPrices from Prisma JSON field.
 * Returns null if invalid — caller treats null as "no packaging".
 */
export function parsePackagingPrices(raw: unknown): Record<string, number> | null {
  if (raw === null || raw === undefined) return null;
  const parsed = packagingPricesSchema.safeParse(raw);
  return parsed.success ? parsed.data ?? null : null;
}
