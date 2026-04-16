import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth/guards';
import { FINANCE_ROLES } from '@/lib/constants/roles';

// GET /api/debts — parcels not paid, grouped by client
export async function GET() {
  const guard = await requireRole(FINANCE_ROLES);
  if (!guard.ok) return guard.response;

  const unpaidParcels = await prisma.parcel.findMany({
    where: {
      deletedAt: null,
      isPaid: false,
      totalCost: { not: null, gt: 0 },
      status: { notIn: ['draft', 'returned'] },
    },
    include: {
      sender: { select: { id: true, phone: true, firstName: true, lastName: true } },
      receiver: { select: { id: true, phone: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Group by payer (sender or receiver)
  const debtMap = new Map<string, {
    clientId: string;
    clientName: string;
    clientPhone: string;
    totalDebt: number;
    parcelsCount: number;
    oldestDate: string;
    parcels: { id: string; internalNumber: string; totalCost: number; createdAt: string; direction: string }[];
  }>();

  for (const p of unpaidParcels) {
    const payerClient = p.payer === 'sender' ? p.sender : p.receiver;
    const existing = debtMap.get(payerClient.id);
    const parcelInfo = {
      id: p.id,
      internalNumber: p.internalNumber,
      totalCost: Number(p.totalCost) || 0,
      createdAt: p.createdAt.toISOString(),
      direction: p.direction,
    };

    if (existing) {
      existing.totalDebt += parcelInfo.totalCost;
      existing.parcelsCount++;
      existing.parcels.push(parcelInfo);
    } else {
      debtMap.set(payerClient.id, {
        clientId: payerClient.id,
        clientName: `${payerClient.lastName} ${payerClient.firstName}`,
        clientPhone: payerClient.phone,
        totalDebt: parcelInfo.totalCost,
        parcelsCount: 1,
        oldestDate: p.createdAt.toISOString(),
        parcels: [parcelInfo],
      });
    }
  }

  const debts = Array.from(debtMap.values()).sort((a, b) => b.totalDebt - a.totalDebt);
  const totalDebt = debts.reduce((s, d) => s + d.totalDebt, 0);

  return NextResponse.json({ debts, totalDebt });
}
