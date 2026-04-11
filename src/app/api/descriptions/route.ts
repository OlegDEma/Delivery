import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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
  const body = await request.json();
  const { text } = body;
  if (!text?.trim()) return NextResponse.json({ error: 'Text required' }, { status: 400 });

  await prisma.descriptionSuggestion.upsert({
    where: { text: text.trim() },
    update: { usageCount: { increment: 1 } },
    create: { text: text.trim() },
  });

  return NextResponse.json({ success: true });
}
