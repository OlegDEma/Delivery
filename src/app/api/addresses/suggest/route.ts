import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { suggestCitiesFromDictionary } from '@/lib/data/cities';
import { searchCities } from '@/lib/nova-poshta/client';

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
  const push = (raw: string | null | undefined) => {
    const trimmed = (raw ?? '').trim();
    if (trimmed && !seen.has(trimmed.toLowerCase())) {
      seen.add(trimmed.toLowerCase());
      result.push(trimmed);
    }
  };

  // 1) Історія адрес — найрелевантніше (реально використані значення).
  for (const r of rows) push(field === 'city' ? r.city : r.street);

  // ТЗ docx 17.08.26 (Частина перша): для МІСТА додаємо канонічні підказки —
  // щоб ловити опечатки («Amshtetten» → «Amstetten») навіть без історії.
  if (field === 'city') {
    // 2) Nova Poshta — повний реєстр населених пунктів України (лише коли є ключ).
    if (country === 'UA' && process.env.NP_API_KEY) {
      try {
        const np = await searchCities(q, 10);
        if (np.success) for (const s of np.data) push(s.Description);
      } catch { /* НП недоступна — тихо пропускаємо, є словник+історія */ }
    }
    // 3) Вивірений словник міст/містечок (UA + NL/AT/DE).
    for (const c of suggestCitiesFromDictionary(country, q, 12)) push(c);
  }

  return NextResponse.json(result.slice(0, 12));
}
