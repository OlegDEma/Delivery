import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';

/**
 * GET  /api/service-cities[?country=UA&forCourierPickup=1]
 * POST /api/service-cities    body: { country, city, acceptsCourierPickup, notes }
 *
 * Per ТЗ §5: список міст, де клієнту дозволено обирати «Виклик кур'єра».
 * Будь-який авторизований користувач може читати (потрібно для клієнтського
 * порталу). Тільки admin/super-admin може писати.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const country = searchParams.get('country');
  const forCourierPickup = searchParams.get('forCourierPickup');

  const where: { country?: 'UA' | 'NL' | 'AT' | 'DE'; acceptsCourierPickup?: boolean } = {};
  if (country && ['UA', 'NL', 'AT', 'DE'].includes(country)) {
    where.country = country as 'UA' | 'NL' | 'AT' | 'DE';
  }
  if (forCourierPickup === '1') {
    where.acceptsCourierPickup = true;
  }

  const rows = await prisma.serviceCity.findMany({
    where,
    orderBy: [{ country: 'asc' }, { city: 'asc' }],
  });
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  if (!profile || !['super_admin', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { country?: string; city?: string; acceptsCourierPickup?: boolean; notes?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Очікується JSON body' }, { status: 400 }); }

  if (!body.country || !['UA', 'NL', 'AT', 'DE'].includes(body.country)) {
    return NextResponse.json({ error: 'country: UA/NL/AT/DE' }, { status: 400 });
  }
  const city = String(body.city ?? '').trim();
  if (!city) return NextResponse.json({ error: 'city: required' }, { status: 400 });

  // Upsert — якщо вже є, оновлюємо acceptsCourierPickup; інакше створюємо.
  const row = await prisma.serviceCity.upsert({
    where: { country_city: { country: body.country as 'UA'|'NL'|'AT'|'DE', city } },
    update: {
      acceptsCourierPickup: body.acceptsCourierPickup ?? true,
      notes: body.notes ?? null,
    },
    create: {
      country: body.country as 'UA'|'NL'|'AT'|'DE',
      city,
      acceptsCourierPickup: body.acceptsCourierPickup ?? true,
      notes: body.notes ?? null,
    },
  });
  return NextResponse.json(row);
}
