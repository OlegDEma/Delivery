import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validators/common';

/**
 * GET /api/parcels/[id]/invoice-history
 *
 * Returns SMS-invoice send attempts for a parcel (newest first). Each row
 * carries the recipient party, phone, status, and the operator who triggered
 * it — drives the «Надіслані рахунки» panel on the parcel detail page so
 * operators don't double-send by accident.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });

  // Cap at 20 to keep the panel scan-able. Realistically there's <5 entries
  // per parcel; older sends fall off gracefully.
  const rows = await prisma.smsLog.findMany({
    where: { parcelId: id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  // Resolve sender names in one round-trip — log only stores UUIDs.
  const operatorIds = Array.from(
    new Set(rows.map((r) => r.sentById).filter((x): x is string => !!x))
  );
  const operators = operatorIds.length
    ? await prisma.profile.findMany({
        where: { id: { in: operatorIds } },
        select: { id: true, fullName: true },
      })
    : [];
  const opMap = new Map(operators.map((o) => [o.id, o.fullName]));

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      toParty: r.toParty,
      toPhone: r.toPhone,
      provider: r.provider,
      status: r.status,
      errorMessage: r.errorMessage,
      sentBy: r.sentById ? opMap.get(r.sentById) ?? null : null,
      createdAt: r.createdAt,
      // Truncate body in the listing — full body stays in DB for forensic.
      bodyPreview: r.body.length > 80 ? r.body.slice(0, 80) + '…' : r.body,
    }))
  );
}
