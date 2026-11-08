import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/guards';
import { isUuid } from '@/lib/validators/common';
import { transferParcel } from '@/lib/services/parcel-transfer';
import { logger } from '@/lib/logger';
import { lockIfParcelTripCompleted } from '@/lib/trips/completed-lock';

/**
 * POST /api/parcels/[id]/transfer  { tripId }
 * ТЗ docx 09.10.26 (п.2): перенесення посилки на інший рейс (Працівник).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });
  const body = await request.json().catch(() => null) as { tripId?: string } | null;
  if (!body?.tripId || !isUuid(body.tripId)) {
    return NextResponse.json({ error: 'Оберіть рейс' }, { status: 400 });
  }

  // ТЗ docx 03.11.26 (п.3): завершений рейс повністю заблоковано — жодних змін його даних.
  const locked = await lockIfParcelTripCompleted(id);
  if (locked) return locked;

  const res = await transferParcel({ parcelId: id, toTripId: body.tripId, userId: guard.user.userId, actor: 'staff' });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  logger.audit('parcel.transferred', { parcelId: id, toTripId: body.tripId, userId: guard.user.userId });
  return NextResponse.json({ success: true });
}
