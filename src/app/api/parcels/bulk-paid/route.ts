import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth/guards';
import { ROLES } from '@/lib/constants/roles';
import { parseBody } from '@/lib/validators';
import { logger } from '@/lib/logger';

// ТЗ docx 04.10.26: «Оплату кожної посилки Працівник повинен приймати окремо.
// Лише Суперадмін може відмітити бажані посилки та прийняти оплату пакетом.»
const bulkAcceptPaymentSchema = z.object({
  parcelIds: z.array(z.string().uuid()).min(1).max(200),
  paymentMethod: z.enum(['cash', 'cashless']),
});

// POST /api/parcels/bulk-paid — прийняти оплату пакетом (лише Суперадмін).
// Раніше цей роут лише ставив позначку isPaid і не створював запису в Касі —
// пакетна оплата «зникала» з каси і звітів. Тепер на кожну посилку — окремий
// прихід у касі на суму її вартості, так само як при оплаті однієї посилки.
export async function POST(request: NextRequest) {
  const guard = await requireRole([ROLES.SUPER_ADMIN]);
  if (!guard.ok) return guard.response;
  const userId = guard.user.userId;

  const parsed = await parseBody(request, bulkAcceptPaymentSchema);
  if (parsed instanceof NextResponse) return parsed;
  const { parcelIds, paymentMethod } = parsed;

  // Soft-delete і вже оплачені — пропускаємо (повторна оплата = дубль у касі).
  const parcels = await prisma.parcel.findMany({
    where: { id: { in: parcelIds }, deletedAt: null, isPaid: false },
    select: { id: true, totalCost: true, costCurrency: true },
  });

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const p of parcels) {
      // Посилка без розрахованої вартості — позначаємо оплаченою, але без суми в касі.
      const amount = p.totalCost != null ? Number(p.totalCost) : 0;
      if (amount > 0) {
        await tx.cashRegister.create({
          data: {
            parcelId: p.id,
            amount,
            currency: p.costCurrency || 'EUR',
            paymentMethod,
            paymentType: 'income',
            description: 'Пакетна оплата (Суперадмін)',
            receivedById: userId,
          },
        });
      }
      await tx.parcel.update({
        where: { id: p.id },
        data: { isPaid: true, paidAt: now, paymentMethod },
      });
    }
  });

  logger.audit('payment.bulk_accepted', {
    userId, paymentMethod, requested: parcelIds.length, updated: parcels.length,
  });

  return NextResponse.json({ updated: parcels.length, skipped: parcelIds.length - parcels.length });
}
