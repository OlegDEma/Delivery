import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';

// GET /api/descriptions?q=... — autocomplete for parcel descriptions
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const suggestions = await prisma.descriptionSuggestion.findMany({
    where: { text: { contains: q, mode: 'insensitive' } },
    orderBy: { usageCount: 'desc' },
    take: 10,
    select: { text: true },
  });

  return NextResponse.json(suggestions.map(s => s.text));
}

// POST /api/descriptions — increment or create suggestion
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Очікується JSON body' }, { status: 400 }); }
  const text = String(body?.text ?? '').trim();
  if (!text) return NextResponse.json({ error: 'Text required' }, { status: 400 });
  // Match Parcel.description max-length so suggestions never exceed what
  // can actually be entered as a description.
  if (text.length > 500) {
    return NextResponse.json({ error: 'Опис задовгий (макс 500)' }, { status: 400 });
  }

  await prisma.descriptionSuggestion.upsert({
    where: { text },
    update: { usageCount: { increment: 1 } },
    create: { text },
  });

  return NextResponse.json({ success: true });
}
