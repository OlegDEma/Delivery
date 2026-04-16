export * from './common';
export * from './parcel';

import type { ZodError, ZodType } from 'zod';
import { NextResponse } from 'next/server';

/**
 * Parse request JSON body against a zod schema. Returns either the parsed
 * data or a NextResponse that the route can `return` immediately.
 *
 * Usage:
 *   const parsed = await parseBody(request, createParcelSchema);
 *   if (parsed instanceof NextResponse) return parsed;
 *   const data = parsed; // fully typed
 */
export async function parseBody<T>(
  request: Request,
  schema: ZodType<T>
): Promise<T | NextResponse> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Невалідний JSON у тілі запиту' }, { status: 400 });
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return NextResponse.json(
      { error: formatZodError(result.error) },
      { status: 400 }
    );
  }
  return result.data;
}

export function formatZodError(err: ZodError): string {
  const first = err.issues[0];
  if (!first) return 'Невалідні дані';
  const path = first.path.length > 0 ? `${first.path.join('.')}: ` : '';
  return `${path}${first.message}`;
}
