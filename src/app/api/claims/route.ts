import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

// GET /api/claims
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  const claims = await prisma.claim.findMany({
    where: status ? { status: status as import('@/generated/prisma/client').ClaimStatus } : {},
    include: {
      parcel: { select: { internalNumber: true, itn: true } },
      client: { select: { firstName: true, lastName: true, phone: true } },
      createdBy: { select: { fullName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json(claims);
}

// POST /api/claims
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { parcelId, clientId, type, description } = body;

  if (!parcelId || !type || !description) {
    return NextResponse.json({ error: 'Посилка, тип та опис обов\'язкові' }, { status: 400 });
  }

  const claim = await prisma.claim.create({
    data: {
      parcelId,
      clientId: clientId || null,
      type,
      description,
      createdById: user.id,
    },
    include: {
      parcel: { select: { internalNumber: true } },
    },
  });

  return NextResponse.json(claim, { status: 201 });
}

// PATCH /api/claims
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { id, status, resolution } = body;

  const updated = await prisma.claim.update({
    where: { id },
    data: {
      ...(status && { status: status as import('@/generated/prisma/client').ClaimStatus }),
      ...(resolution !== undefined && { resolution }),
    },
  });

  return NextResponse.json(updated);
}
