import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth/guards';
import { ADMIN_ROLES } from '@/lib/constants/roles';
import type { Weekday } from '@/generated/prisma/enums';

// GET /api/collection-points — lists all active points (public — client portal uses it)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get('country');

  const points = await prisma.collectionPoint.findMany({
    where: {
      isActive: true,
      ...(country ? { country: country as 'UA' | 'NL' | 'AT' | 'DE' } : {}),
    },
    orderBy: [{ country: 'asc' }, { city: 'asc' }],
  });
  return NextResponse.json(points);
}

// POST /api/collection-points — create new (admin only)
export async function POST(request: NextRequest) {
  const guard = await requireRole(ADMIN_ROLES);
  if (!guard.ok) return guard.response;

  const body = await request.json();
  const {
    name,
    country,
    city,
    address,
    postalCode,
    contactPhone,
    workingHours,
    workingDays,
    latitude,
    longitude,
    notes,
    maxCapacity,
  } = body;

  if (!country || !city || !address) {
    return NextResponse.json(
      { error: 'Країна, місто та адреса обовʼязкові' },
      { status: 400 }
    );
  }

  const point = await prisma.collectionPoint.create({
    data: {
      name: name || null,
      country,
      city,
      address,
      postalCode: postalCode || null,
      contactPhone: contactPhone || null,
      workingHours: workingHours || null,
      workingDays: (workingDays || []) as Weekday[],
      latitude: latitude != null && latitude !== '' ? Number(latitude) : null,
      longitude: longitude != null && longitude !== '' ? Number(longitude) : null,
      notes: notes || null,
      maxCapacity: maxCapacity ? Number(maxCapacity) : null,
    },
  });

  return NextResponse.json(point, { status: 201 });
}
