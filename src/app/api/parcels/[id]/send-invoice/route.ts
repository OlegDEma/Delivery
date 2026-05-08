import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/guards';
import { isUuid } from '@/lib/validators/common';
import { sendInvoice } from '@/lib/services/invoice-sms';
import { logger } from '@/lib/logger';

/**
 * POST /api/parcels/[id]/send-invoice
 *
 * Per ТЗ: «при відмічанні чекбокса на телефонний номер Платника за доставку
 * відправляється повідомлення». Body:
 *   { toParty: 'sender' | 'receiver', overridePhone?: string }
 *
 * The actual phone defaults to the chosen party's stored number — overridable
 * for one-off cases (e.g. accountant's phone instead of receiver's). Auth:
 * staff only (admins/cashiers/couriers/etc).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });

  let body: { toParty?: string; overridePhone?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Очікується JSON body' }, { status: 400 }); }

  if (body.toParty !== 'sender' && body.toParty !== 'receiver') {
    return NextResponse.json({ error: 'toParty must be sender|receiver' }, { status: 400 });
  }

  try {
    const result = await sendInvoice({
      parcelId: id,
      toParty: body.toParty,
      overridePhone: body.overridePhone,
      sentById: guard.user.userId,
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'PARCEL_NOT_FOUND') {
      return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });
    }
    if (msg === 'NO_PHONE_FOR_PARTY') {
      return NextResponse.json({ error: 'У вибраного отримувача рахунка не задано телефон' }, { status: 400 });
    }
    if (msg === 'TOTAL_COST_NOT_SET') {
      return NextResponse.json({ error: 'Загальна вартість посилки ще не розрахована — дочекайтесь розрахунку' }, { status: 400 });
    }
    logger.error('parcel.send_invoice.failed', err, { parcelId: id });
    return NextResponse.json({ error: 'Помилка надсилання SMS' }, { status: 500 });
  }
}
