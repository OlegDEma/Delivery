import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { normalizePhone } from '@/lib/utils/phone';
import { capitalize } from '@/lib/utils/format';

// GET /api/clients/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      addresses: { orderBy: { usageCount: 'desc' } },
      sentParcels: {
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: { id: true, internalNumber: true, status: true, createdAt: true },
      },
      receivedParcels: {
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: { id: true, internalNumber: true, status: true, createdAt: true },
      },
    },
  });

  if (!client) return NextResponse.json({ error: 'Клієнта не знайдено' }, { status: 404 });
  return NextResponse.json(client);
}

// PATCH /api/clients/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  // Update client fields
  if (body.action === 'update') {
    const { phone, firstName, lastName, middleName, country, notes } = body;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    if (phone !== undefined) { data.phone = phone; data.phoneNormalized = normalizePhone(phone); }
    if (firstName !== undefined) data.firstName = capitalize(firstName);
    if (lastName !== undefined) data.lastName = capitalize(lastName);
    if (middleName !== undefined) data.middleName = middleName ? capitalize(middleName) : null;
    if (country !== undefined) data.country = country || null;
    if (notes !== undefined) data.notes = notes || null;

    const updated = await prisma.client.update({ where: { id }, data });
    return NextResponse.json(updated);
  }

  // Add address
  if (body.action === 'addAddress') {
    const addr = body.address;
    const address = await prisma.clientAddress.create({
      data: {
        clientId: id,
        country: addr.country,
        city: addr.city,
        street: addr.street || null,
        building: addr.building || null,
        apartment: addr.apartment || null,
        postalCode: addr.postalCode || null,
        landmark: addr.landmark || null,
        npWarehouseNum: addr.npWarehouseNum || null,
        npPoshtamatNum: addr.npPoshtamatNum || null,
        deliveryMethod: addr.deliveryMethod || 'address',
      },
    });
    return NextResponse.json(address, { status: 201 });
  }

  // Delete address
  if (body.action === 'deleteAddress') {
    await prisma.clientAddress.delete({ where: { id: body.addressId } });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Невідома дія' }, { status: 400 });
}
