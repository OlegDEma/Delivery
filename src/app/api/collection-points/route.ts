import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

// GET /api/collection-points — public (used by client portal too)
export async function GET() {
  const points = await prisma.collectionPoint.findMany({
    where: { isActive: true },
    orderBy: [{ country: 'asc' }, { city: 'asc' }],
  });
  return NextResponse.json(points);
}

// POST /api/collection-points
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  if (!profile || !['super_admin', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { country, city, address, postalCode, contactPhone, workingHours } = body;

  const point = await prisma.collectionPoint.create({
    data: { country, city, address, postalCode, contactPhone, workingHours },
  });

  return NextResponse.json(point, { status: 201 });
}
