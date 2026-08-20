import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/guards';
import { isUuid } from '@/lib/validators/common';
import { sendConfirmation, type MessageChannel } from '@/lib/services/messaging';
import { logger } from '@/lib/logger';

/**
 * POST /api/parcels/[id]/send-confirmation
 * ТЗ docx 18.08.26: сервер САМ надсилає підтвердження обраним каналом і записує факт.
 * Body: { toParty: 'sender' | 'receiver', channel: 'sms' | 'viber' | 'whatsapp' }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });

  let body: { toParty?: string; channel?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Очікується JSON body' }, { status: 400 }); }

  if (body.toParty !== 'sender' && body.toParty !== 'receiver') {
    return NextResponse.json({ error: 'toParty must be sender|receiver' }, { status: 400 });
  }
  if (body.channel !== 'sms' && body.channel !== 'viber' && body.channel !== 'whatsapp') {
    return NextResponse.json({ error: 'channel must be sms|viber|whatsapp' }, { status: 400 });
  }

  try {
    const result = await sendConfirmation({
      parcelId: id,
      toParty: body.toParty,
      channel: body.channel as MessageChannel,
      sentById: guard.user.userId,
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'PARCEL_NOT_FOUND') return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });
    if (msg === 'NO_PHONE_FOR_PARTY') return NextResponse.json({ error: 'У сторони не задано телефон' }, { status: 400 });
    logger.error('parcel.send_confirmation.failed', err, { parcelId: id });
    return NextResponse.json({ error: 'Помилка надсилання підтвердження' }, { status: 500 });
  }
}
