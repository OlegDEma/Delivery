import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/guards';
import { isUuid } from '@/lib/validators/common';
import { sendInvoice, invoiceChannelConfigured } from '@/lib/services/invoice-sms';
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

  let body: { toParty?: string; overridePhone?: string; channel?: string; mode?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Очікується JSON body' }, { status: 400 }); }

  if (body.toParty !== 'sender' && body.toParty !== 'receiver') {
    return NextResponse.json({ error: 'toParty must be sender|receiver' }, { status: 400 });
  }

  // ТЗ docx 04.11.26 (п.7): рахунок — SMS, Viber або WhatsApp.
  const channel = body.channel ?? 'sms';
  if (channel !== 'sms' && channel !== 'viber' && channel !== 'whatsapp') {
    return NextResponse.json({ error: 'channel must be sms|viber|whatsapp' }, { status: 400 });
  }

  try {
    const result = await sendInvoice({
      parcelId: id,
      toParty: body.toParty,
      overridePhone: body.overridePhone,
      sentById: guard.user.userId,
      channel,
      mode: body.mode === 'manual' ? 'manual' : 'auto',
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

/**
 * GET /api/parcels/[id]/send-invoice?toParty=receiver
 * ТЗ docx 04.11.26 (п.7): текст рахунку (з реквізитами) для вікна «Надіслати рахунок» і
 * які канали (SMS / Viber / WhatsApp) мають реального провайдера. Без провайдера кнопка
 * відкриває застосунок із готовим текстом, а факт відправки фіксується (як підтвердження).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });
  const toParty = new URL(request.url).searchParams.get('toParty');
  if (toParty !== 'sender' && toParty !== 'receiver') {
    return NextResponse.json({ error: 'toParty must be sender|receiver' }, { status: 400 });
  }
  try {
    const preview = await sendInvoice({ parcelId: id, toParty, sentById: guard.user.userId, preview: true });
    return NextResponse.json({
      body: preview.body,
      phone: preview.phone,
      configured: {
        sms: invoiceChannelConfigured('sms'),
        viber: invoiceChannelConfigured('viber'),
        whatsapp: invoiceChannelConfigured('whatsapp'),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'PARCEL_NOT_FOUND') return NextResponse.json({ error: 'Посилку не знайдено' }, { status: 404 });
    if (msg === 'NO_PHONE_FOR_PARTY') return NextResponse.json({ error: 'У вибраного отримувача рахунка не задано телефон' }, { status: 400 });
    if (msg === 'TOTAL_COST_NOT_SET') return NextResponse.json({ error: 'Загальна вартість посилки ще не розрахована' }, { status: 400 });
    logger.error('parcel.send_invoice.preview_failed', err, { parcelId: id });
    return NextResponse.json({ error: 'Не вдалося сформувати рахунок' }, { status: 500 });
  }
}
