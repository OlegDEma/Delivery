import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { PaymentMethod, CashPaymentType } from '@/generated/prisma/enums';
import { requireRole, requireStaff } from '@/lib/auth/guards';
import { FINANCE_ROLES } from '@/lib/constants/roles';
import { parseBody, acceptPaymentSchema } from '@/lib/validators';
import { logger } from '@/lib/logger';

// Payments within this tolerance (0.5 EUR / UAH) of totalCost are accepted
// without warning. Larger deviations are blocked unless caller passes
// { allowDeviation: true } — UI surfaces a confirm dialog for that.
const PAYMENT_TOLERANCE = 0.5;

// POST /api/parcels/[id]/payment — accept payment (FINANCE_ROLES)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRole(FINANCE_ROLES);
  if (!guard.ok) return guard.response;
  const userId = guard.user.userId;

  const { id } = await params;

  const raw = await request.clone().json().catch(() => ({}));
  const allowDeviation = !!raw?.allowDeviation;

  const parsed = await parseBody(request, acceptPaymentSchema);
  if (parsed instanceof NextResponse) return parsed;
  const body = parsed;

  const parcel = await prisma.parcel.findFirst({ where: { id, deletedAt: null } });
  if (!parcel) {
    return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });
  }

  // Compare payment amount against expected totalCost (when known). We only
  // validate for EUR since that's how totalCost is stored. For UAH payments
  // we skip the check (FX rate is outside this route's scope).
  if (
    !allowDeviation
    && body.currency === 'EUR'
    && parcel.totalCost != null
    && Number(parcel.totalCost) > 0
  ) {
    const expected = Number(parcel.totalCost);
    if (Math.abs(body.amount - expected) > PAYMENT_TOLERANCE) {
      return NextResponse.json(
        {
          error: `Сума оплати (${body.amount.toFixed(2)} EUR) не співпадає з вартістю посилки (${expected.toFixed(2)} EUR). Підтвердьте через allowDeviation, якщо це навмисно.`,
          expected,
          mismatch: true,
        },
        { status: 400 }
      );
    }
  }

  const method: PaymentMethod = body.paymentMethod;

  const cashEntry = await prisma.cashRegister.create({
    data: {
      parcelId: id,
      amount: body.amount,
      currency: body.currency,
      paymentMethod: method,
      paymentType: 'income' as CashPaymentType,
      description: body.description ?? null,
      receivedById: userId,
    },
  });

  await prisma.parcel.update({
    where: { id },
    data: {
      isPaid: true,
      paidAt: new Date(),
      paymentMethod: method,
    },
  });

  logger.audit('payment.accepted', {
    parcelId: id, amount: body.amount, currency: body.currency, userId,
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
  const userId = guard.user.userId;

  const { id } = await params;

  const parcel = await prisma.parcel.findFirst({ where: { id, deletedAt: null } });
  if (!parcel) {
    return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.cashRegister.deleteMany({ where: { parcelId: id, paymentType: 'income' } }),
    prisma.parcel.update({ where: { id }, data: { isPaid: false, paidAt: null } }),
  ]);

  logger.audit('payment.cancelled', { parcelId: id, userId });

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
