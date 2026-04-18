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

  // The client is a "party" of a parcel either as sender or receiver, and pays
  // for it only when they are the `payer`. So the "owes" calculation is the
  // subset where this client is the responsible payer.
  const asPayerWhere = {
    deletedAt: null,
    OR: [
      { senderId: id, payer: 'sender' as const },
      { receiverId: id, payer: 'receiver' as const },
    ],
  };

  const [
    totalSent,
    totalReceived,
    totalPaidAgg,
    currentDebtAgg,
    unpaidCount,
    byDirectionEuUa,
    byDirectionUaEu,
    cashEntries,
  ] = await Promise.all([
    prisma.parcel.count({ where: { deletedAt: null, senderId: id } }),
    prisma.parcel.count({ where: { deletedAt: null, receiverId: id } }),
    // Lifetime paid — how much this client has already paid across all their parcels.
    prisma.parcel.aggregate({
      where: { ...asPayerWhere, isPaid: true },
      _sum: { totalCost: true },
    }),
    // Current debt — unpaid parcels where this client is the payer, excluding drafts/returned.
    prisma.parcel.aggregate({
      where: {
        ...asPayerWhere,
        isPaid: false,
        totalCost: { gt: 0 },
        status: { notIn: ['draft', 'returned'] },
      },
      _sum: { totalCost: true },
    }),
    prisma.parcel.count({
      where: {
        ...asPayerWhere,
        isPaid: false,
        totalCost: { gt: 0 },
        status: { notIn: ['draft', 'returned'] },
      },
    }),
    prisma.parcel.count({
      where: { deletedAt: null, direction: 'eu_to_ua', OR: [{ senderId: id }, { receiverId: id }] },
    }),
    prisma.parcel.count({
      where: { deletedAt: null, direction: 'ua_to_eu', OR: [{ senderId: id }, { receiverId: id }] },
    }),
    // Last 10 cash register entries linked to this client's parcels.
    prisma.cashRegister.findMany({
      where: {
        parcel: { OR: [{ senderId: id }, { receiverId: id }], deletedAt: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        amount: true,
        currency: true,
        paymentMethod: true,
        paymentType: true,
        createdAt: true,
        parcel: { select: { id: true, internalNumber: true } },
        receivedBy: { select: { fullName: true } },
      },
    }),
  ]);

  return NextResponse.json({
    ...client,
    stats: {
      totalSent,
      totalReceived,
      totalParcels: totalSent + totalReceived,
      totalPaid: Number(totalPaidAgg._sum.totalCost) || 0,
      currentDebt: Number(currentDebtAgg._sum.totalCost) || 0,
      unpaidCount,
      byDirection: {
        eu_to_ua: byDirectionEuUa,
        ua_to_eu: byDirectionUaEu,
      },
    },
    cashEntries: cashEntries.map((c) => ({
      id: c.id,
      amount: Number(c.amount),
      currency: c.currency,
      paymentMethod: c.paymentMethod,
      paymentType: c.paymentType,
      createdAt: c.createdAt,
      parcel: c.parcel,
      receivedBy: c.receivedBy?.fullName ?? null,
    })),
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
