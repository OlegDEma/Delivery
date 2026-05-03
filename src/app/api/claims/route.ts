import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validators/common';

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

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Очікується JSON body' }, { status: 400 }); }
  const { parcelId, clientId, type, description } = body;

  if (!parcelId || !type || !description) {
    return NextResponse.json({ error: 'Посилка, тип та опис обов\'язкові' }, { status: 400 });
  }
  if (!isUuid(parcelId)) {
    return NextResponse.json({ error: 'Невалідний parcelId' }, { status: 400 });
  }
  // Verify parcel exists — bare FK violation gives generic 500.
  const parcel = await prisma.parcel.findFirst({ where: { id: parcelId, deletedAt: null }, select: { id: true } });
  if (!parcel) return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });
  if (clientId && !isUuid(clientId)) {
    return NextResponse.json({ error: 'Невалідний clientId' }, { status: 400 });
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

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Очікується JSON body' }, { status: 400 }); }
  const { id, status, resolution } = body;
  if (!id) return NextResponse.json({ error: 'id обов\'язковий' }, { status: 400 });
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });

  const exists = await prisma.claim.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: 'Претензію не знайдено' }, { status: 404 });

  const updated = await prisma.claim.update({
    where: { id },
    data: {
      ...(status && { status: status as import('@/generated/prisma/client').ClaimStatus }),
      ...(resolution !== undefined && { resolution }),
    },
  });

  return NextResponse.json(updated);
}
