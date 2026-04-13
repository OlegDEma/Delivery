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

  const normalized = normalizePhone(q || '');
  const isPhoneQuery = normalized.length >= 3;

  const where = q
    ? {
        OR: [
          ...(isPhoneQuery ? [
            { phoneNormalized: { contains: normalized } },
            { phone: { contains: q } },
          ] : []),
          { lastName: { contains: q, mode: 'insensitive' as const } },
          { firstName: { contains: q, mode: 'insensitive' as const } },
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
        // Last parcel where this client was sender or receiver — to get last used address
        sentParcels: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: {
            receiverAddressId: true,
            senderAddressId: true,
            receiverAddress: {
              select: { id: true, country: true, city: true, street: true, building: true, apartment: true, postalCode: true, landmark: true, npWarehouseNum: true, npPoshtamatNum: true, deliveryMethod: true, usageCount: true },
            },
          },
        },
        receivedParcels: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: {
            receiverAddressId: true,
            receiverAddress: {
              select: { id: true, country: true, city: true, street: true, building: true, apartment: true, postalCode: true, landmark: true, npWarehouseNum: true, npPoshtamatNum: true, deliveryMethod: true, usageCount: true },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.client.count({ where }),
  ]);

  // Reorder addresses: put last-used address from latest parcel first
  const processedClients = clients.map(c => {
    // Find address from last parcel
    const lastSentAddr = c.sentParcels?.[0]?.senderAddressId
      ? c.addresses.find(a => a.id === c.sentParcels[0].senderAddressId)
      : null;
    const lastRecvAddr = c.receivedParcels?.[0]?.receiverAddress || null;

    let reorderedAddresses = [...c.addresses];
    const lastAddrId = lastSentAddr?.id || lastRecvAddr?.id;
    if (lastAddrId) {
      // Move last-used address to top
      const idx = reorderedAddresses.findIndex(a => a.id === lastAddrId);
      if (idx > 0) {
        const [addr] = reorderedAddresses.splice(idx, 1);
        reorderedAddresses.unshift(addr);
      }
    }

    // Remove parcel data from response (not needed by frontend)
    const { sentParcels, receivedParcels, ...clientData } = c;
    return { ...clientData, addresses: reorderedAddresses };
  });

  return NextResponse.json({
    clients: processedClients,
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
