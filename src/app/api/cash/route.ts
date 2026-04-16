import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth/guards';
import { FINANCE_ROLES } from '@/lib/constants/roles';

// GET /api/cash?dateFrom=...&dateTo=...&receivedBy=...
export async function GET(request: NextRequest) {
  const guard = await requireRole(FINANCE_ROLES);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const receivedBy = searchParams.get('receivedBy');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (receivedBy) where.receivedById = receivedBy;
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo + 'T23:59:59Z');
  }

  const [entries, totals] = await Promise.all([
    prisma.cashRegister.findMany({
      where,
      include: {
        parcel: { select: { internalNumber: true, itn: true } },
        receivedBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.cashRegister.groupBy({
      by: ['currency', 'paymentType'],
      where,
      _sum: { amount: true },
    }),
  ]);

  return NextResponse.json({ entries, totals });
}

// POST /api/cash
export async function POST(request: NextRequest) {
  const guard = await requireRole(FINANCE_ROLES);
  if (!guard.ok) return guard.response;
  const userId = guard.user.userId;

  const body = await request.json();
  const { parcelId, amount, currency, paymentMethod, paymentType, description } = body;

  if (!amount || !currency || !paymentMethod) {
    return NextResponse.json({ error: 'Сума, валюта та спосіб оплати обов\'язкові' }, { status: 400 });
  }

  const entry = await prisma.cashRegister.create({
    data: {
      parcelId: parcelId || null,
      amount: Number(amount),
      currency,
      paymentMethod,
      paymentType: paymentType || 'income',
      description: description || null,
      receivedById: userId,
    },
    include: {
      parcel: { select: { internalNumber: true } },
    },
  });

  // If linked to parcel, mark as paid
  if (parcelId) {
    await prisma.parcel.update({
      where: { id: parcelId },
      data: { isPaid: true, paidAt: new Date() },
    });
  }

  return NextResponse.json(entry, { status: 201 });
}
