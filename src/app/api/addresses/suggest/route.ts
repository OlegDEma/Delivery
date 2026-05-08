import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/addresses/suggest?field=city|street&country=NL&q=Am
 *
 * Autocomplete for the address fields on the parcel form (per ТЗ — клієнт
 * починає вводити «Am» і отримує «Amsterdam»). Aggregates distinct values
 * across the whole `client_addresses` table, scoped by country to avoid
 * mixing UA streets with EU streets.
 *
 * Privacy: returns only the city/street string itself, never linked to a
 * specific client. Cities & street names are public data — safe to share.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const field = searchParams.get('field');
  const country = searchParams.get('country');
  const q = (searchParams.get('q') ?? '').trim();

  if (field !== 'city' && field !== 'street') {
    return NextResponse.json({ error: 'field must be city|street' }, { status: 400 });
  }
  if (!country || !['UA', 'NL', 'AT', 'DE'].includes(country)) {
    return NextResponse.json({ error: 'invalid country' }, { status: 400 });
  }
  // Min 1 char — autocomplete starts kicking in early. Empty q returns nothing
  // to avoid shipping the entire address book on focus.
  if (q.length < 1) return NextResponse.json([]);

  // Prisma `groupBy` + `count` would give us frequencies, but JSON doesn't
  // need them — we only return distinct strings. `findMany` + `distinct`
  // is the cheapest path with the existing index.
  const where = field === 'city'
    ? { country: country as 'UA'|'NL'|'AT'|'DE', city: { startsWith: q, mode: 'insensitive' as const } }
    : { country: country as 'UA'|'NL'|'AT'|'DE', street: { startsWith: q, mode: 'insensitive' as const } };

  const rows = await prisma.clientAddress.findMany({
    where,
    distinct: [field],
    orderBy: { usageCount: 'desc' },
    take: 10,
    select: { city: field === 'city', street: field === 'street' },
  });

  const seen = new Set<string>();
  const result: string[] = [];
  for (const r of rows) {
    const v = (field === 'city' ? r.city : r.street) ?? '';
    const trimmed = v.trim();
    if (trimmed && !seen.has(trimmed.toLowerCase())) {
      seen.add(trimmed.toLowerCase());
      result.push(trimmed);
    }
  }
  return NextResponse.json(result);
}
