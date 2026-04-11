import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { normalizePhone } from '@/lib/utils/phone';
import { capitalize } from '@/lib/utils/format';

// GET /api/clients?q=search&page=1&limit=20
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() || '';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20));
  const skip = (page - 1) * limit;

  const where = q
    ? {
        OR: [
          { phoneNormalized: { contains: normalizePhone(q) } },
          { lastName: { contains: q, mode: 'insensitive' as const } },
          { firstName: { contains: q, mode: 'insensitive' as const } },
          { phone: { contains: q } },
        ],
      }
    : {};

  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where,
      include: {
        addresses: {
          orderBy: { usageCount: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.client.count({ where }),
  ]);

  return NextResponse.json({
    clients,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}

// POST /api/clients — create new client
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { phone, firstName, lastName, middleName, clientType, organizationName, country, notes, address } = body;

  if (!phone || !firstName || !lastName) {
    return NextResponse.json({ error: 'Телефон, ім\'я та прізвище обов\'язкові' }, { status: 400 });
  }

  // Check if phone already exists
  const existing = await prisma.client.findUnique({ where: { phone } });
  if (existing) {
    return NextResponse.json({ error: 'Клієнт з таким номером вже існує' }, { status: 409 });
  }

  const client = await prisma.client.create({
    data: {
      phone,
      phoneNormalized: normalizePhone(phone),
      firstName: capitalize(firstName),
      lastName: capitalize(lastName),
      middleName: middleName ? capitalize(middleName) : null,
      clientType: clientType || 'individual',
      organizationName: organizationName || null,
      country: country || null,
      notes: notes || null,
      createdById: user.id,
      addresses: address
        ? {
            create: {
              country: address.country,
              city: address.city,
              street: address.street || null,
              building: address.building || null,
              apartment: address.apartment || null,
              postalCode: address.postalCode || null,
              landmark: address.landmark || null,
              npWarehouseNum: address.npWarehouseNum || null,
              npPoshtamatNum: address.npPoshtamatNum || null,
              deliveryMethod: address.deliveryMethod || 'address',
              isDefault: true,
            },
          }
        : undefined,
    },
    include: { addresses: true },
  });

  return NextResponse.json(client, { status: 201 });
}
