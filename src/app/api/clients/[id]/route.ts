import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizePhone } from '@/lib/utils/phone';
import { capitalize } from '@/lib/utils/format';
import { requireRole, requireStaff } from '@/lib/auth/guards';
import { ADMIN_ROLES } from '@/lib/constants/roles';
import { logger } from '@/lib/logger';
import { writeAuditLog } from '@/lib/audit';

// GET /api/clients/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const client = await prisma.client.findFirst({
    where: { id, deletedAt: null },
    include: {
      addresses: { orderBy: { usageCount: 'desc' } },
      sentParcels: {
        where: { deletedAt: null },
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: { id: true, internalNumber: true, status: true, createdAt: true },
      },
      receivedParcels: {
        where: { deletedAt: null },
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: { id: true, internalNumber: true, status: true, createdAt: true },
      },
    },
  });

  if (!client) return NextResponse.json({ error: 'Клієнта не знайдено' }, { status: 404 });

  // Calculate stats
  const [totalSent, totalReceived, totalSpent, unpaidCount] = await Promise.all([
    prisma.parcel.count({ where: { deletedAt: null, senderId: id } }),
    prisma.parcel.count({ where: { deletedAt: null, receiverId: id } }),
    prisma.parcel.aggregate({
      where: { deletedAt: null, OR: [{ senderId: id }, { receiverId: id }], isPaid: true },
      _sum: { totalCost: true },
    }),
    prisma.parcel.count({
      where: { deletedAt: null, OR: [{ senderId: id, payer: 'sender' }, { receiverId: id, payer: 'receiver' }], isPaid: false, totalCost: { gt: 0 } },
    }),
  ]);

  return NextResponse.json({
    ...client,
    stats: {
      totalSent,
      totalReceived,
      totalParcels: totalSent + totalReceived,
      totalSpent: Number(totalSpent._sum.totalCost) || 0,
      unpaidCount,
    },
  });
}

// PATCH /api/clients/[id] — staff only
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await request.json();

  // Update client fields
  if (body.action === 'update') {
    const { phone, firstName, lastName, middleName, country, notes } = body;
    const data: {
      phone?: string;
      phoneNormalized?: string;
      firstName?: string;
      lastName?: string;
      middleName?: string | null;
      country?: string | null;
      notes?: string | null;
    } = {};
    if (phone !== undefined) { data.phone = phone; data.phoneNormalized = normalizePhone(phone); }
    if (firstName !== undefined) data.firstName = capitalize(firstName);
    if (lastName !== undefined) data.lastName = capitalize(lastName);
    if (middleName !== undefined) data.middleName = middleName ? capitalize(middleName) : null;
    if (country !== undefined) data.country = country || null;
    if (notes !== undefined) data.notes = notes || null;

    const updated = await prisma.client.update({
      where: { id },
      data: data as import('@/generated/prisma/client').Prisma.ClientUpdateInput,
    });
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

  // Update address
  if (body.action === 'updateAddress') {
    const addr = body.address;
    const updated = await prisma.clientAddress.update({
      where: { id: body.addressId },
      data: {
        ...(addr.country !== undefined && { country: addr.country }),
        ...(addr.city !== undefined && { city: addr.city }),
        ...(addr.street !== undefined && { street: addr.street || null }),
        ...(addr.building !== undefined && { building: addr.building || null }),
        ...(addr.apartment !== undefined && { apartment: addr.apartment || null }),
        ...(addr.postalCode !== undefined && { postalCode: addr.postalCode || null }),
        ...(addr.landmark !== undefined && { landmark: addr.landmark || null }),
        ...(addr.npWarehouseNum !== undefined && { npWarehouseNum: addr.npWarehouseNum || null }),
        ...(addr.deliveryMethod !== undefined && { deliveryMethod: addr.deliveryMethod }),
      },
    });
    return NextResponse.json(updated);
  }

  // Delete address
  if (body.action === 'deleteAddress') {
    await prisma.clientAddress.delete({ where: { id: body.addressId } });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Невідома дія' }, { status: 400 });
}

// DELETE /api/clients/[id] — soft delete (admin only)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(ADMIN_ROLES);
  if (!guard.ok) return guard.response;
  const userId = guard.user.userId;

  const { id } = await params;

  const client = await prisma.client.findFirst({ where: { id, deletedAt: null } });
  if (!client) {
    return NextResponse.json({ error: 'Клієнта не знайдено' }, { status: 404 });
  }

  await prisma.client.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  logger.audit('client.deleted', { clientId: id, phone: client.phone, userId });
  await writeAuditLog({
    event: 'client.deleted',
    actorId: userId,
    subjectId: id,
    subjectType: 'client',
    payload: { phone: client.phone, lastName: client.lastName, firstName: client.firstName },
  });

  return NextResponse.json({ success: true });
}
