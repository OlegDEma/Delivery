import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/guards';
import { isUuid } from '@/lib/validators/common';
import { configuredChannels, type MessageChannel } from '@/lib/services/messaging';
import {
  buildPassengerBody, loadPassengerForMessage, logPassengerMessage,
  type PassengerMessageKind,
} from '@/lib/services/passenger-messaging';
import { logger } from '@/lib/logger';

function parseKind(v: unknown): PassengerMessageKind {
  return v === 'invoice' ? 'invoice' : 'confirmation';
}

/**
 * GET /api/passengers/[id]/send-message — тексти підтвердження/рахунку для прев'ю
 * + які канали мають реального провайдера (ТЗ docx 23.08.26, п.5-6).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });

  const passenger = await loadPassengerForMessage(id);
  if (!passenger) return NextResponse.json({ error: 'Пасажира не знайдено' }, { status: 404 });

  return NextResponse.json({
    phone: passenger.phone,
    confirmation: buildPassengerBody(passenger, 'confirmation'),
    invoice: buildPassengerBody(passenger, 'invoice'),
    configured: configuredChannels(),
  });
}

/**
 * POST /api/passengers/[id]/send-message — зафіксувати надсилання пасажиру.
 * Body: { channel: 'sms'|'viber'|'whatsapp', kind: 'confirmation'|'invoice', mode?: 'manual' }
 * Провайдера для месенджерів поки немає, тож працівник надсилає з застосунку
 * (deep-link), а ми пишемо факт у лог — щоб на сайті було видно, що надіслано.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Невалідний id' }, { status: 400 });

  let body: { channel?: string; kind?: string; mode?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Очікується JSON body' }, { status: 400 }); }

  if (body.channel !== 'sms' && body.channel !== 'viber' && body.channel !== 'whatsapp') {
    return NextResponse.json({ error: 'channel must be sms|viber|whatsapp' }, { status: 400 });
  }
  const kind = parseKind(body.kind);

  try {
    const passenger = await loadPassengerForMessage(id);
    if (!passenger) return NextResponse.json({ error: 'Пасажира не знайдено' }, { status: 404 });
    if (!passenger.phone) return NextResponse.json({ error: 'У пасажира не вказано телефон' }, { status: 400 });

    const text = buildPassengerBody(passenger, kind);
    const log = await logPassengerMessage({
      passengerId: id,
      phone: passenger.phone,
      body: text,
      channel: body.channel as MessageChannel,
      kind,
      sentById: guard.user.userId,
      provider: 'deeplink',
      status: 'sent',
    });
    logger.audit('passenger.message_sent', { passengerId: id, channel: body.channel, kind, userId: guard.user.userId });
    return NextResponse.json({ ok: true, logId: log.id, status: 'sent' });
  } catch (err) {
    logger.error('passenger.send_message.failed', err, { passengerId: id });
    return NextResponse.json({ error: 'Помилка надсилання' }, { status: 500 });
  }
}
