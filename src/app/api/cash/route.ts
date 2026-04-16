import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth/guards';
import { FINANCE_ROLES } from '@/lib/constants/roles';
import type { Prisma } from '@/generated/prisma/client';
import { z } from 'zod';
import { parseBody } from '@/lib/validators';
import { paymentMethodSchema, positiveMoneySchema, uuidSchema } from '@/lib/validators/common';
import { logger } from '@/lib/logger';

// POST body schema — kept local since it's only used here.
const cashEntrySchema = z.object({
  parcelId: uuidSchema.optional().nullable(),
  amount: positiveMoneySchema,
  currency: z.enum(['EUR', 'UAH']),
  paymentMethod: paymentMethodSchema,
  paymentType: z.enum(['income', 'expense', 'refund']).optional(),
  description: z.string().trim().max(500).optional().nullable(),
});

// GET /api/cash?dateFrom=...&dateTo=...&receivedBy=...
export async function GET(request: NextRequest) {
  const guard = await requireRole(FINANCE_ROLES);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const receivedBy = searchParams.get('receivedBy');

  const where: Prisma.CashRegisterWhereInput = {};
  if (receivedBy) where.receivedById = receivedBy;
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom + 'T00:00:00+02:00');
    if (dateTo) where.createdAt.lte = new Date(dateTo + 'T23:59:59.999+03:00');
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

  const parsed = await parseBody(request, cashEntrySchema);
  if (parsed instanceof NextResponse) return parsed;
  const body = parsed;

  // Do everything in a single transaction so a cash entry and the paid-flag
  // on the parcel never diverge.
  const entry = await prisma.$transaction(async (tx) => {
    const created = await tx.cashRegister.create({
      data: {
        parcelId: body.parcelId || null,
        amount: body.amount,
        currency: body.currency,
        paymentMethod: body.paymentMethod,
        paymentType: body.paymentType || 'income',
        description: body.description || null,
        receivedById: userId,
      },
      include: {
        parcel: { select: { internalNumber: true } },
      },
    });

    if (body.parcelId && (body.paymentType || 'income') === 'income') {
      await tx.parcel.update({
        where: { id: body.parcelId },
        data: { isPaid: true, paidAt: new Date() },
      });
    }

    return created;
  });

  logger.audit('cash.entry_created', {
    entryId: entry.id, amount: body.amount, currency: body.currency,
    type: body.paymentType || 'income', userId,
  });

  return NextResponse.json(entry, { status: 201 });
}
