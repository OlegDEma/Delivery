import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { PaymentMethod, CashPaymentType } from '@/generated/prisma/client';
import { requireRole, requireStaff } from '@/lib/auth/guards';
import { FINANCE_ROLES } from '@/lib/constants/roles';

// POST /api/parcels/[id]/payment — accept payment (FINANCE_ROLES)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(FINANCE_ROLES);
  if (!guard.ok) return guard.response;
  const userId = guard.user.userId;

  const { id } = await params;
  const body = await request.json();

  const parcel = await prisma.parcel.findFirst({ where: { id, deletedAt: null } });
  if (!parcel) {
    return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });
  }

  const amount = Number(body.amount);
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Сума має бути більше 0' }, { status: 400 });
  }

  const method: PaymentMethod = (body.paymentMethod === 'cashless' ? 'cashless' : 'cash');
  const currency = body.currency === 'UAH' ? 'UAH' : 'EUR';
  const description = body.description?.trim() || null;

  // Create cash register entry
  const cashEntry = await prisma.cashRegister.create({
    data: {
      parcelId: id,
      amount,
      currency,
      paymentMethod: method,
      paymentType: 'income' as CashPaymentType,
      description,
      receivedById: userId,
    },
  });

  // Update parcel as paid
  await prisma.parcel.update({
    where: { id },
    data: {
      isPaid: true,
      paidAt: new Date(),
      paymentMethod: method,
    },
  });

  return NextResponse.json({ success: true, cashEntry });
}

// DELETE /api/parcels/[id]/payment — cancel payment (FINANCE_ROLES)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(FINANCE_ROLES);
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const parcel = await prisma.parcel.findFirst({ where: { id, deletedAt: null } });
  if (!parcel) {
    return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });
  }

  // Delete cash entries linked to this parcel (income type)
  await prisma.cashRegister.deleteMany({
    where: { parcelId: id, paymentType: 'income' },
  });

  // Mark as not paid
  await prisma.parcel.update({
    where: { id },
    data: { isPaid: false, paidAt: null },
  });

  return NextResponse.json({ success: true });
}

// GET /api/parcels/[id]/payment — payment history (any staff)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const entries = await prisma.cashRegister.findMany({
    where: { parcelId: id },
    include: {
      receivedBy: { select: { fullName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(entries);
}
